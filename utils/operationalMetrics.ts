import type {
  ActivityExecution,
  ActivityOvertimeEntry,
  Company,
  InternalUser,
  ProjectActivity,
  WorkSession
} from '../types';
import { ProjectStatus } from '../types';
import { calculateOvertimeMs, calculateRegularOperationalMs } from './operationalTime';
import { isProjectActivityCompleted } from './projectActivityStatus';

const HOUR_MS = 60 * 60 * 1000;

export interface OperationalMetricsPeriod {
  startMs?: number;
  endMs?: number;
  internalUserId?: string;
}

export interface ActivityOperationalMetric {
  activityId: string;
  activityName: string;
  projectId: string;
  internalUserId?: string;
  status: ProjectStatus;
  isCompleted: boolean;
  estimatedMs: number | null;
  regularMs: number | null;
  overtimeMs: number | null;
  totalAccountedMs: number | null;
  deviationMs: number | null;
  deviationPercent: number | null;
  remainingEstimatedMs: number | null;
  plannedStartDate?: string;
  plannedDeadline?: string;
  actualStartDate?: string;
  actualEndDate?: string;
}

export interface ProfessionalOperationalMetrics {
  internalUserId: string;
  completedActivities: number;
  inProgressActivities: number;
  completedEstimatedMs: number;
  completedRegularMs: number;
  completedOvertimeMs: number;
  completedAccountedMs: number;
  comparableEstimatedMs: number;
  comparableAccountedMs: number;
  aggregateDeviationMs: number | null;
  aggregateDeviationPercent: number | null;
  completedWithEstimate: number;
  completedWithinEstimate: number;
  completedWithinEstimatePercent: number | null;
}

export interface OperationalMetricsInput {
  activities: ProjectActivity[];
  executions: ActivityExecution[];
  sessions: WorkSession[];
  overtimeEntries: ActivityOvertimeEntry[];
  company: Company | undefined;
  nowMs: number;
  period?: OperationalMetricsPeriod;
}

const validDateMs = (value?: string): number | null => {
  if (!value) return null;
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3])).getTime()
    : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const isActivityInPeriod = (
  activity: ProjectActivity,
  completedAtMs: number | null,
  period?: OperationalMetricsPeriod
): boolean => {
  if (period?.startMs === undefined && period?.endMs === undefined) return true;

  const startMs = period.startMs ?? Number.NEGATIVE_INFINITY;
  const endMs = period.endMs ?? Number.POSITIVE_INFINITY;

  if (isProjectActivityCompleted(activity.status)) {
    return completedAtMs !== null && completedAtMs >= startMs && completedAtMs <= endMs;
  }

  const activityStart = validDateMs(activity.actualStartDate) ?? validDateMs(activity.startDate) ?? activity.createdAt;
  const activityEnd = validDateMs(activity.actualEndDate);
  return activityStart <= endMs && (activityEnd === null || activityEnd >= startMs);
};

/**
 * Builds auditable activity metrics from the execution architecture. Completed
 * activities are attributed to a historical period exclusively by actualEndDate.
 * Durations are never derived from project lead time or planned dates.
 */
