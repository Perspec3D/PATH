-- Migration: Add capacity validation to project activities based on workspace work journey
create or replace function public.enforce_project_activity_capacity_integrity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_work_start text;
  v_work_end text;
  v_lunch_min int;
  v_work_days int[];
  v_hours_per_day numeric;
  v_business_days int := 0;
  v_curr_date date;
  v_dow int;
  v_max_capacity numeric;
  v_start_time time;
  v_end_time time;
  v_diff_seconds int;
begin
  if new.start_date is null or new.delivery_date is null or new.estimated_duration_hours is null then
    return new;
  end if;

  if new.estimated_duration_hours <= 0 then
    return new;
  end if;

  -- Load the workspace configuration
  select work_start_time, work_end_time, lunch_duration_minutes, work_days
    into v_work_start, v_work_end, v_lunch_min, v_work_days
  from public.profiles
  where id = new.workspace_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'WORKSPACE_PROFILE_NOT_FOUND';
  end if;

  -- Default fallbacks
  if v_work_start is null then v_work_start := '08:00'; end if;
  if v_work_end is null then v_work_end := '18:00'; end if;
  if v_lunch_min is null then v_lunch_min := 60; end if;
  if v_work_days is null then v_work_days := ARRAY[1, 2, 3, 4, 5]; end if;

  -- Calculate the daily work duration in hours
  v_start_time := cast(v_work_start || ':00' as time);
  v_end_time := cast(v_work_end || ':00' as time);
  
  if v_end_time > v_start_time then
    v_diff_seconds := extract(epoch from (v_end_time - v_start_time))::int;
    v_hours_per_day := (v_diff_seconds::numeric / 3600.0) - (v_lunch_min::numeric / 60.0);
  else
    v_hours_per_day := 0;
  end if;
  
  if v_hours_per_day < 0 then
    v_hours_per_day := 0;
  end if;

  -- Count business days in the range [start_date, delivery_date]
  v_curr_date := new.start_date;
  while v_curr_date <= new.delivery_date loop
    v_dow := extract(dow from v_curr_date)::int;
    if v_dow = any(v_work_days) then
      v_business_days := v_business_days + 1;
    end if;
    v_curr_date := v_curr_date + 1;
  end loop;

  v_max_capacity := v_business_days::numeric * v_hours_per_day;

  if new.estimated_duration_hours > v_max_capacity then
    raise exception using
      errcode = '23514',
      message = 'ACTIVITY_DURATION_EXCEEDS_CAPACITY',
      detail = pg_catalog.format(
        'Duration: %s hours. Max capacity: %s hours (Business days: %s, Journey: %s).',
        new.estimated_duration_hours,
        v_max_capacity,
        v_business_days,
        v_hours_per_day
      );
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_project_activity_capacity_integrity on public.project_activities;
create trigger enforce_project_activity_capacity_integrity
before insert or update of workspace_id, start_date, delivery_date, estimated_duration_hours
on public.project_activities
for each row
execute function public.enforce_project_activity_capacity_integrity();

revoke all on function public.enforce_project_activity_capacity_integrity() from public, anon, authenticated;
