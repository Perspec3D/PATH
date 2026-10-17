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

export { ActivityCanonicalStatus, ActivityDeadlineStatus };

/**
 * Normalizes any activity status (canonical or legacy) into one of the four canonical states:
 * - A FAZER
 * - EM ANDAMENTO
 * - BLOQUEADA
 * - CONCLUÍDA
 */
export const normalizeActivityStatus = (status: string | any | undefined): ActivityCanonicalStatus => {
  if (!status) return ActivityCanonicalStatus.TO_DO;
  let rawStr = '';
  if (typeof status === 'string') {
    rawStr = status;
  } else if (typeof status === 'object' && status !== null && 'status' in status) {
    return normalizeActivityStatus((status as any).status);
  } else {
    rawStr = String(status);
  }
  const upper = rawStr.trim().toUpperCase();

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
 * Adds or subtracts calendar days from a YYYY-MM-DD date string safely.
 * Returns null if input date is invalid.
 */
export const addCalendarDays = (dateStr?: string | null, days: number = 0): string | null => {
  const d = parseLocalDate(dateStr);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
};

/**
 * Returns today's date formatted as YYYY-MM-DD in local time.
 */
export const getTodayDateString = (): string => formatLocalDate(new Date());

export type DragRescheduleMode = 'move' | 'resize-start' | 'resize-end';

export interface RescheduleDatesResult {
  newStartDate: string;
  newDeliveryDate: string;
  isClamped: boolean;
}

/**
 * Calculates new planned start and delivery dates for interactive Gantt drag/resize.
 * Strictly respects:
 * - Preservation of duration in 'move' mode
 * - Boundaries of parent project (if defined)
 * - Safe minimum 1-day duration (startDate <= deliveryDate)
 * - Immune to timezone shifts
 */
export const calculateRescheduledDates = (
  mode: DragRescheduleMode,
  initialStartDate: string,
  initialDeliveryDate: string,
  deltaDays: number,
  projectStartDate?: string,
  projectDeliveryDate?: string
): RescheduleDatesResult => {
  const initialDuration = calculateCalendarDurationDays(initialStartDate, initialDeliveryDate) || 1;
  let isClamped = false;
  let newStartDate = initialStartDate;
  let newDeliveryDate = initialDeliveryDate;

  if (mode === 'move') {
    let shiftedStart = addCalendarDays(initialStartDate, deltaDays) || initialStartDate;
    let shiftedEnd = addCalendarDays(initialDeliveryDate, deltaDays) || initialDeliveryDate;

    if (projectStartDate && shiftedStart < projectStartDate) {
      shiftedStart = projectStartDate;
      shiftedEnd = addCalendarDays(shiftedStart, initialDuration - 1) || shiftedEnd;
      isClamped = true;
    }
    if (projectDeliveryDate && shiftedEnd > projectDeliveryDate) {
      shiftedEnd = projectDeliveryDate;
      shiftedStart = addCalendarDays(shiftedEnd, -(initialDuration - 1)) || shiftedStart;
      isClamped = true;
    }

    if (shiftedStart > shiftedEnd) {
      shiftedStart = shiftedEnd;
      isClamped = true;
    }

    newStartDate = shiftedStart;
    newDeliveryDate = shiftedEnd;
  } else if (mode === 'resize-start') {
    let candidateStart = addCalendarDays(initialStartDate, deltaDays) || initialStartDate;

    if (candidateStart > initialDeliveryDate) {
      candidateStart = initialDeliveryDate;
      isClamped = true;
    }
    if (projectStartDate && candidateStart < projectStartDate) {
      candidateStart = projectStartDate;
      isClamped = true;
    }

    newStartDate = candidateStart;
    newDeliveryDate = initialDeliveryDate;
  } else if (mode === 'resize-end') {
    let candidateEnd = addCalendarDays(initialDeliveryDate, deltaDays) || initialDeliveryDate;

    if (candidateEnd < initialStartDate) {
      candidateEnd = initialStartDate;
      isClamped = true;
    }
    if (projectDeliveryDate && candidateEnd > projectDeliveryDate) {
      candidateEnd = projectDeliveryDate;
      isClamped = true;
    }

    newStartDate = initialStartDate;
    newDeliveryDate = candidateEnd;
  }

  return { newStartDate, newDeliveryDate, isClamped };
};

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

// ============================================================================
// ETAPA 2: MOTOR UNIFICADO DE KPI E INTELIGÊNCIA GERENCIAL
// ============================================================================

export interface KPIPeriodFilter {
  monthStr?: string;   // e.g. "2026-10" (YYYY-MM)
  startDate?: string;  // YYYY-MM-DD
  endDate?: string;    // YYYY-MM-DD
}

export interface UnifiedDeliveryKPIs {
  // Prazos e Entregas
  completedCount: number;
  completedWithOriginalDeadlineCount: number;
  completedOnOriginalDeadlineCount: number;
  originalDeliveryRatePercent: number | null; // null se denominador for 0 ("Dados insuficientes")

  completedWithUpdatedDeadlineCount: number;
  completedOnUpdatedDeadlineCount: number;
  updatedDeliveryRatePercent: number | null;

  openOverdueCount: number;
  openUpcomingCount: number;
  openOnTimeCount: number;

  averageDelayDaysCompletedLate: number | null; // em dias
  delayedCompletedCount: number;

  averageLeadTimeDaysCompleted: number | null; // em dias
  leadTimeSampleCount: number;

  // Fluxo de Trabalho
  toDoCount: number;
  inProgressCount: number; // WIP canônico (estritamente EM ANDAMENTO)
  blockedCount: number;    // Estritamente BLOQUEADA, sem duplicação no WIP
  canonicalWipCount: number;
  totalActivitiesCount: number;

  // Confiabilidade do Planejamento
  rescheduledActivitiesCount: number;
  totalReschedulingsCount: number;
  rescheduledRatePercent: number | null;
  averageOriginalDeviationDays: number | null;

  // Impedimentos
  activeBlocksCount: number;
  blockedReasonsDistribution: Record<string, number>;
  totalBlockedDays: number;
}

export interface UpcomingDeliveryItem {
  id: string;
  projectId: string;
  name: string;
  deliveryDate: string;
  status: ActivityCanonicalStatus;
  deadlineStatus: ActivityDeadlineStatus;
  deadlineLabel: string;
  isOverdue: boolean;
  isUpcoming: boolean;
}

export interface ProfessionalDeliveryMetrics {
  userId: string;
  username?: string;
  inProgressCount: number; // WIP
  blockedCount: number;
  overdueCount: number;
  completedInPeriodCount: number;
  completedOnTimeCount: number;
  completedWithDeadlineCount: number;
  onTimeRatePercent: number | null;
  averageLeadTimeDays: number | null;
  leadTimeSampleCount: number;
  upcomingDeliveries: UpcomingDeliveryItem[];
  wipLimit?: number;
  isWipLimitExceeded: boolean;
}

export interface WipOverview {
  totalWip: number;       // Canonical EM ANDAMENTO
  totalBlocked: number;   // Canonical BLOQUEADA
  totalOverdue: number;   // Open past deadline
  wipByAssignee: Record<string, number>;
  blockedByAssignee: Record<string, number>;
  overdueByAssignee: Record<string, number>;
  userLimits: Record<string, number>;
  exceededUsers: string[];
}

/**
 * Checks whether a completed activity belongs to the requested period.
 * If no period is specified, returns true.
 */
export const isActivityInPeriod = (
  activity: ProjectActivity,
  period?: KPIPeriodFilter
): boolean => {
  if (!period) return true;
  const canonical = normalizeActivityStatus(activity.status);
  
  // For open activities, they reflect current state unless strict date range is required
  if (canonical !== ActivityCanonicalStatus.COMPLETED) {
    return true;
  }

  const completionDate = activity.actualEndDate;
  if (!completionDate) return false;

  if (period.monthStr) {
    return completionDate.startsWith(period.monthStr);
  }

  if (period.startDate && completionDate < period.startDate) {
    return false;
  }

  if (period.endDate && completionDate > period.endDate) {
    return false;
  }

  return true;
};

/**
 * Consolidates all delivery, workflow, reliability and impedance KPIs for a set of activities.
 */
export const calculateUnifiedKPIs = (
  activities: ProjectActivity[],
  eventsInput: ProjectActivityEvent[] | Record<string, ProjectActivityEvent[]> = [],
  period?: KPIPeriodFilter,
  todayStr: string = getTodayDateString(),
  activeProjectIds?: Set<string>
): UnifiedDeliveryKPIs => {
  // Normalize events input
  const eventsByActivityId: Record<string, ProjectActivityEvent[]> = {};
  if (Array.isArray(eventsInput)) {
    for (const evt of eventsInput) {
      if (!eventsByActivityId[evt.activityId]) {
        eventsByActivityId[evt.activityId] = [];
      }
      eventsByActivityId[evt.activityId].push(evt);
    }
  } else if (eventsInput) {
    Object.assign(eventsByActivityId, eventsInput);
  }

  // Filter activities by active project / revision if provided to avoid duplicate historical revisions
  const filteredActivities = activities.filter(act => {
    if (activeProjectIds && !activeProjectIds.has(act.projectId)) {
      return false;
    }
    return isActivityInPeriod(act, period);
  });

  let toDoCount = 0;
  let inProgressCount = 0;
  let blockedCount = 0;
  let completedCount = 0;

  let openOverdueCount = 0;
  let openUpcomingCount = 0;
  let openOnTimeCount = 0;

  // On-time tracking (Original deadline)
  let completedWithOriginalDeadlineCount = 0;
  let completedOnOriginalDeadlineCount = 0;

  // On-time tracking (Updated deadline)
  let completedWithUpdatedDeadlineCount = 0;
  let completedOnUpdatedDeadlineCount = 0;

  // Delay of late completed
  let sumDelayDaysCompletedLate = 0;
  let delayedCompletedCount = 0;

  // Lead time of completed
  let sumLeadTimeDays = 0;
  let leadTimeSampleCount = 0;

  // Reschedulings
  let rescheduledActivitiesCount = 0;
  let totalReschedulingsCount = 0;
  let sumOriginalDeviationDays = 0;
  let deviationSampleCount = 0;

  // Blockages
  const blockedReasonsDistribution: Record<string, number> = {};
  let totalBlockedDays = 0;

  for (const act of filteredActivities) {
    const canonical = normalizeActivityStatus(act.status);
    const deadlineEval = evaluateDeadlineStatus(act, todayStr);
    const actEvents = eventsByActivityId[act.id] || [];

    // Calculate reschedulings for reliability metrics
    const rescheduleEventsCount = actEvents.filter(e => e.eventType === 'RESCHEDULED').length;
    const effectiveChangesCount = Math.max(act.deadlineChangesCount || 0, rescheduleEventsCount);
    const hasDifferentOriginal = Boolean(
      act.originalDeliveryDate &&
      act.deliveryDate &&
      act.originalDeliveryDate !== act.deliveryDate
    );

    if (effectiveChangesCount > 0 || hasDifferentOriginal) {
      rescheduledActivitiesCount++;
      totalReschedulingsCount += Math.max(1, effectiveChangesCount);
    }

    if (act.deliveryDate && act.originalDeliveryDate) {
      const dev = calculateDaysDifference(act.deliveryDate, act.originalDeliveryDate);
      if (dev !== null && dev !== 0) {
        sumOriginalDeviationDays += Math.abs(dev);
        deviationSampleCount++;
      }
    }

    // Status breakdown
    switch (canonical) {
      case ActivityCanonicalStatus.TO_DO:
        toDoCount++;
        if (deadlineEval.status === ActivityDeadlineStatus.OVERDUE) openOverdueCount++;
        else if (deadlineEval.status === ActivityDeadlineStatus.UPCOMING) openUpcomingCount++;
        else openOnTimeCount++;
        break;

      case ActivityCanonicalStatus.IN_PROGRESS:
        inProgressCount++;
        if (deadlineEval.status === ActivityDeadlineStatus.OVERDUE) openOverdueCount++;
        else if (deadlineEval.status === ActivityDeadlineStatus.UPCOMING) openUpcomingCount++;
        else openOnTimeCount++;
        break;

      case ActivityCanonicalStatus.BLOCKED:
        blockedCount++;
        if (deadlineEval.status === ActivityDeadlineStatus.OVERDUE) openOverdueCount++;
        else if (deadlineEval.status === ActivityDeadlineStatus.UPCOMING) openUpcomingCount++;
        else openOnTimeCount++;

        // Track blocked reason
        const reason = (act.blockedReason && act.blockedReason.trim()) || 'Motivo não especificado';
        blockedReasonsDistribution[reason] = (blockedReasonsDistribution[reason] || 0) + 1;
        break;

      case ActivityCanonicalStatus.COMPLETED:
        completedCount++;

        // 1. Original Deadline Compliance
        const originalTarget = act.originalDeliveryDate;
        if (originalTarget && act.actualEndDate) {
          completedWithOriginalDeadlineCount++;
          if (act.actualEndDate <= originalTarget) {
            completedOnOriginalDeadlineCount++;
          }
        }

        // 2. Updated Deadline Compliance
        const updatedTarget = act.deadlineAtConclusion || act.deliveryDate;
        if (updatedTarget && act.actualEndDate) {
          completedWithUpdatedDeadlineCount++;
          if (act.actualEndDate <= updatedTarget) {
            completedOnUpdatedDeadlineCount++;
          } else {
            // Late completion delay
            const delayDays = calculateDaysDifference(act.actualEndDate, updatedTarget);
            if (delayDays !== null && delayDays > 0) {
              sumDelayDaysCompletedLate += delayDays;
              delayedCompletedCount++;
            }
          }
        }

        // 3. Lead Time (Difference between actual start and actual end)
        if (act.actualStartDate && act.actualEndDate) {
          const leadDays = calculateCalendarDurationDays(act.actualStartDate, act.actualEndDate);
          if (leadDays !== null && leadDays > 0) {
            sumLeadTimeDays += leadDays;
            leadTimeSampleCount++;
          }
        }
        break;
    }

    // Accumulate blocked days from events or current blocked status
    const managerial = calculateActivityManagerialMetrics(act, actEvents, todayStr);
    if (managerial.blockedDurationDays && managerial.blockedDurationDays > 0) {
      totalBlockedDays += managerial.blockedDurationDays;
    }
  }

  // Calculate percentages with rigorous zero-division protection ("Dados insuficientes" -> null)
  const originalDeliveryRatePercent = completedWithOriginalDeadlineCount > 0
    ? Math.round((completedOnOriginalDeadlineCount / completedWithOriginalDeadlineCount) * 100)
    : null;

  const updatedDeliveryRatePercent = completedWithUpdatedDeadlineCount > 0
    ? Math.round((completedOnUpdatedDeadlineCount / completedWithUpdatedDeadlineCount) * 100)
    : null;

  const averageDelayDaysCompletedLate = delayedCompletedCount > 0
    ? Math.round((sumDelayDaysCompletedLate / delayedCompletedCount) * 10) / 10
    : null;

  const averageLeadTimeDaysCompleted = leadTimeSampleCount > 0
    ? Math.round((sumLeadTimeDays / leadTimeSampleCount) * 10) / 10
    : null;

  const totalConsidered = filteredActivities.length;
  const rescheduledRatePercent = totalConsidered > 0
    ? Math.round((rescheduledActivitiesCount / totalConsidered) * 100)
    : null;

  const averageOriginalDeviationDays = deviationSampleCount > 0
    ? Math.round((sumOriginalDeviationDays / deviationSampleCount) * 10) / 10
    : null;

  return {
    completedCount,
    completedWithOriginalDeadlineCount,
    completedOnOriginalDeadlineCount,
    originalDeliveryRatePercent,
    completedWithUpdatedDeadlineCount,
    completedOnUpdatedDeadlineCount,
    updatedDeliveryRatePercent,
    openOverdueCount,
    openUpcomingCount,
    openOnTimeCount,
    averageDelayDaysCompletedLate,
    delayedCompletedCount,
    averageLeadTimeDaysCompleted,
    leadTimeSampleCount,
    toDoCount,
    inProgressCount,
    blockedCount,
    canonicalWipCount: inProgressCount,
    totalActivitiesCount: totalConsidered,
    rescheduledActivitiesCount,
    totalReschedulingsCount,
    rescheduledRatePercent,
    averageOriginalDeviationDays,
    activeBlocksCount: blockedCount,
    blockedReasonsDistribution,
    totalBlockedDays
  };
};

/**
 * Calculates delivery and WIP metrics per professional.
 */
export const calculateProfessionalDeliveryMetrics = (
  activities: ProjectActivity[],
  users: Array<{ id: string; username: string }>,
  period?: KPIPeriodFilter,
  todayStr: string = getTodayDateString(),
  userWipLimits: Record<string, number> = {},
  activeProjectIds?: Set<string>
): ProfessionalDeliveryMetrics[] => {
  return users.map(user => {
    // Filter activities where user is assignee or conclusion responsible
    const userActivities = activities.filter(act => {
      if (activeProjectIds && !activeProjectIds.has(act.projectId)) {
        return false;
      }
      return act.assigneeId === user.id || act.conclusionResponsibleId === user.id;
    });

    let inProgressCount = 0;
    let blockedCount = 0;
    let overdueCount = 0;

    let completedInPeriodCount = 0;
    let completedOnTimeCount = 0;
    let completedWithDeadlineCount = 0;

    let sumLeadTimeDays = 0;
    let leadTimeSampleCount = 0;

    const openActivitiesForUpcoming: UpcomingDeliveryItem[] = [];

    for (const act of userActivities) {
      const canonical = normalizeActivityStatus(act.status);
      const deadlineEval = evaluateDeadlineStatus(act, todayStr);

      if (canonical === ActivityCanonicalStatus.IN_PROGRESS) {
        if (act.assigneeId === user.id) {
          inProgressCount++;
        }
        if (deadlineEval.status === ActivityDeadlineStatus.OVERDUE) overdueCount++;
        if (act.deliveryDate && act.assigneeId === user.id) {
          openActivitiesForUpcoming.push({
            id: act.id,
            projectId: act.projectId,
            name: act.name,
            deliveryDate: act.deliveryDate,
            status: canonical,
            deadlineStatus: deadlineEval.status,
            deadlineLabel: deadlineEval.label,
            isOverdue: deadlineEval.status === ActivityDeadlineStatus.OVERDUE,
            isUpcoming: deadlineEval.status === ActivityDeadlineStatus.UPCOMING
          });
        }
      } else if (canonical === ActivityCanonicalStatus.BLOCKED) {
        if (act.assigneeId === user.id) {
          blockedCount++;
        }
        if (deadlineEval.status === ActivityDeadlineStatus.OVERDUE) overdueCount++;
        if (act.deliveryDate && act.assigneeId === user.id) {
          openActivitiesForUpcoming.push({
            id: act.id,
            projectId: act.projectId,
            name: act.name,
            deliveryDate: act.deliveryDate,
            status: canonical,
            deadlineStatus: deadlineEval.status,
            deadlineLabel: deadlineEval.label,
            isOverdue: deadlineEval.status === ActivityDeadlineStatus.OVERDUE,
            isUpcoming: deadlineEval.status === ActivityDeadlineStatus.UPCOMING
          });
        }
      } else if (canonical === ActivityCanonicalStatus.TO_DO) {
        if (deadlineEval.status === ActivityDeadlineStatus.OVERDUE) overdueCount++;
        if (act.deliveryDate && act.assigneeId === user.id) {
          openActivitiesForUpcoming.push({
            id: act.id,
            projectId: act.projectId,
            name: act.name,
            deliveryDate: act.deliveryDate,
            status: canonical,
            deadlineStatus: deadlineEval.status,
            deadlineLabel: deadlineEval.label,
            isOverdue: deadlineEval.status === ActivityDeadlineStatus.OVERDUE,
            isUpcoming: deadlineEval.status === ActivityDeadlineStatus.UPCOMING
          });
        }
      } else if (canonical === ActivityCanonicalStatus.COMPLETED) {
        if (isActivityInPeriod(act, period)) {
          completedInPeriodCount++;

          const target = act.deadlineAtConclusion || act.deliveryDate;
          if (target && act.actualEndDate) {
            completedWithDeadlineCount++;
            if (act.actualEndDate <= target) {
              completedOnTimeCount++;
            }
          }

          if (act.actualStartDate && act.actualEndDate) {
            const lead = calculateCalendarDurationDays(act.actualStartDate, act.actualEndDate);
            if (lead !== null && lead > 0) {
              sumLeadTimeDays += lead;
              leadTimeSampleCount++;
            }
          }
        }
      }
    }

    const onTimeRatePercent = completedWithDeadlineCount > 0
      ? Math.round((completedOnTimeCount / completedWithDeadlineCount) * 100)
      : null;

    const averageLeadTimeDays = leadTimeSampleCount > 0
      ? Math.round((sumLeadTimeDays / leadTimeSampleCount) * 10) / 10
      : null;

    // Sort upcoming deliveries ascending by delivery date
    openActivitiesForUpcoming.sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
    const upcomingDeliveries = openActivitiesForUpcoming.slice(0, 5);

    const wipLimit = userWipLimits[user.id];
    const isWipLimitExceeded = Boolean(wipLimit && wipLimit > 0 && inProgressCount > wipLimit);

    return {
      userId: user.id,
      username: user.username,
      inProgressCount,
      blockedCount,
      overdueCount,
      completedInPeriodCount,
      completedOnTimeCount,
      completedWithDeadlineCount,
      onTimeRatePercent,
      averageLeadTimeDays,
      leadTimeSampleCount,
      upcomingDeliveries,
      wipLimit,
      isWipLimitExceeded
    };
  });
};

/**
 * Calculates global WIP overview, team distribution, and advisory limit alerts.
 */
export const calculateWipOverview = (
  activities: ProjectActivity[],
  userLimits: Record<string, number> = {},
  todayStr: string = getTodayDateString(),
  activeProjectIds?: Set<string>
): WipOverview => {
  let totalWip = 0;
  let totalBlocked = 0;
  let totalOverdue = 0;

  const wipByAssignee: Record<string, number> = {};
  const blockedByAssignee: Record<string, number> = {};
  const overdueByAssignee: Record<string, number> = {};

  for (const act of activities) {
    if (activeProjectIds && !activeProjectIds.has(act.projectId)) {
      continue;
    }

    const canonical = normalizeActivityStatus(act.status);
    const deadline = evaluateDeadlineStatus(act, todayStr);
    const assignee = act.assigneeId || 'unassigned';

    if (canonical === ActivityCanonicalStatus.IN_PROGRESS) {
      totalWip++;
      wipByAssignee[assignee] = (wipByAssignee[assignee] || 0) + 1;
      if (deadline.status === ActivityDeadlineStatus.OVERDUE) {
        totalOverdue++;
        overdueByAssignee[assignee] = (overdueByAssignee[assignee] || 0) + 1;
      }
    } else if (canonical === ActivityCanonicalStatus.BLOCKED) {
      totalBlocked++;
      blockedByAssignee[assignee] = (blockedByAssignee[assignee] || 0) + 1;
      if (deadline.status === ActivityDeadlineStatus.OVERDUE) {
        totalOverdue++;
        overdueByAssignee[assignee] = (overdueByAssignee[assignee] || 0) + 1;
      }
    } else if (canonical === ActivityCanonicalStatus.TO_DO) {
      if (deadline.status === ActivityDeadlineStatus.OVERDUE) {
        totalOverdue++;
        overdueByAssignee[assignee] = (overdueByAssignee[assignee] || 0) + 1;
      }
    }
  }

  const exceededUsers: string[] = [];
  for (const [userId, limit] of Object.entries(userLimits)) {
    if (limit > 0 && (wipByAssignee[userId] || 0) > limit) {
      exceededUsers.push(userId);
    }
  }

  return {
    totalWip,
    totalBlocked,
    totalOverdue,
    wipByAssignee,
    blockedByAssignee,
    overdueByAssignee,
    userLimits,
    exceededUsers
  };
};

/**
 * Formats a percentage with clear numerator and denominator or explicit "Dados insuficientes".
 */
export const formatKpiRateWithFraction = (
  percent: number | null,
  numerator?: number,
  denominator?: number
): string => {
  if (percent === null || denominator === 0 || denominator === undefined) {
    return 'Dados insuficientes';
  }
  return `${percent}% (${numerator}/${denominator})`;
};

/**
 * Formats duration in calendar days or "Dados insuficientes".
 */
export const formatKpiLeadTimeDays = (days: number | null): string => {
  if (days === null || !Number.isFinite(days)) {
    return 'Dados insuficientes';
  }
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
};

