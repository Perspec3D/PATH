-- Cover the composite foreign keys using their declared column order.
CREATE INDEX activity_executions_project_activity_workspace_idx
    ON public.activity_executions (project_activity_id, workspace_id);

CREATE INDEX activity_executions_internal_user_workspace_idx
    ON public.activity_executions (internal_user_id, workspace_id);
