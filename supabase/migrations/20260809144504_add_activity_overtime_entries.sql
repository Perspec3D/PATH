-- Administrative overtime entries supplement regular operational time.
-- Workspace Auth identifies the tenant; the supplied internal user is checked
-- independently and must be an active ADMIN in that same workspace.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE TABLE public.activity_overtime_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    project_activity_id uuid NOT NULL,
    date date NOT NULL,
    authorized_hours numeric(8, 2) NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    notes text,

    CONSTRAINT activity_overtime_entries_authorized_hours_check
        CHECK (authorized_hours > 0),
    CONSTRAINT fk_activity_overtime_entries_project_activity
        FOREIGN KEY (project_activity_id, workspace_id)
        REFERENCES public.project_activities(id, workspace_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_activity_overtime_entries_created_by
        FOREIGN KEY (created_by, workspace_id)
        REFERENCES public.internal_users(id, workspace_id)
        ON DELETE RESTRICT
);

CREATE INDEX activity_overtime_entries_workspace_activity_date_idx
    ON public.activity_overtime_entries (workspace_id, project_activity_id, date DESC);
CREATE INDEX activity_overtime_entries_created_by_workspace_idx
    ON public.activity_overtime_entries (created_by, workspace_id);

CREATE TRIGGER update_activity_overtime_entries_updated_at
    BEFORE UPDATE ON public.activity_overtime_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.activity_overtime_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view activity overtime entries"
ON public.activity_overtime_entries
FOR SELECT
TO authenticated
USING (workspace_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.activity_overtime_entries FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.activity_overtime_entries FROM authenticated;
GRANT SELECT ON TABLE public.activity_overtime_entries TO authenticated;

CREATE OR REPLACE FUNCTION private.create_activity_overtime_entry(
    p_project_activity_id uuid,
    p_admin_internal_user_id uuid,
    p_entry_date date,
    p_authorized_hours numeric,
    p_notes text DEFAULT NULL
)
RETURNS SETOF public.activity_overtime_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_workspace_id uuid := (SELECT auth.uid());
    v_entry public.activity_overtime_entries%ROWTYPE;
BEGIN
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTH_REQUIRED';
    END IF;

    PERFORM 1
    FROM public.internal_users iu
    WHERE iu.id = p_admin_internal_user_id
      AND iu.workspace_id = v_workspace_id
      AND iu.role = 'ADMIN'
      AND iu.is_active IS TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_REQUIRED';
    END IF;

    PERFORM 1
    FROM public.project_activities pa
    WHERE pa.id = p_project_activity_id
      AND pa.workspace_id = v_workspace_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTIVITY_NOT_FOUND';
    END IF;

    IF p_entry_date IS NULL OR p_authorized_hours IS NULL OR p_authorized_hours <= 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_OVERTIME_ENTRY';
    END IF;

    INSERT INTO public.activity_overtime_entries (
        workspace_id,
        project_activity_id,
        date,
        authorized_hours,
        created_by,
        notes
    ) VALUES (
        v_workspace_id,
        p_project_activity_id,
        p_entry_date,
        p_authorized_hours,
        p_admin_internal_user_id,
        NULLIF(BTRIM(p_notes), '')
    )
    RETURNING * INTO v_entry;

    RETURN NEXT v_entry;
END;
$$;

CREATE OR REPLACE FUNCTION private.update_activity_overtime_entry(
    p_entry_id uuid,
    p_admin_internal_user_id uuid,
    p_entry_date date,
    p_authorized_hours numeric,
    p_notes text DEFAULT NULL
)
RETURNS SETOF public.activity_overtime_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_workspace_id uuid := (SELECT auth.uid());
    v_entry public.activity_overtime_entries%ROWTYPE;
BEGIN
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTH_REQUIRED';
    END IF;

    PERFORM 1
    FROM public.internal_users iu
    WHERE iu.id = p_admin_internal_user_id
      AND iu.workspace_id = v_workspace_id
      AND iu.role = 'ADMIN'
      AND iu.is_active IS TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_REQUIRED';
    END IF;

    IF p_entry_date IS NULL OR p_authorized_hours IS NULL OR p_authorized_hours <= 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_OVERTIME_ENTRY';
    END IF;

    SELECT *
    INTO v_entry
    FROM public.activity_overtime_entries aoe
    WHERE aoe.id = p_entry_id
      AND aoe.workspace_id = v_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OVERTIME_ENTRY_NOT_FOUND';
    END IF;

    UPDATE public.activity_overtime_entries
    SET date = p_entry_date,
        authorized_hours = p_authorized_hours,
        notes = NULLIF(BTRIM(p_notes), '')
    WHERE id = p_entry_id
      AND workspace_id = v_workspace_id
    RETURNING * INTO v_entry;

    RETURN NEXT v_entry;
END;
$$;

CREATE OR REPLACE FUNCTION private.delete_activity_overtime_entry(
    p_entry_id uuid,
    p_admin_internal_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_workspace_id uuid := (SELECT auth.uid());
    v_deleted_id uuid;
BEGIN
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTH_REQUIRED';
    END IF;

    PERFORM 1
    FROM public.internal_users iu
    WHERE iu.id = p_admin_internal_user_id
      AND iu.workspace_id = v_workspace_id
      AND iu.role = 'ADMIN'
      AND iu.is_active IS TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_REQUIRED';
    END IF;

    DELETE FROM public.activity_overtime_entries
    WHERE id = p_entry_id
      AND workspace_id = v_workspace_id
    RETURNING id INTO v_deleted_id;

    IF v_deleted_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OVERTIME_ENTRY_NOT_FOUND';
    END IF;

    RETURN v_deleted_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_activity_overtime_entry(
    p_project_activity_id uuid,
    p_admin_internal_user_id uuid,
    p_entry_date date,
    p_authorized_hours numeric,
    p_notes text DEFAULT NULL
)
RETURNS SETOF public.activity_overtime_entries
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT *
    FROM private.create_activity_overtime_entry(
        p_project_activity_id,
        p_admin_internal_user_id,
        p_entry_date,
        p_authorized_hours,
        p_notes
    );
$$;

CREATE OR REPLACE FUNCTION public.update_activity_overtime_entry(
    p_entry_id uuid,
    p_admin_internal_user_id uuid,
    p_entry_date date,
    p_authorized_hours numeric,
    p_notes text DEFAULT NULL
)
RETURNS SETOF public.activity_overtime_entries
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT *
    FROM private.update_activity_overtime_entry(
        p_entry_id,
        p_admin_internal_user_id,
        p_entry_date,
        p_authorized_hours,
        p_notes
    );
$$;

CREATE OR REPLACE FUNCTION public.delete_activity_overtime_entry(
    p_entry_id uuid,
    p_admin_internal_user_id uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT private.delete_activity_overtime_entry(p_entry_id, p_admin_internal_user_id);
$$;

REVOKE EXECUTE ON FUNCTION private.create_activity_overtime_entry(uuid, uuid, date, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.update_activity_overtime_entry(uuid, uuid, date, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.delete_activity_overtime_entry(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_activity_overtime_entry(uuid, uuid, date, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_activity_overtime_entry(uuid, uuid, date, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_activity_overtime_entry(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.create_activity_overtime_entry(uuid, uuid, date, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.update_activity_overtime_entry(uuid, uuid, date, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.delete_activity_overtime_entry(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_activity_overtime_entry(uuid, uuid, date, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_activity_overtime_entry(uuid, uuid, date, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_activity_overtime_entry(uuid, uuid) TO authenticated;
