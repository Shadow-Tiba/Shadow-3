-- Retire directory records without deleting historical identities, and allow
-- Main Office to reroute/cancel an active trip while preserving its trip code.

ALTER TABLE public.factories
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.app_users(user_id) ON DELETE RESTRICT;
ALTER TABLE public.quarries
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.app_users(user_id) ON DELETE RESTRICT;
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.app_users(user_id) ON DELETE RESTRICT;
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.app_users(user_id) ON DELETE RESTRICT;

-- Re-registering a retired physical vehicle may reuse its plate, but always gets
-- a new vehicle row and therefore a new, never-reused vehicle code.
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_plate_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_nonretired_plate_number_key
  ON public.vehicles(plate_number) WHERE cancelled_at IS NULL;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS redirected_factory_id uuid REFERENCES public.factories(factory_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS redirected_at timestamptz,
  ADD COLUMN IF NOT EXISTS redirected_by uuid REFERENCES public.app_users(user_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS redirect_reason text;

-- Retired identity rows remain in place so old loads, bookings, and reports retain
-- their original foreign-key and audit history. Their unique codes stay reserved.
CREATE OR REPLACE FUNCTION public.prevent_cancelled_directory_reactivation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.cancelled_at IS NOT NULL AND NEW.is_active THEN
    RAISE EXCEPTION 'CANCELLED_DIRECTORY_ENTITY_CANNOT_BE_REACTIVATED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS factories_prevent_cancelled_reactivation ON public.factories;
CREATE TRIGGER factories_prevent_cancelled_reactivation BEFORE UPDATE OF is_active ON public.factories
FOR EACH ROW EXECUTE FUNCTION public.prevent_cancelled_directory_reactivation();
DROP TRIGGER IF EXISTS quarries_prevent_cancelled_reactivation ON public.quarries;
CREATE TRIGGER quarries_prevent_cancelled_reactivation BEFORE UPDATE OF is_active ON public.quarries
FOR EACH ROW EXECUTE FUNCTION public.prevent_cancelled_directory_reactivation();
DROP TRIGGER IF EXISTS drivers_prevent_cancelled_reactivation ON public.drivers;
CREATE TRIGGER drivers_prevent_cancelled_reactivation BEFORE UPDATE OF is_active ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.prevent_cancelled_directory_reactivation();
DROP TRIGGER IF EXISTS vehicles_prevent_cancelled_reactivation ON public.vehicles;
CREATE TRIGGER vehicles_prevent_cancelled_reactivation BEFORE UPDATE OF is_active ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.prevent_cancelled_directory_reactivation();
REVOKE ALL ON FUNCTION public.prevent_cancelled_directory_reactivation() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.main_office_cancel_directory_entity(
  p_entity_type text,
  p_entity_id uuid,
  p_confirmation text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid;
  v_type text := upper(trim(coalesce(p_entity_type,'')));
  v_code text;
  v_name text;
BEGIN
  v_actor := public.current_main_office_user();
  IF p_entity_id IS NULL OR v_type NOT IN ('FACTORY','QUARRY','DRIVER','VEHICLE') THEN
    RAISE EXCEPTION 'ENTITY_TYPE_AND_ID_REQUIRED';
  END IF;

  IF v_type='FACTORY' THEN
    SELECT factory_code,name INTO v_code,v_name FROM public.factories WHERE factory_id=p_entity_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ENTITY_NOT_FOUND'; END IF;
    IF EXISTS (SELECT 1 FROM public.load_orders WHERE factory_id=p_entity_id AND status IN ('DRAFT','PUBLISHED','IN_PROGRESS'))
       OR EXISTS (SELECT 1 FROM public.bookings b JOIN public.load_orders lo ON lo.load_order_id=b.load_order_id WHERE lo.factory_id=p_entity_id AND b.status IN ('ASSIGNED','ARRIVED','LOADING','LOADED','IN_TRANSIT')) THEN
      RAISE EXCEPTION 'ENTITY_HAS_OPEN_LOAD_ORDERS';
    END IF;
  ELSIF v_type='QUARRY' THEN
    SELECT quarry_code,name INTO v_code,v_name FROM public.quarries WHERE quarry_id=p_entity_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ENTITY_NOT_FOUND'; END IF;
    IF EXISTS (SELECT 1 FROM public.load_orders WHERE quarry_id=p_entity_id AND status IN ('DRAFT','PUBLISHED','IN_PROGRESS'))
       OR EXISTS (SELECT 1 FROM public.bookings b JOIN public.load_orders lo ON lo.load_order_id=b.load_order_id WHERE lo.quarry_id=p_entity_id AND b.status IN ('ASSIGNED','ARRIVED','LOADING','LOADED','IN_TRANSIT')) THEN
      RAISE EXCEPTION 'ENTITY_HAS_OPEN_LOAD_ORDERS';
    END IF;
  ELSIF v_type='DRIVER' THEN
    SELECT driver_code,name INTO v_code,v_name FROM public.drivers WHERE driver_id=p_entity_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ENTITY_NOT_FOUND'; END IF;
    IF EXISTS (SELECT 1 FROM public.bookings WHERE driver_id=p_entity_id AND status IN ('ASSIGNED','ARRIVED','LOADING','LOADED','IN_TRANSIT')) THEN
      RAISE EXCEPTION 'ENTITY_HAS_ACTIVE_BOOKING';
    END IF;
    IF EXISTS (SELECT 1 FROM public.waiting_list_entries WHERE driver_id=p_entity_id AND status IN ('WAITING','ASSIGNED'))
       OR EXISTS (SELECT 1 FROM public.driver_load_choices WHERE driver_id=p_entity_id AND status='CHOSEN') THEN
      RAISE EXCEPTION 'ENTITY_IS_IN_DISPATCH_QUEUE';
    END IF;
  ELSE
    SELECT vehicle_code,plate_number INTO v_code,v_name FROM public.vehicles WHERE vehicle_id=p_entity_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ENTITY_NOT_FOUND'; END IF;
    IF EXISTS (SELECT 1 FROM public.bookings WHERE vehicle_id=p_entity_id AND status IN ('ASSIGNED','ARRIVED','LOADING','LOADED','IN_TRANSIT')) THEN
      RAISE EXCEPTION 'ENTITY_HAS_ACTIVE_BOOKING';
    END IF;
  END IF;

  IF p_confirmation IS DISTINCT FROM ('CANCEL '||v_type||' '||v_code) THEN
    RAISE EXCEPTION 'CANCELLATION_CONFIRMATION_MISMATCH';
  END IF;

  IF v_type='FACTORY' THEN
    UPDATE public.factories SET is_active=false,cancelled_at=now(),cancelled_by=v_actor,updated_at=now() WHERE factory_id=p_entity_id AND cancelled_at IS NULL;
  ELSIF v_type='QUARRY' THEN
    UPDATE public.quarries SET is_active=false,cancelled_at=now(),cancelled_by=v_actor,updated_at=now() WHERE quarry_id=p_entity_id AND cancelled_at IS NULL;
  ELSIF v_type='DRIVER' THEN
    UPDATE public.drivers SET is_active=false,cancelled_at=now(),cancelled_by=v_actor,updated_at=now() WHERE driver_id=p_entity_id AND cancelled_at IS NULL;
  ELSE
    UPDATE public.driver_vehicle_assignments SET ended_at=now(),notes=concat_ws(E'\n',notes,'Vehicle retired')
    WHERE vehicle_id=p_entity_id AND ended_at IS NULL;
    UPDATE public.vehicles SET is_active=false,cancelled_at=now(),cancelled_by=v_actor,updated_at=now() WHERE vehicle_id=p_entity_id AND cancelled_at IS NULL;
  END IF;

  IF NOT FOUND THEN RAISE EXCEPTION 'ENTITY_ALREADY_CANCELLED'; END IF;
  PERFORM public.write_audit_event('CANCEL_DIRECTORY_ENTITY',v_type,p_entity_id,
    jsonb_build_object('code',v_code,'name',v_name,'historical_row_retained',true));
  RETURN jsonb_build_object('id',p_entity_id,'entity_type',v_type,'cancelled',true,'code',v_code);
END;
$$;
REVOKE ALL ON FUNCTION public.main_office_cancel_directory_entity(text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.main_office_cancel_directory_entity(text,uuid,text) TO authenticated;

-- Per-trip route overrides leave load orders and immutable trip identifiers alone.
-- The previous RPC used p_new_load_order_id at this same signature. Drop it first
-- because PostgreSQL cannot rename an input parameter with CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.main_office_redirect_booking(uuid,uuid,text);
CREATE OR REPLACE FUNCTION public.main_office_redirect_booking(
  p_booking_id uuid,
  p_factory_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid;
  v_booking public.bookings%rowtype;
  v_order public.load_orders%rowtype;
  v_factory_name text;
  v_old_factory_name text;
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
BEGIN
  v_actor := public.current_main_office_user();
  IF p_booking_id IS NULL OR p_factory_id IS NULL OR v_reason IS NULL THEN RAISE EXCEPTION 'BOOKING_FACTORY_AND_REASON_REQUIRED'; END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE booking_id=p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF v_booking.status NOT IN ('ASSIGNED','ARRIVED','LOADING','LOADED','IN_TRANSIT') THEN RAISE EXCEPTION 'TRIP_NOT_READY_FOR_REDIRECTION'; END IF;
  IF EXISTS (SELECT 1 FROM public.delivery_confirmations WHERE booking_id=p_booking_id)
     OR EXISTS (SELECT 1 FROM public.actual_loading_records WHERE booking_id=p_booking_id AND actual_weight IS NOT NULL) THEN
    RAISE EXCEPTION 'DELIVERY_ALREADY_CONFIRMED';
  END IF;
  SELECT * INTO v_order FROM public.load_orders WHERE load_order_id=v_booking.load_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOAD_ORDER_NOT_FOUND'; END IF;
  IF p_factory_id=coalesce(v_booking.redirected_factory_id,v_order.factory_id) THEN RAISE EXCEPTION 'REDIRECT_FACTORY_MUST_CHANGE'; END IF;
  SELECT name INTO v_factory_name FROM public.factories WHERE factory_id=p_factory_id AND is_active=true AND cancelled_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_FACTORY_NOT_ACTIVE'; END IF;
  SELECT name INTO v_old_factory_name FROM public.factories WHERE factory_id=coalesce(v_booking.redirected_factory_id,v_order.factory_id);

  UPDATE public.bookings SET redirected_factory_id=p_factory_id,redirected_at=now(),redirected_by=v_actor,redirect_reason=v_reason,updated_at=now()
  WHERE booking_id=p_booking_id;
  UPDATE public.loading_data_records SET factory_id=p_factory_id WHERE booking_id=p_booking_id;
  INSERT INTO public.notifications(recipient_driver_id,notification_type,title,body,payload)
  VALUES(v_booking.driver_id,'LOAD_REDIRECTED','تم تغيير وجهة النقلة',
    format('تم تحويل النقلة إلى مصنع %s. السبب: %s. احتفظ بكود النقلة %s.',v_factory_name,v_reason,v_booking.trip_code),
    jsonb_build_object('booking_id',p_booking_id,'trip_code',v_booking.trip_code,'previous_factory_name',v_old_factory_name,'factory_name',v_factory_name,'reason',v_reason));
  PERFORM public.write_audit_event('REDIRECT_BOOKING','BOOKING',p_booking_id,
    jsonb_build_object('trip_code',v_booking.trip_code,'from_factory_id',coalesce(v_booking.redirected_factory_id,v_order.factory_id),'to_factory_id',p_factory_id,'reason',v_reason));
  RETURN jsonb_build_object('booking_id',p_booking_id,'trip_code',v_booking.trip_code,'factory_id',p_factory_id,'factory_name',v_factory_name,'reason',v_reason);
END;
$$;
REVOKE ALL ON FUNCTION public.main_office_redirect_booking(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.main_office_redirect_booking(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.main_office_cancel_booking(p_booking_id uuid,p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_actor uuid; v_booking public.bookings%rowtype; v_reason text:=nullif(trim(coalesce(p_reason,'')),'');
BEGIN
  v_actor:=public.current_main_office_user();
  IF p_booking_id IS NULL OR v_reason IS NULL THEN RAISE EXCEPTION 'BOOKING_AND_REASON_REQUIRED'; END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE booking_id=p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF v_booking.status IN ('CANCELLED','DELIVERED') THEN RAISE EXCEPTION 'BOOKING_TERMINAL_STATE'; END IF;
  IF EXISTS (SELECT 1 FROM public.delivery_confirmations WHERE booking_id=p_booking_id)
     OR EXISTS (SELECT 1 FROM public.actual_loading_records WHERE booking_id=p_booking_id AND actual_weight IS NOT NULL) THEN
    RAISE EXCEPTION 'DELIVERY_ALREADY_CONFIRMED';
  END IF;
  UPDATE public.bookings SET status='CANCELLED',cancelled_at=now(),cancellation_reason=v_reason,updated_at=now() WHERE booking_id=p_booking_id;
  UPDATE public.load_orders lo SET status=CASE
    WHEN EXISTS (SELECT 1 FROM public.bookings b WHERE b.load_order_id=lo.load_order_id AND b.status NOT IN ('DELIVERED','CANCELLED')) THEN 'IN_PROGRESS'
    ELSE 'PUBLISHED' END,updated_at=now()
  WHERE lo.load_order_id=v_booking.load_order_id AND lo.status NOT IN ('COMPLETED','CANCELLED');
  INSERT INTO public.notifications(recipient_driver_id,notification_type,title,body,payload)
  VALUES(v_booking.driver_id,'LOAD_CANCELLED','تم إلغاء النقلة',
    format('تم إلغاء النقلة %s. السبب: %s.',v_booking.trip_code,v_reason),
    jsonb_build_object('booking_id',p_booking_id,'trip_code',v_booking.trip_code,'reason',v_reason));
  PERFORM public.write_audit_event('CANCEL_BOOKING','BOOKING',p_booking_id,
    jsonb_build_object('previous_status',v_booking.status,'reason',v_reason,'trip_code',v_booking.trip_code));
  RETURN jsonb_build_object('booking_id',p_booking_id,'trip_code',v_booking.trip_code,'status','CANCELLED','reason',v_reason);
END;
$$;
REVOKE ALL ON FUNCTION public.main_office_cancel_booking(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.main_office_cancel_booking(uuid,text) TO authenticated;

-- Apply a trip-specific destination to the eventual actual-weight row without
-- rewriting the original order or changing the trip code.
CREATE OR REPLACE FUNCTION public.apply_booking_factory_redirect_to_actual_load()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_factory_id uuid;
BEGIN
  IF NEW.booking_id IS NOT NULL THEN
    SELECT redirected_factory_id INTO v_factory_id FROM public.bookings WHERE booking_id=NEW.booking_id;
    IF v_factory_id IS NOT NULL THEN NEW.factory_id:=v_factory_id; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS actual_load_apply_booking_redirect ON public.actual_loading_records;
CREATE TRIGGER actual_load_apply_booking_redirect BEFORE INSERT OR UPDATE OF booking_id,factory_id ON public.actual_loading_records
FOR EACH ROW EXECUTE FUNCTION public.apply_booking_factory_redirect_to_actual_load();
REVOKE ALL ON FUNCTION public.apply_booking_factory_redirect_to_actual_load() FROM PUBLIC,anon,authenticated;

-- Current-directory reads exclude permanently cancelled rows; historical joins
-- continue to resolve them through their stable IDs and codes.
CREATE OR REPLACE FUNCTION public.main_office_get_directory()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor uuid;
BEGIN
  v_actor:=public.current_main_office_user();
  RETURN jsonb_build_object(
    'factories',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',factory_id,'code',factory_code,'name',name,'is_active',is_active) ORDER BY name),'[]'::jsonb) FROM public.factories WHERE cancelled_at IS NULL),
    'quarries',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',quarry_id,'code',quarry_code,'name',name,'is_active',is_active,'latitude',latitude,'longitude',longitude) ORDER BY name),'[]'::jsonb) FROM public.quarries WHERE cancelled_at IS NULL),
    'owners',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',owner_id,'code',owner_code,'name',name,'phone',phone,'is_active',is_active) ORDER BY name),'[]'::jsonb) FROM public.vehicle_owners),
    'vehicles',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.vehicle_id,'code',v.vehicle_code,'plate_number',v.plate_number,'owner_id',v.owner_id,'office_id',v.office_id,'is_active',v.is_active,
      'assigned_drivers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.driver_id,'name',d.name,'code',d.driver_code) ORDER BY d.name) FROM public.driver_vehicle_assignments a JOIN public.drivers d ON d.driver_id=a.driver_id WHERE a.vehicle_id=v.vehicle_id AND a.ended_at IS NULL),'[]'::jsonb)) ORDER BY v.plate_number),'[]'::jsonb) FROM public.vehicles v WHERE v.cancelled_at IS NULL),
    'drivers',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.driver_id,'code',d.driver_code,'name',d.name,'phone',d.phone,'office_id',d.office_id,'is_active',d.is_active,'vehicle_id',a.vehicle_id,'vehicle_code',v.vehicle_code,'plate_number',v.plate_number) ORDER BY d.name),'[]'::jsonb) FROM public.drivers d LEFT JOIN public.driver_vehicle_assignments a ON a.driver_id=d.driver_id AND a.ended_at IS NULL LEFT JOIN public.vehicles v ON v.vehicle_id=a.vehicle_id WHERE d.cancelled_at IS NULL)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.main_office_get_directory() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.main_office_get_directory() TO authenticated;

CREATE OR REPLACE FUNCTION public.main_office_get_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
DECLARE v_actor uuid;
BEGIN
  v_actor:=public.current_main_office_user();
  RETURN jsonb_build_object(
    'office',(SELECT jsonb_build_object('office_id',office_id,'office_code',office_code,'name',name,'office_type',office_type,'latitude',latitude,'longitude',longitude,'geofence_radius_m',geofence_radius_m) FROM public.offices WHERE office_code='MAIN' AND office_type='HEAD_OFFICE' AND is_active=true),
    'operational_office',(SELECT jsonb_build_object('office_id',office_id,'office_code',office_code,'name',name,'office_type',office_type) FROM public.offices WHERE office_code='MAIN' AND office_type='HEAD_OFFICE' AND is_active=true),
    'check_in_office',(SELECT jsonb_build_object('office_id',office_id,'office_code',office_code,'name',name,'office_type',office_type,'latitude',latitude,'longitude',longitude,'geofence_radius_m',geofence_radius_m) FROM public.offices WHERE office_code='RAS_SEDR' AND office_type='BRANCH' AND is_active=true),
    'factories',(SELECT coalesce(jsonb_agg(jsonb_build_object('factory_id',factory_id,'factory_code',factory_code,'name',name,'is_active',is_active) ORDER BY name),'[]'::jsonb) FROM public.factories WHERE cancelled_at IS NULL),
    'quarries',(SELECT coalesce(jsonb_agg(jsonb_build_object('quarry_id',quarry_id,'quarry_code',quarry_code,'name',name,'latitude',latitude,'longitude',longitude,'is_active',is_active) ORDER BY name),'[]'::jsonb) FROM public.quarries WHERE cancelled_at IS NULL),
    'drivers',(SELECT coalesce(jsonb_agg(jsonb_build_object('driver_id',d.driver_id,'driver_code',d.driver_code,'name',d.name,'phone',d.phone,'office_id',d.office_id,'is_active',d.is_active,'latitude',l.latitude,'longitude',l.longitude,'location_captured_at',l.captured_at,'location_received_at',l.received_at) ORDER BY d.name),'[]'::jsonb) FROM public.drivers d LEFT JOIN public.driver_live_locations l ON l.driver_id=d.driver_id WHERE d.cancelled_at IS NULL),
    'vehicles',(SELECT coalesce(jsonb_agg(jsonb_build_object('vehicle_id',v.vehicle_id,'vehicle_code',v.vehicle_code,'plate_number',v.plate_number,'owner_id',v.owner_id,'office_id',v.office_id,'is_active',v.is_active) ORDER BY v.plate_number),'[]'::jsonb) FROM public.vehicles v WHERE v.cancelled_at IS NULL),
    'load_orders',(SELECT coalesce(jsonb_agg(jsonb_build_object('load_order_id',lo.load_order_id,'order_number',lo.order_number,'factory_id',lo.factory_id,'factory_name',f.name,'quarry_id',lo.quarry_id,'quarry_name',q.name,'requested_quantity',lo.requested_quantity,'priority',lo.priority,'status',lo.status,'created_at',lo.created_at,'published_at',lo.published_at,'notes',lo.notes) ORDER BY lo.created_at DESC),'[]'::jsonb) FROM public.load_orders lo JOIN public.factories f ON f.factory_id=lo.factory_id JOIN public.quarries q ON q.quarry_id=lo.quarry_id WHERE f.cancelled_at IS NULL AND q.cancelled_at IS NULL),
    'bookings',(SELECT coalesce(jsonb_agg(jsonb_build_object('booking_id',b.booking_id,'load_order_id',b.load_order_id,'driver_id',b.driver_id,'driver_name',d.name,'vehicle_id',b.vehicle_id,'plate_number',v.plate_number,'assignment_type',b.assignment_type,'status',b.status,'trip_code',b.trip_code,'assigned_at',b.assigned_at,'arrived_at',b.arrived_at,'factory_id',coalesce(b.redirected_factory_id,lo.factory_id),'factory_name',coalesce(rf.name,f.name),'original_factory_name',f.name,'quarry_id',lo.quarry_id,'quarry_name',q.name,'redirect_reason',b.redirect_reason) ORDER BY b.assigned_at DESC),'[]'::jsonb) FROM public.bookings b JOIN public.drivers d ON d.driver_id=b.driver_id JOIN public.vehicles v ON v.vehicle_id=b.vehicle_id JOIN public.load_orders lo ON lo.load_order_id=b.load_order_id JOIN public.factories f ON f.factory_id=lo.factory_id JOIN public.quarries q ON q.quarry_id=lo.quarry_id LEFT JOIN public.factories rf ON rf.factory_id=b.redirected_factory_id),
    'actual_loading_records',(SELECT coalesce(jsonb_agg(jsonb_build_object('actual_load_id',a.actual_load_id,'booking_id',a.booking_id,'actual_weight',a.actual_weight,'ticket_number',a.ticket_number,'loaded_at',a.loaded_at,'notes',a.notes) ORDER BY a.loaded_at DESC),'[]'::jsonb) FROM public.actual_loading_records a),
    'office_notifications',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.office_notification_id,'load_order_id',n.load_order_id,'type',n.notification_type,'title',n.title,'body',n.body,'payload',n.payload,'created_at',n.created_at,'read_at',n.read_at) ORDER BY n.created_at DESC),'[]'::jsonb) FROM (SELECT * FROM public.office_notifications WHERE office_id=(SELECT office_id FROM public.offices WHERE office_code='MAIN' AND office_type='HEAD_OFFICE' AND is_active=true) ORDER BY created_at DESC LIMIT 20) n)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.main_office_get_dashboard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.main_office_get_dashboard() TO authenticated;

-- Statements follow the factory captured on the actual weigh record. A reroute
-- therefore lands on the destination account instead of the original order's factory.
CREATE OR REPLACE FUNCTION public.get_account_statement_records(p_from date DEFAULT NULL,p_to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.current_main_office_user();
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to THEN RAISE EXCEPTION 'INVALID_DATE_RANGE'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'actual_load_id',alr.actual_load_id,'booking_id',b.booking_id,'load_date',alr.loaded_at::date,
    'loading_sequence_date',alr.loaded_at::date,'created_at',alr.created_at,'trip_code',b.trip_code,
    'daily_load_number',lo.order_number,'ticket_number',alr.ticket_number,'actual_weight',alr.actual_weight,
    'vehicle_id',b.vehicle_id,'plate_number',v.plate_number,'driver_id',b.driver_id,'driver_name',d.name,
    'factory_id',coalesce(alr.factory_id,lo.factory_id),'factory_name',coalesce(actual_factory.name,original_factory.name),
    'quarry_id',lo.quarry_id,'quarry_name',q.name,'scale_image_path',alr.scale_image_path,
    'delivery_confirmed_at',dc.confirmed_at
  ) ORDER BY alr.loaded_at DESC,alr.created_at DESC),'[]'::jsonb)
  INTO v_result
  FROM public.actual_loading_records alr
  JOIN public.bookings b ON b.booking_id=alr.booking_id
  JOIN public.load_orders lo ON lo.load_order_id=b.load_order_id
  LEFT JOIN public.vehicles v ON v.vehicle_id=b.vehicle_id
  LEFT JOIN public.drivers d ON d.driver_id=b.driver_id
  LEFT JOIN public.factories actual_factory ON actual_factory.factory_id=alr.factory_id
  LEFT JOIN public.factories original_factory ON original_factory.factory_id=lo.factory_id
  LEFT JOIN public.quarries q ON q.quarry_id=lo.quarry_id
  LEFT JOIN public.delivery_confirmations dc ON dc.booking_id=b.booking_id
  WHERE (p_from IS NULL OR alr.loaded_at::date>=p_from) AND (p_to IS NULL OR alr.loaded_at::date<=p_to);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_account_statement_records(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_account_statement_records(date,date) TO authenticated;

-- Keep retired vehicles out of current selectors while retaining their trips in history.
CREATE OR REPLACE FUNCTION public.get_vehicle_owner_reports(p_from date DEFAULT NULL,p_to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.current_main_office_user();
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to THEN RAISE EXCEPTION 'INVALID_DATE_RANGE'; END IF;
  SELECT jsonb_build_object(
    'vehicles',coalesce((SELECT jsonb_agg(jsonb_build_object('vehicle_id',v.vehicle_id,'plate_number',v.plate_number,'vehicle_code',v.vehicle_code,'owner_id',vo.owner_id,'owner_name',vo.name,'owner_phone',vo.phone,'is_active',v.is_active) ORDER BY v.plate_number) FROM public.vehicles v LEFT JOIN public.vehicle_owners vo ON vo.owner_id=v.owner_id WHERE v.cancelled_at IS NULL),'[]'::jsonb),
    'owners',coalesce((SELECT jsonb_agg(jsonb_build_object('owner_id',vo.owner_id,'name',vo.name,'phone',vo.phone,'is_active',vo.is_active,'vehicle_count',(SELECT count(*) FROM public.vehicles v2 WHERE v2.owner_id=vo.owner_id AND v2.cancelled_at IS NULL)) ORDER BY vo.name) FROM public.vehicle_owners vo),'[]'::jsonb),
    'trips',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'actual_load_id',alr.actual_load_id,'booking_id',alr.booking_id,'trip_code',alr.trip_code,
      'daily_load_number',alr.daily_load_number,'loading_sequence_date',alr.loading_sequence_date,'load_date',alr.load_date,'created_at',alr.created_at,
      'vehicle_id',alr.vehicle_id,'plate_number',v.plate_number,'vehicle_code',v.vehicle_code,'owner_id',v.owner_id,'owner_name',vo.name,
      'driver_id',alr.driver_id,'driver_name',d.name,'quarry_id',alr.quarry_id,'quarry_name',q.name,
      'factory_id',alr.factory_id,'factory_name',f.name,'ticket_number',alr.ticket_number,'actual_weight',alr.actual_weight,
      'scale_image_path',alr.scale_image_path,'delivery_confirmed_at',alr.delivery_confirmed_at,'booking_status',b.status,
      'is_completed',(alr.delivery_confirmed_at IS NOT NULL AND alr.actual_weight IS NOT NULL)
    ) ORDER BY alr.loading_sequence_date DESC,alr.daily_load_number DESC)
    FROM public.actual_loading_records alr LEFT JOIN public.vehicles v ON v.vehicle_id=alr.vehicle_id
    LEFT JOIN public.vehicle_owners vo ON vo.owner_id=v.owner_id LEFT JOIN public.drivers d ON d.driver_id=alr.driver_id
    LEFT JOIN public.quarries q ON q.quarry_id=alr.quarry_id LEFT JOIN public.factories f ON f.factory_id=alr.factory_id
    LEFT JOIN public.bookings b ON b.booking_id=alr.booking_id
    WHERE (p_from IS NULL OR alr.loading_sequence_date>=p_from) AND (p_to IS NULL OR alr.loading_sequence_date<=p_to)),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_vehicle_owner_reports(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_vehicle_owner_reports(date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.driver_get_portal_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
DECLARE v_driver public.drivers%rowtype; v_office public.offices%rowtype; v_lat double precision; v_lon double precision; v_captured timestamptz; v_distance double precision; v_inside boolean:=false; v_fresh boolean:=false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='28000'; END IF;
  SELECT * INTO v_driver FROM public.drivers WHERE auth_user_id=auth.uid() AND is_active=true AND cancelled_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'DRIVER_NOT_FOUND' USING errcode='42501'; END IF;
  SELECT * INTO v_office FROM public.offices WHERE office_code='RAS_SEDR' AND office_type='BRANCH' AND is_active=true;
  IF NOT FOUND OR v_office.latitude IS NULL OR v_office.longitude IS NULL THEN RAISE EXCEPTION 'OFFICE_LOCATION_NOT_CONFIGURED'; END IF;
  SELECT latitude,longitude,captured_at INTO v_lat,v_lon,v_captured FROM public.driver_live_locations WHERE driver_id=v_driver.driver_id;
  IF v_captured IS NOT NULL THEN
    v_fresh:=v_captured>=now()-interval '10 minutes' AND v_captured<=now()+interval '1 minute';
    v_distance:=6371000*2*asin(sqrt(least(1,greatest(0,power(sin(radians(v_lat-v_office.latitude)/2),2)+cos(radians(v_office.latitude))*cos(radians(v_lat))*power(sin(radians(v_lon-v_office.longitude)/2),2)))));
    v_inside:=v_fresh AND v_distance<=v_office.geofence_radius_m;
  END IF;
  RETURN jsonb_build_object('driver_id',v_driver.driver_id,'driver_name',v_driver.name,'driver_code',v_driver.driver_code,'office_name',v_office.name,'distance_m',v_distance,'inside_geofence',v_inside,'location_updated_at',v_captured,'queue_status',null,'queue_position',null,
    'my_bookings',coalesce((SELECT jsonb_agg(jsonb_build_object('booking_id',b.booking_id,'load_order_id',lo.load_order_id,'factory_name',coalesce(rf.name,f.name),'original_factory_name',f.name,'redirect_reason',b.redirect_reason,'quarry_name',q.name,'trip_code',b.trip_code,'raw_status',b.status,'is_direct_assignment',(b.assignment_type='DIRECT'),'status',CASE b.status WHEN 'ASSIGNED' THEN 'BOOKED' WHEN 'ARRIVED' THEN 'BOOKED' WHEN 'LOADING' THEN 'LOADING_STATEMENT' WHEN 'LOADED' THEN 'LOADING_STATEMENT' WHEN 'IN_TRANSIT' THEN 'IN_TRANSIT' WHEN 'DELIVERED' THEN 'DELIVERED' ELSE 'CANCELLED' END,'booked_at',b.assigned_at,'actual_weight',al.actual_weight,'ticket_number',al.ticket_number) ORDER BY b.assigned_at DESC) FROM public.bookings b JOIN public.load_orders lo ON lo.load_order_id=b.load_order_id JOIN public.factories f ON f.factory_id=lo.factory_id LEFT JOIN public.factories rf ON rf.factory_id=b.redirected_factory_id JOIN public.quarries q ON q.quarry_id=lo.quarry_id LEFT JOIN public.actual_loading_records al ON al.booking_id=b.booking_id WHERE b.driver_id=v_driver.driver_id),'[]'::jsonb),
    'available_loads',CASE WHEN v_inside THEN coalesce((SELECT jsonb_agg(jsonb_build_object('load_order_id',lo.load_order_id,'factory_name',f.name,'quarry_name',q.name,'quarry_id',q.quarry_id,'requested_quantity',lo.requested_quantity,'remaining_quantity',greatest(0,lo.requested_quantity-coalesce(x.committed,0)),'priority',lo.priority,'status',lo.status) ORDER BY lo.priority ASC,lo.created_at ASC) FROM public.load_orders lo JOIN public.factories f ON f.factory_id=lo.factory_id JOIN public.quarries q ON q.quarry_id=lo.quarry_id LEFT JOIN LATERAL (SELECT count(*)::integer committed FROM public.bookings b WHERE b.load_order_id=lo.load_order_id AND b.status<>'CANCELLED') x ON true WHERE lo.status='PUBLISHED' AND f.cancelled_at IS NULL AND q.cancelled_at IS NULL AND greatest(0,lo.requested_quantity-coalesce(x.committed,0))>0),'[]'::jsonb) ELSE '[]'::jsonb END);
END;
$$;
REVOKE ALL ON FUNCTION public.driver_get_portal_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.driver_get_portal_snapshot() TO authenticated;

CREATE OR REPLACE FUNCTION public.driver_get_dispatch_state()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE v_driver public.drivers%rowtype; v_office public.offices%rowtype; v_location public.driver_live_locations%rowtype; v_entry public.waiting_list_entries%rowtype; v_window public.dispatch_windows%rowtype; v_choice public.driver_load_choices%rowtype; v_distance_m double precision; v_inside boolean:=false; v_position integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='28000'; END IF;
  SELECT * INTO v_driver FROM public.drivers WHERE auth_user_id=auth.uid() AND is_active=true AND cancelled_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'DRIVER_NOT_FOUND' USING errcode='42501'; END IF;
  SELECT * INTO v_office FROM public.offices WHERE office_code='RAS_SEDR' AND office_type='BRANCH' AND is_active=true;
  IF NOT FOUND OR v_office.latitude IS NULL OR v_office.longitude IS NULL THEN RAISE EXCEPTION 'RAS_SEDR_GEOFENCE_NOT_CONFIGURED'; END IF;
  SELECT * INTO v_location FROM public.driver_live_locations WHERE driver_id=v_driver.driver_id;
  IF FOUND AND v_location.captured_at>=now()-interval '10 minutes' AND v_location.captured_at<=now()+interval '1 minute' AND v_location.accuracy_m IS NOT NULL AND v_location.accuracy_m<=100 THEN
    v_distance_m:=6371000*2*asin(sqrt(least(1,greatest(0,power(sin(radians(v_location.latitude-v_office.latitude)/2),2)+cos(radians(v_office.latitude))*cos(radians(v_location.latitude))*power(sin(radians(v_location.longitude-v_office.longitude)/2),2)))));
    v_inside:=v_distance_m<=coalesce(v_office.geofence_radius_m,10000);
  END IF;
  SELECT * INTO v_entry FROM public.waiting_list_entries WHERE driver_id=v_driver.driver_id AND office_id=v_office.office_id AND status='WAITING' ORDER BY arrived_at DESC LIMIT 1;
  IF FOUND THEN SELECT count(*)::integer+1 INTO v_position FROM public.waiting_list_entries w WHERE w.office_id=v_office.office_id AND w.status='WAITING' AND (w.arrived_at<v_entry.arrived_at OR (w.arrived_at=v_entry.arrived_at AND w.entry_id<v_entry.entry_id)); END IF;
  SELECT * INTO v_window FROM public.dispatch_windows WHERE office_id=v_office.office_id ORDER BY opened_at DESC LIMIT 1;
  SELECT * INTO v_choice FROM public.driver_load_choices c WHERE c.driver_id=v_driver.driver_id AND c.dispatch_window_id=v_window.dispatch_window_id ORDER BY c.chosen_at DESC LIMIT 1;
  RETURN jsonb_build_object('inside_geofence',v_inside,'distance_m',v_distance_m,'radius_m',coalesce(v_office.geofence_radius_m,10000),'location_updated_at',v_location.captured_at,'office_name',v_office.name,
    'queue_status',CASE WHEN NOT v_inside THEN 'OUTSIDE' WHEN v_entry.entry_id IS NOT NULL THEN 'WAITING' WHEN EXISTS(SELECT 1 FROM public.waiting_list_entries w WHERE w.driver_id=v_driver.driver_id AND w.office_id=v_office.office_id AND w.status='ASSIGNED' AND w.assigned_at>now()-interval '1 day') THEN 'ASSIGNED' ELSE 'NOT_REGISTERED' END,
    'queue_position',v_position,'queue_arrived_at',v_entry.arrived_at,'selection_window',CASE WHEN v_window.dispatch_window_id IS NULL THEN null ELSE jsonb_build_object('dispatch_window_id',v_window.dispatch_window_id,'status',v_window.status,'opened_at',v_window.opened_at,'selection_ends_at',v_window.selection_ends_at,'closed_at',v_window.closed_at,'is_open',v_window.status='OPEN' AND now()<v_window.selection_ends_at) END,
    'selected_load_order_id',v_choice.load_order_id,'choice_status',v_choice.status,'choice_outcome_reason',v_choice.outcome_reason,'chosen_at',v_choice.chosen_at,
    'available_loads',CASE WHEN v_inside AND v_entry.entry_id IS NOT NULL AND v_window.status='OPEN' AND now()<v_window.selection_ends_at THEN coalesce((SELECT jsonb_agg(jsonb_build_object('load_order_id',lo.load_order_id,'order_number',lo.order_number,'factory_name',f.name,'quarry_name',q.name,'factory_id',f.factory_id,'quarry_id',q.quarry_id,'requested_quantity',lo.requested_quantity,'committed_quantity',(SELECT count(*) FROM public.bookings b WHERE b.load_order_id=lo.load_order_id AND b.status<>'CANCELLED'),'remaining_quantity',greatest(0,lo.requested_quantity-(SELECT count(*) FROM public.bookings b WHERE b.load_order_id=lo.load_order_id AND b.status<>'CANCELLED')),'priority',lo.priority,'status',lo.status,'selection_ends_at',v_window.selection_ends_at,'is_selected',v_choice.load_order_id=lo.load_order_id AND v_choice.status='CHOSEN') ORDER BY lo.priority,lo.created_at) FROM public.load_orders lo JOIN public.factories f ON f.factory_id=lo.factory_id JOIN public.quarries q ON q.quarry_id=lo.quarry_id WHERE lo.dispatch_window_id=v_window.dispatch_window_id AND lo.status IN ('PUBLISHED','IN_PROGRESS') AND f.cancelled_at IS NULL AND q.cancelled_at IS NULL AND (SELECT count(*) FROM public.bookings b WHERE b.load_order_id=lo.load_order_id AND b.status<>'CANCELLED')<lo.requested_quantity),'[]'::jsonb) ELSE '[]'::jsonb END,
    'notifications',coalesce((SELECT jsonb_agg(jsonb_build_object('notification_id',n.notification_id,'notification_type',n.notification_type,'title',n.title,'body',n.body,'created_at',n.created_at,'payload',n.payload) ORDER BY n.created_at DESC) FROM (SELECT * FROM public.notifications WHERE recipient_driver_id=v_driver.driver_id AND notification_type IN ('LOAD_SELECTION_OPEN','LOAD_REQUEST_ACCEPTED','LOAD_REQUEST_NOT_ALLOCATED','LOAD_REDIRECTED','LOAD_CANCELLED') AND created_at>=now()-interval '24 hours' ORDER BY created_at DESC LIMIT 5) n),'[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.driver_get_dispatch_state() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.driver_get_dispatch_state() TO authenticated;

NOTIFY pgrst,'reload schema';
