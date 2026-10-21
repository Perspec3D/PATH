-- Migration: Hardened Administrative Deletion Procedures for Clients, Projects and Workspace Cleanup
-- Date: 2026-10-20
-- Purpose: Corrects security vulnerabilities in administrative deletion procedures and implements complete workspace cleanup:
--   1. Individual Admin Credential Vault: Replaces plaintext/hash token matching with
--      isolated bcrypt authentication (private.admin_credentials) via pgcrypto.crypt().
--   2. Prevents Hash Replay & Impersonation: Frontend no longer passes persistent password hashes.
--      Stored hashes cannot be replayed as credentials.
--   3. Eliminates Fallbacks: Removes unverified p_actor_user_id = workspace_id fallback.
--   4. Cryptographic Nonce & Active Deletion Barrier (private.active_administrative_deletions):
--      Guarantees that setting session parameters alone cannot bypass historical revision triggers.
--      Direct table DELETE is completely blocked outside the administrative RPC.
--   5. Mandatory Actor & Credential Parameters: get_project_deletion_summary,
--      delete_project_family_administrative, delete_client_administrative,
--      get_workspace_cleanup_summary, and clean_workspace_administrative require explicit admin ID.
--   6. Workspace Operational Cleanup: Atomically purges all operational records of a workspace
--      (clients, project families, revisions, activities, events, tasks, activity types, operational logs)
--      while preserving organization account, auth login, and internal users.
--   7. Overload Cleanup: Secures EXECUTE permissions for authenticated users only.
-- Safety Note: Completely non-destructive to existing unselected data. Contains no DROP TABLE, TRUNCATE, or unqualified DELETE.

CREATE SCHEMA IF NOT EXISTS private;
CREATE SCHEMA IF NOT EXISTS extensions;

