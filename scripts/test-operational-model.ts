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
  createActivityEventPayload,
  getActivityStatusBadge,
  getActivityStatusTheme,
  getActivityGanttBarStyle,
  addCalendarDays,
  calculateRescheduledDates,
  calculateUnifiedKPIs,
  calculateProfessionalDeliveryMetrics,
  calculateWipOverview,
  formatKpiRateWithFraction,
  formatKpiLeadTimeDays,
  isActivityInPeriod
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

// 7. Visual Standard & Gantt Bar Styling
console.log('\n7. Visual Standard & Gantt Bar Styling');
const todoTheme = getActivityStatusTheme('A FAZER');
assert(todoTheme.canonical === ActivityCanonicalStatus.TO_DO, 'TO_DO canonical matches');
assert(todoTheme.label === 'A FAZER', 'TO_DO label is A FAZER');

const inProgTheme = getActivityStatusTheme('EM ANDAMENTO');
assert(inProgTheme.canonical === ActivityCanonicalStatus.IN_PROGRESS, 'IN_PROGRESS canonical matches');
assert(inProgTheme.label === 'EM ANDAMENTO', 'IN_PROGRESS label is EM ANDAMENTO');

const blockedTheme = getActivityStatusTheme('BLOQUEADA');
assert(blockedTheme.canonical === ActivityCanonicalStatus.BLOCKED, 'BLOCKED canonical matches');
assert(blockedTheme.label === 'BLOQUEADA', 'BLOCKED label is BLOQUEADA');
assert(blockedTheme.barStyle?.backgroundColor === '#78350F', 'BLOCKED background is #78350F');
assert(blockedTheme.barStyle?.borderColor === '#FBBF24', 'BLOCKED border is #FBBF24');
assert(blockedTheme.barStyle?.color === '#FFFFFF', 'BLOCKED text is #FFFFFF');
assert(blockedTheme.highlightColor === '#FDE68A', 'BLOCKED highlight is #FDE68A');

const completedTheme = getActivityStatusTheme('CONCLUÍDA');
assert(completedTheme.canonical === ActivityCanonicalStatus.COMPLETED, 'COMPLETED canonical matches');
assert(completedTheme.label === 'CONCLUÍDA', 'COMPLETED label is CONCLUÍDA');

// Gantt Bar Styles & Overdue double condition
const blockedNotOverdue = getActivityGanttBarStyle('BLOQUEADA', false);
assert(blockedNotOverdue.isBlocked === true, 'getActivityGanttBarStyle detects isBlocked true');
assert(blockedNotOverdue.isOverdue === false, 'getActivityGanttBarStyle detects isOverdue false');
assert(blockedNotOverdue.style.backgroundColor === '#78350F', 'Gantt bar backgroundColor is #78350F');

const blockedAndOverdue = getActivityGanttBarStyle('BLOQUEADA', true);
assert(blockedAndOverdue.isBlocked === true, 'Detects both blocked and overdue: isBlocked true');
assert(blockedAndOverdue.isOverdue === true, 'Detects both blocked and overdue: isOverdue true');
assert(blockedAndOverdue.style.backgroundColor === '#78350F', 'Preserves #78350F background when overdue');
assert(String(blockedAndOverdue.style.boxShadow).includes('#F43F5E'), 'Adds overdue warning shadow to blocked bar');

// Calendar Days Arithmetic Tests
assert(addCalendarDays('2026-10-15', 0) === '2026-10-15', 'addCalendarDays 0 days returns same date');
assert(addCalendarDays('2026-10-15', 5) === '2026-10-20', 'addCalendarDays forward 5 days');
assert(addCalendarDays('2026-10-15', -5) === '2026-10-10', 'addCalendarDays backward 5 days');
assert(addCalendarDays('2026-10-31', 1) === '2026-11-01', 'addCalendarDays crossing month boundary forward');
assert(addCalendarDays('2026-11-01', -1) === '2026-10-31', 'addCalendarDays crossing month boundary backward');
assert(addCalendarDays('2026-12-31', 1) === '2027-01-01', 'addCalendarDays crossing year boundary');
assert(addCalendarDays(null, 5) === null, 'addCalendarDays null input returns null');
assert(addCalendarDays('invalid-date', 3) === null, 'addCalendarDays invalid input returns null');

