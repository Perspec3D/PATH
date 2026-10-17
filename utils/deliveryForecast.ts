import type { Project, ProjectActivity } from '../types';
import { ProjectStatus } from '../types';
import {
  ActivityCanonicalStatus,
  ActivityDeadlineStatus,
  calculateDaysDifference,
  evaluateDeadlineStatus,
  formatDisplayDate,
  getTodayDateString,
  isActivityBlocked,
  isActivityClosed,
  isActivityInProgress,
  normalizeActivityStatus
} from './activityOperationalModel';
import { getProjectFamilyId, getProjectRevisionNumber, isCurrentProjectRevision } from './projectRevision';

export enum ProjectDeliveryPredictabilityStatus {
  ON_TRACK = 'NO PRAZO',
  ATTENTION = 'ATENÇÃO',
  OVERDUE = 'ATRASADO',
  INSUFFICIENT_DATA = 'SEM DADOS SUFICIENTES'
}

/**
 * Backward compatibility alias mapping previous forecast status to canonical predictability.
 */
export const DeliveryForecastStatus = {
  ON_TRACK: ProjectDeliveryPredictabilityStatus.ON_TRACK,
  ATTENTION: ProjectDeliveryPredictabilityStatus.ATTENTION,
  AT_RISK: ProjectDeliveryPredictabilityStatus.ATTENTION,
  INFEASIBLE: ProjectDeliveryPredictabilityStatus.OVERDUE,
  OVERDUE: ProjectDeliveryPredictabilityStatus.OVERDUE,
  INCOMPLETE: ProjectDeliveryPredictabilityStatus.INSUFFICIENT_DATA
} as const;

export type DeliveryForecastStatus = ProjectDeliveryPredictabilityStatus;

export interface ProjectDeliveryPredictability {
  projectId: string;
  projectCode: string;
  projectName: string;
  clientId?: string;
  assigneeId?: string;
  status: ProjectDeliveryPredictabilityStatus;
  deliveryDate?: string;
  originalDeliveryDate?: string;
  formattedDeliveryDate: string;
  formattedOriginalDeliveryDate?: string;
  daysRemaining: number | null;
  isOverdue: boolean;
  isNearDeadline: boolean;
  totalActivitiesCount: number;
  openActivitiesCount: number;
  inProgressActivitiesCount: number;
  blockedActivitiesCount: number;
  overdueActivitiesCount: number;
  completedActivitiesCount: number;
  reprogrammingCount: number;
  attentionReasons: string[];
  assigneeIds: string[];
}

export interface ProjectDeliveryPredictabilityInput {
  projects: Project[];
  activities: ProjectActivity[];
  todayStr?: string;
  nearDeadlineDaysThreshold?: number; // default 5 days
}

/**
 * Evaluates active projects and produces reliable, objective delivery predictability metrics
 * based on deadlines, remaining days, blockers, overdue activities, and reprogrammings.
 *
 * Absolutely NO hours, fake percentages, or unvalidated probability models.
 */
