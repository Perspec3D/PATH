-- Add estimated_current_hours to project_activities
ALTER TABLE project_activities ADD COLUMN estimated_current_hours numeric;

-- Initialize existing activities in current revisions to have estimated_current_hours equal to estimated_duration_hours
UPDATE project_activities pa 
SET estimated_current_hours = estimated_duration_hours 
FROM projects p 
WHERE pa.project_id = p.id AND p.is_current_revision = true;