// Moving a 5-day activity preserves 5-day calendar duration across weekend
const initStart = '2026-10-14'; // Wednesday
const initEnd = '2026-10-18'; // Sunday (5 calendar days: 14, 15, 16, 17, 18)
assert(calculateCalendarDurationDays(initStart, initEnd) === 5, 'Initial duration is 5 calendar days');
const shiftedStart = addCalendarDays(initStart, 4); // Sunday 18
const shiftedEnd = addCalendarDays(initEnd, 4); // Thursday 22
assert(calculateCalendarDurationDays(shiftedStart, shiftedEnd) === 5, 'Shifted duration strictly preserves 5 calendar days');

// Reschedule Dates Logic Tests
// 1. Move mode
const moveRes = calculateRescheduledDates('move', '2026-10-10', '2026-10-14', 3);
assert(moveRes.newStartDate === '2026-10-13', 'Move mode updates start date');
assert(moveRes.newDeliveryDate === '2026-10-17', 'Move mode updates delivery date');
assert(calculateCalendarDurationDays(moveRes.newStartDate, moveRes.newDeliveryDate) === 5, 'Move mode strictly preserves duration');

// 2. Move clamped by project delivery boundary
const moveClampedEnd = calculateRescheduledDates('move', '2026-10-10', '2026-10-14', 10, '2026-10-01', '2026-10-20');
assert(moveClampedEnd.newDeliveryDate === '2026-10-20', 'Clamped to project delivery date');
assert(moveClampedEnd.newStartDate === '2026-10-16', 'Clamped move preserves 5 calendar days duration');
assert(moveClampedEnd.isClamped === true, 'Flagged as clamped');

// 3. Move clamped by project start boundary
const moveClampedStart = calculateRescheduledDates('move', '2026-10-10', '2026-10-14', -15, '2026-10-05', '2026-10-20');
assert(moveClampedStart.newStartDate === '2026-10-05', 'Clamped to project start date');
assert(moveClampedStart.newDeliveryDate === '2026-10-09', 'Clamped start preserves 5 calendar days duration');
assert(moveClampedStart.isClamped === true, 'Flagged as clamped');

// 4. Resize left (start date)
const resizeStartRes = calculateRescheduledDates('resize-start', '2026-10-10', '2026-10-14', -2);
assert(resizeStartRes.newStartDate === '2026-10-08', 'Resize left extends start date earlier');
assert(resizeStartRes.newDeliveryDate === '2026-10-14', 'Resize left preserves delivery date');

// 5. Resize left cannot invert past delivery date
const resizeStartInvert = calculateRescheduledDates('resize-start', '2026-10-10', '2026-10-14', 10);
assert(resizeStartInvert.newStartDate === '2026-10-14', 'Resize left cannot pass delivery date (clamped to 1 day minimum)');
assert(resizeStartInvert.newDeliveryDate === '2026-10-14', 'Delivery date intact');

// 6. Resize right (delivery date)
const resizeEndRes = calculateRescheduledDates('resize-end', '2026-10-10', '2026-10-14', 4);
assert(resizeEndRes.newStartDate === '2026-10-10', 'Resize right preserves start date');
assert(resizeEndRes.newDeliveryDate === '2026-10-18', 'Resize right extends delivery date');

// 7. Resize right cannot invert before start date
const resizeEndInvert = calculateRescheduledDates('resize-end', '2026-10-10', '2026-10-14', -10);
assert(resizeEndInvert.newStartDate === '2026-10-10', 'Start date intact');
assert(resizeEndInvert.newDeliveryDate === '2026-10-10', 'Resize right cannot precede start date (clamped to 1 day minimum)');

// 8. 1-day bar move
const oneDayMove = calculateRescheduledDates('move', '2026-10-15', '2026-10-15', 2);
assert(oneDayMove.newStartDate === '2026-10-17', '1-day bar moved start');
assert(oneDayMove.newDeliveryDate === '2026-10-17', '1-day bar moved end');
assert(calculateCalendarDurationDays(oneDayMove.newStartDate, oneDayMove.newDeliveryDate) === 1, '1-day duration preserved');

// 8. Unified KPI Engine, WIP and Professional Delivery
console.log('\n8. Unified KPI Engine, WIP and Delivery Metrics');

// Zero sample division safety
const emptyKpi = calculateUnifiedKPIs([], [], undefined, '2026-10-16');
assert(emptyKpi.completedCount === 0, 'Empty KPI completed count is 0');
assert(emptyKpi.originalDeliveryRatePercent === null, 'Empty KPI original rate is null (Dados insuficientes)');
assert(emptyKpi.updatedDeliveryRatePercent === null, 'Empty KPI updated rate is null (Dados insuficientes)');
assert(emptyKpi.averageDelayDaysCompletedLate === null, 'Empty KPI delay is null');
assert(emptyKpi.averageLeadTimeDaysCompleted === null, 'Empty KPI lead time is null');
assert(emptyKpi.canonicalWipCount === 0, 'Empty KPI WIP count is 0');
assert(emptyKpi.blockedCount === 0, 'Empty KPI blocked count is 0');

