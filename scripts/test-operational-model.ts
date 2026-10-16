import {
  normalizeActivityStatus,
  isActivityCompleted,
  isActivityInProgress,
  isActivityBlocked,
  isActivityToDo,
  parseLocalDate,
  formatLocalDate,
  calculateCalendarDurationDays,
  calculateBusinessDurationDays,
  calculateDaysDifference,
  evaluateDeadlineStatus,
  calculateActivityManagerialMetrics,
  calculateActivitiesDeliveryOverview,
  createActivityEventPayload
} from '../utils/activityOperationalModel';
import {
  ActivityCanonicalStatus,
  ActivityDeadlineStatus,
  ProjectActivity,
  ProjectActivityEvent,
  ProjectStatus
} from '../types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

console.log('=== TEST SUITE: PERSPECPATH OPERATIONAL MODEL ===\n');

// 1. Status Normalization & Predicates
console.log('1. Status Normalization & Predicates');
assert(normalizeActivityStatus('A FAZER') === ActivityCanonicalStatus.TO_DO, 'Normalizes A FAZER');
assert(normalizeActivityStatus('Fila de Espera') === ActivityCanonicalStatus.TO_DO, 'Normalizes Fila de Espera -> A FAZER');
assert(normalizeActivityStatus('QUEUE') === ActivityCanonicalStatus.TO_DO, 'Normalizes QUEUE -> A FAZER');
assert(normalizeActivityStatus('EM ANDAMENTO') === ActivityCanonicalStatus.IN_PROGRESS, 'Normalizes EM ANDAMENTO');
assert(normalizeActivityStatus('Em Andamento') === ActivityCanonicalStatus.IN_PROGRESS, 'Normalizes Em Andamento -> EM ANDAMENTO');
assert(normalizeActivityStatus('BLOQUEADA') === ActivityCanonicalStatus.BLOCKED, 'Normalizes BLOQUEADA');
assert(normalizeActivityStatus('Pausado') === ActivityCanonicalStatus.BLOCKED, 'Normalizes Pausado -> BLOQUEADA');
assert(normalizeActivityStatus('PAUSED') === ActivityCanonicalStatus.BLOCKED, 'Normalizes PAUSED -> BLOQUEADA');
assert(normalizeActivityStatus('CONCLUÍDA') === ActivityCanonicalStatus.COMPLETED, 'Normalizes CONCLUÍDA');
assert(normalizeActivityStatus('Concluído') === ActivityCanonicalStatus.COMPLETED, 'Normalizes Concluído -> CONCLUÍDA');
assert(normalizeActivityStatus('Cancelado') === ActivityCanonicalStatus.COMPLETED, 'Normalizes Cancelado -> CONCLUÍDA');

assert(isActivityCompleted('Concluído'), 'isActivityCompleted on Concluído');
assert(isActivityCompleted('CONCLUÍDA'), 'isActivityCompleted on CONCLUÍDA');
assert(!isActivityCompleted('Em Andamento'), 'isActivityCompleted false for Em Andamento');
assert(isActivityInProgress('Em Andamento'), 'isActivityInProgress on Em Andamento');
assert(isActivityBlocked('Pausado'), 'isActivityBlocked on Pausado');
assert(isActivityBlocked('BLOQUEADA'), 'isActivityBlocked on BLOQUEADA');
assert(isActivityToDo('Fila de Espera'), 'isActivityToDo on Fila de Espera');

// 2. Timezone & Date Conventions
console.log('\n2. Timezone Safety & Date Conventions');
const parsed = parseLocalDate('2026-08-10');
assert(parsed !== null, 'Parses 2026-08-10');
assert(parsed?.getFullYear() === 2026, 'Year is 2026');
assert(parsed?.getMonth() === 7, 'Month is 7 (August, 0-indexed)');
assert(parsed?.getDate() === 10, 'Day is 10 (no timezone day shift)');
assert(formatLocalDate(parsed!) === '2026-08-10', 'Formats back to 2026-08-10');

