-- Migration: create activity executions and work sessions foundation
-- Architecture: project_activities -> activity_executions -> work_sessions

-- Composite keys keep every relationship inside the same workspace.
ALTER TABLE public.internal_users
ADD CONSTRAINT internal_users_id_workspace_id_key UNIQUE (id, workspace_id);

ALTER TABLE public.project_activities
ADD CONSTRAINT project_activities_id_workspace_id_key UNIQUE (id, workspace_id);

CREATE TABLE public.activity_executions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    project_activity_id uuid NOT NULL,
    internal_user_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'IN_PROGRESS',
    started_at timestamp with time zone NOT NULL DEFAULT now(),
    completed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT activity_executions_status_check
        CHECK (status IN ('IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELED')),
    CONSTRAINT activity_executions_completed_at_check
        CHECK (completed_at IS NULL OR completed_at >= started_at),
    CONSTRAINT activity_executions_id_workspace_user_key
        UNIQUE (id, workspace_id, internal_user_id),
    CONSTRAINT fk_activity_executions_project_activity
        FOREIGN KEY (project_activity_id, workspace_id)
        REFERENCES public.project_activities(id, workspace_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_activity_executions_internal_user
        FOREIGN KEY (internal_user_id, workspace_id)
        REFERENCES public.internal_users(id, workspace_id)
        ON DELETE RESTRICT
);

CREATE TABLE public.work_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    activity_execution_id uuid NOT NULL,
    internal_user_id uuid NOT NULL,
    started_at timestamp with time zone NOT NULL DEFAULT now(),
    ended_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT work_sessions_time_range_check
        CHECK (ended_at IS NULL OR ended_at >= started_at),
    CONSTRAINT fk_work_sessions_activity_execution
        FOREIGN KEY (activity_execution_id, workspace_id, internal_user_id)
        REFERENCES public.activity_executions(id, workspace_id, internal_user_id)
        ON DELETE CASCADE
);

-- An internal user can have at most one open session across the entire workspace.
-- internal_users.id is globally unique, so the partial unique key needs only that ID.
CREATE UNIQUE INDEX work_sessions_one_active_per_internal_user_idx
    ON public.work_sessions (internal_user_id)
    WHERE ended_at IS NULL;

-- FK traversal, workspace filtering, and chronological history indexes.
CREATE INDEX activity_executions_project_activity_idx
    ON public.activity_executions (project_activity_id);
CREATE INDEX activity_executions_workspace_user_idx
    ON public.activity_executions (workspace_id, internal_user_id);
CREATE INDEX work_sessions_activity_execution_idx
    ON public.work_sessions (activity_execution_id, workspace_id, internal_user_id);
CREATE INDEX work_sessions_workspace_user_started_idx
    ON public.work_sessions (workspace_id, internal_user_id, started_at DESC);

CREATE TRIGGER update_activity_executions_updated_at
    BEFORE UPDATE ON public.activity_executions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_work_sessions_updated_at
    BEFORE UPDATE ON public.work_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.activity_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can manage activity executions"
ON public.activity_executions
FOR ALL
TO authenticated
USING (workspace_id = (SELECT auth.uid()))
WITH CHECK (workspace_id = (SELECT auth.uid()));

CREATE POLICY "Workspace members can manage work sessions"
ON public.work_sessions
FOR ALL
TO authenticated
USING (workspace_id = (SELECT auth.uid()))
WITH CHECK (workspace_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.activity_executions FROM anon;
REVOKE ALL ON TABLE public.work_sessions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.activity_executions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.work_sessions TO authenticated;
