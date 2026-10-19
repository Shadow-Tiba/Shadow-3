-- Tiba-Supplies v191 contract gate.
-- Run only against a disposable clean PostgreSQL database after applying the proposed
-- clean migration chain. This is an assertion script, not a migration.
-- Expected to FAIL while v191 RPCs are unresolved; do not run against Production.

begin;

do $gate$
declare
  missing text[];
  rpc_name text;
  required_rpcs text[] := array[
    'driver_get_pending_assignments',
    'driver_get_dispatch_state',
    'driver_get_portal_snapshot',
    'driver_select_load',
    'driver_confirm_delivery',
    'accept_direct_assignment',
    'driver_update_live_location',
    'driver_confirm_arrival',
    'driver_check_in_queue'
  ];
begin
  select array_agg(x) into missing
  from unnest(required_rpcs) as x
  where not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = x
  );

  if missing is not null then
    raise exception 'V191_RPC_MISSING: %', array_to_string(missing, ', ');
  end if;

  -- The eight-argument delivery contract is what the v191 client calls by named args.
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'driver_confirm_delivery'
      and p.proargnames @> array[
        'p_booking_id','p_latitude','p_longitude','p_accuracy_m',
        'p_captured_at','p_actual_weight','p_scale_image_path','p_notes'
      ]::text[]
  ) then
    raise exception 'V191_DELIVERY_SIGNATURE_MISMATCH: expected named arguments booking, lat/lon, accuracy, captured_at, actual_weight, scale_image_path, notes';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'driver_confirm_arrival'
      and p.proargnames @> array[
        'p_booking_id','p_latitude','p_longitude','p_accuracy_m','p_captured_at'
      ]::text[]
  ) then
    raise exception 'V191_ARRIVAL_SIGNATURE_MISMATCH';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'driver_select_load'
      and p.proargnames @> array['p_load_order_id']::text[]
  ) then
    raise exception 'V191_SELECT_LOAD_SIGNATURE_MISMATCH';
  end if;
end
$gate$;

do $schema$
declare
  missing text[];
  required_columns text[][] := array[
    array['public','bookings','booking_id'],
    array['public','bookings','driver_id'],
    array['public','bookings','vehicle_id'],
    array['public','bookings','status'],
    array['public','bookings','trip_code'],
    array['public','actual_loading_records','booking_id'],
    array['public','actual_loading_records','actual_weight'],
    array['public','actual_loading_records','scale_image_path'],
    array['public','actual_loading_records','load_date'],
    array['public','actual_loading_records','vehicle_id'],
    array['public','actual_loading_records','driver_id'],
    array['public','actual_loading_records','quarry_id'],
    array['public','actual_loading_records','factory_id'],
    array['public','actual_loading_records','trip_code'],
    array['public','actual_loading_records','daily_load_number'],
    array['public','actual_loading_records','loading_sequence_date'],
    array['public','actual_loading_records','actual_weight_recorded_at'],
    array['public','actual_loading_records','record_source'],
    array['public','actual_loading_records','source_record_id'],
    array['public','actual_loading_records','source_file_name'],
    array['public','actual_loading_records','source_row_number'],
    array['public','actual_loading_records','imported_at'],
    array['public','loading_data_records','booking_id'],
    array['public','loading_data_records','trip_code'],
    array['public','loading_data_records','booking_status'],
    array['public','driver_live_locations','driver_id'],
    array['public','driver_live_locations','latitude'],
    array['public','driver_live_locations','longitude'],
    array['public','driver_live_locations','accuracy_m'],
    array['public','driver_live_locations','captured_at']
  ];
  item text[];
begin
  foreach item slice 1 in array required_columns loop
    if not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = item[1]
        and c.table_name = item[2]
        and c.column_name = item[3]
    ) then
      missing := array_append(missing, item[2] || '.' || item[3]);
    end if;
  end loop;

  if missing is not null then
    raise exception 'V191_REQUIRED_COLUMN_MISSING: %', array_to_string(missing, ', ');
  end if;
end
$schema$;


do $lifecycle$
declare
  v_office_def text;
  v_delivery_def text;
  v_vehicle_report_def text;
  v_account_statement_def text;
  v_booking_id_nullable text;
