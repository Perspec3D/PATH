CREATE INDEX activity_overtime_entries_project_activity_workspace_idx
    ON public.activity_overtime_entries (project_activity_id, workspace_id);
