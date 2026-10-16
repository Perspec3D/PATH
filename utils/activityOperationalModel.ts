import type React from 'react';
import {
  ActivityCanonicalStatus,
  ActivityDeadlineStatus,
  ActivityEventType,
  ActivityManagerialMetrics,
  ProjectActivity,
  ProjectActivityEvent,
  ProjectStatus
} from '../types';

/**
 * Normalizes any activity status (canonical or legacy) into one of the four canonical states:
 * - A FAZER
 * - EM ANDAMENTO
 * - BLOQUEADA
 * - CONCLUÍDA
 */
export const normalizeActivityStatus = (status: string | undefined): ActivityCanonicalStatus => {
  if (!status) return ActivityCanonicalStatus.TO_DO;
  const upper = status.trim().toUpperCase();

  // A FAZER
  if (
    upper === 'A FAZER' ||
    upper === 'FILA DE ESPERA' ||
    upper === 'QUEUE' ||
    upper === 'TODO' ||
    upper === 'TO_DO'
  ) {
    return ActivityCanonicalStatus.TO_DO;
  }

  // EM ANDAMENTO
  if (
    upper === 'EM ANDAMENTO' ||
    upper === 'IN_PROGRESS' ||
    upper === 'PROGRESS'
  ) {
    return ActivityCanonicalStatus.IN_PROGRESS;
  }

  // BLOQUEADA
  if (
    upper === 'BLOQUEADA' ||
    upper === 'BLOQUEADO' ||
    upper === 'PAUSADO' ||
    upper === 'PAUSED' ||
    upper === 'BLOCKED'
  ) {
    return ActivityCanonicalStatus.BLOCKED;
  }

  // CONCLUÍDA
  if (
    upper === 'CONCLUÍDA' ||
    upper === 'CONCLUIDA' ||
    upper === 'CONCLUÍDO' ||
    upper === 'CONCLUIDO' ||
    upper === 'DONE' ||
    upper === 'COMPLETED' ||
    upper === 'CANCELADO' ||
    upper === 'CANCELED'
  ) {
    return ActivityCanonicalStatus.COMPLETED;
  }

  return ActivityCanonicalStatus.TO_DO;
};

export const isActivityCompleted = (status: string | undefined): boolean => (
  normalizeActivityStatus(status) === ActivityCanonicalStatus.COMPLETED
);

export const isActivityInProgress = (status: string | undefined): boolean => (
  normalizeActivityStatus(status) === ActivityCanonicalStatus.IN_PROGRESS
);

export const isActivityBlocked = (status: string | undefined): boolean => (
  normalizeActivityStatus(status) === ActivityCanonicalStatus.BLOCKED
);

export const isActivityToDo = (status: string | undefined): boolean => (
  normalizeActivityStatus(status) === ActivityCanonicalStatus.TO_DO
);

export const isActivityClosed = (status: string | undefined): boolean => (
  isActivityCompleted(status)
);

export interface ActivityStatusTheme {
  canonical: ActivityCanonicalStatus;
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotBg: string;
  barBgClass: string;
  barBorderClass: string;
  barTextClass: string;
  barStyle?: React.CSSProperties;
  badgeStyle?: React.CSSProperties;
  accentColor: string;
  highlightColor: string;
}

/**
 * Returns complete visual styles (badge, Gantt bar, and tokens) for an activity status.
 * Standardizes:
 * - A FAZER: cinza / azul neutro (Slate)
 * - EM ANDAMENTO: azul / ciano (Sky)
 * - BLOQUEADA: âmbar / laranja queimado (Fundo: #78350F, Borda: #FBBF24, Texto: #FFFFFF, Destaque: #FDE68A)
 * - CONCLUÍDA: verde (Emerald)
 */