begin
  if to_regclass('public.loading_data_records') is null then
    raise exception 'V191_LOADING_DATA_SCHEMA_MISSING';
  end if;

  select is_nullable into v_booking_id_nullable
  from information_schema.columns
  where table_schema='public' and table_name='actual_loading_records'
    and column_name='booking_id';
  if v_booking_id_nullable <> 'YES' then
    raise exception 'V191_PAPER_ACTUAL_RECORDS_REQUIRE_NULLABLE_BOOKING_ID';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.bookings'::regclass
      and tgname='bookings_sync_loading_data'
      and not tgisinternal and tgenabled <> 'D'
  ) then
    raise exception 'V191_LOADING_DATA_SYNC_TRIGGER_MISSING';
  end if;

  if to_regclass('public.daily_loading_counters') is null then
    raise exception 'V191_DAILY_LOADING_COUNTER_MISSING';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.actual_loading_records'::regclass
      and tgname='actual_loading_assign_trip_identity'
      and not tgisinternal and tgenabled <> 'D'
  ) then
    raise exception 'V191_ACTUAL_LOADING_IDENTITY_TRIGGER_MISSING';
  end if;
  if has_table_privilege('anon','public.daily_loading_counters','SELECT')
     or has_table_privilege('authenticated','public.daily_loading_counters','SELECT')
     or has_table_privilege('anon','public.daily_loading_counters','UPDATE')
     or has_table_privilege('authenticated','public.daily_loading_counters','UPDATE') then
    raise exception 'V191_DAILY_LOADING_COUNTER_DIRECT_ACCESS_EXPOSED';
  end if;

  if has_table_privilege('anon','public.loading_data_records','SELECT')
     or has_table_privilege('authenticated','public.loading_data_records','SELECT')
     or has_table_privilege('anon','public.loading_data_records','INSERT')
     or has_table_privilege('authenticated','public.loading_data_records','INSERT') then
    raise exception 'V191_LOADING_DATA_DIRECT_ACCESS_EXPOSED';
  end if;

  -- Storage predicates must use narrow SECURITY DEFINER helpers because direct
  -- SELECT on bookings/drivers/app_users is intentionally revoked from client roles.
  if not has_function_privilege('authenticated','public.can_upload_scale_ticket(text)','EXECUTE')
     or not has_function_privilege('authenticated','public.can_read_scale_ticket(text)','EXECUTE')
     or not has_function_privilege('authenticated','public.can_delete_scale_ticket(text)','EXECUTE') then
    raise exception 'V191_SCALE_TICKET_POLICY_HELPER_GRANTS_MISSING';
  end if;
  if has_function_privilege('anon','public.can_upload_scale_ticket(text)','EXECUTE')
     or has_function_privilege('anon','public.can_read_scale_ticket(text)','EXECUTE')
     or has_function_privilege('anon','public.can_delete_scale_ticket(text)','EXECUTE') then
    raise exception 'V191_SCALE_TICKET_POLICY_HELPERS_EXPOSED_TO_ANON';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='driver_upload_own_scale_ticket'
      and position('can_upload_scale_ticket' in lower(coalesce(with_check,'')))>0
  ) or not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='read_scale_tickets_for_driver_or_office'
      and position('can_read_scale_ticket' in lower(coalesce(qual,'')))>0
  ) or not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='driver_delete_unconfirmed_scale_ticket'
      and position('can_delete_scale_ticket' in lower(coalesce(qual,'')))>0
  ) then
    raise exception 'V191_SCALE_TICKET_STORAGE_POLICIES_MISSING_OR_UNSCOPED';
  end if;

  v_office_def := upper(pg_get_functiondef(
    'public.main_office_advance_booking(uuid,text,numeric,text,text)'::regprocedure
  ));
  if position('INSERT INTO PUBLIC.ACTUAL_LOADING_RECORDS' in v_office_def) > 0 then
    raise exception 'V191_OFFICE_LOADED_TRANSITION_MUST_NOT_WRITE_ACTUAL_WEIGHT';
  end if;
  if position('ACTUAL_WEIGHT_CAPTURED_AT_DELIVERY' in v_office_def) = 0 then
    raise exception 'V191_LEGACY_OFFICE_WEIGHT_INPUT_NOT_RETIRED';
  end if;

  v_vehicle_report_def := upper(pg_get_functiondef(
    'public.get_vehicle_owner_reports(date,date)'::regprocedure
  ));
  v_account_statement_def := upper(pg_get_functiondef(
    'public.get_account_statement_records(date,date)'::regprocedure
  ));
  if position('CURRENT_MAIN_OFFICE_USER' in v_vehicle_report_def) = 0
     or position('CURRENT_MAIN_OFFICE_USER' in v_account_statement_def) = 0 then
    raise exception 'V191_REPORTING_OFFICE_SCOPE_HARDENING_MISSING';
  end if;

  v_delivery_def := upper(pg_get_functiondef(
    'public.driver_confirm_delivery(uuid,double precision,double precision,double precision,timestamp with time zone,numeric,text,text)'::regprocedure
  ));
  if position('INSERT INTO PUBLIC.ACTUAL_LOADING_RECORDS' in v_delivery_def) = 0
     or position('DRIVER_DELIVERY' in v_delivery_def) = 0
     or position('ACTUAL_WEIGHT_RECORDED_AT' in v_delivery_def) = 0 then
    raise exception 'V191_DRIVER_DELIVERY_MUST_WRITE_ACTUAL_WEIGHT_AND_EVIDENCE';
  end if;
