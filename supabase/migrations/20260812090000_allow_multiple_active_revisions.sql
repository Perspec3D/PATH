-- Migration: Allow multiple active revisions with administrative authorization
-- 1. Drop the unique index that limits to one active revision per family
drop index if exists public.projects_one_current_revision_per_family_idx;

-- 2. Update private.create_project_revision to support deactivating all other revisions in the family
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

  -- Verify p_admin_internal_user_id is an active user in the workspace
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

  -- Select the latest revision of this family to use as metadata template (name, client_id, etc.)
  select * into v_current
  from public.projects p
  where p.id = (
    select id from public.projects
    where family_id = p_family_id
    order by revision_number desc
    limit 1
  )
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'CURRENT_PROJECT_REVISION_NOT_FOUND';
  end if;

  -- Check if ANY active revision of this family has active work sessions
  if exists (
    select 1
    from public.work_sessions ws
    join public.activity_executions ae on ae.id = ws.activity_execution_id
    join public.project_activities pa on pa.id = ae.project_activity_id
    join public.projects p on p.id = pa.project_id
    where p.family_id = p_family_id and p.is_current_revision is true and ws.ended_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_WORK_SESSION_MUST_BE_PAUSED';
  end if;

  select coalesce(max(p.revision_number), -1) + 1 into v_next_revision
  from public.projects p
  where p.family_id = p_family_id;

  perform pg_catalog.set_config('perspec.internal_revision_transition', 'on', true);

  -- Deactivate all currently active revisions in the family (standard rule: only one active revision)
  update public.projects
  set is_current_revision = false
  where family_id = p_family_id;

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


-- 3. Update private.reactivate_project_revision to set all other revisions to false (standard rule: only one active revision)
create or replace function private.reactivate_project_revision(
  p_family_id uuid,
  p_target_project_id uuid,
  p_actor_internal_user_id uuid
)
returns setof public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := (select auth.uid());
  v_family public.project_families%rowtype;
  v_target public.projects%rowtype;
begin
  if v_workspace_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  -- Validate that the actor is an active user in the workspace
  perform 1 from public.internal_users iu
  where iu.id = p_actor_internal_user_id
    and iu.workspace_id = v_workspace_id
    and iu.is_active is true;
  if not found then
    raise exception using errcode = 'P0001', message = 'INTERNAL_USER_REQUIRED';
  end if;

  -- 1. Validate family and lock it
  select * into v_family
  from public.project_families pf
  where pf.id = p_family_id and pf.workspace_id = v_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROJECT_FAMILY_NOT_FOUND';
  end if;

  -- 2. Validate target revision
  select * into v_target
  from public.projects p
  where p.id = p_target_project_id 
    and p.family_id = p_family_id 
    and p.workspace_id = v_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TARGET_PROJECT_REVISION_NOT_FOUND';
  end if;

  -- 3. If target is already the only active revision, just return it
  if v_target.is_current_revision is true and not exists (
    select 1 from public.projects p
    where p.family_id = p_family_id and p.is_current_revision is true and p.id <> p_target_project_id
  ) then
    return next v_target;
    return;
  end if;

  -- 4. Prevent transition if there is any active work session in any active revision of the family (except target itself if it is already active)
  if exists (
    select 1
    from public.work_sessions ws
    join public.activity_executions ae on ae.id = ws.activity_execution_id
    join public.project_activities pa on pa.id = ae.project_activity_id
    join public.projects p on p.id = pa.project_id
    where p.family_id = p_family_id 
      and p.is_current_revision is true 
      and p.id <> p_target_project_id
      and ws.ended_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_WORK_SESSION_MUST_BE_PAUSED';
  end if;

  -- Enable transition mode config
  perform pg_catalog.set_config('perspec.internal_revision_transition', 'on', true);

  -- 5. Deactivate all revisions in the family
  update public.projects
  set is_current_revision = false
  where family_id = p_family_id;

  -- 6. Activate target revision
  update public.projects
  set is_current_revision = true
  where id = v_target.id
  returning * into v_target;

  -- 7. Log the change in public.logs
  insert into public.logs (
    workspace_id, user_id, user_name, user_role, module, action, details, item_id
  )
  select
    v_workspace_id,
    iu.id,
    iu.username,
    iu.role,
    'Projetos',
    'UPDATE',
    pg_catalog.format(
      'Revisão %s (%s) reativada como única ativa da família.',
      v_target.revision, v_target.name
    ),
    v_target.id
  from public.internal_users iu
  where iu.id = p_actor_internal_user_id;

  return next v_target;
end;
$$;


-- 4. Create the private activate simultaneously function
create or replace function private.activate_project_revision_simultaneously(
  p_family_id uuid,
  p_target_project_id uuid,
  p_actor_internal_user_id uuid
)
returns setof public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := (select auth.uid());
  v_family public.project_families%rowtype;
  v_target public.projects%rowtype;
begin
  if v_workspace_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  -- Verify actor is an active ADMIN in the workspace
  perform 1 from public.internal_users iu
  where iu.id = p_actor_internal_user_id
    and iu.workspace_id = v_workspace_id
    and iu.is_active is true
    and iu.role = 'ADMIN';
  if not found then
    raise exception using errcode = 'P0001', message = 'ADMIN_REQUIRED';
  end if;

  -- Validate family and lock it
  select * into v_family
  from public.project_families pf
  where pf.id = p_family_id and pf.workspace_id = v_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROJECT_FAMILY_NOT_FOUND';
  end if;

  -- Validate target revision
  select * into v_target
  from public.projects p
  where p.id = p_target_project_id 
    and p.family_id = p_family_id 
    and p.workspace_id = v_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TARGET_PROJECT_REVISION_NOT_FOUND';
  end if;

  -- If target is already active, just return it
  if v_target.is_current_revision is true then
    return next v_target;
    return;
  end if;

  -- Enable transition mode config
  perform pg_catalog.set_config('perspec.internal_revision_transition', 'on', true);

  -- Activate target revision (leaving other revisions as they are)
  update public.projects
  set is_current_revision = true
  where id = v_target.id
  returning * into v_target;

  -- Log the change in public.logs
  insert into public.logs (
    workspace_id, user_id, user_name, user_role, module, action, details, item_id
  )
  select
    v_workspace_id,
    iu.id,
    iu.username,
    iu.role,
    'Projetos',
    'UPDATE',
    pg_catalog.format(
      'Revisão adicional %s (%s) ativada simultaneamente pelo administrador.',
      v_target.revision, v_target.name
    ),
    v_target.id
  from public.internal_users iu
  where iu.id = p_actor_internal_user_id;

  return next v_target;
end;
$$;


-- 5. Create the public activate simultaneously wrapper function
create or replace function public.activate_project_revision_simultaneously(
  p_family_id uuid,
  p_target_project_id uuid,
  p_actor_internal_user_id uuid
)
returns setof public.projects
language sql
security invoker
set search_path = ''
as $$
  select * from private.activate_project_revision_simultaneously(
    p_family_id, p_target_project_id, p_actor_internal_user_id
  );
$$;

revoke all on function private.activate_project_revision_simultaneously(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.activate_project_revision_simultaneously(uuid, uuid, uuid) from public, anon;
grant execute on function public.activate_project_revision_simultaneously(uuid, uuid, uuid) to authenticated;
grant execute on function private.activate_project_revision_simultaneously(uuid, uuid, uuid) to authenticated;


-- 6. Create the private deactivate revision function
create or replace function private.deactivate_project_revision(
  p_family_id uuid,
  p_target_project_id uuid,
  p_actor_internal_user_id uuid
)
returns setof public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := (select auth.uid());
  v_family public.project_families%rowtype;
  v_target public.projects%rowtype;
begin
  if v_workspace_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  -- Verify actor is an active ADMIN in the workspace
  perform 1 from public.internal_users iu
  where iu.id = p_actor_internal_user_id
    and iu.workspace_id = v_workspace_id
    and iu.is_active is true
    and iu.role = 'ADMIN';
  if not found then
    raise exception using errcode = 'P0001', message = 'ADMIN_REQUIRED';
  end if;

  -- Validate family and lock it
  select * into v_family
  from public.project_families pf
  where pf.id = p_family_id and pf.workspace_id = v_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROJECT_FAMILY_NOT_FOUND';
  end if;

  -- Validate target revision
  select * into v_target
  from public.projects p
  where p.id = p_target_project_id 
    and p.family_id = p_family_id 
    and p.workspace_id = v_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TARGET_PROJECT_REVISION_NOT_FOUND';
  end if;

  -- If target is already inactive, just return it
  if v_target.is_current_revision is false then
    return next v_target;
    return;
  end if;

  -- Check if there are active work sessions in this revision
  if exists (
    select 1
    from public.work_sessions ws
    join public.activity_executions ae on ae.id = ws.activity_execution_id
    join public.project_activities pa on pa.id = ae.project_activity_id
    where pa.project_id = p_target_project_id and ws.ended_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_WORK_SESSION_MUST_BE_PAUSED';
  end if;

  -- Enable transition mode config
  perform pg_catalog.set_config('perspec.internal_revision_transition', 'on', true);

  -- Deactivate target revision
  update public.projects
  set is_current_revision = false
  where id = v_target.id
  returning * into v_target;

  -- Log the change in public.logs
  insert into public.logs (
    workspace_id, user_id, user_name, user_role, module, action, details, item_id
  )
  select
    v_workspace_id,
    iu.id,
    iu.username,
    iu.role,
    'Projetos',
    'UPDATE',
    pg_catalog.format(
      'Revisão %s (%s) desativada pelo administrador.',
      v_target.revision, v_target.name
    ),
    v_target.id
  from public.internal_users iu
  where iu.id = p_actor_internal_user_id;

  return next v_target;
end;
$$;


-- 7. Create the public deactivate revision wrapper function
create or replace function public.deactivate_project_revision(
  p_family_id uuid,
  p_target_project_id uuid,
  p_actor_internal_user_id uuid
)
returns setof public.projects
language sql
security invoker
set search_path = ''
as $$
  select * from private.deactivate_project_revision(
    p_family_id, p_target_project_id, p_actor_internal_user_id
  );
$$;

revoke all on function private.deactivate_project_revision(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.deactivate_project_revision(uuid, uuid, uuid) from public, anon;
grant execute on function public.deactivate_project_revision(uuid, uuid, uuid) to authenticated;
grant execute on function private.deactivate_project_revision(uuid, uuid, uuid) to authenticated;