// Comprehensive activities sample
const sampleActivities: ProjectActivity[] = [
  // 1. Completed on original deadline
  {
    id: 'kpi-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    name: 'Atividade 1',
    status: ActivityCanonicalStatus.COMPLETED,
    startDate: '2026-10-01',
    actualStartDate: '2026-10-01',
    deliveryDate: '2026-10-10',
    originalDeliveryDate: '2026-10-10',
    actualEndDate: '2026-10-08', // 2 days ahead of original
    orderIndex: 1,
    deadlineChangesCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    assigneeId: 'user-a'
  },
  // 2. Completed late vs original, but ON TIME vs updated deadline
  {
    id: 'kpi-2',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    name: 'Atividade 2',
    status: ActivityCanonicalStatus.COMPLETED,
    startDate: '2026-10-01',
    actualStartDate: '2026-10-02',
    originalDeliveryDate: '2026-10-08',
    deliveryDate: '2026-10-15',
    actualEndDate: '2026-10-14', // late vs original (8), on time vs updated (15)
    orderIndex: 2,
    deadlineChangesCount: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    assigneeId: 'user-a'
  },
  // 3. Completed late vs updated deadline
  {
    id: 'kpi-3',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    name: 'Atividade 3',
    status: ActivityCanonicalStatus.COMPLETED,
    startDate: '2026-10-01',
    actualStartDate: '2026-10-01',
    originalDeliveryDate: '2026-10-10',
    deliveryDate: '2026-10-10',
    actualEndDate: '2026-10-16', // 6 days late
    orderIndex: 3,
    deadlineChangesCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    assigneeId: 'user-b'
  },
  // 4. In Progress (Canonical WIP)
  {
    id: 'kpi-4',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    name: 'Atividade 4 - Em Andamento',
    status: ActivityCanonicalStatus.IN_PROGRESS,
    startDate: '2026-10-10',
    actualStartDate: '2026-10-10',
    deliveryDate: '2026-10-20',
    orderIndex: 4,
    deadlineChangesCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    assigneeId: 'user-a'
  },
  // 5. Another In Progress for user-a (testing WIP limits)
  {
    id: 'kpi-5',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    name: 'Atividade 5 - Em Andamento',
    status: ActivityCanonicalStatus.IN_PROGRESS,
    startDate: '2026-10-12',
    actualStartDate: '2026-10-12',
    deliveryDate: '2026-10-22',
    orderIndex: 5,
    deadlineChangesCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    assigneeId: 'user-a'
  },
  // 6. Blocked (MUST NOT be in canonical WIP)
  {
    id: 'kpi-6',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    name: 'Atividade 6 - Bloqueada',
    status: ActivityCanonicalStatus.BLOCKED,
    blockedReason: 'Aguardando aprovação do cliente',
    startDate: '2026-10-10',
    deliveryDate: '2026-10-18',
    orderIndex: 6,
    deadlineChangesCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    assigneeId: 'user-a'
  },
  // 7. To Do (Open overdue)
  {
    id: 'kpi-7',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    name: 'Atividade 7 - A Fazer Atrasada',
    status: ActivityCanonicalStatus.TO_DO,
    startDate: '2026-10-01',
    deliveryDate: '2026-10-14', // overdue at 2026-10-16
    orderIndex: 7,
    deadlineChangesCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    assigneeId: 'user-b'
  }
];

const kpiResult = calculateUnifiedKPIs(sampleActivities, [], undefined, '2026-10-16');

// Delivery Indicators
assert(kpiResult.completedCount === 3, 'Calculates 3 completed activities');
assert(kpiResult.completedWithOriginalDeadlineCount === 3, 'All 3 completed have original deadline');
assert(kpiResult.completedOnOriginalDeadlineCount === 1, 'Only activity 1 met original deadline (1 / 3)');
assert(kpiResult.originalDeliveryRatePercent === 33, 'Original delivery compliance rate is 33% (1/3)');

assert(kpiResult.completedWithUpdatedDeadlineCount === 3, 'All 3 completed have updated deadline');
assert(kpiResult.completedOnUpdatedDeadlineCount === 2, 'Activities 1 and 2 met updated deadline (2 / 3)');
assert(kpiResult.updatedDeliveryRatePercent === 67, 'Updated delivery compliance rate is 67% (2/3)');