// Duration: same day = 1 inclusive day
assert(calculateCalendarDurationDays('2026-08-10', '2026-08-10') === 1, 'Same day calendar duration is 1 day');
assert(calculateCalendarDurationDays('2026-08-10', '2026-08-14') === 5, 'Monday to Friday calendar duration is 5 days');
// Friday 2026-08-14 to Monday 2026-08-17 = 4 calendar days (Fri, Sat, Sun, Mon), 2 business days (Fri, Mon)
assert(calculateCalendarDurationDays('2026-08-14', '2026-08-17') === 4, 'Friday to Monday calendar duration is 4 days');
assert(calculateBusinessDurationDays('2026-08-14', '2026-08-17', [1, 2, 3, 4, 5]) === 2, 'Friday to Monday business duration is 2 days');

// Difference: target - reference
assert(calculateDaysDifference('2026-08-12', '2026-08-10') === 2, 'Difference 2026-08-12 vs 2026-08-10 is +2 days');
assert(calculateDaysDifference('2026-08-08', '2026-08-10') === -2, 'Difference 2026-08-08 vs 2026-08-10 is -2 days');
assert(calculateDaysDifference('2026-08-10', '2026-08-10') === 0, 'Difference same day is 0');

// 3. Deadline Status Evaluation
console.log('\n3. Deadline Status Evaluation');
const baseActivity: ProjectActivity = {
  id: 'act-1',
  workspaceId: 'ws-1',
  projectId: 'proj-1',
  name: 'Desenho Técnico',
  status: ActivityCanonicalStatus.IN_PROGRESS,
  startDate: '2026-08-10',
  deliveryDate: '2026-08-20',
  originalDeliveryDate: '2026-08-20',
  orderIndex: 1,
  deadlineChangesCount: 0,
  createdAt: Date.now(),
  updatedAt: Date.now()
};

// On track: today is 2026-08-12, deadline 2026-08-20 (8 days ahead)
const evalOnTrack = evaluateDeadlineStatus(baseActivity, '2026-08-12');
assert(evalOnTrack.status === ActivityDeadlineStatus.ON_TIME, 'Open activity with deadline in 8 days is NO_PRAZO');

// Upcoming: today is 2026-08-18, deadline 2026-08-20 (2 days ahead)
const evalUpcoming = evaluateDeadlineStatus(baseActivity, '2026-08-18');
assert(evalUpcoming.status === ActivityDeadlineStatus.UPCOMING, 'Open activity with deadline in 2 days is VENCIMENTO_PROXIMO');

// Overdue: today is 2026-08-22, deadline 2026-08-20 (2 days late)
const evalOverdue = evaluateDeadlineStatus(baseActivity, '2026-08-22');
assert(evalOverdue.status === ActivityDeadlineStatus.OVERDUE, 'Open activity past deadline is ATRASADA');

// Completed on time: deadline 2026-08-20, actualEndDate 2026-08-20
const completedOnTimeActivity: ProjectActivity = {
  ...baseActivity,
  status: ActivityCanonicalStatus.COMPLETED,
  actualStartDate: '2026-08-10',
  actualEndDate: '2026-08-20'
};
const evalCompOnTime = evaluateDeadlineStatus(completedOnTimeActivity, '2026-08-25');
assert(evalCompOnTime.status === ActivityDeadlineStatus.COMPLETED_ON_TIME, 'Completed on deadline is CONCLUIDA_NO_PRAZO');

// Completed early: deadline 2026-08-20, actualEndDate 2026-08-18
const completedEarlyActivity: ProjectActivity = {
  ...baseActivity,
  status: ActivityCanonicalStatus.COMPLETED,
  actualStartDate: '2026-08-10',
  actualEndDate: '2026-08-18'
};
const evalCompEarly = evaluateDeadlineStatus(completedEarlyActivity, '2026-08-25');
assert(evalCompEarly.status === ActivityDeadlineStatus.COMPLETED_EARLY, 'Completed early is CONCLUIDA_ADIANTADA');

// Completed late: deadline 2026-08-20, actualEndDate 2026-08-23
const completedLateActivity: ProjectActivity = {
  ...baseActivity,
  status: ActivityCanonicalStatus.COMPLETED,
  actualStartDate: '2026-08-10',
  actualEndDate: '2026-08-23'
};
const evalCompLate = evaluateDeadlineStatus(completedLateActivity, '2026-08-25');
assert(evalCompLate.status === ActivityDeadlineStatus.COMPLETED_LATE, 'Completed late is CONCLUIDA_COM_ATRASO');

