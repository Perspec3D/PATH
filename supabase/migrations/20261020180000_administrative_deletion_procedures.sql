-- Migration: Administrative Permanent Deletion Procedures for Clients and Project Families
-- Date: 2026-10-20
-- Purpose: Secure, transactional, auditable administrative deletion with workspace isolation,
--          permission enforcement, referential integrity and historical cascade control.
-- Safety Note: This migration is completely non-destructive to existing data. It only creates
--              and updates stored procedures and security triggers; it contains no DROP TABLE,
--              TRUNCATE, or unqualified DELETE statements.

-- 1. Update enforce_project_revision_integrity to allow internal deletion mode
CREATE OR REPLACE FUNCTION private.enforce_project_revision_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_family_workspace_id uuid;
  v_family_code text;
  v_expected_revision text;
  v_internal_transition boolean := COALESCE(
    pg_catalog.current_setting('perspec.internal_revision_transition', true),
    'off'
  ) = 'on';
  v_internal_deletion boolean := COALESCE(
    pg_catalog.current_setting('perspec.internal_deletion_mode', true),
    'off'
  ) = 'on';
BEGIN
  IF tg_op = 'DELETE' THEN
    IF v_internal_deletion THEN
      RETURN OLD;
    END IF;

    IF OLD.is_current_revision IS FALSE THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'HISTORICAL_PROJECT_REVISION_READ_ONLY';
    END IF;

    IF EXISTS (SELECT 1 FROM public.projects p WHERE p.family_id = OLD.family_id AND p.id <> OLD.id) THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'PROJECT_FAMILY_WITH_HISTORY_CANNOT_BE_DELETED';
    END IF;

    RETURN OLD;
  END IF;

  SELECT pf.workspace_id, pf.code
    INTO v_family_workspace_id, v_family_code
  FROM public.project_families pf
  WHERE pf.id = NEW.family_id;

  IF NOT FOUND
     OR NEW.workspace_id IS DISTINCT FROM v_family_workspace_id
     OR NEW.code IS DISTINCT FROM v_family_code THEN
    RAISE EXCEPTION USING errcode = '23514', message = 'PROJECT_FAMILY_IDENTITY_MISMATCH';
  END IF;

  v_expected_revision := pg_catalog.format(
    'Rev.%s',
    pg_catalog.lpad(NEW.revision_number::text, 2, '0')
  );

  IF NEW.revision IS DISTINCT FROM v_expected_revision THEN
    RAISE EXCEPTION USING errcode = '23514', message = 'PROJECT_REVISION_LABEL_MISMATCH';
  END IF;

  IF tg_op = 'UPDATE' THEN
    IF OLD.is_current_revision IS FALSE THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'HISTORICAL_PROJECT_REVISION_READ_ONLY';
    END IF;

    IF NEW.family_id IS DISTINCT FROM OLD.family_id
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.revision_number IS DISTINCT FROM OLD.revision_number
       OR NEW.revision IS DISTINCT FROM OLD.revision THEN
      RAISE EXCEPTION USING errcode = '23514', message = 'PROJECT_REVISION_IDENTITY_IMMUTABLE';
    END IF;

    IF NEW.is_current_revision IS DISTINCT FROM OLD.is_current_revision
       AND NOT v_internal_transition THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'PROJECT_REVISION_TRANSITION_REQUIRES_RPC';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Update prevent_historical_revision_operational_mutation to allow internal deletion mode
CREATE OR REPLACE FUNCTION private.prevent_historical_revision_operational_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_project_id uuid;
  v_is_current boolean;
  v_internal_deletion boolean := COALESCE(
    pg_catalog.current_setting('perspec.internal_deletion_mode', true),
    'off'
  ) = 'on';
