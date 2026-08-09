create index if not exists projects_family_workspace_idx
  on public.projects (family_id, workspace_id);

create index if not exists projects_workspace_idx
  on public.projects (workspace_id);
