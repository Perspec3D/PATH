import { ProjectStatus, ActivityCanonicalStatus } from '../types';
import { normalizeActivityStatus, isActivityCompleted as isCanonicalCompleted } from './activityOperationalModel';

export const isProjectActivityCompleted = (status: ProjectStatus | ActivityCanonicalStatus | string | undefined): boolean => (
  isCanonicalCompleted(status)
);

export const isProjectActivityCanceled = (status: ProjectStatus | ActivityCanonicalStatus | string | undefined): boolean => {
  if (!status) return false;
  const upper = String(status).trim().toUpperCase();
  return upper === 'CANCELADO' || upper === 'CANCELED';
};

export const isProjectActivityClosed = (status: ProjectStatus | ActivityCanonicalStatus | string | undefined): boolean => (
  isProjectActivityCompleted(status) || isProjectActivityCanceled(status)
);