export const getActivityStatusTheme = (status: string | undefined): ActivityStatusTheme => {
  const canonical = normalizeActivityStatus(status);
  switch (canonical) {
    case ActivityCanonicalStatus.TO_DO:
      return {
        canonical,
        label: 'A FAZER',
        badgeBg: 'bg-slate-500/15 dark:bg-slate-400/15',
        badgeText: 'text-slate-700 dark:text-slate-300',
        badgeBorder: 'border-slate-400/40 dark:border-slate-500/40',
        dotBg: 'bg-slate-400 dark:bg-slate-400',
        barBgClass: 'bg-slate-600 dark:bg-slate-700',
        barBorderClass: 'border border-slate-400/50 dark:border-slate-500/50',
        barTextClass: 'text-slate-100',
        accentColor: '#94A3B8',
        highlightColor: '#CBD5E1'
      };
    case ActivityCanonicalStatus.IN_PROGRESS:
      return {
        canonical,
        label: 'EM ANDAMENTO',
        badgeBg: 'bg-sky-500/15 dark:bg-sky-400/15',
        badgeText: 'text-sky-700 dark:text-sky-300',
        badgeBorder: 'border-sky-500/35 dark:border-sky-400/35',
        dotBg: 'bg-sky-500 animate-pulse',
        barBgClass: 'bg-sky-600 dark:bg-sky-600',
        barBorderClass: 'border-2 border-sky-300 dark:border-sky-400',
        barTextClass: 'text-white',
        accentColor: '#0284C7',
        highlightColor: '#BAE6FD'
      };
    case ActivityCanonicalStatus.BLOCKED:
      return {
        canonical,
        label: 'BLOQUEADA',
        badgeBg: 'bg-amber-950/20 dark:bg-[#78350F]/45',
        badgeText: 'text-amber-800 dark:text-[#FDE68A]',
        badgeBorder: 'border-[#FBBF24] dark:border-[#FBBF24]',
        dotBg: 'bg-[#FBBF24]',
        badgeStyle: {
          backgroundColor: 'rgba(120, 53, 15, 0.18)',
          borderColor: '#FBBF24',
          borderWidth: '1px',
          borderStyle: 'solid'
        },
        barBgClass: 'bg-[#78350F]',
        barBorderClass: 'border-2 border-[#FBBF24]',
        barTextClass: 'text-white',
        barStyle: {
          backgroundColor: '#78350F',
          borderColor: '#FBBF24',
          borderWidth: '2px',
          borderStyle: 'solid',
          color: '#FFFFFF',
          backgroundImage: 'repeating-linear-gradient(45deg, rgba(251, 191, 36, 0.08), rgba(251, 191, 36, 0.08) 6px, transparent 6px, transparent 12px)',
          boxShadow: '0 2px 8px rgba(120, 53, 15, 0.4)'
        },
        accentColor: '#FBBF24',
        highlightColor: '#FDE68A'
      };
    case ActivityCanonicalStatus.COMPLETED:
      return {
        canonical,
        label: 'CONCLUÍDA',
        badgeBg: 'bg-emerald-500/15 dark:bg-emerald-400/15',
        badgeText: 'text-emerald-700 dark:text-emerald-300',
        badgeBorder: 'border-emerald-500/35 dark:border-emerald-400/35',
        dotBg: 'bg-emerald-500',
        barBgClass: 'bg-emerald-600 dark:bg-emerald-600',
        barBorderClass: 'border border-emerald-300/60 dark:border-emerald-400/60',
        barTextClass: 'text-white',
        accentColor: '#10B981',
        highlightColor: '#A7F3D0'
      };
  }
};

/**
 * Returns visual styles (badge colors) for a status.
 */
export const getActivityStatusBadge = (status: string | undefined): {
  canonical: ActivityCanonicalStatus;
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotBg: string;
  badgeStyle?: React.CSSProperties;
} => {
  const theme = getActivityStatusTheme(status);
  return {
    canonical: theme.canonical,
    label: theme.label,
    badgeBg: theme.badgeBg,
    badgeText: theme.badgeText,
    badgeBorder: theme.badgeBorder,
    dotBg: theme.dotBg,
    badgeStyle: theme.badgeStyle
  };
};

/**
 * Returns the Gantt timeline bar style for an activity.
 * When isOverdue is true, adds visual distinction for deadline delay.
 */