export const calculateProjectDeliveryPredictability = ({
  projects,
  activities,
  todayStr = getTodayDateString(),
  nearDeadlineDaysThreshold = 5
}: ProjectDeliveryPredictabilityInput): ProjectDeliveryPredictability[] => {
  // Only evaluate active revisions (QUEUE, IN_PROGRESS, PAUSED)
  const activeProjects = projects.filter(project => (
    isCurrentProjectRevision(project)
    && [ProjectStatus.QUEUE, ProjectStatus.IN_PROGRESS, ProjectStatus.PAUSED].includes(project.status)
  ));

  // Pre-index activities by projectId (O(A) one-pass) to avoid repeated O(P*A) scans
  const activitiesByProjectId = new Map<string, ProjectActivity[]>();
  for (const act of activities) {
    let list = activitiesByProjectId.get(act.projectId);
    if (!list) {
      list = [];
      activitiesByProjectId.set(act.projectId, list);
    }
    list.push(act);
  }

  // Pre-index family revisions (O(P) one-pass)
  const familyRevisionsMap = new Map<string, Project[]>();
  for (const p of projects) {
    const famId = getProjectFamilyId(p);
    const key = famId || p.code;
    let list = familyRevisionsMap.get(key);
    if (!list) {
      list = [];
      familyRevisionsMap.set(key, list);
    }
    list.push(p);
  }

  return activeProjects.map(project => {
    // Locate family revisions to track reprogrammings and original delivery date
    const familyId = getProjectFamilyId(project);
    const familyRevisions = familyRevisionsMap.get(familyId || project.code) || [project];
    const sortedRevisions = [...familyRevisions].sort((a, b) => (
      getProjectRevisionNumber(a) - getProjectRevisionNumber(b)
    ));
    const originalRevision = sortedRevisions[0] || project;
    const originalDeliveryDate = originalRevision.deliveryDate || project.deliveryDate;
    const reprogrammingCount = Math.max(0, sortedRevisions.length - 1);

    // Get activities belonging to this project in O(1)
    const projectActivities = activitiesByProjectId.get(project.id) || [];
    const openActivities = projectActivities.filter(activity => !isActivityClosed(activity.status));
    const inProgressActivities = openActivities.filter(activity => isActivityInProgress(activity.status));
    const blockedActivities = openActivities.filter(activity => isActivityBlocked(activity.status));
    const completedActivities = projectActivities.filter(activity => isActivityClosed(activity.status));

    // Overdue activities: open activities whose planned delivery date has already passed
    const overdueActivities = openActivities.filter(activity => {
      const deadlineEval = evaluateDeadlineStatus(activity, todayStr);
      return deadlineEval.status === ActivityDeadlineStatus.OVERDUE;
    });

    const assigneeIds = Array.from(new Set(
      projectActivities
        .map(activity => activity.assigneeId)
        .filter((id): id is string => Boolean(id))
    ));

    // Deadline difference in calendar days
    const daysRemaining = project.deliveryDate
      ? calculateDaysDifference(project.deliveryDate, todayStr)
      : null;

    const isOverdue = daysRemaining !== null && daysRemaining < 0;
    const isNearDeadline = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= nearDeadlineDaysThreshold;

    let status: ProjectDeliveryPredictabilityStatus;
    const attentionReasons: string[] = [];

    // Rule 1: Insufficient data when no delivery date or no activities configured
    if (!project.deliveryDate || projectActivities.length === 0) {
      status = ProjectDeliveryPredictabilityStatus.INSUFFICIENT_DATA;
      if (!project.deliveryDate) {
        attentionReasons.push('Sem prazo de entrega definido');
      }
      if (projectActivities.length === 0) {
        attentionReasons.push('Sem atividades cadastradas');
      }
    }
    // Rule 2: Overdue project (project's global delivery date has passed today)
    else if (isOverdue) {
      status = ProjectDeliveryPredictabilityStatus.OVERDUE;
      const daysOverdue = Math.abs(daysRemaining!);
      attentionReasons.push(`Prazo ultrapassado há ${daysOverdue} dia${daysOverdue > 1 ? 's' : ''}`);

      if (blockedActivities.length > 0) {
        attentionReasons.push(`${blockedActivities.length} atividade(s) bloqueada(s)`);
      }
      if (overdueActivities.length > 0) {
        attentionReasons.push(`${overdueActivities.length} atividade(s) com prazo vencido`);
      }
      if (reprogrammingCount > 0 && originalDeliveryDate && project.deliveryDate && originalDeliveryDate !== project.deliveryDate) {
        attentionReasons.push(`Reprogramado (${reprogrammingCount}ª revisão)`);
      }
    }
    // Rule 3: On-track or Attention based on blockers, overdue tasks, near deadline, or reprogrammings
    else {
      const reasons: string[] = [];

      if (blockedActivities.length > 0) {
        reasons.push(`${blockedActivities.length} atividade(s) bloqueada(s)`);
      }
      if (overdueActivities.length > 0) {
        reasons.push(`${overdueActivities.length} atividade(s) com prazo vencido`);
      }
      if (isNearDeadline) {
        const deadlineLabel = daysRemaining === 0
          ? 'Prazo vence hoje'
          : daysRemaining === 1
            ? 'Prazo vence amanhã'
            : `Prazo vence em ${daysRemaining} dias`;
        reasons.push(deadlineLabel);
      }
      if (reprogrammingCount > 0 && originalDeliveryDate && project.deliveryDate && originalDeliveryDate !== project.deliveryDate) {
        reasons.push(`Reprogramado (${reprogrammingCount}ª revisão)`);
      }

      if (reasons.length > 0) {
        status = ProjectDeliveryPredictabilityStatus.ATTENTION;
        attentionReasons.push(...reasons);
      } else {
        status = ProjectDeliveryPredictabilityStatus.ON_TRACK;
      }
    }

    return {
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      clientId: project.clientId,
      assigneeId: project.assigneeId,
      status,
      deliveryDate: project.deliveryDate,
      originalDeliveryDate,
      formattedDeliveryDate: formatDisplayDate(project.deliveryDate),
      formattedOriginalDeliveryDate: formatDisplayDate(originalDeliveryDate),
      daysRemaining,
      isOverdue,
      isNearDeadline,
      totalActivitiesCount: projectActivities.length,
      openActivitiesCount: openActivities.length,
      inProgressActivitiesCount: inProgressActivities.length,
      blockedActivitiesCount: blockedActivities.length,
      overdueActivitiesCount: overdueActivities.length,
      completedActivitiesCount: completedActivities.length,
      reprogrammingCount,
      attentionReasons,
      assigneeIds
    };
  });
};

/**
 * Returns color tokens and styling classes for delivery predictability badges.
 */
export const getDeliveryPredictabilityBadge = (
  status: ProjectDeliveryPredictabilityStatus
): {
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotColor: string;
} => {
  switch (status) {
    case ProjectDeliveryPredictabilityStatus.ON_TRACK:
      return {
        label: 'NO PRAZO',
        badgeBg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
        badgeText: 'text-emerald-700 dark:text-emerald-300',
        badgeBorder: 'border-emerald-500/25',
        dotColor: 'bg-emerald-500'
      };
    case ProjectDeliveryPredictabilityStatus.ATTENTION:
      return {
        label: 'ATENÇÃO',
        badgeBg: 'bg-amber-500/10 dark:bg-amber-500/15',
        badgeText: 'text-amber-700 dark:text-amber-300',
        badgeBorder: 'border-amber-500/25',
        dotColor: 'bg-amber-500'
      };
    case ProjectDeliveryPredictabilityStatus.OVERDUE:
      return {
        label: 'ATRASADO',
        badgeBg: 'bg-rose-500/10 dark:bg-rose-500/15',
        badgeText: 'text-rose-700 dark:text-rose-300',
        badgeBorder: 'border-rose-500/25',
        dotColor: 'bg-rose-500'
      };
    case ProjectDeliveryPredictabilityStatus.INSUFFICIENT_DATA:
    default:
      return {
        label: 'SEM DADOS',
        badgeBg: 'bg-slate-500/10 dark:bg-slate-500/15',
        badgeText: 'text-slate-600 dark:text-slate-400',
        badgeBorder: 'border-slate-500/20',
        dotColor: 'bg-slate-400'
      };
  }
};