assert(kpiResult.delayedCompletedCount === 1, '1 activity completed with delay');
assert(kpiResult.averageDelayDaysCompletedLate === 6, 'Average delay of late completed is 6 days');

// Lead Time (act-1: Oct 1-8 = 8d; act-2: Oct 2-14 = 13d; act-3: Oct 1-16 = 16d) -> (8 + 13 + 16) / 3 = 37 / 3 = 12.3 days
assert(kpiResult.leadTimeSampleCount === 3, 'Lead time sample is 3');
assert(kpiResult.averageLeadTimeDaysCompleted === 12.3, 'Average lead time is 12.3 calendar days');

// Workflow & Strict WIP Isolation
assert(kpiResult.inProgressCount === 2, 'Canonical WIP is strictly 2 (only EM ANDAMENTO)');
assert(kpiResult.canonicalWipCount === 2, 'canonicalWipCount matches inProgressCount');
assert(kpiResult.blockedCount === 1, 'Blocked count is strictly 1 (separated from WIP)');
assert(kpiResult.toDoCount === 1, 'To-do count is 1');
assert(kpiResult.totalActivitiesCount === 7, 'Total activities considered is 7');

// Planning Reliability & Blockage
assert(kpiResult.rescheduledActivitiesCount === 1, '1 activity rescheduled');
assert(kpiResult.activeBlocksCount === 1, '1 active block');
assert(kpiResult.blockedReasonsDistribution['Aguardando aprovação do cliente'] === 1, 'Blocked reason tracked');

// Professional Delivery Metrics & Advisory WIP Limits
const testUsers = [
  { id: 'user-a', username: 'Engenheiro A' },
  { id: 'user-b', username: 'Engenheiro B' }
];

const profMetrics = calculateProfessionalDeliveryMetrics(
  sampleActivities,
  testUsers,
  undefined,
  '2026-10-16',
  { 'user-a': 1 } // user-a has advisory WIP limit of 1, but has 2 in progress
);

const profA = profMetrics.find(p => p.userId === 'user-a')!;
assert(profA !== undefined, 'Found metrics for user-a');
assert(profA.inProgressCount === 2, 'User A has 2 WIP');
assert(profA.blockedCount === 1, 'User A has 1 blocked');
assert(profA.completedInPeriodCount === 2, 'User A has 2 completed in period');
assert(profA.completedOnTimeCount === 2, 'User A completed 2 on time');
assert(profA.onTimeRatePercent === 100, 'User A on-time rate is 100%');
assert(profA.isWipLimitExceeded === true, 'User A WIP limit of 1 is exceeded (2 > 1)');

const profB = profMetrics.find(p => p.userId === 'user-b')!;
assert(profB !== undefined, 'Found metrics for user-b');
assert(profB.inProgressCount === 0, 'User B has 0 WIP');
assert(profB.overdueCount === 1, 'User B has 1 overdue open activity');
assert(profB.isWipLimitExceeded === false, 'User B WIP limit not exceeded');

// Global WIP Overview
const wipOverview = calculateWipOverview(
  sampleActivities,
  { 'user-a': 1, 'user-b': 3 },
  '2026-10-16'
);
assert(wipOverview.totalWip === 2, 'Global WIP overview totalWip is 2');
assert(wipOverview.totalBlocked === 1, 'Global WIP overview totalBlocked is 1');
assert(wipOverview.totalOverdue === 1, 'Global WIP overview totalOverdue is 1');
assert(wipOverview.exceededUsers.length === 1 && wipOverview.exceededUsers[0] === 'user-a', 'User A correctly identified as exceeded');

// Formatters
assert(formatKpiRateWithFraction(null) === 'Dados insuficientes', 'Null percent formats as Dados insuficientes');
assert(formatKpiRateWithFraction(80, 4, 5) === '80% (4/5)', 'Formats rate with fraction 80% (4/5)');
assert(formatKpiLeadTimeDays(null) === 'Dados insuficientes', 'Null lead time formats as Dados insuficientes');
assert(formatKpiLeadTimeDays(1) === '1 dia', '1 day lead time formats as 1 dia');
assert(formatKpiLeadTimeDays(5.4) === '5.4 dias', '5.4 days lead time formats as 5.4 dias');

// Period Filtering
assert(isActivityInPeriod(sampleActivities[0], { monthStr: '2026-10' }) === true, 'Activity in 2026-10 passes month filter');
assert(isActivityInPeriod(sampleActivities[0], { monthStr: '2026-09' }) === false, 'Activity in 2026-10 excluded from 2026-09 filter');

console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
if (failed > 0) {
  process.exit(1);
}