export const getActivityGanttBarStyle = (
  status: string | undefined,
  isOverdue = false
): {
  className: string;
  style: React.CSSProperties;
  theme: ActivityStatusTheme;
  isBlocked: boolean;
  isOverdue: boolean;
} => {
  const theme = getActivityStatusTheme(status);
  const isBlocked = theme.canonical === ActivityCanonicalStatus.BLOCKED;

  const baseClasses = 'shadow-md transition-all duration-300 hover:brightness-110 flex items-center overflow-hidden';
  let className = `${baseClasses} ${theme.barBgClass} ${theme.barBorderClass} ${theme.barTextClass}`;
  let style: React.CSSProperties = { ...(theme.barStyle || {}) };

  if (isBlocked && isOverdue) {
    // Both Blocked and Overdue: keep burnt amber and border-amber-400, add outer red outline ring
    style = {
      ...style,
      boxShadow: '0 0 0 1.5px #F43F5E, 0 3px 10px rgba(120, 53, 15, 0.5)'
    };
  } else if (!isBlocked && isOverdue) {
    // Non-blocked but overdue: add red highlight border
    style = {
      ...style,
      boxShadow: '0 0 0 1.5px #F43F5E, 0 2px 6px rgba(244, 63, 94, 0.3)'
    };
  }

  return {
    className,
    style,
    theme,
    isBlocked,
    isOverdue
  };
};

/**
 * Parses YYYY-MM-DD date-only string at local midday to prevent any timezone shifts.
 */
export const parseLocalDate = (dateStr?: string | null): Date | null => {
  if (!dateStr) return null;
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const d = new Date(year, month, day, 12, 0, 0, 0);
  return Number.isFinite(d.getTime()) ? d : null;
};

/**
 * Formats a Date object to YYYY-MM-DD in local time.
 */
export const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Returns today's date formatted as YYYY-MM-DD in local time.
 */
export const getTodayDateString = (): string => formatLocalDate(new Date());

/**
 * Returns user-facing format DD/MM/YYYY.
 */
export const formatDisplayDate = (dateStr?: string | null): string => {
  if (!dateStr) return '---';
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr;
  return `${match[3]}/${match[2]}/${match[1]}`;
};

/**
 * Calculates calendar days between two dates, inclusive (start to end = duration).
 * If start and end are the same day, duration is 1 day.
 */
export const calculateCalendarDurationDays = (startStr?: string | null, endStr?: string | null): number | null => {
  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);
  if (!start || !end) return null;
  if (start > end) return 0;
  const msDiff = end.getTime() - start.getTime();
  const days = Math.round(msDiff / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(0, days);
};

/**
 * Calculates business days between two dates, inclusive.
 */
export const calculateBusinessDurationDays = (
  startStr?: string | null,
  endStr?: string | null,
  workDays: number[] = [1, 2, 3, 4, 5]
): number | null => {
  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);
  if (!start || !end) return null;
  if (start > end) return 0;

  let businessDays = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (workDays.includes(cursor.getDay())) {
      businessDays++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return businessDays;
};

/**
 * Calculates signed difference in days between two dates (end - ref).
 * Positive = after reference (delay / after).
 * Negative = before reference (anticipation / early).
 * Zero = on reference day.
 */
export const calculateDaysDifference = (targetStr?: string | null, referenceStr?: string | null): number | null => {
  const target = parseLocalDate(targetStr);
  const ref = parseLocalDate(referenceStr);
  if (!target || !ref) return null;
  const msDiff = target.getTime() - ref.getTime();
  return Math.round(msDiff / (1000 * 60 * 60 * 24));
};

export interface ActivityDeadlineEvaluation {
  status: ActivityDeadlineStatus;
  label: string;
  badgeStyle: string;
  isOverdue: boolean;
  isUpcoming: boolean;
  isOnTime: boolean;
}

/**
 * Evaluates the deadline status of an activity based on verifiable dates.
 */
