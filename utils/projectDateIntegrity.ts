import type { Project, ProjectActivity } from '../types';

export const isValidDateRange = (startDate?: string, deliveryDate?: string): boolean => (
  Boolean(startDate && deliveryDate && startDate <= deliveryDate)
);

export const isActivityWithinProjectPeriod = (
  activityStartDate: string | undefined,
  activityDeliveryDate: string | undefined,
  projectStartDate: string | undefined,
  projectDeliveryDate: string | undefined
): boolean => (
  isValidDateRange(projectStartDate, projectDeliveryDate)
  && isValidDateRange(activityStartDate, activityDeliveryDate)
  && activityStartDate! >= projectStartDate!
  && activityDeliveryDate! <= projectDeliveryDate!
);

export const findActivitiesOutsideProjectPeriod = (
  activities: ProjectActivity[],
  projectId: string,
  projectStartDate: string | undefined,
  projectDeliveryDate: string | undefined
): ProjectActivity[] => activities.filter(activity => (
  activity.projectId === projectId
  && !isActivityWithinProjectPeriod(
    activity.startDate,
    activity.deliveryDate,
    projectStartDate,
    projectDeliveryDate
  )
));

export const formatIntegrityDate = (date?: string): string => {
  if (!date) return 'sem data';
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
};

export const getProjectPeriodLabel = (project: Pick<Project, 'startDate' | 'deliveryDate'>): string => (
  `Prazo do projeto: ${formatIntegrityDate(project.startDate)} a ${formatIntegrityDate(project.deliveryDate)}.`
);

export const getAffectedActivitiesLabel = (activities: ProjectActivity[]): string => activities
  .map(activity => `- ${activity.name}: ${formatIntegrityDate(activity.startDate)} a ${formatIntegrityDate(activity.deliveryDate)}`)
  .join('\n');