BEGIN
  IF v_internal_deletion THEN
    IF tg_op = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF tg_table_name = 'project_activities' THEN
    v_project_id := CASE WHEN tg_op = 'DELETE' THEN OLD.project_id ELSE NEW.project_id END;
  ELSIF tg_table_name = 'activity_executions' THEN
    SELECT pa.project_id INTO v_project_id
    FROM public.project_activities pa
    WHERE pa.id = CASE WHEN tg_op = 'DELETE' THEN OLD.project_activity_id ELSE NEW.project_activity_id END;
  ELSIF tg_table_name = 'work_sessions' THEN
    SELECT pa.project_id INTO v_project_id
    FROM public.activity_executions ae
    JOIN public.project_activities pa ON pa.id = ae.project_activity_id
    WHERE ae.id = CASE WHEN tg_op = 'DELETE' THEN OLD.activity_execution_id ELSE NEW.activity_execution_id END;
  ELSIF tg_table_name = 'activity_overtime_entries' THEN
    SELECT pa.project_id INTO v_project_id
    FROM public.project_activities pa
    WHERE pa.id = CASE WHEN tg_op = 'DELETE' THEN OLD.project_activity_id ELSE NEW.project_activity_id END;
  END IF;

  SELECT p.is_current_revision INTO v_is_current
  FROM public.projects p
  WHERE p.id = v_project_id
  FOR SHARE;

  IF v_is_current IS FALSE THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'HISTORICAL_PROJECT_REVISION_READ_ONLY';
  END IF;

  IF tg_op = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Function to fetch summary of deletion impact for a project family
CREATE OR REPLACE FUNCTION public.get_project_deletion_summary(
  p_family_id uuid,
  p_workspace_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_workspace_id uuid;
  v_family public.project_families%ROWTYPE;
  v_project_ids uuid[];
  v_revisions_count integer;
  v_activity_ids uuid[];
  v_activities_count integer;
  v_events_count integer;
  v_attachments_count integer;
BEGIN
  -- Strict authentication & workspace isolation
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'AUTH_REQUIRED: Autenticação obrigatória';
  END IF;

  v_workspace_id := auth.uid();

  IF p_workspace_id IS NOT NULL AND p_workspace_id <> v_workspace_id THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'WORKSPACE_ACCESS_DENIED';
  END IF;

  -- Locate project family (directly by family_id or through one of its project revision IDs)
  SELECT * INTO v_family
  FROM public.project_families pf
  WHERE pf.id = p_family_id AND pf.workspace_id = v_workspace_id;

  IF NOT FOUND THEN
    SELECT pf.* INTO v_family
    FROM public.projects p
    JOIN public.project_families pf ON pf.id = p.family_id
    WHERE p.id = p_family_id AND p.workspace_id = v_workspace_id;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'revisionsCount', 0,
      'activitiesCount', 0,
      'eventsCount', 0,
      'attachmentsCount', 0
    );
  END IF;

  -- Revisions
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]), count(*)
    INTO v_project_ids, v_revisions_count
  FROM public.projects
  WHERE family_id = v_family.id AND workspace_id = v_workspace_id;

  -- Attachments / Photos
  SELECT count(*) INTO v_attachments_count
  FROM public.projects
  WHERE family_id = v_family.id AND photo_url IS NOT NULL AND photo_url <> '';

  -- Activities
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]), count(*)
    INTO v_activity_ids, v_activities_count
  FROM public.project_activities
  WHERE project_id = ANY(v_project_ids) AND workspace_id = v_workspace_id;

  -- Events
  IF array_length(v_activity_ids, 1) > 0 THEN
    SELECT count(*) INTO v_events_count
    FROM public.project_activity_events
    WHERE activity_id = ANY(v_activity_ids) AND workspace_id = v_workspace_id;
  ELSE
    v_events_count := 0;
  END IF;

  RETURN jsonb_build_object(
    'familyId', v_family.id,
    'familyCode', v_family.code,
    'familyName', v_family.name,
    'revisionsCount', COALESCE(v_revisions_count, 0),
    'activitiesCount', COALESCE(v_activities_count, 0),
    'eventsCount', COALESCE(v_events_count, 0),
    'attachmentsCount', COALESCE(v_attachments_count, 0)
  );
END;
$$;

