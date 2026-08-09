-- Abort instead of guessing when existing project identity or revision data is ambiguous.
do $$
begin
  if exists (
    select 1
    from public.projects p
    where p.workspace_id is null
       or nullif(pg_catalog.btrim(p.code), '') is null
       or nullif(pg_catalog.btrim(p.name), '') is null
       or pg_catalog.btrim(coalesce(p.revision, '')) !~* '^rev\.[0-9]+$'
  ) or exists (
    select 1
    from public.projects p
    group by p.workspace_id, p.code
    having count(*) > 1
  ) or exists (
    select 1
    from public.projects p
    left join public.clients c on c.id = p.client_id
    where c.id is null or c.workspace_id is distinct from p.workspace_id
  ) or exists (
    select 1
    from public.projects p
    left join public.internal_users iu on iu.id = p.assignee_id
    where p.assignee_id is not null
      and (iu.id is null or iu.workspace_id is distinct from p.workspace_id)
  ) then
    raise exception using
      errcode = '23514',
      message = 'EXISTING_PROJECT_REVISION_DATA_REQUIRES_MANUAL_REVIEW';
  end if;
end;
$$;

create schema if not exists private;
grant usage on schema private to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.clients'::regclass
      and conname = 'clients_id_workspace_id_key'
  ) then
    alter table public.clients
      add constraint clients_id_workspace_id_key unique (id, workspace_id);
  end if;
end;
$$;

create table public.project_families (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  constraint project_families_id_workspace_id_key unique (id, workspace_id),
  constraint project_families_workspace_code_key unique (workspace_id, code),
  constraint project_families_code_not_blank check (nullif(pg_catalog.btrim(code), '') is not null),
  constraint project_families_name_not_blank check (nullif(pg_catalog.btrim(name), '') is not null),
  constraint project_families_workspace_id_fkey
    foreign key (workspace_id) references public.profiles (id) on delete cascade,
  constraint project_families_client_workspace_fkey
    foreign key (client_id, workspace_id) references public.clients (id, workspace_id)
);

create index project_families_client_workspace_idx
  on public.project_families (client_id, workspace_id);

alter table public.project_families enable row level security;

create policy "Workspace members can view project families"
on public.project_families
for select
to authenticated
using (workspace_id = (select auth.uid()));

grant select on public.project_families to authenticated;
revoke insert, update, delete on public.project_families from public, anon, authenticated;

alter table public.projects
  add column family_id uuid,
  add column revision_number integer,
  add column is_current_revision boolean;

-- Each existing project becomes one family and remains the only current revision.
insert into public.project_families (id, workspace_id, client_id, code, name, created_at)
select p.id, p.workspace_id, p.client_id, p.code, p.name, coalesce(p.created_at, now())
from public.projects p;

update public.projects p
set family_id = p.id,
    revision_number = substring(pg_catalog.btrim(p.revision) from '[0-9]+$')::integer,
    is_current_revision = true;

alter table public.projects
  alter column family_id set not null,
  alter column revision_number set not null,
  alter column is_current_revision set not null,
  alter column is_current_revision set default true;

alter table public.projects
  drop constraint projects_workspace_code_unique;

alter table public.projects
  add constraint projects_family_workspace_fkey
    foreign key (family_id, workspace_id)
    references public.project_families (id, workspace_id),
  add constraint projects_revision_number_nonnegative
    check (revision_number >= 0),
  add constraint projects_family_revision_key
    unique (family_id, revision_number);

create unique index projects_one_current_revision_per_family_idx
  on public.projects (family_id)
  where is_current_revision is true;

create index projects_family_revision_history_idx
  on public.projects (family_id, revision_number desc);

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
    if old.is_current_revision is false then
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

create trigger enforce_project_revision_integrity
before insert or update or delete on public.projects
for each row execute function private.enforce_project_revision_integrity();

create or replace function private.cleanup_empty_project_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.project_families pf
  where pf.id = old.family_id
    and pf.workspace_id = old.workspace_id
    and not exists (select 1 from public.projects p where p.family_id = old.family_id);
  return old;
end;
$$;

create trigger cleanup_empty_project_family
after delete on public.projects
for each row execute function private.cleanup_empty_project_family();

create or replace function private.prevent_historical_revision_operational_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_is_current boolean;
begin
  if tg_table_name = 'project_activities' then
    v_project_id := case when tg_op = 'DELETE' then old.project_id else new.project_id end;
  elsif tg_table_name = 'activity_executions' then
    select pa.project_id into v_project_id
    from public.project_activities pa
    where pa.id = case when tg_op = 'DELETE' then old.project_activity_id else new.project_activity_id end;
  elsif tg_table_name = 'work_sessions' then
    select pa.project_id into v_project_id
    from public.activity_executions ae
    join public.project_activities pa on pa.id = ae.project_activity_id
    where ae.id = case when tg_op = 'DELETE' then old.activity_execution_id else new.activity_execution_id end;
  elsif tg_table_name = 'activity_overtime_entries' then
    select pa.project_id into v_project_id
    from public.project_activities pa
    where pa.id = case when tg_op = 'DELETE' then old.project_activity_id else new.project_activity_id end;
  end if;

  select p.is_current_revision into v_is_current
  from public.projects p
  where p.id = v_project_id
  for share;

  if v_is_current is false then
    raise exception using errcode = 'P0001', message = 'HISTORICAL_PROJECT_REVISION_READ_ONLY';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger prevent_historical_project_activity_mutation
before insert or update or delete on public.project_activities
for each row execute function private.prevent_historical_revision_operational_mutation();

create trigger prevent_historical_activity_execution_mutation
before insert or update or delete on public.activity_executions
for each row execute function private.prevent_historical_revision_operational_mutation();