end
$lifecycle$;

-- Assignment model is deliberately asserted as a single canonical relation.
-- This gate currently accepts the newer name only; if source pinning proves that
-- v191 requires the historical name instead, update this test with a documented decision.
do $assignment$
begin
  if to_regclass('public.driver_vehicle_assignments') is null then
    raise exception 'V191_ASSIGNMENT_MODEL_UNRESOLVED: public.driver_vehicle_assignments is absent';
  end if;

  if to_regclass('public.vehicle_driver_assignments') is not null then
    raise exception 'DUPLICATE_ASSIGNMENT_MODELS: both assignment table names exist; reconcile instead of maintaining two sources of truth';
  end if;
end
$assignment$;


-- Global security posture regression gate: client table access stays RPC-only,
-- and SECURITY DEFINER functions must not be executable by anon/PUBLIC or lack a fixed search_path.
do $security$
declare
  unsafe_tables text[];
  exposed_tables text[];
  unsafe_definers text[];
begin
  select array_agg(format('%I.%I', n.nspname, c.relname)) into unsafe_tables
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relkind in ('r','p')
    and not c.relrowsecurity;

  if unsafe_tables is not null then
    raise exception 'SECURITY_RLS_DISABLED: %', array_to_string(unsafe_tables, ', ');
  end if;

  select array_agg(format('%I.%I', n.nspname, c.relname)) into exposed_tables
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relkind in ('r','p')
    and (
      has_table_privilege('anon', c.oid, 'SELECT')
      or has_table_privilege('anon', c.oid, 'INSERT')
      or has_table_privilege('anon', c.oid, 'UPDATE')
      or has_table_privilege('anon', c.oid, 'DELETE')
      or has_table_privilege('authenticated', c.oid, 'SELECT')
      or has_table_privilege('authenticated', c.oid, 'INSERT')
      or has_table_privilege('authenticated', c.oid, 'UPDATE')
      or has_table_privilege('authenticated', c.oid, 'DELETE')
    );

  if exposed_tables is not null then
    raise exception 'SECURITY_DIRECT_CLIENT_TABLE_GRANTS: %', array_to_string(exposed_tables, ', ');
  end if;

  select array_agg(format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)))
  into unsafe_definers
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and (
      p.proconfig is null
      or not exists (select 1 from unnest(p.proconfig) setting where setting like 'search_path=%')
      or has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('public', p.oid, 'EXECUTE')
    );

  if unsafe_definers is not null then
    raise exception 'SECURITY_DEFINER_GRANT_OR_SEARCH_PATH_UNSAFE: %', array_to_string(unsafe_definers, ', ');
  end if;
end
$security$;

rollback;
