import { ProjectStatus } from '../types';

export const isProjectActivityCompleted = (status: ProjectStatus | string | undefined): boolean => (
  status === ProjectStatus.DONE
);

export const isProjectActivityCanceled = (status: ProjectStatus | string | undefined): boolean => (
  status === ProjectStatus.CANCELED
);

export const isProjectActivityClosed = (status: ProjectStatus | string | undefined): boolean => (
  isProjectActivityCompleted(status) || isProjectActivityCanceled(status)
);