create trigger prevent_historical_work_session_mutation
before insert or update or delete on public.work_sessions
for each row execute function private.prevent_historical_revision_operational_mutation();

create trigger prevent_historical_overtime_mutation
before insert or update or delete on public.activity_overtime_entries
for each row execute function private.prevent_historical_revision_operational_mutation();

create or replace function private.create_project_family(
  p_project_id uuid,
  p_actor_internal_user_id uuid,
  p_client_id uuid,
  p_assignee_id uuid,
  p_code text,
  p_name text,
  p_photo_url text,
  p_status text,
  p_start_date date,
  p_delivery_date date,
  p_notes text,
  p_created_at timestamptz
)
returns setof public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := (select auth.uid());
  v_family_id uuid := gen_random_uuid();
  v_project public.projects%rowtype;
begin
  if v_workspace_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  perform 1 from public.internal_users iu
  where iu.id = p_actor_internal_user_id
    and iu.workspace_id = v_workspace_id
    and iu.is_active is true
    and iu.role in ('ADMIN', 'USER');
  if not found then
    raise exception using errcode = 'P0001', message = 'PROJECT_CREATE_PERMISSION_REQUIRED';
  end if;

  perform 1 from public.clients c
  where c.id = p_client_id and c.workspace_id = v_workspace_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'CLIENT_NOT_FOUND';
  end if;

  perform 1 from public.internal_users iu
  where iu.id = p_assignee_id and iu.workspace_id = v_workspace_id and iu.is_active is true;
  if not found then
    raise exception using errcode = 'P0001', message = 'ASSIGNEE_NOT_FOUND';
  end if;

  if p_project_id is null
     or nullif(pg_catalog.btrim(p_code), '') is null
     or nullif(pg_catalog.btrim(p_name), '') is null
     or p_start_date is null
     or p_delivery_date is null
     or p_start_date > p_delivery_date
     or p_status not in ('Fila de Espera', 'Em Andamento', 'Pausado', 'Concluído', 'Cancelado') then
    raise exception using errcode = '23514', message = 'INVALID_INITIAL_PROJECT_REVISION';
  end if;

  insert into public.project_families (id, workspace_id, client_id, code, name)
  values (v_family_id, v_workspace_id, p_client_id, pg_catalog.btrim(p_code), pg_catalog.btrim(p_name));

  insert into public.projects (
    id, workspace_id, client_id, assignee_id, code, name, photo_url,
    revision, revision_number, is_current_revision, family_id, status,
    start_date, delivery_date, due_date, notes, created_at
  ) values (
    p_project_id, v_workspace_id, p_client_id, p_assignee_id, pg_catalog.btrim(p_code), pg_catalog.btrim(p_name), p_photo_url,
    'Rev.00', 0, true, v_family_id, p_status,
    p_start_date, p_delivery_date, p_delivery_date, nullif(pg_catalog.btrim(p_notes), ''), coalesce(p_created_at, now())
  ) returning * into v_project;

  return next v_project;
end;
$$;

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

  perform 1 from public.internal_users iu
  where iu.id = p_admin_internal_user_id
    and iu.workspace_id = v_workspace_id
    and iu.role = 'ADMIN'
    and iu.is_active is true;
  if not found then
    raise exception using errcode = 'P0001', message = 'ADMIN_REQUIRED';
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

create or replace function public.create_project_family(
  p_project_id uuid,
  p_actor_internal_user_id uuid,
  p_client_id uuid,
  p_assignee_id uuid,
  p_code text,
  p_name text,
  p_photo_url text,
  p_status text,
  p_start_date date,
  p_delivery_date date,
  p_notes text,
  p_created_at timestamptz
)
returns setof public.projects
language sql
security invoker
set search_path = ''
as $$
  select * from private.create_project_family(
    p_project_id, p_actor_internal_user_id, p_client_id, p_assignee_id,
    p_code, p_name, p_photo_url, p_status, p_start_date,
    p_delivery_date, p_notes, p_created_at
  );
$$;

create or replace function public.create_project_revision(
  p_family_id uuid,
  p_admin_internal_user_id uuid,
  p_start_date date,
  p_delivery_date date,
  p_assignee_id uuid,
  p_notes text default null
)
returns setof public.projects
language sql
security invoker
set search_path = ''
as $$
  select * from private.create_project_revision(
    p_family_id, p_admin_internal_user_id, p_start_date,
    p_delivery_date, p_assignee_id, p_notes
  );
$$;

revoke all on function private.enforce_project_revision_integrity() from public, anon, authenticated;
revoke all on function private.cleanup_empty_project_family() from public, anon, authenticated;
revoke all on function private.prevent_historical_revision_operational_mutation() from public, anon, authenticated;
revoke all on function private.create_project_family(uuid, uuid, uuid, uuid, text, text, text, text, date, date, text, timestamptz) from public, anon, authenticated;
revoke all on function private.create_project_revision(uuid, uuid, date, date, uuid, text) from public, anon, authenticated;
revoke all on function public.create_project_family(uuid, uuid, uuid, uuid, text, text, text, text, date, date, text, timestamptz) from public, anon;
revoke all on function public.create_project_revision(uuid, uuid, date, date, uuid, text) from public, anon;
grant execute on function public.create_project_family(uuid, uuid, uuid, uuid, text, text, text, text, date, date, text, timestamptz) to authenticated;
grant execute on function public.create_project_revision(uuid, uuid, date, date, uuid, text) to authenticated;
grant execute on function private.create_project_family(uuid, uuid, uuid, uuid, text, text, text, text, date, date, text, timestamptz) to authenticated;
grant execute on function private.create_project_revision(uuid, uuid, date, date, uuid, text) to authenticated;

-- Initial projects must use the RPC so Rev.00 and its family are created atomically.
revoke insert on public.projects from public, anon, authenticated;