export const evaluateDeadlineStatus = (
  activity: ProjectActivity,
  todayStr: string = getTodayDateString()
): ActivityDeadlineEvaluation => {
  const isDone = isActivityCompleted(activity.status);
  const currentDeadline = activity.deliveryDate;

  if (!currentDeadline) {
    return {
      status: ActivityDeadlineStatus.NOT_APPLICABLE,
      label: 'Sem Prazo',
      badgeStyle: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
      isOverdue: false,
      isUpcoming: false,
      isOnTime: false
    };
  }

  // Activity is completed: evaluate against actual completion date
  if (isDone) {
    const actualEnd = activity.actualEndDate;
    if (!actualEnd) {
      return {
        status: ActivityDeadlineStatus.COMPLETED_ON_TIME,
        label: 'Concluída',
        badgeStyle: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        isOverdue: false,
        isUpcoming: false,
        isOnTime: true
      };
    }

    const diff = calculateDaysDifference(actualEnd, currentDeadline);
    if (diff === null) {
      return {
        status: ActivityDeadlineStatus.COMPLETED_ON_TIME,
        label: 'Concluída',
        badgeStyle: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        isOverdue: false,
        isUpcoming: false,
        isOnTime: true
      };
    }

    if (diff < 0) {
      const days = Math.abs(diff);
      return {
        status: ActivityDeadlineStatus.COMPLETED_EARLY,
        label: `Concluída ${days}d antes`,
        badgeStyle: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
        isOverdue: false,
        isUpcoming: false,
        isOnTime: true
      };
    }

    if (diff === 0) {
      return {
        status: ActivityDeadlineStatus.COMPLETED_ON_TIME,
        label: 'Concluída no prazo',
        badgeStyle: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        isOverdue: false,
        isUpcoming: false,
        isOnTime: true
      };
    }

    return {
      status: ActivityDeadlineStatus.COMPLETED_LATE,
      label: `Concluída com ${diff}d de atraso`,
      badgeStyle: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
      isOverdue: true,
      isUpcoming: false,
      isOnTime: false
    };
  }

  // Open activity: evaluate current deadline against today
  const diffFromToday = calculateDaysDifference(currentDeadline, todayStr);
  if (diffFromToday === null) {
    return {
      status: ActivityDeadlineStatus.NOT_APPLICABLE,
      label: 'Sem Prazo',
      badgeStyle: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
      isOverdue: false,
      isUpcoming: false,
      isOnTime: false
    };
  }

  // Overdue: deadline is in the past
  if (diffFromToday < 0) {
    const daysLate = Math.abs(diffFromToday);
    return {
      status: ActivityDeadlineStatus.OVERDUE,
      label: `Atrasada há ${daysLate} ${daysLate === 1 ? 'dia' : 'dias'}`,
      badgeStyle: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30 animate-pulse',
      isOverdue: true,
      isUpcoming: false,
      isOnTime: false
    };
  }

  // Upcoming: deadline is within the next 3 calendar days (0, 1, 2, or 3 days)
  if (diffFromToday <= 3) {
    const label = diffFromToday === 0
      ? 'Vence hoje'
      : diffFromToday === 1
        ? 'Vence amanhã'
        : `Vence em ${diffFromToday} dias`;
    return {
      status: ActivityDeadlineStatus.UPCOMING,
      label,
      badgeStyle: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-bold',
      isOverdue: false,
      isUpcoming: true,
      isOnTime: true
    };
  }

  // On track
  return {
    status: ActivityDeadlineStatus.ON_TIME,
    label: 'No prazo',
    badgeStyle: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    isOverdue: false,
    isUpcoming: false,
    isOnTime: true
  };
};

/**
 * Calculates all managerial indicators derived from verifiable data for an activity.
 * Returns null for metrics that cannot be reliably computed.
 */
