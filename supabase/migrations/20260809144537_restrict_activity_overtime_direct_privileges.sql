-- The Data API may grant more than DML privileges by default. Keep the table
-- strictly read-only for authenticated clients; all writes go through the
-- ADMIN-validating RPCs created in the previous migration.
REVOKE ALL ON TABLE public.activity_overtime_entries FROM authenticated;
GRANT SELECT ON TABLE public.activity_overtime_entries TO authenticated;
