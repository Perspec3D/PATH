import type {
  ActivityExecution,
  ActivityOvertimeEntry,
  Company,
  InternalUser,
  Project,
  ProjectActivity,
  WorkSession
} from '../types';
import { ProjectStatus } from '../types';
import { buildActivityOperationalMetrics } from './operationalMetrics';
import { calculateNetWorkdayMs } from './operationalTime';
import { isProjectActivityClosed } from './projectActivityStatus';
import { isCurrentProjectRevision } from './projectRevision';

const HOUR_MS = 60 * 60 * 1000;
// Centralized management bands: up to 75% leaves a comfortable margin;
// 75-90% requires attention; 90-100% is at risk; above 100% is infeasible.
const ON_TRACK_MAX_UTILIZATION = 0.75;
const ATTENTION_MAX_UTILIZATION = 0.9;
const CAPACITY_EPSILON_MS = 1000;

export enum DeliveryForecastStatus {
  ON_TRACK = 'DENTRO DO PRAZO',
  ATTENTION = 'ATENÇÃO',
  AT_RISK = 'PRAZO EM RISCO',
  INFEASIBLE = 'PRAZO INVIÁVEL',
  OVERDUE = 'ATRASADO',
  INCOMPLETE = 'PREVISÃO INCOMPLETA'
}

export interface AssigneeDeliveryForecast {
  internalUserId: string;
  userName: string;
  remainingRequiredMs: number;
  regularCapacityMs: number;
  overtimeCapacityMs: number;
  availableCapacityMs: number;
  marginMs: number;
}

export interface ProjectDeliveryForecast {
  projectId: string;
  projectCode: string;
  projectName: string;
  deliveryDate?: string;
  status: DeliveryForecastStatus;
  remainingRequiredMs: number;
  regularCapacityMs: number;
  overtimeCapacityMs: number;
  availableCapacityMs: number;
  marginMs: number;
  unestimatedActivities: number;
  unassignedActivities: number;
  assignees: AssigneeDeliveryForecast[];
}

export interface DeliveryForecastInput {
  projects: Project[];
  users: InternalUser[];
  activities: ProjectActivity[];
  executions: ActivityExecution[];
  sessions: WorkSession[];
  overtimeEntries: ActivityOvertimeEntry[];
  company: Company | undefined;
  nowMs: number;
}

const parseDateOnly = (value?: string): Date | null => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(date.getTime()) ? date : null;
};

const dateKey = (date: Date): string => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