// 4. Managerial Metrics
console.log('\n4. Managerial Metrics Calculation');
const events: ProjectActivityEvent[] = [
  {
    id: 'e1',
    workspaceId: 'ws-1',
    activityId: 'act-1',
    eventType: 'CREATED',
    createdAt: new Date('2026-08-10T09:00:00Z').getTime()
  },
  {
    id: 'e2',
    workspaceId: 'ws-1',
    activityId: 'act-1',
    eventType: 'STARTED',
    fromStatus: 'A FAZER',
    toStatus: 'EM ANDAMENTO',
    createdAt: new Date('2026-08-10T10:00:00Z').getTime()
  },
  {
    id: 'e3',
    workspaceId: 'ws-1',
    activityId: 'act-1',
    eventType: 'BLOCKED',
    fromStatus: 'EM ANDAMENTO',
    toStatus: 'BLOQUEADA',
    details: 'Aguardando aprovação de material pelo cliente',
    createdAt: new Date('2026-08-12T10:00:00Z').getTime()
  },
  {
    id: 'e4',
    workspaceId: 'ws-1',
    activityId: 'act-1',
    eventType: 'RESUMED',
    fromStatus: 'BLOQUEADA',
    toStatus: 'EM ANDAMENTO',
    createdAt: new Date('2026-08-14T10:00:00Z').getTime()
  },
  {
    id: 'e5',
    workspaceId: 'ws-1',
    activityId: 'act-1',
    eventType: 'RESCHEDULED',
    metadata: { previousEndDate: '2026-08-20', newEndDate: '2026-08-25' },
    createdAt: new Date('2026-08-15T10:00:00Z').getTime()
  }
];

const rescheduledActivity: ProjectActivity = {
  ...baseActivity,
  deliveryDate: '2026-08-25',
  originalDeliveryDate: '2026-08-20',
  deadlineChangesCount: 1,
  actualStartDate: '2026-08-10'
};

const metrics = calculateActivityManagerialMetrics(rescheduledActivity, events, '2026-08-18');
assert(metrics.plannedDurationDays === 16, 'Planned duration from 2026-08-10 to 2026-08-25 is 16 days');
assert(metrics.leadTimeInProgressDays === 9, 'Lead time in progress from 2026-08-10 to 2026-08-18 is 9 days');
assert(metrics.deadlineChangesCount === 1, 'Quantity of reschedulings is 1');
assert(metrics.originalDeadlineDeviationDays !== null, 'Original deadline deviation is calculated');
assert(metrics.blockedDurationDays === 2, 'Blocked duration between 2026-08-12 and 2026-08-14 is 2 days');

// Completed metrics
const completedMetrics = calculateActivityManagerialMetrics(completedLateActivity, events, '2026-08-25');
assert(completedMetrics.leadTimeRealizedDays === 14, 'Realized lead time from 2026-08-10 to 2026-08-23 is 14 days');
assert(completedMetrics.updatedDeadlineDeviationDays === 3, 'Deviation vs updated deadline is +3 days');

// 5. Aggregate On-Time Delivery Overview
console.log('\n5. Aggregate Delivery Overview');
const overview = calculateActivitiesDeliveryOverview([
  completedOnTimeActivity,
  completedEarlyActivity,
  completedLateActivity,
  baseActivity
], '2026-08-18');

assert(overview.total === 4, 'Total activities is 4');
assert(overview.completed === 3, 'Completed count is 3');
assert(overview.completedOnTime === 2, 'Completed on time count is 2 (1 on time, 1 early)');
assert(overview.completedLate === 1, 'Completed late count is 1');
assert(overview.onTimeDeliveryRatePercent === 67, 'On time delivery rate is 67% (2 / 3)');

// 6. Event Payload Creation & Idempotency
console.log('\n6. Event Creation & Idempotency');
const payload = createActivityEventPayload(
  'ws-1',
  'act-1',
  'BLOCKED',
  { id: 'u1', username: 'Engenheiro Chefe' },
  { fromStatus: 'EM ANDAMENTO', toStatus: 'BLOQUEADA', details: 'Falta de cotação' }
);
assert(payload.eventType === 'BLOCKED', 'Event payload type is BLOCKED');
assert(payload.actorName === 'Engenheiro Chefe', 'Actor username is recorded');
assert(payload.details === 'Falta de cotação', 'Block reason recorded');

console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
if (failed > 0) {
  process.exit(1);
}
