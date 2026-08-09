-- Prevent installing prospective guards while historical rows still violate
-- the invariant. This block is read-only and never adjusts business dates.
do $$
begin
  if exists (
    select 1
    from public.project_activities pa
    join public.projects p on p.id = pa.project_id
    where pa.workspace_id is distinct from p.workspace_id
       or p.start_date is null
       or p.delivery_date is null
       or pa.start_date is null
       or pa.delivery_date is null
       or pa.start_date < p.start_date
       or pa.delivery_date > p.delivery_date
       or pa.start_date > pa.delivery_date
  ) then
    raise exception using
      errcode = '23514',
      message = 'EXISTING_PROJECT_ACTIVITY_DATE_INTEGRITY_VIOLATION';
  end if;
end;
$$;

-- Supports the parent-date guard and the existing composite project/workspace FK.
create index if not exists project_activities_project_workspace_idx
  on public.project_activities (project_id, workspace_id);

create or replace function public.enforce_project_activity_date_integrity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_workspace_id uuid;
  v_project_start_date date;
  v_project_delivery_date date;
begin
  -- The share lock serializes activity validation with project date updates.
  select p.workspace_id, p.start_date, p.delivery_date
    into v_project_workspace_id, v_project_start_date, v_project_delivery_date
  from public.projects p
  where p.id = new.project_id
  for share;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'PROJECT_ACTIVITY_PROJECT_NOT_FOUND';
  end if;

  if new.workspace_id is distinct from v_project_workspace_id then
    raise exception using
      errcode = '23514',
      message = 'PROJECT_ACTIVITY_WORKSPACE_MISMATCH';
  end if;

  if v_project_start_date is null
     or v_project_delivery_date is null
     or new.start_date is null
     or new.delivery_date is null
     or new.start_date < v_project_start_date
     or new.delivery_date > v_project_delivery_date
     or new.start_date > new.delivery_date then
    raise exception using
      errcode = '23514',
      message = 'PROJECT_ACTIVITY_OUTSIDE_PROJECT_PERIOD',
      detail = pg_catalog.format(
        'Project period: %s to %s. Activity period: %s to %s.',
        v_project_start_date,
        v_project_delivery_date,
        new.start_date,
        new.delivery_date
      );
  end if;

  return new;
end;
$$;

create or replace function public.protect_project_dates_from_activity_conflicts()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_affected_activities text;
begin
  if new.start_date is not distinct from old.start_date
     and new.delivery_date is not distinct from old.delivery_date then
    return new;
  end if;

  select pg_catalog.string_agg(
           pg_catalog.format('%s [%s to %s]', pa.name, pa.start_date, pa.delivery_date),
           ', '
           order by pa.order_index, pa.created_at
         )
    into v_affected_activities
  from public.project_activities pa
  where pa.project_id = old.id
    and pa.workspace_id = old.workspace_id
    and (
      new.start_date is null
      or new.delivery_date is null
      or new.start_date > new.delivery_date
      or pa.start_date is null
      or pa.delivery_date is null
      or pa.start_date < new.start_date
      or pa.delivery_date > new.delivery_date
      or pa.start_date > pa.delivery_date
    );

  if v_affected_activities is not null then
    raise exception using
      errcode = '23514',
      message = 'PROJECT_DATE_RANGE_EXCLUDES_ACTIVITIES',
      detail = v_affected_activities;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_project_activity_dates_within_project on public.project_activities;
create trigger enforce_project_activity_dates_within_project
before insert or update of project_id, workspace_id, start_date, delivery_date
on public.project_activities
for each row
execute function public.enforce_project_activity_date_integrity();

drop trigger if exists protect_project_dates_from_activity_conflicts on public.projects;
create trigger protect_project_dates_from_activity_conflicts
before update of start_date, delivery_date
on public.projects
for each row
execute function public.protect_project_dates_from_activity_conflicts();

-- Trigger functions are internal database mechanisms, not public RPCs.
revoke all on function public.enforce_project_activity_date_integrity() from public, anon, authenticated;
revoke all on function public.protect_project_dates_from_activity_conflicts() from public, anon, authenticated;
