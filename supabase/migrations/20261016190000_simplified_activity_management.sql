-- Migration: Add simplified activity operational model fields and event audit history
-- Date: 2026-10-16
-- Reference: PERSPECPATH Refatoração do Modelo de Gestão de Atividades

-- 1. Add original_delivery_date and blocked_reason columns to project_activities
ALTER TABLE public.project_activities 
ADD COLUMN IF NOT EXISTS original_delivery_date date,
ADD COLUMN IF NOT EXISTS blocked_reason text;

-- 2. Populate original_delivery_date for existing activities in active revisions
UPDATE public.project_activities pa 
SET original_delivery_date = pa.delivery_date 
FROM public.projects p 
WHERE pa.project_id = p.id 
  AND p.is_current_revision = true 
  AND pa.original_delivery_date IS NULL 
  AND pa.delivery_date IS NOT NULL;

-- 3. Create project_activity_events table for auditable lifecycle events
CREATE TABLE IF NOT EXISTS public.project_activity_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    event_type text NOT NULL, -- 'CREATED', 'STARTED', 'BLOCKED', 'RESUMED', 'COMPLETED', 'REOPENED', 'RESCHEDULED', 'DATES_ADJUSTED', 'ASSIGNEE_CHANGED', 'UPDATED'
    from_status text,
    to_status text,
    details text,
    metadata jsonb DEFAULT '{}'::jsonb,
    actor_id uuid REFERENCES public.internal_users(id) ON DELETE SET NULL,
    actor_name text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT fk_activity_events_activity
        FOREIGN KEY (activity_id, workspace_id)
        REFERENCES public.project_activities(id, workspace_id)
        ON DELETE CASCADE
);

-- 4. Create performance indexes for activity event queries
CREATE INDEX IF NOT EXISTS idx_activity_events_activity_id 
    ON public.project_activity_events (activity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_workspace_id 
    ON public.project_activity_events (workspace_id, created_at DESC);

-- 5. Enable RLS and setup policy
ALTER TABLE public.project_activity_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'project_activity_events' 
          AND policyname = 'Workspaces can manage own activity events'
    ) THEN
        CREATE POLICY "Workspaces can manage own activity events" 
        ON public.project_activity_events 
        FOR ALL 
        TO authenticated 
        USING (workspace_id = (SELECT auth.uid())) 
        WITH CHECK (workspace_id = (SELECT auth.uid()));
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_activity_events TO authenticated;
