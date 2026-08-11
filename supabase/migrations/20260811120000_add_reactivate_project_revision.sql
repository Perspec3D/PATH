-- 1. Modify the trigger function to allow reactivation when v_internal_transition is active
create or replace function private.enforce_project_revision_integrity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_family_workspace_id uuid;
  v_family_code text;
  v_expected_revision text;
  v_internal_transition boolean := coalesce(
    pg_catalog.current_setting('perspec.internal_revision_transition', true),
    'off'
  ) = 'on';
begin
  if tg_op = 'DELETE' then
    if old.is_current_revision is false then
      raise exception using errcode = 'P0001', message = 'HISTORICAL_PROJECT_REVISION_READ_ONLY';
    end if;
    if exists (select 1 from public.projects p where p.family_id = old.family_id and p.id <> old.id) then
      raise exception using errcode = 'P0001', message = 'PROJECT_FAMILY_WITH_HISTORY_CANNOT_BE_DELETED';
    end if;
    return old;
  end if;

  select pf.workspace_id, pf.code
    into v_family_workspace_id, v_family_code
  from public.project_families pf
  where pf.id = new.family_id;

  if not found
     or new.workspace_id is distinct from v_family_workspace_id
     or new.code is distinct from v_family_code then
    raise exception using errcode = '23514', message = 'PROJECT_FAMILY_IDENTITY_MISMATCH';
  end if;

  v_expected_revision := pg_catalog.format(
    'Rev.%s',
    pg_catalog.lpad(new.revision_number::text, 2, '0')
  );

  if new.revision is distinct from v_expected_revision then
    raise exception using errcode = '23514', message = 'PROJECT_REVISION_LABEL_MISMATCH';
  end if;

  if tg_op = 'UPDATE' then
    if old.is_current_revision is false and not v_internal_transition then
      raise exception using errcode = 'P0001', message = 'HISTORICAL_PROJECT_REVISION_READ_ONLY';
    end if;

    if new.family_id is distinct from old.family_id
       or new.workspace_id is distinct from old.workspace_id
       or new.code is distinct from old.code
       or new.revision_number is distinct from old.revision_number
       or new.revision is distinct from old.revision then
      raise exception using errcode = '23514', message = 'PROJECT_REVISION_IDENTITY_IMMUTABLE';
    end if;

    if new.is_current_revision is distinct from old.is_current_revision
       and not v_internal_transition then
      raise exception using errcode = 'P0001', message = 'PROJECT_REVISION_TRANSITION_REQUIRES_RPC';
    end if;
  end if;

  return new;
end;
$$;


-- 2. Create the private reactivate function
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
  v_current public.projects%rowtype;
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

  -- 3. If target is already active, just return it
  if v_target.is_current_revision is true then
    return next v_target;
    return;
  end if;

  -- 4. Get currently active revision (if any) and lock it
  select * into v_current
  from public.projects p
  where p.family_id = p_family_id and p.is_current_revision is true
  for update;

  -- 5. Prevent transition if there is any active work session in the currently active revision
  if v_current.id is not null and exists (
    select 1
    from public.work_sessions ws
    join public.activity_executions ae on ae.id = ws.activity_execution_id
    join public.project_activities pa on pa.id = ae.project_activity_id
    where pa.project_id = v_current.id and ws.ended_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_WORK_SESSION_MUST_BE_PAUSED';
  end if;

  -- Enable transition mode config
  perform pg_catalog.set_config('perspec.internal_revision_transition', 'on', true);

  -- 6. Deactivate current active revision
  if v_current.id is not null then
    update public.projects
    set is_current_revision = false
    where id = v_current.id;
  end if;

  -- 7. Activate target revision
  update public.projects
  set is_current_revision = true
  where id = v_target.id
  returning * into v_target;

  -- 8. Log the change in public.logs
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
      'Revisão %s (%s) reativada. Revisão %s (%s) desativada.',
      v_target.revision, v_target.name,
      coalesce(v_current.revision, 'Nenhuma'), coalesce(v_current.name, 'Nenhuma')
    ),
    v_target.id
  from public.internal_users iu
  where iu.id = p_actor_internal_user_id;

  return next v_target;
end;
$$;


-- 3. Create the public reactivate wrapper function
create or replace function public.reactivate_project_revision(
  p_family_id uuid,
  p_target_project_id uuid,
  p_actor_internal_user_id uuid
)
returns setof public.projects
language sql
security invoker
set search_path = ''
as $$
  select * from private.reactivate_project_revision(
    p_family_id, p_target_project_id, p_actor_internal_user_id
  );
$$;


-- 4. Set security privileges
revoke all on function private.reactivate_project_revision(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.reactivate_project_revision(uuid, uuid, uuid) from public, anon;
grant execute on function public.reactivate_project_revision(uuid, uuid, uuid) to authenticated;
grant execute on function private.reactivate_project_revision(uuid, uuid, uuid) to authenticated;
