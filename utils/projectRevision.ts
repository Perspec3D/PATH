import type { Project } from '../types';

export const isCurrentProjectRevision = (project: Project | undefined): boolean => (
  project?.isCurrentRevision !== false
);

export const getProjectRevisionNumber = (project: Project): number => {
  if (project.revisionNumber !== undefined) return project.revisionNumber;
  const parsed = Number(project.revision.match(/\d+$/)?.[0]);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getProjectFamilyId = (project: Project): string => project.familyId || project.id;