-- 4. Transactional Administrative Project Family Deletion RPC
CREATE OR REPLACE FUNCTION public.delete_project_family_administrative(
  p_family_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_workspace_id uuid;
  v_actor record;
  v_family public.project_families%ROWTYPE;
  v_project_ids uuid[];
  v_revisions_count integer;
  v_activity_ids uuid[];
  v_activities_count integer;
  v_events_count integer;
  v_executions_count integer;
  v_overtime_count integer;
BEGIN
  -- 1. Authentication & Workspace Isolation
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'AUTH_REQUIRED: Autenticação obrigatória';
  END IF;

  v_workspace_id := auth.uid();

  IF p_workspace_id IS NOT NULL AND p_workspace_id <> v_workspace_id THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'WORKSPACE_ACCESS_DENIED: Operação restrita ao workspace autenticado';
  END IF;

  -- 2. Verify Actor Admin Role in workspace
  SELECT iu.id, iu.username, iu.role
    INTO v_actor
  FROM public.internal_users iu
  WHERE iu.id = p_actor_user_id
    AND iu.workspace_id = v_workspace_id
    AND iu.is_active IS TRUE;

  IF NOT FOUND THEN
    IF p_actor_user_id = v_workspace_id THEN
      v_actor.id := v_workspace_id;
      v_actor.username := 'Administrador Principal';
      v_actor.role := 'ADMIN';
    ELSE
      RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_AUTHORIZATION_REQUIRED: Operação restrita a administradores ativos do workspace';
    END IF;
  ELSIF v_actor.role <> 'ADMIN' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_AUTHORIZATION_REQUIRED: Apenas administradores podem executar exclusão permanente';
  END IF;

  -- 3. Lock and Locate Project Family
  SELECT * INTO v_family
  FROM public.project_families pf
  WHERE pf.id = p_family_id AND pf.workspace_id = v_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT pf.* INTO v_family
    FROM public.projects p
    JOIN public.project_families pf ON pf.id = p.family_id
    WHERE p.id = p_family_id AND p.workspace_id = v_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'PROJECT_FAMILY_NOT_FOUND: Projeto ou família não encontrada no workspace';
    END IF;
  END IF;

  -- 4. Gather Identifiers and Counts
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]), count(*)
    INTO v_project_ids, v_revisions_count
  FROM public.projects
  WHERE family_id = v_family.id AND workspace_id = v_workspace_id;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]), count(*)
    INTO v_activity_ids, v_activities_count
  FROM public.project_activities
  WHERE project_id = ANY(v_project_ids) AND workspace_id = v_workspace_id;

  IF array_length(v_activity_ids, 1) > 0 THEN
    SELECT count(*) INTO v_events_count
    FROM public.project_activity_events
    WHERE activity_id = ANY(v_activity_ids) AND workspace_id = v_workspace_id;

    SELECT count(*) INTO v_executions_count
    FROM public.activity_executions
    WHERE project_activity_id = ANY(v_activity_ids) AND workspace_id = v_workspace_id;

    SELECT count(*) INTO v_overtime_count
    FROM public.activity_overtime_entries
    WHERE project_activity_id = ANY(v_activity_ids) AND workspace_id = v_workspace_id;
  ELSE
    v_events_count := 0;
    v_executions_count := 0;
    v_overtime_count := 0;
  END IF;

  -- 5. Enable Internal Deletion Bypass Mode strictly for this transaction
  PERFORM pg_catalog.set_config('perspec.internal_deletion_mode', 'on', true);

  -- 6. Execute Ordered Deletion of Exclusive Relational Records
  IF array_length(v_activity_ids, 1) > 0 THEN
    -- Delete auditable lifecycle events
    DELETE FROM public.project_activity_events
    WHERE activity_id = ANY(v_activity_ids);

    -- Delete overtime entries
    DELETE FROM public.activity_overtime_entries
    WHERE project_activity_id = ANY(v_activity_ids);

    -- Delete work sessions and activity executions
    DELETE FROM public.work_sessions
    WHERE activity_execution_id IN (
      SELECT id FROM public.activity_executions
      WHERE project_activity_id = ANY(v_activity_ids)
    );

    DELETE FROM public.activity_executions
    WHERE project_activity_id = ANY(v_activity_ids);

    -- Delete project activities
    DELETE FROM public.project_activities
    WHERE id = ANY(v_activity_ids);
  END IF;

  -- Delete all project revisions belonging to this family
  DELETE FROM public.projects
  WHERE family_id = v_family.id AND workspace_id = v_workspace_id;

  -- Delete the canonical project family record
  DELETE FROM public.project_families
  WHERE id = v_family.id AND workspace_id = v_workspace_id;

  -- Reset deletion mode explicitly before commit
  PERFORM pg_catalog.set_config('perspec.internal_deletion_mode', 'off', true);

  -- 7. Insert Minimal Administrative Audit Log (no FK to deleted records)
  INSERT INTO public.logs (
    workspace_id,
    user_id,
    user_name,
    user_role,
    module,
    action,
    details,
    item_id
  ) VALUES (
    v_workspace_id,
    v_actor.id,
    v_actor.username,
    v_actor.role,
    'Projetos',
    'DELETE',
    pg_catalog.format(
      'Exclusão permanente do projeto %s (%s). %s revisão(ões) e %s atividade(s) excluídas.',
      v_family.code,
      v_family.name,
      COALESCE(v_revisions_count, 0),
      COALESCE(v_activities_count, 0)
    ),
    v_family.code
  );

  -- 8. Return Success Payload
  RETURN jsonb_build_object(
    'success', true,
    'familyId', v_family.id,
    'familyCode', v_family.code,
    'familyName', v_family.name,
    'deletedRevisionsCount', COALESCE(v_revisions_count, 0),
    'deletedActivitiesCount', COALESCE(v_activities_count, 0),
    'deletedEventsCount', COALESCE(v_events_count, 0),
    'deletedExecutionsCount', COALESCE(v_executions_count, 0)
  );