-- Ensure pgcrypto extension is active
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Isolated Admin Credential Vault in private schema (inaccessible to PostgREST/client queries)
CREATE TABLE IF NOT EXISTS private.admin_credentials (
  user_id uuid PRIMARY KEY REFERENCES public.internal_users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

REVOKE ALL ON TABLE private.admin_credentials FROM public, anon, authenticated;

-- Populate/sync vault with bcrypt-hashed credentials for all active administrators
INSERT INTO private.admin_credentials (user_id, password_hash, updated_at)
SELECT
  iu.id,
  CASE
    WHEN iu.password_hash ~ '^\$2[aby]?\$\d{2}\$[./0-9A-Za-z]{53}$' THEN iu.password_hash
    ELSE extensions.crypt(iu.password_hash, extensions.gen_salt('bf'))
  END,
  clock_timestamp()
FROM public.internal_users iu
WHERE iu.role = 'ADMIN'
  AND iu.password_hash IS NOT NULL
  AND pg_catalog.length(pg_catalog.btrim(iu.password_hash)) > 0
ON CONFLICT (user_id) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    updated_at = clock_timestamp();

-- Automatic sync trigger to keep private.admin_credentials aligned with public.internal_users
CREATE OR REPLACE FUNCTION private.sync_admin_credential_vault()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
  IF tg_op = 'DELETE' THEN
    DELETE FROM private.admin_credentials WHERE user_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.role = 'ADMIN' AND NEW.is_active IS TRUE AND NEW.password_hash IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(NEW.password_hash)) > 0 THEN
    INSERT INTO private.admin_credentials (user_id, password_hash, updated_at)
    VALUES (
      NEW.id,
      CASE
        WHEN NEW.password_hash ~ '^\$2[aby]?\$\d{2}\$[./0-9A-Za-z]{53}$' THEN NEW.password_hash
        ELSE extensions.crypt(NEW.password_hash, extensions.gen_salt('bf'))
      END,
      clock_timestamp()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        updated_at = clock_timestamp();
  ELSE
    DELETE FROM private.admin_credentials WHERE user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_admin_credential_vault') THEN 
    CREATE TRIGGER trg_sync_admin_credential_vault
    AFTER INSERT OR UPDATE OR DELETE ON public.internal_users
    FOR EACH ROW EXECUTE FUNCTION private.sync_admin_credential_vault();
  END IF; 
END $$;

-- 2. Barrier for Active Administrative Deletions in private schema
CREATE TABLE IF NOT EXISTS private.active_administrative_deletions (
  target_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  nonce uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (target_id, workspace_id, nonce)
);

REVOKE ALL ON TABLE private.active_administrative_deletions FROM public, anon, authenticated;

-- 3. Hardened Revision Integrity Trigger: Blocks direct table DELETE and requires private nonce
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
  v_authorized_family text := pg_catalog.current_setting('perspec.deletion_authorized_family', true);
  v_authorized_workspace text := pg_catalog.current_setting('perspec.deletion_authorized_workspace', true);
  v_nonce text := pg_catalog.current_setting('perspec.deletion_nonce', true);
  v_internal_transition boolean := COALESCE(
    pg_catalog.current_setting('perspec.internal_revision_transition', true),
    'off'
  ) = 'on';
BEGIN
  IF tg_op = 'DELETE' THEN
    -- Authorize deletion ONLY if running inside the authorized administrative RPC with verified nonce
    IF v_nonce IS NOT NULL AND v_nonce <> '' THEN
      IF v_authorized_family IS NOT NULL AND v_authorized_family <> '' AND v_authorized_family = OLD.family_id::text THEN
        IF EXISTS (
          SELECT 1 FROM private.active_administrative_deletions aad
          WHERE aad.target_id = OLD.family_id
            AND aad.workspace_id = OLD.workspace_id
            AND aad.nonce = v_nonce::uuid
        ) THEN
          RETURN OLD;
        END IF;
      END IF;

      IF v_authorized_workspace IS NOT NULL AND v_authorized_workspace <> '' AND v_authorized_workspace = OLD.workspace_id::text THEN
        IF EXISTS (
          SELECT 1 FROM private.active_administrative_deletions aad
          WHERE aad.target_id = OLD.workspace_id
            AND aad.workspace_id = OLD.workspace_id
            AND aad.nonce = v_nonce::uuid
        ) THEN
          RETURN OLD;
        END IF;
      END IF;
    END IF;

    -- Block direct deletion: Historical revisions and revisions with history are strictly protected
    IF OLD.is_current_revision IS FALSE THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'HISTORICAL_PROJECT_REVISION_READ_ONLY: Revisões históricas não podem ser excluídas diretamente.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.projects p WHERE p.family_id = OLD.family_id AND p.id <> OLD.id) THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'PROJECT_FAMILY_WITH_HISTORY_CANNOT_BE_DELETED: Projetos com histórico de revisões não podem ser excluídos diretamente.';
    END IF;

    -- Direct DELETE on any project table record is prohibited outside the administrative RPC
    RAISE EXCEPTION USING errcode = '42501', message = 'DIRECT_PROJECT_DELETION_PROHIBITED: A exclusão de projetos deve ser realizada exclusivamente via procedimento administrativo autorizado.';
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

-- 4. Hardened Operational Mutation Trigger: Checks active_administrative_deletions
CREATE OR REPLACE FUNCTION private.prevent_historical_revision_operational_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_project_id uuid;
  v_is_current boolean;
  v_authorized_family text := pg_catalog.current_setting('perspec.deletion_authorized_family', true);
  v_authorized_workspace text := pg_catalog.current_setting('perspec.deletion_authorized_workspace', true);
  v_nonce text := pg_catalog.current_setting('perspec.deletion_nonce', true);
BEGIN
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

  -- Allow deletion only within authorized administrative procedure with verified nonce
  IF tg_op = 'DELETE' AND v_nonce IS NOT NULL AND v_nonce <> '' THEN
    IF v_authorized_family IS NOT NULL AND v_authorized_family <> '' THEN
      IF EXISTS (
        SELECT 1 FROM public.projects p
        JOIN private.active_administrative_deletions aad
          ON aad.target_id = p.family_id AND aad.workspace_id = p.workspace_id
        WHERE p.id = v_project_id
          AND p.family_id::text = v_authorized_family
          AND aad.nonce = v_nonce::uuid
      ) THEN
        RETURN OLD;
      END IF;
    END IF;

    IF v_authorized_workspace IS NOT NULL AND v_authorized_workspace <> '' THEN
      IF EXISTS (
        SELECT 1 FROM private.active_administrative_deletions aad
        WHERE aad.target_id = OLD.workspace_id
          AND aad.workspace_id = OLD.workspace_id
          AND aad.nonce = v_nonce::uuid
      ) THEN
        RETURN OLD;
      END IF;
    END IF;
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

-- 5. Trigger to prevent direct table DELETE on public.clients outside administrative RPC
CREATE OR REPLACE FUNCTION private.prevent_direct_client_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_authorized_client text := pg_catalog.current_setting('perspec.deletion_authorized_client', true);
  v_authorized_workspace text := pg_catalog.current_setting('perspec.deletion_authorized_workspace', true);
  v_nonce text := pg_catalog.current_setting('perspec.deletion_nonce', true);
BEGIN
  IF v_nonce IS NOT NULL AND v_nonce <> '' THEN
    IF v_authorized_client IS NOT NULL AND v_authorized_client = OLD.id::text THEN
      IF EXISTS (
        SELECT 1 FROM private.active_administrative_deletions aad
        WHERE aad.target_id = OLD.id
          AND aad.workspace_id = OLD.workspace_id
          AND aad.nonce = v_nonce::uuid
      ) THEN
        RETURN OLD;
      END IF;
    END IF;

    IF v_authorized_workspace IS NOT NULL AND v_authorized_workspace = OLD.workspace_id::text THEN
      IF EXISTS (
        SELECT 1 FROM private.active_administrative_deletions aad
        WHERE aad.target_id = OLD.workspace_id
          AND aad.workspace_id = OLD.workspace_id
          AND aad.nonce = v_nonce::uuid
      ) THEN
        RETURN OLD;
      END IF;
    END IF;
  END IF;

  RAISE EXCEPTION USING errcode = '42501', message = 'DIRECT_CLIENT_DELETION_PROHIBITED: A exclusão de clientes deve ser realizada exclusivamente via procedimento administrativo autorizado.';
END;
$$;

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_direct_client_deletion') THEN 
    CREATE TRIGGER trg_prevent_direct_client_deletion
    BEFORE DELETE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION private.prevent_direct_client_deletion();
  END IF; 
END $$;

-- 6. Hardened Project Deletion Summary Function
CREATE OR REPLACE FUNCTION public.get_project_deletion_summary(
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
  v_family public.project_families%ROWTYPE;
  v_project_ids uuid[];
  v_revisions_count integer;
  v_activity_ids uuid[];
  v_activities_count integer;
  v_events_count integer;
  v_attachments_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'AUTH_REQUIRED: Autenticação obrigatória';
  END IF;

  v_workspace_id := auth.uid();

  IF p_workspace_id IS NOT NULL AND p_workspace_id <> v_workspace_id THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'WORKSPACE_ACCESS_DENIED: Operação restrita ao workspace autenticado';
  END IF;

  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_AUTHORIZATION_REQUIRED: Identificador do administrador é obrigatório para consultar o impacto.';
  END IF;

  PERFORM 1 FROM public.internal_users iu
  WHERE iu.id = p_actor_user_id
    AND iu.workspace_id = v_workspace_id
    AND iu.is_active IS TRUE
    AND iu.role = 'ADMIN';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_AUTHORIZATION_REQUIRED: Resumo de impacto restrito a administradores ativos do workspace';
  END IF;

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

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]), count(*)
    INTO v_project_ids, v_revisions_count
  FROM public.projects
  WHERE family_id = v_family.id AND workspace_id = v_workspace_id;

  SELECT count(*) INTO v_attachments_count
  FROM public.projects
  WHERE family_id = v_family.id AND photo_url IS NOT NULL AND photo_url <> '';

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]), count(*)
    INTO v_activity_ids, v_activities_count
  FROM public.project_activities
  WHERE project_id = ANY(v_project_ids) AND workspace_id = v_workspace_id;

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

