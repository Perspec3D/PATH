-- Atomic activity execution transitions for the operational UI.
-- Functions are SECURITY INVOKER so the existing workspace RLS remains authoritative.

CREATE OR REPLACE FUNCTION public.start_or_resume_activity(
    p_project_activity_id uuid,
    p_internal_user_id uuid,
    p_pause_current boolean DEFAULT false
)
RETURNS TABLE (
    activity_execution_id uuid,
    work_session_id uuid,
    transition_action text,
    transitioned_at timestamp with time zone,
    previous_project_activity_id uuid
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_workspace_id uuid := (SELECT auth.uid());
    v_now timestamp with time zone := clock_timestamp();
    v_assignee_id uuid;
    v_activity_status text;
    v_execution_id uuid;
    v_execution_existed boolean := false;
    v_active_session_id uuid;
    v_active_execution_id uuid;
    v_active_activity_id uuid;
    v_new_session_id uuid;
BEGIN
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTH_REQUIRED';
    END IF;

    -- Serialize transitions for this internal user and validate workspace membership.
    PERFORM 1
    FROM public.internal_users iu
    WHERE iu.id = p_internal_user_id
      AND iu.workspace_id = v_workspace_id
      AND iu.is_active IS TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INTERNAL_USER_NOT_AVAILABLE';
    END IF;

    SELECT pa.assignee_id, pa.status
    INTO v_assignee_id, v_activity_status
    FROM public.project_activities pa
    WHERE pa.id = p_project_activity_id
      AND pa.workspace_id = v_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTIVITY_NOT_FOUND';
    END IF;

    IF v_assignee_id IS DISTINCT FROM p_internal_user_id THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTIVITY_NOT_ASSIGNED_TO_USER';
    END IF;

    IF v_activity_status IN ('Concluído', 'Cancelado') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTIVITY_CLOSED';
    END IF;

    SELECT ae.id
    INTO v_execution_id
    FROM public.activity_executions ae
    WHERE ae.workspace_id = v_workspace_id
      AND ae.project_activity_id = p_project_activity_id
      AND ae.internal_user_id = p_internal_user_id
      AND ae.status NOT IN ('COMPLETED', 'CANCELED')
    ORDER BY ae.created_at DESC
    LIMIT 1
    FOR UPDATE;

    v_execution_existed := FOUND;

    SELECT ws.id, ws.activity_execution_id, ae.project_activity_id
    INTO v_active_session_id, v_active_execution_id, v_active_activity_id
    FROM public.work_sessions ws
    JOIN public.activity_executions ae ON ae.id = ws.activity_execution_id
    WHERE ws.workspace_id = v_workspace_id
      AND ws.internal_user_id = p_internal_user_id
      AND ws.ended_at IS NULL
    LIMIT 1
    FOR UPDATE OF ws;

    IF v_active_session_id IS NOT NULL AND v_active_execution_id = v_execution_id THEN
        UPDATE public.activity_executions
        SET status = 'IN_PROGRESS'
        WHERE id = v_execution_id;

        UPDATE public.project_activities
        SET status = 'Em Andamento',
            actual_start_date = COALESCE(actual_start_date, v_now::date)
        WHERE id = p_project_activity_id
          AND workspace_id = v_workspace_id;

        RETURN QUERY SELECT
            v_execution_id,
            v_active_session_id,
            'ALREADY_RUNNING'::text,
            v_now,
            NULL::uuid;
        RETURN;
    END IF;

    IF v_active_session_id IS NOT NULL THEN
        IF NOT p_pause_current THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTIVE_SESSION_EXISTS';
        END IF;

        UPDATE public.work_sessions
        SET ended_at = v_now
        WHERE id = v_active_session_id;

        UPDATE public.activity_executions
        SET status = 'PAUSED'
        WHERE id = v_active_execution_id
          AND status NOT IN ('COMPLETED', 'CANCELED');

        UPDATE public.project_activities
        SET status = 'Pausado'
        WHERE id = v_active_activity_id
          AND workspace_id = v_workspace_id
          AND status NOT IN ('Concluído', 'Cancelado');
    END IF;

    IF NOT v_execution_existed THEN
        INSERT INTO public.activity_executions (
            workspace_id,
            project_activity_id,
            internal_user_id,
            status,
            started_at
        ) VALUES (
            v_workspace_id,
            p_project_activity_id,
            p_internal_user_id,
            'IN_PROGRESS',
            v_now
        )
        RETURNING id INTO v_execution_id;
    ELSE
        UPDATE public.activity_executions
        SET status = 'IN_PROGRESS'
        WHERE id = v_execution_id;
    END IF;

    INSERT INTO public.work_sessions (
        workspace_id,
        activity_execution_id,
        internal_user_id,
        started_at,
        ended_at
    ) VALUES (
        v_workspace_id,
        v_execution_id,
        p_internal_user_id,
        v_now,
        NULL
    )
    RETURNING id INTO v_new_session_id;

    UPDATE public.project_activities
    SET status = 'Em Andamento',
        actual_start_date = COALESCE(actual_start_date, v_now::date)
    WHERE id = p_project_activity_id
      AND workspace_id = v_workspace_id;

    RETURN QUERY SELECT
        v_execution_id,
        v_new_session_id,
        CASE WHEN v_execution_existed THEN 'RESUMED' ELSE 'STARTED' END::text,
        v_now,
        v_active_activity_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pause_activity_execution(
    p_activity_execution_id uuid,
    p_internal_user_id uuid
)
RETURNS TABLE (
    activity_execution_id uuid,
    work_session_id uuid,
    transitioned_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_workspace_id uuid := (SELECT auth.uid());
    v_now timestamp with time zone := clock_timestamp();
    v_activity_id uuid;
    v_session_id uuid;
BEGIN
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTH_REQUIRED';
    END IF;

    PERFORM 1
    FROM public.internal_users iu
    WHERE iu.id = p_internal_user_id
      AND iu.workspace_id = v_workspace_id
      AND iu.is_active IS TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INTERNAL_USER_NOT_AVAILABLE';
    END IF;

    SELECT ae.project_activity_id
    INTO v_activity_id
    FROM public.activity_executions ae
    WHERE ae.id = p_activity_execution_id
      AND ae.workspace_id = v_workspace_id
      AND ae.internal_user_id = p_internal_user_id
      AND ae.status NOT IN ('COMPLETED', 'CANCELED')
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EXECUTION_NOT_AVAILABLE';
    END IF;

    SELECT ws.id
    INTO v_session_id
    FROM public.work_sessions ws
    WHERE ws.activity_execution_id = p_activity_execution_id
      AND ws.workspace_id = v_workspace_id
      AND ws.internal_user_id = p_internal_user_id
      AND ws.ended_at IS NULL
    LIMIT 1
    FOR UPDATE;

    IF v_session_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_ACTIVE_SESSION';
    END IF;

    UPDATE public.work_sessions
    SET ended_at = v_now
    WHERE id = v_session_id;

    UPDATE public.activity_executions
    SET status = 'PAUSED'
    WHERE id = p_activity_execution_id;

    UPDATE public.project_activities
    SET status = 'Pausado'
    WHERE id = v_activity_id
      AND workspace_id = v_workspace_id;

    RETURN QUERY SELECT p_activity_execution_id, v_session_id, v_now;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_activity_execution(
    p_activity_execution_id uuid,
    p_internal_user_id uuid
)
RETURNS TABLE (
    activity_execution_id uuid,
    work_session_id uuid,
    transitioned_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_workspace_id uuid := (SELECT auth.uid());
    v_now timestamp with time zone := clock_timestamp();
    v_activity_id uuid;
    v_execution_started_at timestamp with time zone;
    v_session_id uuid;
BEGIN
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTH_REQUIRED';
    END IF;

    PERFORM 1
    FROM public.internal_users iu
    WHERE iu.id = p_internal_user_id
      AND iu.workspace_id = v_workspace_id
      AND iu.is_active IS TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INTERNAL_USER_NOT_AVAILABLE';
    END IF;

    SELECT ae.project_activity_id, ae.started_at
    INTO v_activity_id, v_execution_started_at
    FROM public.activity_executions ae
    WHERE ae.id = p_activity_execution_id
      AND ae.workspace_id = v_workspace_id
      AND ae.internal_user_id = p_internal_user_id
      AND ae.status NOT IN ('COMPLETED', 'CANCELED')
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EXECUTION_NOT_AVAILABLE';
    END IF;

    SELECT ws.id
    INTO v_session_id
    FROM public.work_sessions ws
    WHERE ws.activity_execution_id = p_activity_execution_id
      AND ws.workspace_id = v_workspace_id
      AND ws.internal_user_id = p_internal_user_id
      AND ws.ended_at IS NULL
    LIMIT 1
    FOR UPDATE;

    IF v_session_id IS NOT NULL THEN
        UPDATE public.work_sessions
        SET ended_at = v_now
        WHERE id = v_session_id;
    END IF;

    UPDATE public.activity_executions
    SET status = 'COMPLETED',
        completed_at = v_now
    WHERE id = p_activity_execution_id;

    UPDATE public.project_activities
    SET status = 'Concluído',
        actual_start_date = COALESCE(actual_start_date, v_execution_started_at::date),
        actual_end_date = v_now::date
    WHERE id = v_activity_id
      AND workspace_id = v_workspace_id;

    RETURN QUERY SELECT p_activity_execution_id, v_session_id, v_now;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_or_resume_activity(uuid, uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pause_activity_execution(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_activity_execution(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.start_or_resume_activity(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pause_activity_execution(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_activity_execution(uuid, uuid) TO authenticated;
