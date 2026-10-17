import type { Project } from '../types';

export const isCurrentProjectRevision = (project: Project | undefined | null): boolean => (
  Boolean(project && project.isCurrentRevision !== false)
);

export const getProjectRevisionNumber = (project: Project | undefined | null): number => {
  if (!project) return 0;
  if (typeof project.revisionNumber === 'number' && Number.isFinite(project.revisionNumber)) {
    return project.revisionNumber;
  }
  if (typeof project.revision === 'string') {
    const parsed = Number(project.revision.match(/\d+$/)?.[0]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

export const getProjectFamilyId = (project: Project | undefined | null): string => {
  if (!project) return '';
  return project.familyId || project.id || '';
};