export const calculateActivityManagerialMetrics = (
  activity: ProjectActivity,
  events: ProjectActivityEvent[] = [],
  todayStr: string = getTodayDateString(),
  workDays: number[] = [1, 2, 3, 4, 5]
): ActivityManagerialMetrics => {
  const isDone = isActivityCompleted(activity.status);
  const isBlocked = isActivityBlocked(activity.status);
  const isInProgress = isActivityInProgress(activity.status);

  // 1. Planned Duration (dias corridos planejados)
  const plannedDurationDays = calculateCalendarDurationDays(activity.startDate, activity.deliveryDate);

  // 2. Lead Time Realized (dias corridos reais de execução)
  let leadTimeRealizedDays: number | null = null;
  if (isDone && activity.actualStartDate && activity.actualEndDate) {
    leadTimeRealizedDays = calculateCalendarDurationDays(activity.actualStartDate, activity.actualEndDate);
  }

  // Lead Time in Progress (dias desde o início real até hoje)
  let leadTimeInProgressDays: number | null = null;
  if (!isDone && (isInProgress || isBlocked) && activity.actualStartDate) {
    leadTimeInProgressDays = calculateCalendarDurationDays(activity.actualStartDate, todayStr);
  }

  // 3. Original Deadline & Deviations
  const originalDeadline = activity.originalDeliveryDate || activity.deliveryDate;
  const currentDeadline = activity.deliveryDate;

  let originalDeadlineDeviationDays: number | null = null;
  if (originalDeadline) {
    if (isDone && activity.actualEndDate) {
      originalDeadlineDeviationDays = calculateDaysDifference(activity.actualEndDate, originalDeadline);
    } else if (!isDone) {
      const todayDiff = calculateDaysDifference(todayStr, originalDeadline);
      if (todayDiff !== null && todayDiff > 0) {
        originalDeadlineDeviationDays = todayDiff; // already late
      } else if (todayDiff !== null) {
        originalDeadlineDeviationDays = todayDiff; // days remaining (negative)
      }
    }
  }

  let updatedDeadlineDeviationDays: number | null = null;
  if (currentDeadline) {
    if (isDone && activity.actualEndDate) {
      updatedDeadlineDeviationDays = calculateDaysDifference(activity.actualEndDate, currentDeadline);
    } else if (!isDone) {
      const todayDiff = calculateDaysDifference(todayStr, currentDeadline);
      if (todayDiff !== null && todayDiff > 0) {
        updatedDeadlineDeviationDays = todayDiff;
      } else if (todayDiff !== null) {
        updatedDeadlineDeviationDays = todayDiff;
      }
    }
  }

  // 4. Quantity of reschedulings (from count or events)
  const rescheduleEventsCount = events.filter(e => e.eventType === 'RESCHEDULED').length;
  const deadlineChangesCount = Math.max(activity.deadlineChangesCount || 0, rescheduleEventsCount);

  // 5. Blocked time (in days)
  let blockedDurationDays: number | null = null;
  if (events.length > 0) {
    // Sort events ascending
    const sorted = [...events].sort((a, b) => a.createdAt - b.createdAt);
    let totalBlockedMs = 0;
    let blockStartMs: number | null = null;

    for (const evt of sorted) {
      if (evt.eventType === 'BLOCKED') {
        blockStartMs = evt.createdAt;
      } else if ((evt.eventType === 'RESUMED' || evt.eventType === 'COMPLETED') && blockStartMs !== null) {
        totalBlockedMs += Math.max(0, evt.createdAt - blockStartMs);
        blockStartMs = null;
      }
    }

    if (blockStartMs !== null && isBlocked) {
      totalBlockedMs += Math.max(0, Date.now() - blockStartMs);
    }

    if (totalBlockedMs > 0) {
      blockedDurationDays = Math.max(1, Math.round(totalBlockedMs / (1000 * 60 * 60 * 24)));
    } else if (isBlocked) {
      blockedDurationDays = 1;
    } else {
      blockedDurationDays = 0;
    }
  } else if (isBlocked) {
    blockedDurationDays = 1;
  }

  // 6. Deadline status evaluation
  const deadlineEvaluation = evaluateDeadlineStatus(activity, todayStr);

  return {
    plannedDurationDays,
    leadTimeRealizedDays,
    leadTimeInProgressDays,
    originalDeadlineDeviationDays,
    updatedDeadlineDeviationDays,
    deadlineChangesCount,
    blockedDurationDays,
    isOverdue: deadlineEvaluation.status === ActivityDeadlineStatus.OVERDUE,
    isUpcoming: deadlineEvaluation.status === ActivityDeadlineStatus.UPCOMING,
    isOnTime: deadlineEvaluation.status === ActivityDeadlineStatus.ON_TIME || deadlineEvaluation.status === ActivityDeadlineStatus.COMPLETED_ON_TIME || deadlineEvaluation.status === ActivityDeadlineStatus.COMPLETED_EARLY,
    deadlineStatus: deadlineEvaluation.status,
    deadlineLabel: deadlineEvaluation.label
  };
};

