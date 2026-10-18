-- Scope global snapshot and live-location RPCs to the configured active Main Office identity.
-- Preserve the existing response contract and live-location query; only tighten authorization.
-- Forward-only hardening. Do not apply to Production without the normal migration approval.

CREATE OR REPLACE FUNCTION public.get_phase1_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_head uuid;
  v_branch uuid;
BEGIN
  PERFORM public.current_main_office_user();

  SELECT office_id INTO v_head
  FROM public.offices
  WHERE is_active=true AND office_type='HEAD_OFFICE'
  ORDER BY created_at,name
  LIMIT 1;
  SELECT office_id INTO v_branch
  FROM public.offices
  WHERE is_active=true AND office_type='BRANCH'
  ORDER BY name
  LIMIT 1;

  IF v_head IS NULL THEN RAISE EXCEPTION 'ACTIVE_HEAD_OFFICE_NOT_CONFIGURED'; END IF;
  IF v_branch IS NULL THEN RAISE EXCEPTION 'ACTIVE_CHECK_IN_OFFICE_NOT_CONFIGURED'; END IF;

  RETURN jsonb_build_object(
    'office',(SELECT to_jsonb(o) FROM public.offices o WHERE o.office_id=v_head),
    'operational_office',(SELECT to_jsonb(o) FROM public.offices o WHERE o.office_id=v_head),
    'check_in_office',(SELECT to_jsonb(o) FROM public.offices o WHERE o.office_id=v_branch),
    'factories',COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.name) FROM public.factories f WHERE f.is_active),'[]'::jsonb),
    'quarries',COALESCE((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.name) FROM public.quarries q WHERE q.is_active),'[]'::jsonb),
    'load_orders',COALESCE((SELECT jsonb_agg(to_jsonb(lo) ORDER BY lo.created_at DESC) FROM public.load_orders lo WHERE lo.office_id=v_head),'[]'::jsonb),
    'bookings',COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.booked_at DESC) FROM public.bookings b JOIN public.load_orders lo ON lo.load_order_id=b.load_order_id WHERE lo.office_id=v_head),'[]'::jsonb),
    'actual_loading_records',COALESCE((SELECT jsonb_agg(to_jsonb(alr) ORDER BY alr.created_at DESC) FROM public.actual_loading_records alr JOIN public.bookings b ON b.booking_id=alr.booking_id JOIN public.load_orders lo ON lo.load_order_id=b.load_order_id WHERE lo.office_id=v_head),'[]'::jsonb),
    'drivers',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.name) FROM public.drivers d WHERE d.is_active),'[]'::jsonb),
    'vehicles',COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.plate_number) FROM public.vehicles v WHERE v.is_active),'[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_vehicle_live_locations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
BEGIN
  PERFORM public.current_main_office_user();

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'driver_id',d.driver_id,
      'driver_name',d.name,
      'vehicle_id',v.vehicle_id,
      'plate_number',v.plate_number,
      'vehicle_code',v.vehicle_code,
      'latitude',loc.latitude,
      'longitude',loc.longitude,
      'accuracy_m',loc.accuracy_m,
      'captured_at',loc.captured_at,
      'updated_at',loc.received_at,
      'is_stale',loc.received_at < now()-interval '10 minutes'
    ) ORDER BY loc.received_at DESC)
    FROM public.driver_live_locations loc
    JOIN public.drivers d ON d.driver_id=loc.driver_id AND d.is_active=true
    JOIN LATERAL (
      SELECT dva.vehicle_id
      FROM public.driver_vehicle_assignments dva
      JOIN public.vehicles va ON va.vehicle_id=dva.vehicle_id AND va.is_active=true
      WHERE dva.driver_id=d.driver_id AND dva.ended_at IS NULL
      ORDER BY dva.assigned_at DESC
      LIMIT 1
    ) active_assignment ON true
    JOIN public.vehicles v ON v.vehicle_id=active_assignment.vehicle_id
  ),'[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_phase1_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_phase1_snapshot() TO authenticated;
REVOKE ALL ON FUNCTION public.get_vehicle_live_locations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vehicle_live_locations() TO authenticated;

NOTIFY pgrst, 'reload schema';