END;
$$;

-- 5. Transactional Administrative Client Deletion RPC
CREATE OR REPLACE FUNCTION public.delete_client_administrative(
  p_client_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_workspace_id uuid;
  v_actor record;
  v_client public.clients%ROWTYPE;
  v_linked_families_count integer := 0;
  v_linked_projects_count integer := 0;
  v_total_dependencies integer := 0;
BEGIN
  -- 1. Authentication & Workspace Isolation
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'AUTH_REQUIRED: Autenticação obrigatória';
  END IF;

  v_workspace_id := auth.uid();

  IF p_workspace_id IS NOT NULL AND p_workspace_id <> v_workspace_id THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'WORKSPACE_ACCESS_DENIED: Operação restrita ao workspace autenticado';
  END IF;

  -- 2. Verify Actor Admin Role in workspace
  SELECT iu.id, iu.username, iu.role
    INTO v_actor
  FROM public.internal_users iu
  WHERE iu.id = p_actor_user_id
    AND iu.workspace_id = v_workspace_id
    AND iu.is_active IS TRUE;

  IF NOT FOUND THEN
    IF p_actor_user_id = v_workspace_id THEN
      v_actor.id := v_workspace_id;
      v_actor.username := 'Administrador Principal';
      v_actor.role := 'ADMIN';
    ELSE
      RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_AUTHORIZATION_REQUIRED: Operação restrita a administradores ativos do workspace';
    END IF;
  ELSIF v_actor.role <> 'ADMIN' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_AUTHORIZATION_REQUIRED: Apenas administradores podem executar exclusão permanente';
  END IF;

  -- 3. Lock and Locate Client
  SELECT * INTO v_client
  FROM public.clients c
  WHERE c.id = p_client_id AND c.workspace_id = v_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'CLIENT_NOT_FOUND: Cliente não encontrado no workspace';
  END IF;

  -- 4. Check for Dependencies (linked project families or projects)
  SELECT count(*) INTO v_linked_families_count
  FROM public.project_families pf
  WHERE pf.client_id = p_client_id AND pf.workspace_id = v_workspace_id;

  SELECT count(*) INTO v_linked_projects_count
  FROM public.projects p
  WHERE p.client_id = p_client_id AND p.workspace_id = v_workspace_id;

  v_total_dependencies := GREATEST(v_linked_families_count, v_linked_projects_count);

  IF v_total_dependencies > 0 THEN
    RAISE EXCEPTION USING
      errcode = '23503',
      message = pg_catalog.format(
        'CLIENT_HAS_DEPENDENCIES: Este cliente possui %s projeto(s) vinculado(s) e não pode ser excluído. Os vínculos precisam ser resolvidos antes da exclusão.',
        v_total_dependencies
      );
  END IF;

  -- 5. Delete Client Record
  DELETE FROM public.clients
  WHERE id = p_client_id AND workspace_id = v_workspace_id;

  -- 6. Insert Minimal Administrative Audit Log (no FK to deleted records)
  INSERT INTO public.logs (
    workspace_id,
    user_id,
    user_name,
    user_role,
    module,
    action,
    details,
    item_id
  ) VALUES (
    v_workspace_id,
    v_actor.id,
    v_actor.username,
    v_actor.role,
    'Clientes',
    'DELETE',
    pg_catalog.format('Exclusão permanente do cliente %s (%s).', v_client.code, v_client.name),
    v_client.code
  );

  -- 7. Return Success Payload
  RETURN jsonb_build_object(
    'success', true,
    'clientId', v_client.id,
    'clientCode', v_client.code,
    'clientName', v_client.name
  );
END;
$$;

-- 6. Privilege Management: Restrict EXECUTE to authenticated users only
REVOKE ALL ON FUNCTION public.get_project_deletion_summary(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_project_deletion_summary(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_project_family_administrative(uuid, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_project_family_administrative(uuid, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_client_administrative(uuid, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_client_administrative(uuid, uuid, uuid) TO authenticated;