/**
 * Calculates aggregate on-time delivery percentage and status breakdown for a list of activities.
 */
export const calculateActivitiesDeliveryOverview = (
  activities: ProjectActivity[],
  todayStr: string = getTodayDateString()
): {
  total: number;
  toDo: number;
  inProgress: number;
  blocked: number;
  completed: number;
  completedOnTime: number;
  completedLate: number;
  openOverdue: number;
  openUpcoming: number;
  openOnTime: number;
  onTimeDeliveryRatePercent: number | null;
} => {
  let toDo = 0;
  let inProgress = 0;
  let blocked = 0;
  let completed = 0;
  let completedOnTime = 0;
  let completedLate = 0;
  let openOverdue = 0;
  let openUpcoming = 0;
  let openOnTime = 0;

  for (const act of activities) {
    const canonical = normalizeActivityStatus(act.status);
    const deadline = evaluateDeadlineStatus(act, todayStr);

    switch (canonical) {
      case ActivityCanonicalStatus.TO_DO:
        toDo++;
        if (deadline.status === ActivityDeadlineStatus.OVERDUE) openOverdue++;
        else if (deadline.status === ActivityDeadlineStatus.UPCOMING) openUpcoming++;
        else openOnTime++;
        break;
      case ActivityCanonicalStatus.IN_PROGRESS:
        inProgress++;
        if (deadline.status === ActivityDeadlineStatus.OVERDUE) openOverdue++;
        else if (deadline.status === ActivityDeadlineStatus.UPCOMING) openUpcoming++;
        else openOnTime++;
        break;
      case ActivityCanonicalStatus.BLOCKED:
        blocked++;
        if (deadline.status === ActivityDeadlineStatus.OVERDUE) openOverdue++;
        else if (deadline.status === ActivityDeadlineStatus.UPCOMING) openUpcoming++;
        else openOnTime++;
        break;
      case ActivityCanonicalStatus.COMPLETED:
        completed++;
        if (deadline.status === ActivityDeadlineStatus.COMPLETED_EARLY || deadline.status === ActivityDeadlineStatus.COMPLETED_ON_TIME) {
          completedOnTime++;
        } else if (deadline.status === ActivityDeadlineStatus.COMPLETED_LATE) {
          completedLate++;
        } else {
          completedOnTime++;
        }
        break;
    }
  }

  const onTimeDeliveryRatePercent = completed > 0
    ? Math.round((completedOnTime / completed) * 100)
    : null;

  return {
    total: activities.length,
    toDo,
    inProgress,
    blocked,
    completed,
    completedOnTime,
    completedLate,
    openOverdue,
    openUpcoming,
    openOnTime,
    onTimeDeliveryRatePercent
  };
};

/**
 * Creates an activity lifecycle event payload.
 */
export const createActivityEventPayload = (
  workspaceId: string,
  activityId: string,
  eventType: ActivityEventType,
  actor: { id: string; username: string },
  options: {
    fromStatus?: string;
    toStatus?: string;
    details?: string;
    metadata?: Record<string, any>;
  } = {}
): Omit<ProjectActivityEvent, 'id' | 'createdAt'> => ({
  workspaceId,
  activityId,
  eventType,
  fromStatus: options.fromStatus,
  toStatus: options.toStatus,
  details: options.details,
  metadata: options.metadata || {},
  actorId: actor.id,
  actorName: actor.username
});
