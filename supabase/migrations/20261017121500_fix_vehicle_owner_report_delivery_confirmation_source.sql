-- Fix vehicle-owner reports to source delivery confirmation from delivery_confirmations.
-- actual_loading_records intentionally has no delivery_confirmed_at column.

create or replace function public.get_vehicle_owner_reports(
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
  perform public.current_main_office_user();
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'INVALID_DATE_RANGE';
  end if;

  select jsonb_build_object(
    'vehicles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'vehicle_id', v.vehicle_id,
        'plate_number', v.plate_number,
        'vehicle_code', v.vehicle_code,
        'owner_id', vo.owner_id,
        'owner_name', vo.name,
        'owner_phone', vo.phone,
        'is_active', v.is_active
      ) order by v.plate_number)
      from public.vehicles v
      left join public.vehicle_owners vo on vo.owner_id = v.owner_id
    ), '[]'::jsonb),
    'owners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'owner_id', vo.owner_id,
        'name', vo.name,
        'phone', vo.phone,
        'is_active', vo.is_active,
        'vehicle_count', (
          select count(*) from public.vehicles v2
          where v2.owner_id = vo.owner_id
        )
      ) order by vo.name)
      from public.vehicle_owners vo
    ), '[]'::jsonb),
    'trips', coalesce((
      select jsonb_agg(jsonb_build_object(
        'actual_load_id', alr.actual_load_id,
        'booking_id', alr.booking_id,
        'trip_code', coalesce(alr.trip_code, b.trip_code),
        'daily_load_number', coalesce(alr.daily_load_number, lo.order_number),
        'loading_sequence_date', coalesce(alr.loading_sequence_date, alr.load_date, alr.loaded_at::date),
        'load_date', coalesce(alr.load_date, alr.loaded_at::date),
        'created_at', alr.created_at,
        'vehicle_id', coalesce(alr.vehicle_id, b.vehicle_id),
        'plate_number', v.plate_number,
        'vehicle_code', v.vehicle_code,
        'owner_id', vo.owner_id,
        'owner_name', vo.name,
        'driver_name', d.name,
        'quarry_name', q.name,
        'factory_name', f.name,
        'ticket_number', alr.ticket_number,
        'actual_weight', alr.actual_weight,
        'scale_image_path', alr.scale_image_path,
        'delivery_confirmed_at', dc.confirmed_at,
        'actual_weight_recorded_at', alr.actual_weight_recorded_at,
        'record_source', alr.record_source,
        'source_record_id', alr.source_record_id,
        'source_file_name', alr.source_file_name,
        'source_row_number', alr.source_row_number,
        'imported_at', alr.imported_at,
        'is_completed', (
          alr.actual_weight is not null
          and (b.booking_id is null or dc.confirmed_at is not null)
        )
      ) order by coalesce(alr.load_date, alr.loaded_at::date, alr.created_at::date) desc,
                 alr.created_at desc)
      from public.actual_loading_records alr
      left join public.bookings b on b.booking_id = alr.booking_id
      left join public.load_orders lo on lo.load_order_id = b.load_order_id
      left join public.vehicles v on v.vehicle_id = coalesce(alr.vehicle_id, b.vehicle_id)
      left join public.vehicle_owners vo on vo.owner_id = v.owner_id
      left join public.drivers d on d.driver_id = coalesce(alr.driver_id, b.driver_id)
      left join public.factories f on f.factory_id = coalesce(alr.factory_id, lo.factory_id)
      left join public.quarries q on q.quarry_id = coalesce(alr.quarry_id, lo.quarry_id)
      left join public.delivery_confirmations dc on dc.booking_id = b.booking_id
      where (p_from is null or coalesce(alr.load_date, alr.loaded_at::date, alr.created_at::date) >= p_from)
        and (p_to is null or coalesce(alr.load_date, alr.loaded_at::date, alr.created_at::date) <= p_to)
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_vehicle_owner_reports(date, date) from public, anon, authenticated;
grant execute on function public.get_vehicle_owner_reports(date, date) to authenticated;

notify pgrst, 'reload schema';
