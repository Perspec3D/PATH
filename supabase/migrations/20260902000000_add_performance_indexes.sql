-- Migration: Add Performance Indexes for Workspace Entities
-- Date: 2026-09-02

-- 1. Projects: composite indexes for high-frequency filtering and revision lookups
CREATE INDEX IF NOT EXISTS idx_projects_workspace_current_rev
    ON public.projects (workspace_id, is_current_revision);

CREATE INDEX IF NOT EXISTS idx_projects_workspace_client
    ON public.projects (workspace_id, client_id);

CREATE INDEX IF NOT EXISTS idx_projects_workspace_assignee
    ON public.projects (workspace_id, assignee_id);

CREATE INDEX IF NOT EXISTS idx_projects_workspace_status
    ON public.projects (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_projects_workspace_created_at
    ON public.projects (workspace_id, created_at DESC);

-- 2. Work Sessions: indexes for workspace-wide and execution-specific lookups
CREATE INDEX IF NOT EXISTS idx_work_sessions_workspace_id
    ON public.work_sessions (workspace_id);

CREATE INDEX IF NOT EXISTS idx_work_sessions_activity_execution_id
    ON public.work_sessions (activity_execution_id);

CREATE INDEX IF NOT EXISTS idx_work_sessions_workspace_active
    ON public.work_sessions (workspace_id, internal_user_id)
    WHERE ended_at IS NULL;

-- 3. Activity Overtime Entries: indexes for project activity lookups
CREATE INDEX IF NOT EXISTS idx_activity_overtime_project_activity
    ON public.activity_overtime_entries (project_activity_id);

CREATE INDEX IF NOT EXISTS idx_activity_overtime_workspace_id
    ON public.activity_overtime_entries (workspace_id);

-- 4. Activity Executions: workspace and project activity indexes
CREATE INDEX IF NOT EXISTS idx_activity_executions_workspace_id
    ON public.activity_executions (workspace_id);

CREATE INDEX IF NOT EXISTS idx_activity_executions_workspace_status
    ON public.activity_executions (workspace_id, status);

-- 5. System Logs: index for fast descending chronological retrieval
CREATE INDEX IF NOT EXISTS idx_logs_workspace_created_at
    ON public.logs (workspace_id, created_at DESC);
