import type { Company, WorkSession } from '../types';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const parseTime = (value: string | undefined, fallback: string): [number, number] | null => {
  const match = (value || fallback).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return [hours, minutes];
};

const isValidTimestamp = (value: number) => Number.isFinite(value) && value > 0;

export const calculateNetWorkdayMs = (company: Company | undefined): number => {
  if (!company) return 8 * HOUR_MS;

  const start = company.workStartTime || '08:00';
  const end = company.workEndTime || '18:00';
  const lunchMinutes = company.lunchDurationMinutes ?? 60;
  const [startHours, startMinutes = 0] = start.split(':').map(Number);
  const [endHours, endMinutes = 0] = end.split(':').map(Number);
  if (!Number.isFinite(startHours) || !Number.isFinite(endHours)) return 8 * HOUR_MS;

  const grossMinutes = ((endHours * 60) + endMinutes) - ((startHours * 60) + startMinutes);
  return Math.max(0, grossMinutes - lunchMinutes) * MINUTE_MS;
};

/**
 * Calculates regular operational time in the browser's local timezone.
 *
 * Because the Workspace stores only a lunch duration (not a fixed lunch window),
 * every valid overlap receives the same proportional net factor:
 * (gross workday - lunch duration) / gross workday.
 * A full covered day therefore reaches the configured net workday, while partial
 * sessions receive a deterministic proportional discount without inventing a
 * lunch start or end time.
 */
export const calculateRegularOperationalMs = (
  sessions: WorkSession[],
  company: Company | undefined,
  nowMs: number
): number | null => {
  if (!isValidTimestamp(nowMs)) return null;

  const workStart = parseTime(company?.workStartTime, '08:00');
  const workEnd = parseTime(company?.workEndTime, '18:00');
  if (!workStart || !workEnd) return null;

  const workDays = company?.workDays || [1, 2, 3, 4, 5];
  const lunchMinutes = Math.max(0, company?.lunchDurationMinutes ?? 60);
  let totalMs = 0;

  for (const session of sessions) {
    if (!isValidTimestamp(session.startedAt)) return null;

    const sessionEnd = session.endedAt ?? nowMs;
    if (!isValidTimestamp(sessionEnd) || sessionEnd < session.startedAt) return null;

    const cursor = new Date(session.startedAt);
    cursor.setHours(0, 0, 0, 0);
    const lastDay = new Date(sessionEnd);
    lastDay.setHours(0, 0, 0, 0);

    while (cursor.getTime() <= lastDay.getTime()) {
      if (workDays.includes(cursor.getDay())) {
        const dayStart = new Date(cursor);
        dayStart.setHours(workStart[0], workStart[1], 0, 0);
        const dayEnd = new Date(cursor);
        dayEnd.setHours(workEnd[0], workEnd[1], 0, 0);

        const grossWorkdayMs = dayEnd.getTime() - dayStart.getTime();
        if (grossWorkdayMs <= 0) return null;

        const overlapStart = Math.max(session.startedAt, dayStart.getTime());
        const overlapEnd = Math.min(sessionEnd, dayEnd.getTime());
        const overlapMs = Math.max(0, overlapEnd - overlapStart);
        const lunchMs = Math.min(lunchMinutes * MINUTE_MS, grossWorkdayMs);
        const netFactor = (grossWorkdayMs - lunchMs) / grossWorkdayMs;
        totalMs += overlapMs * netFactor;
      }

      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return Math.round(totalMs);
};

export const calculateOvertimeMs = (authorizedHours: number[]): number | null => {
  if (authorizedHours.some(hours => !Number.isFinite(hours) || hours < 0)) return null;
  return Math.round(authorizedHours.reduce((total, hours) => total + hours, 0) * 60 * MINUTE_MS);
};

export const calculateAccountedOperationalMs = (
  sessions: WorkSession[],
  authorizedHours: number[],
  company: Company | undefined,
  nowMs: number
): number | null => {
  const regularMs = calculateRegularOperationalMs(sessions, company, nowMs);
  const overtimeMs = calculateOvertimeMs(authorizedHours);
  return regularMs === null || overtimeMs === null ? null : regularMs + overtimeMs;
};

export interface PauseMetrics {
  count: number;
  totalMs: number;
  averageMs: number;
  currentPauseMs: number;
}

export const calculatePauseMetrics = (
  sessions: WorkSession[],
  company: Company | undefined,
  nowMs: number,
  isPaused: boolean
): PauseMetrics => {
  const validSessions = sessions.filter(s => Number.isFinite(s.startedAt) && s.startedAt > 0);
  if (validSessions.length === 0) {
    return { count: 0, totalMs: 0, averageMs: 0, currentPauseMs: 0 };
  }

  // Group by activityExecutionId
  const groups: { [executionId: string]: WorkSession[] } = {};
  for (const session of validSessions) {
    if (!groups[session.activityExecutionId]) {
      groups[session.activityExecutionId] = [];
    }
    groups[session.activityExecutionId].push(session);
  }

  let count = 0;
  let totalMs = 0;

  for (const execId of Object.keys(groups)) {
    const execSessions = [...groups[execId]].sort((a, b) => a.startedAt - b.startedAt);
    for (let i = 0; i < execSessions.length - 1; i++) {
      const current = execSessions[i];
      const next = execSessions[i + 1];
      if (
        current.endedAt !== undefined && current.endedAt !== null && Number.isFinite(current.endedAt) && current.endedAt > 0 &&
        next.startedAt !== undefined && next.startedAt !== null && Number.isFinite(next.startedAt) && next.startedAt > 0 &&
        next.startedAt > current.endedAt
      ) {
        const pauseStart = current.endedAt;
        const pauseEnd = next.startedAt;
        const duration = calculateRegularOperationalMs(
          [{ startedAt: pauseStart, endedAt: pauseEnd } as WorkSession],
          company,
          nowMs
        );
        if (duration !== null && duration > 0) {
          totalMs += duration;
        }
        count++;
      }
    }
  }

  const averageMs = count > 0 ? Math.round(totalMs / count) : 0;

  let currentPauseMs = 0;
  if (isPaused) {
    const endedSessions = validSessions.filter(
      s => s.endedAt !== undefined && s.endedAt !== null && Number.isFinite(s.endedAt) && s.endedAt > 0
    );
    if (endedSessions.length > 0) {
      const latestSession = endedSessions.reduce((latest, curr) => {
        return curr.endedAt! > latest.endedAt! ? curr : latest;
      }, endedSessions[0]);

      if (latestSession.endedAt && nowMs > latestSession.endedAt) {
        const duration = calculateRegularOperationalMs(
          [{ startedAt: latestSession.endedAt, endedAt: nowMs } as WorkSession],
          company,
          nowMs
        );
        if (duration !== null && duration > 0) {
          currentPauseMs = duration;
        }
      }
    }
  }

  return {
    count,
    totalMs,
    averageMs,
    currentPauseMs
  };
};