export const buildActivityOperationalMetrics = ({
  activities,
  executions,
  sessions,
  overtimeEntries,
  company,
  nowMs,
  period
}: OperationalMetricsInput): ActivityOperationalMetric[] => {
  const executionIdsByActivity = new Map<string, Set<string>>();
  const completedAtByActivity = new Map<string, number>();
  for (const execution of executions) {
    const executionIds = executionIdsByActivity.get(execution.projectActivityId) ?? new Set<string>();
    executionIds.add(execution.id);
    executionIdsByActivity.set(execution.projectActivityId, executionIds);

    if (execution.completedAt !== undefined && Number.isFinite(execution.completedAt)) {
      const currentCompletedAt = completedAtByActivity.get(execution.projectActivityId) ?? 0;
      completedAtByActivity.set(execution.projectActivityId, Math.max(currentCompletedAt, execution.completedAt));
    }
  }

  const sessionsByExecution = new Map<string, WorkSession[]>();
  for (const session of sessions) {
    const executionSessions = sessionsByExecution.get(session.activityExecutionId) ?? [];
    executionSessions.push(session);
    sessionsByExecution.set(session.activityExecutionId, executionSessions);
  }

  const overtimeByActivity = new Map<string, ActivityOvertimeEntry[]>();
  for (const entry of overtimeEntries) {
    const activityEntries = overtimeByActivity.get(entry.projectActivityId) ?? [];
    activityEntries.push(entry);
    overtimeByActivity.set(entry.projectActivityId, activityEntries);
  }

  return activities
    .map(activity => ({
      activity,
      completedAtMs: validDateMs(activity.actualEndDate) ?? completedAtByActivity.get(activity.id) ?? null
    }))
    .filter(({ activity, completedAtMs }) => (
      (!period?.internalUserId || activity.assigneeId === period.internalUserId)
      && isActivityInPeriod(activity, completedAtMs, period)
    ))
    .map(({ activity, completedAtMs }) => {
      const executionIds = executionIdsByActivity.get(activity.id) ?? new Set<string>();
      const activitySessions = Array.from(executionIds).flatMap(executionId => sessionsByExecution.get(executionId) ?? []);
      const activityOvertime = overtimeByActivity.get(activity.id) ?? [];
      const regularMs = calculateRegularOperationalMs(activitySessions, company, nowMs);
      const overtimeMs = calculateOvertimeMs(activityOvertime.map(entry => entry.authorizedHours));
      const totalAccountedMs = regularMs === null || overtimeMs === null ? null : regularMs + overtimeMs;
      const estimatedHours = activity.estimatedDurationHours;
      const estimatedMs = estimatedHours !== undefined && Number.isFinite(estimatedHours) && estimatedHours > 0
        ? Math.round(estimatedHours * HOUR_MS)
        : null;
      const deviationMs = estimatedMs !== null && totalAccountedMs !== null ? totalAccountedMs - estimatedMs : null;

      return {
        activityId: activity.id,
        activityName: activity.name,
        projectId: activity.projectId,
        internalUserId: activity.assigneeId,
        status: activity.status,
        isCompleted: isProjectActivityCompleted(activity.status),
        estimatedMs,
        regularMs,
        overtimeMs,
        totalAccountedMs,
        deviationMs,
        deviationPercent: deviationMs !== null && estimatedMs !== null ? (deviationMs / estimatedMs) * 100 : null,
        remainingEstimatedMs: estimatedMs !== null && totalAccountedMs !== null ? estimatedMs - totalAccountedMs : null,
        plannedStartDate: activity.startDate,
        plannedDeadline: activity.deliveryDate,
        actualStartDate: activity.actualStartDate,
        actualEndDate: activity.actualEndDate ?? (completedAtMs !== null ? new Date(completedAtMs).toISOString() : undefined)
      };
    });
};

export const aggregateOperationalMetricsByProfessional = (
  activityMetrics: ActivityOperationalMetric[],
  users: InternalUser[]
): ProfessionalOperationalMetrics[] => users.map(user => {
  const userActivities = activityMetrics.filter(metric => metric.internalUserId === user.id);
  const completed = userActivities.filter(metric => metric.isCompleted);
  const comparable = completed.filter(metric => metric.estimatedMs !== null && metric.totalAccountedMs !== null);
  const comparableEstimatedMs = comparable.reduce((total, metric) => total + (metric.estimatedMs ?? 0), 0);
  const comparableAccountedMs = comparable.reduce((total, metric) => total + (metric.totalAccountedMs ?? 0), 0);
  const aggregateDeviationMs = comparableEstimatedMs > 0 ? comparableAccountedMs - comparableEstimatedMs : null;
  const completedWithinEstimate = comparable.filter(metric => (metric.totalAccountedMs ?? 0) <= (metric.estimatedMs ?? 0)).length;

  return {
    internalUserId: user.id,
    completedActivities: completed.length,
    inProgressActivities: userActivities.filter(metric => metric.status === ProjectStatus.IN_PROGRESS).length,
    completedEstimatedMs: completed.reduce((total, metric) => total + (metric.estimatedMs ?? 0), 0),
    completedRegularMs: completed.reduce((total, metric) => total + (metric.regularMs ?? 0), 0),
    completedOvertimeMs: completed.reduce((total, metric) => total + (metric.overtimeMs ?? 0), 0),
    completedAccountedMs: completed.reduce((total, metric) => total + (metric.totalAccountedMs ?? 0), 0),
    comparableEstimatedMs,
    comparableAccountedMs,
    aggregateDeviationMs,
    aggregateDeviationPercent: aggregateDeviationMs !== null
      ? (aggregateDeviationMs / comparableEstimatedMs) * 100
      : null,
    completedWithEstimate: comparable.length,
    completedWithinEstimate,
    completedWithinEstimatePercent: comparable.length > 0
      ? (completedWithinEstimate / comparable.length) * 100
      : null
  };
});