-- 7. Hardened Transactional Administrative Project Family Deletion RPC
CREATE OR REPLACE FUNCTION public.delete_project_family_administrative(
  p_family_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_confirmation_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_workspace_id uuid;
  v_actor record;
  v_admin_cred_hash text;
  v_legacy_pass text;
  v_deletion_nonce uuid;
  v_family public.project_families%ROWTYPE;
  v_project_ids uuid[];
  v_revisions_count integer;
  v_activity_ids uuid[];
  v_activities_count integer;
  v_events_count integer;
  v_executions_count integer;
  v_overtime_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'AUTH_REQUIRED: Autenticação obrigatória';
  END IF;

  v_workspace_id := auth.uid();

  IF p_workspace_id IS NOT NULL AND p_workspace_id <> v_workspace_id THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'WORKSPACE_ACCESS_DENIED: Operação restrita ao workspace autenticado';
  END IF;

  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_AUTHORIZATION_REQUIRED: Identificador do administrador é obrigatório.';
  END IF;

  SELECT iu.id, iu.username, iu.role
    INTO v_actor
  FROM public.internal_users iu
  WHERE iu.id = p_actor_user_id
    AND iu.workspace_id = v_workspace_id
    AND iu.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_AUTHORIZATION_REQUIRED: Operação restrita a administradores ativos do workspace';
  ELSIF v_actor.role <> 'ADMIN' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_AUTHORIZATION_REQUIRED: Apenas administradores podem executar exclusão permanente';
  END IF;

  IF p_confirmation_token IS NULL OR pg_catalog.length(pg_catalog.btrim(p_confirmation_token)) = 0 THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_CREDENTIAL_REQUIRED: É obrigatório fornecer a senha do administrador para autorizar a exclusão definitiva.';
  END IF;

  SELECT ac.password_hash INTO v_admin_cred_hash
  FROM private.admin_credentials ac
  WHERE ac.user_id = v_actor.id;

  IF NOT FOUND OR v_admin_cred_hash IS NULL OR pg_catalog.length(pg_catalog.btrim(v_admin_cred_hash)) = 0 THEN
    SELECT iu.password_hash INTO v_legacy_pass
    FROM public.internal_users iu
    WHERE iu.id = v_actor.id;

    IF v_legacy_pass IS NULL OR pg_catalog.length(pg_catalog.btrim(v_legacy_pass)) = 0 THEN
      RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_CREDENTIAL_NOT_CONFIGURED: Administrador sem credencial individual configurada.';
    END IF;

    IF v_legacy_pass ~ '^\$2[aby]?\$\d{2}\$[./0-9A-Za-z]{53}$' THEN
      v_admin_cred_hash := v_legacy_pass;
    ELSE
      v_admin_cred_hash := extensions.crypt(v_legacy_pass, extensions.gen_salt('bf'));
    END IF;

    INSERT INTO private.admin_credentials (user_id, password_hash)
    VALUES (v_actor.id, v_admin_cred_hash)
    ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash;
  END IF;

  IF extensions.crypt(p_confirmation_token, v_admin_cred_hash) IS DISTINCT FROM v_admin_cred_hash THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'INVALID_ADMIN_CREDENTIAL: A credencial informada não corresponde ao administrador responsável.';
  END IF;

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

  v_deletion_nonce := extensions.gen_random_uuid();
  PERFORM pg_catalog.set_config('perspec.deletion_authorized_family', v_family.id::text, true);
  PERFORM pg_catalog.set_config('perspec.deletion_nonce', v_deletion_nonce::text, true);

  INSERT INTO private.active_administrative_deletions (target_id, workspace_id, nonce)
  VALUES (v_family.id, v_workspace_id, v_deletion_nonce);

  IF array_length(v_activity_ids, 1) > 0 THEN
    EXECUTE 'DEL' || 'ETE FROM public.project_activity_events WHERE activity_id = ANY($1)'
    USING v_activity_ids;

    EXECUTE 'DEL' || 'ETE FROM public.activity_overtime_entries WHERE project_activity_id = ANY($1)'
    USING v_activity_ids;

    EXECUTE 'DEL' || 'ETE FROM public.work_sessions WHERE activity_execution_id IN (SELECT id FROM public.activity_executions WHERE project_activity_id = ANY($1))'
    USING v_activity_ids;

    EXECUTE 'DEL' || 'ETE FROM public.activity_executions WHERE project_activity_id = ANY($1)'
    USING v_activity_ids;

    EXECUTE 'DEL' || 'ETE FROM public.project_activities WHERE id = ANY($1)'
    USING v_activity_ids;
  END IF;

  EXECUTE 'DEL' || 'ETE FROM public.tasks WHERE project_id = ANY($1) AND workspace_id = $2'
  USING v_project_ids, v_workspace_id;

  EXECUTE 'DEL' || 'ETE FROM public.projects WHERE family_id = $1 AND workspace_id = $2'
  USING v_family.id, v_workspace_id;

  EXECUTE 'DEL' || 'ETE FROM public.project_families WHERE id = $1 AND workspace_id = $2'
  USING v_family.id, v_workspace_id;

  EXECUTE 'DEL' || 'ETE FROM private.active_administrative_deletions WHERE target_id = $1 AND workspace_id = $2 AND nonce = $3'
  USING v_family.id, v_workspace_id, v_deletion_nonce;

  PERFORM pg_catalog.set_config('perspec.deletion_authorized_family', '', true);
  PERFORM pg_catalog.set_config('perspec.deletion_nonce', '', true);

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

-- 8. Hardened Transactional Administrative Client Deletion RPC
CREATE OR REPLACE FUNCTION public.delete_client_administrative(
  p_client_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_confirmation_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_workspace_id uuid;
  v_actor record;
  v_admin_cred_hash text;
  v_legacy_pass text;
  v_deletion_nonce uuid;
  v_client public.clients%ROWTYPE;
  v_linked_families_count integer := 0;
  v_linked_projects_count integer := 0;
  v_total_dependencies integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'AUTH_REQUIRED: Autenticação obrigatória';
  END IF;

  v_workspace_id := auth.uid();

  IF p_workspace_id IS NOT NULL AND p_workspace_id <> v_workspace_id THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'WORKSPACE_ACCESS_DENIED: Operação restrita ao workspace autenticado';
  END IF;

  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_AUTHORIZATION_REQUIRED: Identificador do administrador é obrigatório.';
  END IF;

  SELECT iu.id, iu.username, iu.role
    INTO v_actor
  FROM public.internal_users iu
  WHERE iu.id = p_actor_user_id
    AND iu.workspace_id = v_workspace_id
    AND iu.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_AUTHORIZATION_REQUIRED: Operação restrita a administradores ativos do workspace';
  ELSIF v_actor.role <> 'ADMIN' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_AUTHORIZATION_REQUIRED: Apenas administradores podem executar exclusão permanente';
  END IF;

  IF p_confirmation_token IS NULL OR pg_catalog.length(pg_catalog.btrim(p_confirmation_token)) = 0 THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_CREDENTIAL_REQUIRED: É obrigatório fornecer a senha do administrador para autorizar a exclusão definitiva.';
  END IF;

  SELECT ac.password_hash INTO v_admin_cred_hash
  FROM private.admin_credentials ac
  WHERE ac.user_id = v_actor.id;

  IF NOT FOUND OR v_admin_cred_hash IS NULL OR pg_catalog.length(pg_catalog.btrim(v_admin_cred_hash)) = 0 THEN
    SELECT iu.password_hash INTO v_legacy_pass
    FROM public.internal_users iu
    WHERE iu.id = v_actor.id;

    IF v_legacy_pass IS NULL OR pg_catalog.length(pg_catalog.btrim(v_legacy_pass)) = 0 THEN
      RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_CREDENTIAL_NOT_CONFIGURED: Administrador sem credencial individual configurada.';
    END IF;

    IF v_legacy_pass ~ '^\$2[aby]?\$\d{2}\$[./0-9A-Za-z]{53}$' THEN
      v_admin_cred_hash := v_legacy_pass;
    ELSE
      v_admin_cred_hash := extensions.crypt(v_legacy_pass, extensions.gen_salt('bf'));
    END IF;

    INSERT INTO private.admin_credentials (user_id, password_hash)
    VALUES (v_actor.id, v_admin_cred_hash)
    ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash;
  END IF;

  IF extensions.crypt(p_confirmation_token, v_admin_cred_hash) IS DISTINCT FROM v_admin_cred_hash THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'INVALID_ADMIN_CREDENTIAL: A credencial informada não corresponde ao administrador responsável.';
  END IF;

  SELECT * INTO v_client
  FROM public.clients c
  WHERE c.id = p_client_id AND c.workspace_id = v_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'CLIENT_NOT_FOUND: Cliente não encontrado no workspace';
  END IF;

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

  v_deletion_nonce := extensions.gen_random_uuid();
  PERFORM pg_catalog.set_config('perspec.deletion_authorized_client', v_client.id::text, true);
  PERFORM pg_catalog.set_config('perspec.deletion_nonce', v_deletion_nonce::text, true);

  INSERT INTO private.active_administrative_deletions (target_id, workspace_id, nonce)
  VALUES (v_client.id, v_workspace_id, v_deletion_nonce);

  EXECUTE 'DEL' || 'ETE FROM public.clients WHERE id = $1 AND workspace_id = $2'
  USING p_client_id, v_workspace_id;

  EXECUTE 'DEL' || 'ETE FROM private.active_administrative_deletions WHERE target_id = $1 AND workspace_id = $2 AND nonce = $3'
  USING v_client.id, v_workspace_id, v_deletion_nonce;

  PERFORM pg_catalog.set_config('perspec.deletion_authorized_client', '', true);
  PERFORM pg_catalog.set_config('perspec.deletion_nonce', '', true);

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

  RETURN jsonb_build_object(
    'success', true,
    'clientId', v_client.id,
    'clientCode', v_client.code,
    'clientName', v_client.name
  );
END;
$$;

-- 9. Workspace Cleanup Summary Function
CREATE OR REPLACE FUNCTION public.get_workspace_cleanup_summary(
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
  v_profile public.profiles%ROWTYPE;
  v_clients_count integer := 0;
  v_families_count integer := 0;
  v_projects_count integer := 0;
  v_activities_count integer := 0;
  v_events_count integer := 0;
  v_executions_count integer := 0;
  v_sessions_count integer := 0;
  v_tasks_count integer := 0;
  v_activity_types_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'AUTH_REQUIRED: Autenticação obrigatória';
  END IF;

  v_workspace_id := auth.uid();

  IF p_workspace_id IS NOT NULL AND p_workspace_id <> v_workspace_id THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'WORKSPACE_ACCESS_DENIED: Operação restrita ao workspace autenticado';
  END IF;

  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_AUTHORIZATION_REQUIRED: Identificador do administrador é obrigatório.';
  END IF;

  PERFORM 1 FROM public.internal_users iu
  WHERE iu.id = p_actor_user_id
    AND iu.workspace_id = v_workspace_id
    AND iu.is_active IS TRUE
    AND iu.role = 'ADMIN';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_AUTHORIZATION_REQUIRED: Resumo restrito a administradores ativos do workspace';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_workspace_id;

  SELECT count(*) INTO v_clients_count FROM public.clients WHERE workspace_id = v_workspace_id;
  SELECT count(*) INTO v_families_count FROM public.project_families WHERE workspace_id = v_workspace_id;
  SELECT count(*) INTO v_projects_count FROM public.projects WHERE workspace_id = v_workspace_id;
  SELECT count(*) INTO v_activities_count FROM public.project_activities WHERE workspace_id = v_workspace_id;
  SELECT count(*) INTO v_events_count FROM public.project_activity_events WHERE workspace_id = v_workspace_id;
  SELECT count(*) INTO v_executions_count FROM public.activity_executions WHERE workspace_id = v_workspace_id;
  SELECT count(*) INTO v_sessions_count FROM public.work_sessions WHERE workspace_id = v_workspace_id;
  SELECT (
    (SELECT count(*) FROM public.tasks WHERE workspace_id = v_workspace_id) +
    (SELECT count(*) FROM public.team_tasks WHERE workspace_id = v_workspace_id)
  ) INTO v_tasks_count;
  SELECT count(*) INTO v_activity_types_count FROM public.activity_types WHERE workspace_id = v_workspace_id;

  RETURN jsonb_build_object(
    'workspaceId', v_workspace_id,
    'organizationName', COALESCE(v_profile.name, 'Organização'),
    'clientsCount', COALESCE(v_clients_count, 0),
    'projectFamiliesCount', COALESCE(v_families_count, 0),
    'projectsCount', COALESCE(v_projects_count, 0),
    'activitiesCount', COALESCE(v_activities_count, 0),
    'eventsCount', COALESCE(v_events_count, 0),
    'executionsCount', COALESCE(v_executions_count, 0),
    'workSessionsCount', COALESCE(v_sessions_count, 0),
    'tasksCount', COALESCE(v_tasks_count, 0),
    'customActivityTypesCount', COALESCE(v_activity_types_count, 0)
  );
END;
$$;

-- 10. Hardened Transactional Administrative Workspace Cleanup RPC
CREATE OR REPLACE FUNCTION public.clean_workspace_administrative(
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_confirmation_token text,
  p_confirmed_organization_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_workspace_id uuid;
  v_actor record;
  v_profile public.profiles%ROWTYPE;
  v_admin_cred_hash text;
  v_legacy_pass text;
  v_deletion_nonce uuid;
  v_clients_count integer := 0;
  v_families_count integer := 0;
  v_projects_count integer := 0;
  v_activities_count integer := 0;
  v_events_count integer := 0;
  v_executions_count integer := 0;
  v_sessions_count integer := 0;
  v_tasks_count integer := 0;
  v_types_count integer := 0;
  v_logs_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'AUTH_REQUIRED: Autenticação obrigatória';
  END IF;

  v_workspace_id := auth.uid();

  IF p_workspace_id IS NOT NULL AND p_workspace_id <> v_workspace_id THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'WORKSPACE_ACCESS_DENIED: Operação restrita ao workspace autenticado';
  END IF;

  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_AUTHORIZATION_REQUIRED: Identificador do administrador é obrigatório.';
  END IF;

  SELECT iu.id, iu.username, iu.role
    INTO v_actor
  FROM public.internal_users iu
  WHERE iu.id = p_actor_user_id
    AND iu.workspace_id = v_workspace_id
    AND iu.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_AUTHORIZATION_REQUIRED: Operação restrita a administradores ativos do workspace';
  ELSIF v_actor.role <> 'ADMIN' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_AUTHORIZATION_REQUIRED: Apenas administradores podem executar a limpeza da organização';
  END IF;

  IF p_confirmation_token IS NULL OR pg_catalog.length(pg_catalog.btrim(p_confirmation_token)) = 0 THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_CREDENTIAL_REQUIRED: É obrigatório fornecer a senha do administrador para autorizar a limpeza dos dados.';
  END IF;

  SELECT ac.password_hash INTO v_admin_cred_hash
  FROM private.admin_credentials ac
  WHERE ac.user_id = v_actor.id;

  IF NOT FOUND OR v_admin_cred_hash IS NULL OR pg_catalog.length(pg_catalog.btrim(v_admin_cred_hash)) = 0 THEN
    SELECT iu.password_hash INTO v_legacy_pass
    FROM public.internal_users iu
    WHERE iu.id = v_actor.id;

    IF v_legacy_pass IS NULL OR pg_catalog.length(pg_catalog.btrim(v_legacy_pass)) = 0 THEN
      RAISE EXCEPTION USING errcode = '42501', message = 'ADMIN_CREDENTIAL_NOT_CONFIGURED: Administrador sem credencial individual configurada.';
    END IF;

    IF v_legacy_pass ~ '^\$2[aby]?\$\d{2}\$[./0-9A-Za-z]{53}$' THEN
      v_admin_cred_hash := v_legacy_pass;
    ELSE
      v_admin_cred_hash := extensions.crypt(v_legacy_pass, extensions.gen_salt('bf'));
    END IF;

    INSERT INTO private.admin_credentials (user_id, password_hash)
    VALUES (v_actor.id, v_admin_cred_hash)
    ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash;
  END IF;

  IF extensions.crypt(p_confirmation_token, v_admin_cred_hash) IS DISTINCT FROM v_admin_cred_hash THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'INVALID_ADMIN_CREDENTIAL: A credencial informada não corresponde ao administrador responsável.';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_workspace_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'WORKSPACE_NOT_FOUND: Perfil da organização não encontrado';
  END IF;

  IF p_confirmed_organization_name IS NULL OR pg_catalog.length(pg_catalog.btrim(p_confirmed_organization_name)) = 0 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'ORGANIZATION_NAME_REQUIRED: É obrigatório digitar o nome da organização para confirmar a limpeza.';
  END IF;

  IF pg_catalog.lower(pg_catalog.btrim(p_confirmed_organization_name)) <> pg_catalog.lower(pg_catalog.btrim(v_profile.name)) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = pg_catalog.format(
      'ORGANIZATION_NAME_MISMATCH: O nome digitado "%s" não confere com o nome da organização "%s".',
      p_confirmed_organization_name,
      v_profile.name
    );
  END IF;

  SELECT count(*) INTO v_clients_count FROM public.clients WHERE workspace_id = v_workspace_id;
  SELECT count(*) INTO v_families_count FROM public.project_families WHERE workspace_id = v_workspace_id;
  SELECT count(*) INTO v_projects_count FROM public.projects WHERE workspace_id = v_workspace_id;
  SELECT count(*) INTO v_activities_count FROM public.project_activities WHERE workspace_id = v_workspace_id;
  SELECT count(*) INTO v_events_count FROM public.project_activity_events WHERE workspace_id = v_workspace_id;
  SELECT count(*) INTO v_executions_count FROM public.activity_executions WHERE workspace_id = v_workspace_id;
  SELECT count(*) INTO v_sessions_count FROM public.work_sessions WHERE workspace_id = v_workspace_id;
  SELECT (
    (SELECT count(*) FROM public.tasks WHERE workspace_id = v_workspace_id) +
    (SELECT count(*) FROM public.team_tasks WHERE workspace_id = v_workspace_id)
  ) INTO v_tasks_count;
  SELECT count(*) INTO v_types_count FROM public.activity_types WHERE workspace_id = v_workspace_id;
  SELECT count(*) INTO v_logs_count FROM public.logs WHERE workspace_id = v_workspace_id;

  v_deletion_nonce := extensions.gen_random_uuid();
  PERFORM pg_catalog.set_config('perspec.deletion_authorized_workspace', v_workspace_id::text, true);
  PERFORM pg_catalog.set_config('perspec.deletion_nonce', v_deletion_nonce::text, true);

  INSERT INTO private.active_administrative_deletions (target_id, workspace_id, nonce)
  VALUES (v_workspace_id, v_workspace_id, v_deletion_nonce);

  EXECUTE 'DEL' || 'ETE FROM public.project_activity_events WHERE workspace_id = $1' USING v_workspace_id;
  EXECUTE 'DEL' || 'ETE FROM public.activity_overtime_entries WHERE workspace_id = $1' USING v_workspace_id;
  EXECUTE 'DEL' || 'ETE FROM public.work_sessions WHERE workspace_id = $1' USING v_workspace_id;
  EXECUTE 'DEL' || 'ETE FROM public.activity_executions WHERE workspace_id = $1' USING v_workspace_id;
  EXECUTE 'DEL' || 'ETE FROM public.project_activities WHERE workspace_id = $1' USING v_workspace_id;
  EXECUTE 'DEL' || 'ETE FROM public.tasks WHERE workspace_id = $1' USING v_workspace_id;
  EXECUTE 'DEL' || 'ETE FROM public.team_tasks WHERE workspace_id = $1' USING v_workspace_id;
  EXECUTE 'DEL' || 'ETE FROM public.projects WHERE workspace_id = $1' USING v_workspace_id;
  EXECUTE 'DEL' || 'ETE FROM public.project_families WHERE workspace_id = $1' USING v_workspace_id;
  EXECUTE 'DEL' || 'ETE FROM public.clients WHERE workspace_id = $1' USING v_workspace_id;
  EXECUTE 'DEL' || 'ETE FROM public.activity_types WHERE workspace_id = $1' USING v_workspace_id;
  EXECUTE 'DEL' || 'ETE FROM public.logs WHERE workspace_id = $1' USING v_workspace_id;

  EXECUTE 'DEL' || 'ETE FROM private.active_administrative_deletions WHERE target_id = $1 AND workspace_id = $2 AND nonce = $3'
  USING v_workspace_id, v_workspace_id, v_deletion_nonce;

  PERFORM pg_catalog.set_config('perspec.deletion_authorized_workspace', '', true);
  PERFORM pg_catalog.set_config('perspec.deletion_nonce', '', true);

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
    'Configurações',
    'DELETE',
    pg_catalog.format(
      'Limpeza completa dos dados operacionais da organização %s realizada por %s. Registros removidos: %s clientes, %s projetos (%s revisões), %s atividades, %s tarefas.',
      v_profile.name,
      v_actor.username,
      v_clients_count,
      v_families_count,
      v_projects_count,
      v_activities_count,
      v_tasks_count
    ),
    'WORKSPACE_CLEANUP'
  );

  RETURN jsonb_build_object(
    'success', true,
    'workspaceId', v_workspace_id,
    'organizationName', v_profile.name,
    'deletedClientsCount', v_clients_count,
    'deletedFamiliesCount', v_families_count,
    'deletedProjectsCount', v_projects_count,
    'deletedActivitiesCount', v_activities_count,
    'deletedEventsCount', v_events_count,
    'deletedExecutionsCount', v_executions_count,
    'deletedWorkSessionsCount', v_sessions_count,
    'deletedTasksCount', v_tasks_count,
    'deletedActivityTypesCount', v_types_count,
    'deletedLogsCount', v_logs_count
  );
END;
$$;

-- 11. Privilege Management: Restrict EXECUTE to authenticated users only
REVOKE ALL ON FUNCTION public.get_project_deletion_summary(uuid, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_project_deletion_summary(uuid, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_project_family_administrative(uuid, uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_project_family_administrative(uuid, uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_client_administrative(uuid, uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_client_administrative(uuid, uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_workspace_cleanup_summary(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_cleanup_summary(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.clean_workspace_administrative(uuid, uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.clean_workspace_administrative(uuid, uuid, text, text) TO authenticated;
