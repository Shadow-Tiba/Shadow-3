-- Notify only the assigned driver after they accept a direct assignment.
-- Queue allocations remain automatic after their five-minute selection window.
CREATE OR REPLACE FUNCTION public.accept_direct_assignment(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_driver_id uuid;
  v_booking public.bookings%rowtype;
  v_order public.load_orders%rowtype;
  v_factory_name text;
  v_quarry_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='28000'; END IF;
  IF p_booking_id IS NULL THEN RAISE EXCEPTION 'BOOKING_ID_REQUIRED'; END IF;

  SELECT driver_id INTO v_driver_id
  FROM public.drivers
  WHERE auth_user_id=auth.uid() AND is_active=true AND cancelled_at IS NULL;
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'DRIVER_NOT_FOUND' USING errcode='42501'; END IF;

  SELECT * INTO v_booking FROM public.bookings
  WHERE booking_id=p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF v_booking.driver_id<>v_driver_id THEN RAISE EXCEPTION 'BOOKING_NOT_YOURS' USING errcode='42501'; END IF;
  IF v_booking.assignment_type<>'DIRECT' THEN RAISE EXCEPTION 'NOT_A_DIRECT_ASSIGNMENT'; END IF;

  IF v_booking.direct_acceptance_status='ACCEPTED' THEN
    RETURN jsonb_build_object('accepted',true,'already_accepted',true,
      'booking_id',v_booking.booking_id,'trip_code',v_booking.trip_code,
      'acceptance_status',v_booking.direct_acceptance_status,'accepted_at',v_booking.direct_accepted_at);
  END IF;
  IF v_booking.direct_acceptance_status<>'PENDING' OR v_booking.status<>'ASSIGNED' THEN
    RAISE EXCEPTION 'DIRECT_ASSIGNMENT_NOT_PENDING';
  END IF;

  SELECT * INTO v_order FROM public.load_orders WHERE load_order_id=v_booking.load_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOAD_ORDER_NOT_FOUND'; END IF;
  SELECT name INTO v_factory_name FROM public.factories WHERE factory_id=v_order.factory_id;
  SELECT name INTO v_quarry_name FROM public.quarries WHERE quarry_id=v_order.quarry_id;

  UPDATE public.bookings
  SET direct_acceptance_status='ACCEPTED',direct_accepted_at=now(),
      direct_accepted_by_driver_id=v_driver_id,updated_at=now()
  WHERE booking_id=p_booking_id
  RETURNING * INTO v_booking;

  INSERT INTO public.notifications(recipient_driver_id,notification_type,title,body,payload)
  VALUES(v_driver_id,'LOAD_REQUEST_ACCEPTED','تم تخصيص النقلة لك',
    format('تم تأكيد قبولك للنقلة. برجاء التوجه إلى محجر %s ثم مصنع %s. كود النقلة: %s.',
      coalesce(v_quarry_name,'غير محدد'),coalesce(v_factory_name,'غير محدد'),v_booking.trip_code),
    jsonb_build_object('booking_id',v_booking.booking_id,'load_order_id',v_order.load_order_id,
      'trip_code',v_booking.trip_code,'factory_name',v_factory_name,'quarry_name',v_quarry_name,
      'assignment_type','DIRECT','accepted_at',v_booking.direct_accepted_at));

  PERFORM public.write_audit_event('ACCEPT_DIRECT_ASSIGNMENT','BOOKING',p_booking_id,
    jsonb_build_object('trip_code',v_booking.trip_code,'driver_id',v_driver_id,
      'acceptance_status',v_booking.direct_acceptance_status,'accepted_at',v_booking.direct_accepted_at));

  RETURN jsonb_build_object('accepted',true,'already_accepted',false,
    'booking_id',v_booking.booking_id,'trip_code',v_booking.trip_code,
    'acceptance_status',v_booking.direct_acceptance_status,'accepted_at',v_booking.direct_accepted_at,
    'status',v_booking.status);
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_direct_assignment(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_direct_assignment(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