const startOfDay = (value: number): Date => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const listWorkdayKeys = (
  start: Date,
  end: Date,
  workDays: number[]
): string[] => {
  if (start > end) return [];
  const keys: string[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const lastDay = new Date(end);
  lastDay.setHours(0, 0, 0, 0);

  while (cursor <= lastDay) {
    if (workDays.includes(cursor.getDay())) keys.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
};

const classifyForecast = (
  requiredMs: number,
  availableMs: number,
  hasTemporalDeficit: boolean
): DeliveryForecastStatus => {
  if (hasTemporalDeficit || requiredMs > availableMs + CAPACITY_EPSILON_MS) {
    return DeliveryForecastStatus.INFEASIBLE;
  }
  if (requiredMs <= CAPACITY_EPSILON_MS) return DeliveryForecastStatus.ON_TRACK;

  const utilization = availableMs > 0 ? requiredMs / availableMs : Number.POSITIVE_INFINITY;
  if (utilization <= ON_TRACK_MAX_UTILIZATION) return DeliveryForecastStatus.ON_TRACK;
  if (utilization <= ATTENTION_MAX_UTILIZATION) return DeliveryForecastStatus.ATTENTION;
  return DeliveryForecastStatus.AT_RISK;
};

/**
 * Forecasts delivery capacity in the browser's local timezone.
 *
 * Regular capacity is calculated once per user/day from the Workspace journey.
 * Other projects consume that capacity by spreading their remaining estimate
 * evenly across their planned workdays, matching the active capacity model.
 * Activities in the forecast project then share the remaining daily buckets,
 * so overlapping activities never duplicate a professional's available hours.
 */
export const buildProjectDeliveryForecasts = ({
  projects,
  users,
  activities,
  executions,
  sessions,
  overtimeEntries,
  company,
  nowMs
}: DeliveryForecastInput): ProjectDeliveryForecast[] => {
  const today = startOfDay(nowMs);
  const workDays = company?.workDays || [1, 2, 3, 4, 5];
  const dailyCapacityMs = calculateNetWorkdayMs(company);
  const activeProjects = projects.filter(project => (
    isCurrentProjectRevision(project)
    && project.status !== ProjectStatus.DONE
    && project.status !== ProjectStatus.CANCELED
  ));
  const activeProjectIds = new Set(activeProjects.map(project => project.id));
  const projectById = new Map(projects.map(project => [project.id, project]));
  const userById = new Map(users.map(user => [user.id, user]));
  const metrics = buildActivityOperationalMetrics({
    activities,
    executions,
    sessions,
    overtimeEntries,
    company,
    nowMs
  });
  const metricByActivityId = new Map(metrics.map(metric => [metric.activityId, metric]));
  const openActivities = activities.filter(activity => (
    activeProjectIds.has(activity.projectId) && !isProjectActivityClosed(activity.status)
  ));

  const remainingByActivityId = new Map<string, number | null>();
  for (const activity of openActivities) {
    const metric = metricByActivityId.get(activity.id);
    remainingByActivityId.set(
      activity.id,
      metric?.estimatedMs === null || metric?.estimatedMs === undefined
        ? null
        : Math.max(0, metric.remainingEstimatedMs ?? metric.estimatedMs)
    );
  }

  return activeProjects.map(project => {
    const projectActivities = activities.filter(activity => activity.projectId === project.id);
    const remainingActivities = projectActivities.filter(activity => !isProjectActivityClosed(activity.status));
    const deadline = parseDateOnly(project.deliveryDate);
    const isOverdue = Boolean(deadline && deadline < today);
    const unestimatedActivities = remainingActivities.filter(activity => remainingByActivityId.get(activity.id) === null).length;
    const unassignedActivities = remainingActivities.filter(activity => (
      !activity.assigneeId || !userById.get(activity.assigneeId)?.isActive
    )).length;

    const emptyForecast: ProjectDeliveryForecast = {
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      deliveryDate: project.deliveryDate,
      status: DeliveryForecastStatus.INCOMPLETE,
      remainingRequiredMs: 0,
      regularCapacityMs: 0,
      overtimeCapacityMs: 0,
      availableCapacityMs: 0,
      marginMs: 0,
      unestimatedActivities,
      unassignedActivities,
      assignees: []
    };

    if (!deadline) return emptyForecast;
    if (projectActivities.length === 0) {
      return isOverdue ? { ...emptyForecast, status: DeliveryForecastStatus.OVERDUE } : emptyForecast;
    }

    const horizonWorkdays = listWorkdayKeys(today, deadline, workDays);
    const assigneeIds = Array.from(new Set(
      remainingActivities
        .map(activity => activity.assigneeId)
        .filter((id): id is string => Boolean(id && userById.get(id)?.isActive))
    ));

    const assignees = assigneeIds.map(internalUserId => {
      const currentActivities = remainingActivities.filter(activity => activity.assigneeId === internalUserId);
      const requiredMs = currentActivities.reduce((total, activity) => (
        total + (remainingByActivityId.get(activity.id) ?? 0)
      ), 0);
      const freeByDay = new Map(horizonWorkdays.map(key => [key, dailyCapacityMs]));

      const externalActivities = openActivities.filter(activity => (
        activity.assigneeId === internalUserId
        && activity.projectId !== project.id
        && remainingByActivityId.get(activity.id) !== null
      ));

      for (const activity of externalActivities) {
        const remainingMs = remainingByActivityId.get(activity.id) ?? 0;
        if (remainingMs <= 0) continue;

        const parentDeadline = parseDateOnly(projectById.get(activity.projectId)?.deliveryDate);
        const activityStart = parseDateOnly(activity.startDate) || today;
        const activityEnd = parseDateOnly(activity.deliveryDate) || parentDeadline || deadline;
        const plannedStart = activityStart > today ? activityStart : today;
        const plannedDays = listWorkdayKeys(plannedStart, activityEnd, workDays);
        if (plannedDays.length === 0) continue;

        const dailyLoadMs = remainingMs / plannedDays.length;
        for (const key of plannedDays) {
          if (!freeByDay.has(key)) continue;
          freeByDay.set(key, Math.max(0, (freeByDay.get(key) ?? 0) - dailyLoadMs));
        }
      }

      const usableDayKeys = new Set<string>();
      for (const activity of currentActivities) {
        const activityStart = parseDateOnly(activity.startDate) || today;
        const effectiveStart = activityStart > today ? activityStart : today;
        listWorkdayKeys(effectiveStart, deadline, workDays).forEach(key => usableDayKeys.add(key));
      }
      const regularCapacityMs = Array.from(usableDayKeys).reduce((total, key) => total + (freeByDay.get(key) ?? 0), 0);

      const currentActivityIds = new Set(currentActivities.map(activity => activity.id));
      const overtimeCapacityMs = overtimeEntries.reduce((total, entry) => {
        if (!currentActivityIds.has(entry.projectActivityId)) return total;
        const entryDate = parseDateOnly(entry.date);
        if (!entryDate || entryDate < today || entryDate > deadline) return total;
        return total + Math.max(0, entry.authorizedHours) * HOUR_MS;
      }, 0);
      const availableCapacityMs = regularCapacityMs + overtimeCapacityMs;

      return {
        internalUserId,
        userName: userById.get(internalUserId)?.username || 'Responsável indisponível',
        remainingRequiredMs: requiredMs,
        regularCapacityMs,
        overtimeCapacityMs,
        availableCapacityMs,
        marginMs: availableCapacityMs - requiredMs
      };
    });

    const remainingRequiredMs = remainingActivities.reduce((total, activity) => (
      total + (remainingByActivityId.get(activity.id) ?? 0)
    ), 0);
    const regularCapacityMs = assignees.reduce((total, assignee) => total + assignee.regularCapacityMs, 0);
    const overtimeCapacityMs = assignees.reduce((total, assignee) => total + assignee.overtimeCapacityMs, 0);
    const availableCapacityMs = regularCapacityMs + overtimeCapacityMs;
    const marginMs = availableCapacityMs - remainingRequiredMs;
    const hasTemporalDeficit = assignees.some(assignee => assignee.marginMs < -CAPACITY_EPSILON_MS);
    const isIncomplete = unestimatedActivities > 0 || unassignedActivities > 0;

    return {
      ...emptyForecast,
      status: isOverdue
        ? DeliveryForecastStatus.OVERDUE
        : isIncomplete
          ? DeliveryForecastStatus.INCOMPLETE
          : classifyForecast(remainingRequiredMs, availableCapacityMs, hasTemporalDeficit),
      remainingRequiredMs,
      regularCapacityMs,
      overtimeCapacityMs,
      availableCapacityMs,
      marginMs,
      assignees
    };
  });
};
