-- Migration: Create Activities Foundation
-- Date: 2026-08-09

-- 1. Reusable function to update updated_at column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create activity_types table
CREATE TABLE IF NOT EXISTS public.activity_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    category text,
    is_active boolean NOT NULL DEFAULT true,
    display_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT activity_types_workspace_name_key UNIQUE (workspace_id, name),
    CONSTRAINT activity_types_id_workspace_id_key UNIQUE (id, workspace_id)
);

-- 3. Create unique constraint on projects to allow composite foreign key reference
ALTER TABLE public.projects 
ADD CONSTRAINT projects_id_workspace_id_key UNIQUE (id, workspace_id);

-- 4. Create project_activities table
CREATE TABLE IF NOT EXISTS public.project_activities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    activity_type_id uuid,
    name text NOT NULL,
    assignee_id uuid REFERENCES public.internal_users(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'Fila de Espera',
    start_date date,
    delivery_date date,
    notes text,
    estimated_duration_hours numeric,
    order_index integer NOT NULL DEFAULT 0,
    actual_start_date date,
    actual_end_date date,
    conclusion_responsible_id uuid REFERENCES public.internal_users(id) ON DELETE SET NULL,
    deadline_changes_count integer NOT NULL DEFAULT 0,
    deadline_at_conclusion date,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    
    -- Workspace consistency foreign keys
    CONSTRAINT fk_project_activities_project 
        FOREIGN KEY (project_id, workspace_id) 
        REFERENCES public.projects(id, workspace_id) 
        ON DELETE CASCADE,
        
    CONSTRAINT fk_project_activities_activity_type 
        FOREIGN KEY (activity_type_id, workspace_id) 
        REFERENCES public.activity_types(id, workspace_id) 
        ON DELETE SET NULL
);

-- 5. Triggers for updated_at column
CREATE TRIGGER update_activity_types_updated_at
    BEFORE UPDATE ON public.activity_types
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_project_activities_updated_at
    BEFORE UPDATE ON public.project_activities
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_activity_types_workspace_id ON public.activity_types(workspace_id);
CREATE INDEX IF NOT EXISTS idx_project_activities_workspace_id ON public.project_activities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_project_activities_project_id ON public.project_activities(project_id);
CREATE INDEX IF NOT EXISTS idx_project_activities_assignee_id ON public.project_activities(assignee_id);
CREATE INDEX IF NOT EXISTS idx_project_activities_activity_type_id ON public.project_activities(activity_type_id);
CREATE INDEX IF NOT EXISTS idx_project_activities_status ON public.project_activities(status);

-- Composite Indexes
CREATE INDEX IF NOT EXISTS idx_project_activities_workspace_assignee ON public.project_activities(workspace_id, assignee_id);
CREATE INDEX IF NOT EXISTS idx_project_activities_workspace_project ON public.project_activities(workspace_id, project_id);

-- 7. Enable RLS
ALTER TABLE public.activity_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_activities ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies
CREATE POLICY "Workspaces can manage own activity_types" 
ON public.activity_types 
FOR ALL 
TO public 
USING (workspace_id = auth.uid()) 
WITH CHECK (workspace_id = auth.uid());

CREATE POLICY "Workspaces can manage own project_activities" 
ON public.project_activities 
FOR ALL 
TO public 
USING (workspace_id = auth.uid()) 
WITH CHECK (workspace_id = auth.uid());
