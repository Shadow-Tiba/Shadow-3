-- Fix account statements to read delivery confirmation from its own table.
-- actual_loading_records intentionally has no delivery_confirmed_at column.
-- This migration changes only the reporting RPC; it does not add columns or modify data.

create or replace function public.get_account_statement_records(
  p_from date default null,
  p_to date default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  -- Account statements are Main Office only; a role label alone is insufficient.
  perform public.current_main_office_user();

  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'INVALID_DATE_RANGE';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'actual_load_id', alr.actual_load_id,
        'booking_id', alr.booking_id,
        'load_date', coalesce(alr.load_date, alr.loaded_at::date),
        'loading_sequence_date', coalesce(alr.loading_sequence_date, alr.load_date, alr.loaded_at::date),
        'created_at', alr.created_at,
        'trip_code', coalesce(alr.trip_code, b.trip_code),
        'daily_load_number', coalesce(alr.daily_load_number, lo.order_number),
        'ticket_number', alr.ticket_number,
        'actual_weight', alr.actual_weight,
        'vehicle_id', coalesce(alr.vehicle_id, b.vehicle_id),
        'plate_number', v.plate_number,
        'driver_id', coalesce(alr.driver_id, b.driver_id),
        'driver_name', d.name,
        'factory_id', coalesce(alr.factory_id, lo.factory_id),
        'factory_name', f.name,
        'quarry_id', coalesce(alr.quarry_id, lo.quarry_id),
        'quarry_name', q.name,
        'scale_image_path', alr.scale_image_path,
        'delivery_confirmed_at', dc.confirmed_at,
        'actual_weight_recorded_at', alr.actual_weight_recorded_at,
        'record_source', alr.record_source,
        'source_record_id', alr.source_record_id,
        'source_file_name', alr.source_file_name,
        'source_row_number', alr.source_row_number,
        'imported_at', alr.imported_at
      )
      order by coalesce(alr.load_date, alr.loaded_at::date, alr.created_at::date) desc,
               alr.created_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.actual_loading_records alr
  left join public.bookings b on b.booking_id = alr.booking_id
  left join public.load_orders lo on lo.load_order_id = b.load_order_id
  left join public.vehicles v on v.vehicle_id = coalesce(alr.vehicle_id, b.vehicle_id)
  left join public.drivers d on d.driver_id = coalesce(alr.driver_id, b.driver_id)
  left join public.factories f on f.factory_id = coalesce(alr.factory_id, lo.factory_id)
  left join public.quarries q on q.quarry_id = coalesce(alr.quarry_id, lo.quarry_id)
  left join public.delivery_confirmations dc on dc.booking_id = b.booking_id
  where (p_from is null or coalesce(alr.load_date, alr.loaded_at::date, alr.created_at::date) >= p_from)
    and (p_to is null or coalesce(alr.load_date, alr.loaded_at::date, alr.created_at::date) <= p_to);

  return v_result;
end;
$$;

revoke all on function public.get_account_statement_records(date, date) from public, anon, authenticated;
grant execute on function public.get_account_statement_records(date, date) to authenticated;

notify pgrst, 'reload schema';
