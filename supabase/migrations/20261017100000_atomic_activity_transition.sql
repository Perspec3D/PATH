-- Migration: Atomic Project Activity Transition and Event Audit Logging
-- Date: 2026-10-17
-- Phase: PERSPECPATH Fase 3 - Consolidacao, Integridade e Performance

CREATE OR REPLACE FUNCTION public.transition_project_activity(
    p_activity_id uuid,
    p_workspace_id uuid,
    p_status text,
    p_actual_start_date date DEFAULT NULL,
    p_actual_end_date date DEFAULT NULL,
    p_blocked_reason text DEFAULT NULL,
    p_conclusion_responsible_id uuid DEFAULT NULL,
    p_deadline_at_conclusion date DEFAULT NULL,
    p_delivery_date date DEFAULT NULL,
    p_start_date date DEFAULT NULL,
    p_order_index integer DEFAULT NULL,
    p_deadline_changes_count integer DEFAULT NULL,
    p_event_type text DEFAULT 'UPDATED',
    p_from_status text DEFAULT NULL,
    p_to_status text DEFAULT NULL,
    p_details text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_actor_id uuid DEFAULT NULL,
    p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_activity record;
    v_new_event record;
BEGIN
    -- Verify workspace isolation if auth.uid() is available
    IF auth.uid() IS NOT NULL AND p_workspace_id != auth.uid() THEN
        RAISE EXCEPTION 'Acesso não autorizado para este workspace';
    END IF;

    -- Update project activity
    UPDATE public.project_activities
    SET
        status = COALESCE(p_status, status),
        actual_start_date = CASE WHEN p_actual_start_date IS NOT NULL THEN p_actual_start_date ELSE actual_start_date END,
        actual_end_date = p_actual_end_date,
        blocked_reason = p_blocked_reason,
        conclusion_responsible_id = p_conclusion_responsible_id,
        deadline_at_conclusion = p_deadline_at_conclusion,
        delivery_date = COALESCE(p_delivery_date, delivery_date),
        start_date = COALESCE(p_start_date, start_date),
        order_index = COALESCE(p_order_index, order_index),
        deadline_changes_count = COALESCE(p_deadline_changes_count, deadline_changes_count),
        updated_at = now()
    WHERE id = p_activity_id AND workspace_id = p_workspace_id
    RETURNING * INTO v_updated_activity;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Atividade não encontrada ou sem permissão de acesso';
    END IF;

    -- Insert event in the exact same transaction
    INSERT INTO public.project_activity_events (
        workspace_id,
        activity_id,
        event_type,
        from_status,
        to_status,
        details,
        metadata,
        actor_id,
        actor_name,
        created_at
    ) VALUES (
        p_workspace_id,
        p_activity_id,
        p_event_type,
        p_from_status,
        p_to_status,
        p_details,
        COALESCE(p_metadata, '{}'::jsonb),
        p_actor_id,
        p_actor_name,
        now()
    ) RETURNING * INTO v_new_event;

    RETURN jsonb_build_object(
        'activity_id', v_updated_activity.id,
        'status', v_updated_activity.status,
        'event_id', v_new_event.id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_project_activity TO authenticated, service_role;
