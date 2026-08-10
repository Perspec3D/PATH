-- Remove ADMIN restriction from private.create_project_revision
create or replace function private.create_project_revision(
  p_family_id uuid,
  p_admin_internal_user_id uuid,
  p_start_date date,
  p_delivery_date date,
  p_assignee_id uuid,
  p_notes text default null
)
returns setof public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := (select auth.uid());
  v_family public.project_families%rowtype;
  v_current public.projects%rowtype;
  v_new public.projects%rowtype;
  v_next_revision integer;
begin
  if v_workspace_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  -- Verify p_admin_internal_user_id is an active user in the workspace (no longer requiring role = 'ADMIN')
  perform 1 from public.internal_users iu
  where iu.id = p_admin_internal_user_id
    and iu.workspace_id = v_workspace_id
    and iu.is_active is true;
  if not found then
    raise exception using errcode = 'P0001', message = 'INTERNAL_USER_REQUIRED';
  end if;

  select * into v_family
  from public.project_families pf
  where pf.id = p_family_id and pf.workspace_id = v_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROJECT_FAMILY_NOT_FOUND';
  end if;

  perform 1 from public.internal_users iu
  where iu.id = p_assignee_id and iu.workspace_id = v_workspace_id and iu.is_active is true;
  if not found then
    raise exception using errcode = 'P0001', message = 'ASSIGNEE_NOT_FOUND';
  end if;

  if p_start_date is null or p_delivery_date is null or p_start_date > p_delivery_date then
    raise exception using errcode = '23514', message = 'INVALID_PROJECT_REVISION_PERIOD';
  end if;

  select * into v_current
  from public.projects p
  where p.family_id = p_family_id and p.is_current_revision is true
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'CURRENT_PROJECT_REVISION_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.work_sessions ws
    join public.activity_executions ae on ae.id = ws.activity_execution_id
    join public.project_activities pa on pa.id = ae.project_activity_id
    where pa.project_id = v_current.id and ws.ended_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_WORK_SESSION_MUST_BE_PAUSED';
  end if;

  select coalesce(max(p.revision_number), -1) + 1 into v_next_revision
  from public.projects p
  where p.family_id = p_family_id;

  perform pg_catalog.set_config('perspec.internal_revision_transition', 'on', true);

  update public.projects
  set is_current_revision = false
  where id = v_current.id;

  insert into public.projects (
    workspace_id, client_id, assignee_id, code, name, photo_url,
    revision, revision_number, is_current_revision, family_id, status,
    start_date, delivery_date, due_date, notes, created_at
  ) values (
    v_workspace_id, v_current.client_id, p_assignee_id, v_family.code, v_current.name, v_current.photo_url,
    pg_catalog.format('Rev.%s', pg_catalog.lpad(v_next_revision::text, 2, '0')),
    v_next_revision, true, p_family_id, 'Fila de Espera',
    p_start_date, p_delivery_date, p_delivery_date, nullif(pg_catalog.btrim(p_notes), ''), now()
  ) returning * into v_new;

  return next v_new;
end;
$$;
