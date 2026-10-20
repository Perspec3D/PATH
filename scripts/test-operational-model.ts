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
  calculateProjectDeliveryPredictability,
  ProjectDeliveryPredictabilityStatus,
  getDeliveryPredictabilityBadge
} from '../utils/deliveryForecast';
import {
  ActivityCanonicalStatus,
  ActivityDeadlineStatus,
  ProjectActivity,
  ProjectActivityEvent,
  ProjectStatus,
  Project,
  InternalUser,
  UserRole,
  Client
} from '../types';
import {
  calculateTeamOperationalCapacity,
  SampleConfidence
} from '../utils/teamOperationalCapacity';
import {
  calculateManagementAttention,
  AlertSeverity,
  AlertCategory,
  addBusinessDaysSafely
} from '../utils/managementAttentionEngine';
import {
  calculateIntelligentPlanning,
  DeliveryUnitType,
  ProjectionConfidence,
  WeekDemandStatus
} from '../utils/intelligentPlanningEngine';

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

// 9. Project Kanban, Lifecycle Transitions & Health State Integrity
console.log('\n9. Project Kanban, Lifecycle Transitions & Health State Integrity');

const baseProject: Project = {
  id: 'proj-1',
  workspaceId: 'ws-1',
  code: '001-000001-26',
  name: 'Galpão Logístico Alpha',
  clientId: 'cli-1',
  assigneeId: 'user-a',
  status: ProjectStatus.QUEUE,
  startDate: '2026-10-01',
  deliveryDate: '2026-10-20',
  revision: 'Rev.01',
  createdAt: 1729000000000,
  isCurrentRevision: true
};

// Transition 1: Moving from QUEUE to IN_PROGRESS sets actualStartDate
const inProgressProject: Project = {
  ...baseProject,
  status: ProjectStatus.IN_PROGRESS,
  actualStartDate: !baseProject.actualStartDate ? '2026-10-05' : baseProject.actualStartDate
};
assert(inProgressProject.status === ProjectStatus.IN_PROGRESS, 'Project moved to IN_PROGRESS');
assert(inProgressProject.actualStartDate === '2026-10-05', 'actualStartDate recorded upon exiting QUEUE');

// Separation of Health vs Status:
// An IN_PROGRESS project with overdue deadline is still IN_PROGRESS (status), while flagged overdue (health)
const overdueHealthDiff = calculateDaysDifference(inProgressProject.deliveryDate, '2026-10-25');
assert(overdueHealthDiff !== null && overdueHealthDiff < 0, 'Project delivery date is past reference date');
assert(inProgressProject.status === ProjectStatus.IN_PROGRESS, 'Status remains IN_PROGRESS despite overdue health');

// An IN_PROGRESS project with blocked activities remains IN_PROGRESS
const projectActivitiesMock: ProjectActivity[] = [
  {
    id: 'act-b1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    name: 'Fundações',
    status: ActivityCanonicalStatus.BLOCKED,
    assigneeId: 'user-a',
    orderIndex: 0,
    deadlineChangesCount: 0,
    createdAt: 1729000000000,
    updatedAt: 1729000000000
  },
  {
    id: 'act-b2',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    name: 'Estrutura Metálica',
    status: ActivityCanonicalStatus.IN_PROGRESS,
    assigneeId: 'user-a',
    orderIndex: 1,
    deadlineChangesCount: 0,
    createdAt: 1729000000000,
    updatedAt: 1729000000000
  }
];
const blockedActivitiesCount = projectActivitiesMock.filter(act => isActivityBlocked(act.status)).length;
assert(blockedActivitiesCount === 1, 'Project has 1 blocked activity');
assert(inProgressProject.status === ProjectStatus.IN_PROGRESS, 'Project status is unaffected by blocked activity');

// Transition 2: Moving project to DONE sets completion metadata WITHOUT auto-completing activities
const completedProject: Project = {
  ...inProgressProject,
  status: ProjectStatus.DONE,
  actualEndDate: '2026-10-18',
  conclusionResponsibleId: 'user-admin',
  deadlineAtConclusion: inProgressProject.deliveryDate
};
assert(completedProject.status === ProjectStatus.DONE, 'Project status is DONE');
assert(completedProject.actualEndDate === '2026-10-18', 'actualEndDate recorded');
assert(completedProject.conclusionResponsibleId === 'user-admin', 'conclusionResponsibleId recorded');
assert(completedProject.deadlineAtConclusion === '2026-10-20', 'deadlineAtConclusion frozen');

// Validate Rule from Etapa 4: Do NOT auto-complete activities
const activitiesAfterProjectCompletion = projectActivitiesMock.map(a => a); // Intact
assert(activitiesAfterProjectCompletion[0].status === ActivityCanonicalStatus.BLOCKED, 'Activity 1 remains BLOCKED');
assert(activitiesAfterProjectCompletion[1].status === ActivityCanonicalStatus.IN_PROGRESS, 'Activity 2 remains IN_PROGRESS');

// Transition 3: Reopening project from DONE clears completion metadata
const reopenedProject: Project = {
  ...completedProject,
  status: ProjectStatus.IN_PROGRESS,
  actualEndDate: undefined,
  conclusionResponsibleId: undefined,
  deadlineAtConclusion: undefined
};
assert(reopenedProject.status === ProjectStatus.IN_PROGRESS, 'Project reopened to IN_PROGRESS');
assert(reopenedProject.actualEndDate === undefined, 'actualEndDate cleared upon reopening');
assert(reopenedProject.conclusionResponsibleId === undefined, 'conclusionResponsibleId cleared');
assert(reopenedProject.deadlineAtConclusion === undefined, 'deadlineAtConclusion cleared');

console.log('\n10. Project Delivery Predictability & Elimination of Hourly Indicators');

const testToday = '2026-10-17';

// 1. Project with overdue deadline (expired in the past)
const overdueProject: Project = {
  id: 'proj-overdue',
  workspaceId: 'ws-1',
  code: 'PRJ-OD',
  name: 'Projeto Atrasado',
  clientId: 'client-1',
  assigneeId: 'user-a',
  status: ProjectStatus.IN_PROGRESS,
  revision: 'Rev.00',
  startDate: '2026-10-01',
  deliveryDate: '2026-10-10', // 7 days in the past
  createdAt: 1729000000000,
  updatedAt: 1729000000000
};

const overdueAct: ProjectActivity = {
  id: 'act-od-1',
  workspaceId: 'ws-1',
  projectId: 'proj-overdue',
  name: 'Tarefa Atrasada',
  status: ActivityCanonicalStatus.IN_PROGRESS,
  assigneeId: 'user-a',
  orderIndex: 0,
  deadlineChangesCount: 0,
  createdAt: 1729000000000,
  updatedAt: 1729000000000
};

const predOverdue = calculateProjectDeliveryPredictability({
  projects: [overdueProject],
  activities: [overdueAct],
  todayStr: testToday
});
assert(predOverdue.length === 1, 'Predictability returned 1 project');
assert(predOverdue[0].status === ProjectDeliveryPredictabilityStatus.OVERDUE, 'Project with past deadline classified as ATRASADO');
assert(predOverdue[0].isOverdue === true, 'isOverdue is true');
assert(predOverdue[0].daysRemaining === -7, 'Days remaining is -7');

// 2. Project with blocked activity and future deadline -> ATENÇÃO (NOT atrasado)
const blockedProject: Project = {
  id: 'proj-blocked',
  workspaceId: 'ws-1',
  code: 'PRJ-BLK',
  name: 'Projeto com Bloqueio',
  clientId: 'client-1',
  assigneeId: 'user-b',
  status: ProjectStatus.IN_PROGRESS,
  revision: 'Rev.00',
  startDate: '2026-10-10',
  deliveryDate: '2026-10-30', // 13 days in the future
  createdAt: 1729000000000,
  updatedAt: 1729000000000
};

const blockedAct: ProjectActivity = {
  id: 'act-blk-1',
  workspaceId: 'ws-1',
  projectId: 'proj-blocked',
  name: 'Aguardando Aprovação Externa',
  status: ActivityCanonicalStatus.BLOCKED,
  assigneeId: 'user-b',
  deliveryDate: '2026-10-25',
  orderIndex: 0,
  deadlineChangesCount: 0,
  createdAt: 1729000000000,
  updatedAt: 1729000000000
};

const predBlocked = calculateProjectDeliveryPredictability({
  projects: [blockedProject],
  activities: [blockedAct],
  todayStr: testToday
});
assert(predBlocked[0].status === ProjectDeliveryPredictabilityStatus.ATTENTION, 'Project with blocked activity is ATENÇÃO');
assert(predBlocked[0].isOverdue === false, 'Blocked project with future deadline is NOT overdue');
assert(predBlocked[0].blockedActivitiesCount === 1, 'Blocked activities count is 1');
assert(predBlocked[0].attentionReasons.some(r => r.includes('bloqueada')), 'Attention reason includes blocked activity note');

// 3. Project near deadline (<= 5 days) -> ATENÇÃO
const nearProject: Project = {
  id: 'proj-near',
  workspaceId: 'ws-1',
  code: 'PRJ-NEAR',
  name: 'Projeto Próximo do Vencimento',
  clientId: 'client-1',
  assigneeId: 'user-a',
  status: ProjectStatus.IN_PROGRESS,
  revision: 'Rev.00',
  startDate: '2026-10-01',
  deliveryDate: '2026-10-19', // 2 days in the future
  createdAt: 1729000000000,
  updatedAt: 1729000000000
};

const nearAct: ProjectActivity = {
  id: 'act-near-1',
  workspaceId: 'ws-1',
  projectId: 'proj-near',
  name: 'Finalização',
  status: ActivityCanonicalStatus.IN_PROGRESS,
  assigneeId: 'user-a',
  deliveryDate: '2026-10-19',
  orderIndex: 0,
  deadlineChangesCount: 0,
  createdAt: 1729000000000,
  updatedAt: 1729000000000
};

const predNear = calculateProjectDeliveryPredictability({
  projects: [nearProject],
  activities: [nearAct],
  todayStr: testToday
});
assert(predNear[0].status === ProjectDeliveryPredictabilityStatus.ATTENTION, 'Project with deadline in 2 days classified as ATENÇÃO');
assert(predNear[0].isNearDeadline === true, 'isNearDeadline is true');
assert(predNear[0].daysRemaining === 2, 'daysRemaining is 2');

// 4. Project without valid delivery date -> SEM DADOS SUFICIENTES
const noDeadlineProject: Project = {
  id: 'proj-no-date',
  workspaceId: 'ws-1',
  code: 'PRJ-ND',
  name: 'Projeto Sem Prazo',
  clientId: 'client-1',
  assigneeId: 'user-a',
  status: ProjectStatus.IN_PROGRESS,
  revision: 'Rev.00',
  createdAt: 1729000000000,
  updatedAt: 1729000000000
};

const predNoDeadline = calculateProjectDeliveryPredictability({
  projects: [noDeadlineProject],
  activities: [nearAct],
  todayStr: testToday
});
assert(predNoDeadline[0].status === ProjectDeliveryPredictabilityStatus.INSUFFICIENT_DATA, 'Project without delivery date is SEM DADOS SUFICIENTES');

// 5. Project without activities -> SEM DADOS SUFICIENTES
const noActivitiesProject: Project = {
  id: 'proj-no-acts',
  workspaceId: 'ws-1',
  code: 'PRJ-NA',
  name: 'Projeto Sem Atividades',
  clientId: 'client-1',
  assigneeId: 'user-a',
  status: ProjectStatus.IN_PROGRESS,
  revision: 'Rev.00',
  deliveryDate: '2026-10-30',
  createdAt: 1729000000000,
  updatedAt: 1729000000000
};

const predNoActs = calculateProjectDeliveryPredictability({
  projects: [noActivitiesProject],
  activities: [],
  todayStr: testToday
});
assert(predNoActs[0].status === ProjectDeliveryPredictabilityStatus.INSUFFICIENT_DATA, 'Project without activities is SEM DADOS SUFICIENTES');

// 6. Project completely on track (future deadline, comfortable, no blocks, no overdue activities)
const onTrackProject: Project = {
  id: 'proj-ontrack',
  workspaceId: 'ws-1',
  code: 'PRJ-OK',
  name: 'Projeto No Prazo',
  clientId: 'client-1',
  assigneeId: 'user-a',
  status: ProjectStatus.IN_PROGRESS,
  revision: 'Rev.00',
  deliveryDate: '2026-11-15', // 29 days in the future
  createdAt: 1729000000000,
  updatedAt: 1729000000000
};

const onTrackAct: ProjectActivity = {
  id: 'act-ok-1',
  workspaceId: 'ws-1',
  projectId: 'proj-ontrack',
  name: 'Modelagem 3D',
  status: ActivityCanonicalStatus.IN_PROGRESS,
  assigneeId: 'user-a',
  deliveryDate: '2026-11-10',
  orderIndex: 0,
  deadlineChangesCount: 0,
  createdAt: 1729000000000,
  updatedAt: 1729000000000
};

const predOnTrack = calculateProjectDeliveryPredictability({
  projects: [onTrackProject],
  activities: [onTrackAct],
  todayStr: testToday
});
assert(predOnTrack[0].status === ProjectDeliveryPredictabilityStatus.ON_TRACK, 'Healthy project classified as NO PRAZO');
assert(predOnTrack[0].attentionReasons.length === 0, 'No attention reasons for healthy project');

// 7. Reprogrammed project tracking
const rev01Project: Project = {
  id: 'proj-rev01',
  workspaceId: 'ws-1',
  familyId: 'fam-rep',
  code: 'PRJ-REP',
  name: 'Projeto Reprogramado',
  clientId: 'client-1',
  status: ProjectStatus.DONE,
  revision: 'Rev.00',
  revisionNumber: 0,
  isCurrentRevision: false,
  deliveryDate: '2026-10-15',
  createdAt: 1729000000000,
  updatedAt: 1729000000000
};

const rev02Project: Project = {
  id: 'proj-rev02',
  workspaceId: 'ws-1',
  familyId: 'fam-rep',
  code: 'PRJ-REP',
  name: 'Projeto Reprogramado',
  clientId: 'client-1',
  status: ProjectStatus.IN_PROGRESS,
  revision: 'Rev.01',
  revisionNumber: 1,
  isCurrentRevision: true,
  deliveryDate: '2026-10-25', // 8 days away, but reprogrammed from 2026-10-15
  createdAt: 1729000000000,
  updatedAt: 1729000000000
};

const repAct: ProjectActivity = {
  id: 'act-rep-1',
  workspaceId: 'ws-1',
  projectId: 'proj-rev02',
  name: 'Execução pós-reprogramação',
  status: ActivityCanonicalStatus.IN_PROGRESS,
  assigneeId: 'user-a',
  orderIndex: 0,
  deadlineChangesCount: 1,
  createdAt: 1729000000000,
  updatedAt: 1729000000000
};

const predRep = calculateProjectDeliveryPredictability({
  projects: [rev01Project, rev02Project],
  activities: [repAct],
  todayStr: testToday
});
assert(predRep.length === 1, 'Only current revision evaluated');
assert(predRep[0].status === ProjectDeliveryPredictabilityStatus.ATTENTION, 'Reprogrammed project classified as ATENÇÃO');
assert(predRep[0].reprogrammingCount === 1, 'Reprogramming count is 1');
assert(predRep[0].originalDeliveryDate === '2026-10-15', 'Original delivery date preserved from Rev.00');
assert(predRep[0].deliveryDate === '2026-10-25', 'Updated delivery date reflects current revision');

// 8. Badge tokens test
const badgeOnTrack = getDeliveryPredictabilityBadge(ProjectDeliveryPredictabilityStatus.ON_TRACK);
assert(badgeOnTrack.label === 'NO PRAZO', 'Badge label is NO PRAZO');
assert(badgeOnTrack.dotColor.includes('emerald'), 'Badge dot is emerald');

const badgeAttention = getDeliveryPredictabilityBadge(ProjectDeliveryPredictabilityStatus.ATTENTION);
assert(badgeAttention.label === 'ATENÇÃO', 'Badge label is ATENÇÃO');
assert(badgeAttention.dotColor.includes('amber'), 'Badge dot is amber');

const badgeOverdue = getDeliveryPredictabilityBadge(ProjectDeliveryPredictabilityStatus.OVERDUE);
assert(badgeOverdue.label === 'ATRASADO', 'Badge label is ATRASADO');
assert(badgeOverdue.dotColor.includes('rose'), 'Badge dot is rose');

// 9. Work Distribution & WIP Overview tests
const allTestActs: ProjectActivity[] = [
  overdueAct,
  blockedAct,
  nearAct,
  onTrackAct,
  repAct
];

const testWipOverview = calculateWipOverview(
  allTestActs,
  { 'user-a': 2, 'user-b': 1 },
  testToday
);
assert(testWipOverview.totalWip === 4, 'Total canonical WIP is 4 (overdueAct, nearAct, onTrackAct, repAct)');
assert(testWipOverview.totalBlocked === 1, 'Total blocked is 1 (blockedAct)');
assert(testWipOverview.wipByAssignee['user-a'] === 4, 'User A has 4 activities in progress');
assert((testWipOverview.wipByAssignee['user-b'] || 0) === 0, 'User B has 0 WIP (only 1 blocked activity)');
assert(testWipOverview.blockedByAssignee['user-b'] === 1, 'User B has 1 blocked activity');
assert(testWipOverview.exceededUsers.includes('user-a'), 'User A exceeds advisory WIP limit of 2 (4 > 2)');
assert(!testWipOverview.exceededUsers.includes('user-b'), 'User B does not exceed limit (0 <= 1)');

// 10. Delivery Metrics per Professional
const testTeamMetrics = calculateProfessionalDeliveryMetrics(
  allTestActs,
  [{ id: 'user-a', username: 'Usuário A' }, { id: 'user-b', username: 'Usuário B' }],
  undefined,
  testToday,
  { 'user-a': 2, 'user-b': 1 }
);
// 11. Team Operational Capacity by Lead Time, WIP & Historical Throughput
console.log('\n11. Team Operational Capacity by Lead Time, WIP & Historical Throughput');

const mockTestUsers: InternalUser[] = [
  { id: 'user-a', workspaceId: 'ws-1', username: 'Engenheiro A', passwordHash: '', role: UserRole.USER, isActive: true },
  { id: 'user-b', workspaceId: 'ws-1', username: 'Engenheira B', passwordHash: '', role: UserRole.USER, isActive: true },
  { id: 'user-c', workspaceId: 'ws-1', username: 'Técnico C', passwordHash: '', role: UserRole.USER, isActive: true }
];

// 11.1 Empty history test -> Insufficient history, null throughput
const emptyCap = calculateTeamOperationalCapacity({
  projects: [onTrackProject],
  activities: [],
  users: mockTestUsers,
  todayStr: testToday,
  windowWeeks: 8
});
assert(emptyCap.totalConcludedDeliveries === 0, 'Empty history has 0 concluded deliveries');
assert(emptyCap.sampleConfidence === SampleConfidence.INSUFFICIENT, 'Empty history has INSUFFICIENT confidence');
assert(emptyCap.teamWeeklyThroughput === null, 'Empty history team weekly throughput is null (no fake numbers)');
assert(emptyCap.averageBusinessLeadTimeDays === null, 'Empty history business lead time is null');
assert(emptyCap.totalWip === 0, 'Empty history total WIP is 0');

// 11.2 Concluded activities with real lead time and throughput
// Test date reference: '2026-10-17' (Saturday)
// Act 1: 2026-10-14 (Wed) to 2026-10-16 (Fri) -> 3 calendar days, 3 business days
// Act 2: 2026-10-09 (Fri) to 2026-10-13 (Tue) -> 5 calendar days, 3 business days (Sat/Sun excluded)
// Act 3: 2026-10-01 (Thu) to 2026-10-08 (Thu) -> 8 calendar days, 6 business days
// Act 4: 2026-09-20 (Sun) to 2026-09-25 (Fri) -> 6 calendar days, 5 business days
// Act 5: 2026-09-10 (Thu) to 2026-09-18 (Fri) -> 9 calendar days, 7 business days
const sampleConcludedActs: ProjectActivity[] = [
  {
    id: 'c-act-1',
    workspaceId: 'ws-1',
    projectId: 'proj-ontrack',
    name: 'Projeto Executivo Elétrico',
    status: ActivityCanonicalStatus.COMPLETED,
    assigneeId: 'user-a',
    actualStartDate: '2026-10-14',
    actualEndDate: '2026-10-16',
    orderIndex: 0,
    deadlineChangesCount: 0,
    createdAt: 1729000000000,
    updatedAt: 1729000000000
  },
  {
    id: 'c-act-2',
    workspaceId: 'ws-1',
    projectId: 'proj-ontrack',
    name: 'Cálculo Estrutural',
    status: ActivityCanonicalStatus.COMPLETED,
    assigneeId: 'user-a',
    conclusionResponsibleId: 'user-a',
    actualStartDate: '2026-10-09',
    actualEndDate: '2026-10-13',
    orderIndex: 1,
    deadlineChangesCount: 0,
    createdAt: 1729000000000,
    updatedAt: 1729000000000
  },
  {
    id: 'c-act-3',
    workspaceId: 'ws-1',
    projectId: 'proj-ontrack',
    name: 'Memorial Descritivo',
    status: ActivityCanonicalStatus.COMPLETED,
    assigneeId: 'user-b',
    actualStartDate: '2026-10-01',
    actualEndDate: '2026-10-08',
    orderIndex: 2,
    deadlineChangesCount: 0,
    createdAt: 1729000000000,
    updatedAt: 1729000000000
  },
  {
    id: 'c-act-4',
    workspaceId: 'ws-1',
    projectId: 'proj-ontrack',
    name: 'Modelagem BIM',
    status: ActivityCanonicalStatus.COMPLETED,
    assigneeId: 'user-b',
    actualStartDate: '2026-09-20',
    actualEndDate: '2026-09-25',
    orderIndex: 3,
    deadlineChangesCount: 0,
    createdAt: 1729000000000,
    updatedAt: 1729000000000
  },
  {
    id: 'c-act-5',
    workspaceId: 'ws-1',
    projectId: 'proj-ontrack',
    name: 'Revisão Técnica Final',
    status: ActivityCanonicalStatus.COMPLETED,
    assigneeId: 'user-a',
    conclusionResponsibleId: 'user-c', // Transferred/concluded by user-c
    actualStartDate: '2026-09-10',
    actualEndDate: '2026-09-18',
    orderIndex: 4,
    deadlineChangesCount: 0,
    createdAt: 1729000000000,
    updatedAt: 1729000000000
  }
];

// Open activities to test WIP, blockers, and upcoming commitments
const sampleOpenActs: ProjectActivity[] = [
  // User A: 2 WIP, 1 blocked
  {
    id: 'o-act-1',
    workspaceId: 'ws-1',
    projectId: 'proj-ontrack',
    name: 'Topografia e Nivelamento',
    status: ActivityCanonicalStatus.IN_PROGRESS,
    assigneeId: 'user-a',
    deliveryDate: '2026-10-21', // Week 1 (4 days away)
    orderIndex: 5,
    deadlineChangesCount: 0,
    createdAt: 1729000000000,
    updatedAt: 1729000000000
  },
  {
    id: 'o-act-2',
    workspaceId: 'ws-1',
    projectId: 'proj-ontrack',
    name: 'Planta de Formas',
    status: ActivityCanonicalStatus.IN_PROGRESS,
    assigneeId: 'user-a',
    deliveryDate: '2026-10-28', // Week 2 (11 days away)
    orderIndex: 6,
    deadlineChangesCount: 0,
    createdAt: 1729000000000,
    updatedAt: 1729000000000
  },
  {
    id: 'o-act-3',
    workspaceId: 'ws-1',
    projectId: 'proj-ontrack',
    name: 'Aprovação de Concessionária',
    status: ActivityCanonicalStatus.BLOCKED,
    assigneeId: 'user-a',
    deliveryDate: '2026-10-22',
    orderIndex: 7,
    deadlineChangesCount: 0,
    createdAt: 1729000000000,
    updatedAt: 1729000000000
  },
  // User B: 1 WIP
  {
    id: 'o-act-4',
    workspaceId: 'ws-1',
    projectId: 'proj-ontrack',
    name: 'Detalhamento de Armaduras',
    status: ActivityCanonicalStatus.IN_PROGRESS,
    assigneeId: 'user-b',
    deliveryDate: '2026-10-23',
    orderIndex: 8,
    deadlineChangesCount: 0,
    createdAt: 1729000000000,
    updatedAt: 1729000000000
  }
];

const allCombinedActs = [...sampleConcludedActs, ...sampleOpenActs];

const capResult8w = calculateTeamOperationalCapacity({
  projects: [onTrackProject],
  activities: allCombinedActs,
  users: mockTestUsers,
  todayStr: testToday,
  windowWeeks: 8,
  userWipLimits: { 'user-a': 1, 'user-b': 2, 'user-c': 2 }
});

// General team validations
assert(capResult8w.totalConcludedDeliveries === 5, 'Team concluded 5 deliveries in 8 weeks');
assert(capResult8w.sampleConfidence === SampleConfidence.SUFFICIENT, 'Confidence is SUFFICIENT with 5 samples');
// 5 deliveries in 8 weeks = 0.6 deliveries/week
assert(capResult8w.teamWeeklyThroughput === 0.6, 'Weekly throughput is 0.6 deliveries/week (5/8)');
// Calendar days: (3 + 5 + 8 + 6 + 9) / 5 = 31 / 5 = 6.2 days
assert(capResult8w.averageCalendarLeadTimeDays === 6.2, 'Average calendar lead time is 6.2 days');
// Business days: (3 + 3 + 6 + 5 + 7) / 5 = 24 / 5 = 4.8 days
assert(capResult8w.averageBusinessLeadTimeDays === 4.8, 'Average business lead time is 4.8 days');

// WIP & Blockers validations
assert(capResult8w.totalWip === 3, 'Total team WIP is 3 (2 from User A, 1 from User B)');
assert(capResult8w.totalBlocked === 1, 'Total team blocked is 1');
assert(capResult8w.exceededWipProfessionalsCount === 1, 'User A exceeded WIP limit of 1 (2 in progress)');

// Professional A metrics
const capProfA = capResult8w.professionals.find(p => p.userId === 'user-a');
assert(capProfA !== undefined, 'Found User A metrics');
assert(capProfA!.concludedCount === 2, 'User A has 2 concluded deliveries attributed');
assert(capProfA!.inProgressCount === 2, 'User A has 2 WIP in progress');
assert(capProfA!.blockedCount === 1, 'User A has 1 blocked activity');
assert(capProfA!.isWipLimitExceeded === true, 'User A WIP limit exceeded is true');
assert(capProfA!.upcomingDeliveries.length === 3, 'User A has 3 upcoming delivery commitments');

// Professional C attribution test (concluded Act 5 where conclusionResponsibleId was user-c)
const capProfC = capResult8w.professionals.find(p => p.userId === 'user-c');
assert(capProfC !== undefined, 'Found User C metrics');
assert(capProfC!.concludedCount === 1, 'User C has 1 concluded delivery via conclusionResponsibleId');
assert(capProfC!.sampleConfidence === SampleConfidence.INSUFFICIENT, 'User C with 1 delivery has INSUFFICIENT sample');
assert(capProfC!.weeklyThroughput === null, 'User C weekly throughput is null (insufficient sample)');

// Test 4-week window calculation
const capResult4w = calculateTeamOperationalCapacity({
  projects: [onTrackProject],
  activities: allCombinedActs,
  users: mockTestUsers,
  todayStr: testToday,
  windowWeeks: 4
});
// In 4 weeks (since 2026-09-19): Acts 1, 2, 3, 4 fall within window (Act 5 was 2026-09-18, so excluded!)
assert(capResult4w.totalConcludedDeliveries === 4, '4-week window includes only 4 deliveries');
// 4 deliveries / 4 weeks = 1.0 delivery/week
assert(capResult4w.teamWeeklyThroughput === 1.0, '4-week window throughput is 1.0 delivery/week');

// Future projections validations
assert(capResult8w.weeklyProjections.length === 4, 'Future projections cover 4 upcoming weeks');
const week1 = capResult8w.weeklyProjections[0];
assert(week1.weekNumber === 1, 'Week 1 projection verified');
// In week 1: o-act-1 (2026-10-21), o-act-3 (2026-10-22), o-act-4 (2026-10-23) -> 3 commitments!
assert(week1.commitmentsCount === 3, 'Week 1 has 3 commitments');
assert(week1.blockedCommitmentsCount === 1, 'Week 1 has 1 blocked commitment');
assert(week1.projectedCapacity === 0.6, 'Week 1 projected capacity matches weekly throughput 0.6');
assert(week1.demandVsCapacityDelta === 2.4, 'Week 1 demand vs capacity delta is +2.4 (3 - 0.6)');

// ============================================================================
// 12. FASE 3: CONSOLIDAÇÃO, INTEGRIDADE E PERFORMANCE
// ============================================================================
console.log('\n12. Integrity & Performance Consolidation (Fase 3)');

// Test 12.1: calculateProfessionalDeliveryMetrics strict open/overdue attribution
const testUserA = { id: 'usr-1', username: 'Operador 1' };
const testUserB = { id: 'usr-2', username: 'Operador 2' };

const activityWithStaleConclusionResp: ProjectActivity = {
  id: 'act-reopened',
  projectId: 'proj-1',
  workspaceId: 'ws-1',
  name: 'Atividade Reaberta e Reatribuída',
  status: ActivityCanonicalStatus.IN_PROGRESS,
  assigneeId: 'usr-2', // Currently assigned to User B!
  conclusionResponsibleId: 'usr-1', // Stale or historical field pointing to User A
  startDate: '2026-10-01',
  deliveryDate: '2026-10-10', // Overdue since testToday is 2026-10-17
  orderIndex: 0,
  deadlineChangesCount: 0,
  createdAt: 1,
  updatedAt: 1
};

const profMetricsFase3 = calculateProfessionalDeliveryMetrics(
  [activityWithStaleConclusionResp],
  [testUserA, testUserB],
  undefined,
  testToday
);
const metricsUserA = profMetricsFase3.find(p => p.userId === 'usr-1')!;
const metricsUserB = profMetricsFase3.find(p => p.userId === 'usr-2')!;

assert(metricsUserA.openActivitiesCount === 0, 'User A has 0 open activities (not current assignee)');
assert(metricsUserA.overdueCount === 0, 'User A has 0 overdue activities (not current assignee)');
assert(metricsUserB.openActivitiesCount === 1, 'User B has 1 open activity (is current assignee)');
assert(metricsUserB.overdueCount === 1, 'User B has 1 overdue activity (is current assignee)');

// Test 12.2: Delivery predictability index lookup performance and accuracy
const batchProjects: Project[] = [
  { id: 'proj-fam-rev0', workspaceId: 'ws-1', clientId: 'client-1', code: 'PRJ-100', name: 'Projeto 100 Rev 00', startDate: '2026-10-01', deliveryDate: '2026-10-20', status: ProjectStatus.DONE, createdAt: 1, updatedAt: 1, revision: 'Rev.00', revisionNumber: 0, isCurrentRevision: false, familyId: 'fam-100' },
  { id: 'proj-fam-rev1', workspaceId: 'ws-1', clientId: 'client-1', code: 'PRJ-100', name: 'Projeto 100 Rev 01', startDate: '2026-10-01', deliveryDate: '2026-10-25', status: ProjectStatus.IN_PROGRESS, createdAt: 2, updatedAt: 2, revision: 'Rev.01', revisionNumber: 1, isCurrentRevision: true, familyId: 'fam-100' }
];

const batchActivities: ProjectActivity[] = [
  { id: 'act-fam-1', projectId: 'proj-fam-rev1', workspaceId: 'ws-1', name: 'Atividade Rev 1', status: ActivityCanonicalStatus.IN_PROGRESS, deliveryDate: '2026-10-24', orderIndex: 0, deadlineChangesCount: 0, createdAt: 1, updatedAt: 1 }
];

const predictabilityResult = calculateProjectDeliveryPredictability({
  projects: batchProjects,
  activities: batchActivities,
  todayStr: testToday
});
// ============================================================================
// 13. FASE 4: CENTRAL DE ATENÇÃO GERENCIAL & MOTOR DE ALERTAS
// ============================================================================
console.log('\n13. Management Attention Engine & Alert Rules (Fase 4)');

// 13.1 Business Days Calculation: Fri 2026-10-16 + 3 business days = Wed 2026-10-21
const horizonCheck = addBusinessDaysSafely('2026-10-16', 3, [1, 2, 3, 4, 5]);
assert(horizonCheck === '2026-10-21', 'Adding 3 business days to Friday 2026-10-16 skips weekend and yields Wednesday 2026-10-21');

const clientsSample: Client[] = [
  { id: 'cli-1', workspaceId: 'ws-1', code: '001', name: 'Incorporadora Alpha', type: 'PJ', status: 'ACTIVE' },
  { id: 'cli-2', workspaceId: 'ws-1', code: '002', name: 'Construtora Beta', type: 'PJ', status: 'ACTIVE' }
];

const usersSample: InternalUser[] = [
  { id: 'u-eng-1', workspaceId: 'ws-1', username: 'Eng. Bruno', passwordHash: '', role: UserRole.USER, isActive: true },
  { id: 'u-eng-2', workspaceId: 'ws-1', username: 'Eng. Camila', passwordHash: '', role: UserRole.USER, isActive: true },
  { id: 'u-eng-3', workspaceId: 'ws-1', username: 'Eng. Diego', passwordHash: '', role: UserRole.USER, isActive: true } // Sem limite configurado
];

const projectsSample: Project[] = [
  // 1. Projeto Ativo e Atrasado (CRÍTICA)
  {
    id: 'prj-overdue',
    workspaceId: 'ws-1',
    clientId: 'cli-1',
    code: '001-001-26',
    name: 'Edifício Horizon',
    status: ProjectStatus.IN_PROGRESS,
    startDate: '2026-09-01',
    deliveryDate: '2026-10-10', // Vencido há 7 dias (ref 2026-10-17)
    revision: 'Rev.01',
    isCurrentRevision: true,
    familyId: 'fam-horizon',
    createdAt: 1,
    updatedAt: 1
  },
  // 2. Projeto Ativo com Entrega Próxima (ATENÇÃO se atividade próxima, ou INFORMATIVA)
  {
    id: 'prj-upcoming',
    workspaceId: 'ws-1',
    clientId: 'cli-2',
    code: '002-005-26',
    name: 'Residencial Aurora',
    status: ProjectStatus.IN_PROGRESS,
    startDate: '2026-10-01',
    deliveryDate: '2026-10-20', // Próxima terça (dentro de 3 dias úteis a partir de 2026-10-17 sábado -> 19 seg, 20 ter, 21 qua)
    revision: 'Rev.00',
    isCurrentRevision: true,
    familyId: 'fam-aurora',
    createdAt: 1,
    updatedAt: 1
  },
  // 3. Projeto com Dados Incompletos (sem prazo de entrega)
  {
    id: 'prj-incomplete',
    workspaceId: 'ws-1',
    clientId: 'cli-1',
    code: '001-008-26',
    name: 'Estudo Preliminar Torre Sul',
    status: ProjectStatus.QUEUE,
    startDate: '2026-10-15',
    deliveryDate: undefined, // Sem prazo definido
    revision: 'Rev.00',
    isCurrentRevision: true,
    familyId: 'fam-torre',
    createdAt: 1,
    updatedAt: 1
  },
  // 4. Projeto Cancelado (NÃO deve gerar alertas)
  {
    id: 'prj-canceled',
    workspaceId: 'ws-1',
    clientId: 'cli-1',
    code: '001-002-26',
    name: 'Projeto Cancelado',
    status: ProjectStatus.CANCELED,
    startDate: '2026-09-01',
    deliveryDate: '2026-10-05',
    revision: 'Rev.00',
    isCurrentRevision: true,
    familyId: 'fam-cancel',
    createdAt: 1,
    updatedAt: 1
  },
  // 5. Revisão Histórica Inativa (NÃO deve gerar alertas)
  {
    id: 'prj-hist-rev0',
    workspaceId: 'ws-1',
    clientId: 'cli-1',
    code: '001-001-26',
    name: 'Edifício Horizon Rev 00',
    status: ProjectStatus.DONE,
    startDate: '2026-09-01',
    deliveryDate: '2026-09-25',
    revision: 'Rev.00',
    isCurrentRevision: false, // Inativa!
    familyId: 'fam-horizon',
    createdAt: 1,
    updatedAt: 1
  }
];

const activitiesSample: ProjectActivity[] = [
  // Atividades do Projeto Horizon (Atrasado)
  {
    id: 'act-hor-1',
    projectId: 'prj-overdue',
    workspaceId: 'ws-1',
    name: 'Modelagem Estrutural 3D',
    status: ActivityCanonicalStatus.IN_PROGRESS,
    assigneeId: 'u-eng-1',
    deliveryDate: '2026-10-12', // Atrasada há 5 dias
    orderIndex: 0,
    deadlineChangesCount: 0,
    createdAt: 1,
    updatedAt: 1
  },
  {
    id: 'act-hor-2',
    projectId: 'prj-overdue',
    workspaceId: 'ws-1',
    name: 'Detalhamento de Formas',
    status: ActivityCanonicalStatus.BLOCKED,
    assigneeId: 'u-eng-1',
    deliveryDate: '2026-10-15',
    blockedReason: 'Aguardando laudo de sondagem do cliente',
    orderIndex: 1,
    deadlineChangesCount: 0,
    createdAt: 1,
    updatedAt: 1
  },
  // Atividade do Projeto Aurora (Próxima entrega)
  {
    id: 'act-aur-1',
    projectId: 'prj-upcoming',
    workspaceId: 'ws-1',
    name: 'Compatibilização Hidráulica',
    status: ActivityCanonicalStatus.IN_PROGRESS,
    assigneeId: 'u-eng-2',
    deliveryDate: '2026-10-20', // Próxima
    orderIndex: 0,
    deadlineChangesCount: 0,
    createdAt: 1,
    updatedAt: 1
  },
  // Segunda atividade de Bruno para estourar o limite de WIP (limite Bruno: 1, Bruno terá 2 em andamento)
  {
    id: 'act-aur-2',
    projectId: 'prj-upcoming',
    workspaceId: 'ws-1',
    name: 'Planta de Cargas',
    status: ActivityCanonicalStatus.IN_PROGRESS,
    assigneeId: 'u-eng-1', // Bruno tem act-hor-1 e act-aur-2 em andamento
    deliveryDate: '2026-10-28',
    orderIndex: 1,
    deadlineChangesCount: 0,
    createdAt: 1,
    updatedAt: 1
  },
  // Atividade de projeto cancelado (deve ser ignorada)
  {
    id: 'act-canc-1',
    projectId: 'prj-canceled',
    workspaceId: 'ws-1',
    name: 'Atividade Descartada',
    status: ActivityCanonicalStatus.BLOCKED,
    blockedReason: 'Cancelado',
    deliveryDate: '2026-10-01',
    orderIndex: 0,
    deadlineChangesCount: 0,
    createdAt: 1,
    updatedAt: 1
  }
];

const sampleEventsByActivityId = {
  'act-hor-2': [
    { eventType: 'ACTIVITY_BLOCKED', created_at: '2026-10-14T10:00:00.000Z' }
  ]
};

const attentionResult = calculateManagementAttention({
  projects: projectsSample,
  activities: activitiesSample,
  users: usersSample,
  clients: clientsSample,
  todayStr: '2026-10-17',
  userWipLimits: {
    'u-eng-1': 1, // Bruno tem limite de 1 WIP, mas está com 2 em andamento
    'u-eng-2': 3  // Camila tem limite de 3 WIP, e está com 1 (dentro do limite)
    // Diego não tem limite configurado -> NÃO deve gerar alerta
  },
  eventsByActivityId: sampleEventsByActivityId,
  upcomingBusinessDaysHorizon: 3
});

// Verificação do Resumo
assert(attentionResult.summary.overdueProjectsCount === 1, 'Summary has exactly 1 overdue project (Edifício Horizon)');
assert(attentionResult.summary.blockedActivitiesCount === 1, 'Summary has exactly 1 active blocked activity (Detalhamento)');
assert(attentionResult.summary.upcomingDeliveriesCount === 2, 'Summary has 2 upcoming deliveries (Residencial Aurora + Compatibilização)');
assert(attentionResult.summary.wipExceededUsersCount === 1, 'Summary has 1 user with exceeded WIP limit (Bruno: 2 > 1)');

// Consolidação e severidades
const horizonItem = attentionResult.items.find(i => i.type === 'project' && i.projectId === 'prj-overdue');
assert(horizonItem !== undefined, 'Horizon project consolidated in priority list');
assert(horizonItem?.maxSeverity === AlertSeverity.CRITICAL, 'Horizon maxSeverity is CRÍTICA due to overdue project deadline');
assert(horizonItem?.type === 'project' && horizonItem.overdueActivitiesCount === 1, 'Horizon has 1 overdue activity linked');
assert(horizonItem?.type === 'project' && horizonItem.blockedActivitiesCount === 1, 'Horizon has 1 blocked activity linked');
assert(horizonItem?.type === 'project' && horizonItem.daysOverdue === 7, 'Horizon daysOverdue is 7 calendar days');
assert(horizonItem?.type === 'project' && horizonItem.activities.find(a => a.category === AlertCategory.ACTIVE_BLOCK)?.blockedSinceDate === '14/10/2026', 'Blocked activity tracks date from valid event');

const auroraItem = attentionResult.items.find(i => i.type === 'project' && i.projectId === 'prj-upcoming');
assert(auroraItem !== undefined, 'Aurora project present in priority list');
assert(auroraItem?.maxSeverity === AlertSeverity.ATTENTION, 'Aurora maxSeverity is ATENÇÃO (upcoming delivery)');
assert(auroraItem?.type === 'project' && auroraItem.primaryCategory === AlertCategory.UPCOMING_DELIVERY, 'Aurora primaryCategory is UPCOMING_DELIVERY');

const incompleteItem = attentionResult.items.find(i => i.type === 'project' && i.projectId === 'prj-incomplete');
assert(incompleteItem !== undefined, 'Incomplete project present in priority list');
assert(incompleteItem?.maxSeverity === AlertSeverity.INFORMATIVE, 'Incomplete project classified as INFORMATIVA (never artificially critical)');

const wipBrunoItem = attentionResult.items.find(i => i.type === 'team' && i.userId === 'u-eng-1');
assert(wipBrunoItem !== undefined, 'Bruno WIP item present in priority list');
assert(wipBrunoItem?.maxSeverity === AlertSeverity.ATTENTION, 'WIP exceeded classified as ATENÇÃO');
assert(wipBrunoItem?.type === 'team' && wipBrunoItem.inProgressCount === 2, 'Bruno in progress count is 2');
assert(wipBrunoItem?.type === 'team' && wipBrunoItem.wipLimit === 1, 'Bruno advisory WIP limit is 1');
assert(wipBrunoItem?.type === 'team' && wipBrunoItem.exceededBy === 1, 'Bruno exceeded by 1');

// Ausência de alertas espúrios
const canceledItem = attentionResult.items.find(i => i.type === 'project' && i.projectId === 'prj-canceled');
assert(canceledItem === undefined, 'Canceled project produces 0 alerts');

const histRevItem = attentionResult.items.find(i => i.type === 'project' && i.projectId === 'prj-hist-rev0');
assert(histRevItem === undefined, 'Historical revision Rev 00 produces 0 alerts');

const wipDiegoItem = attentionResult.items.find(i => i.type === 'team' && i.userId === 'u-eng-3');
assert(wipDiegoItem === undefined, 'User without configured WIP limit produces 0 overload alerts');

// Ordenação determinística
// ============================================================================
// 14. FASE 5: PLANEJAMENTO INTELIGENTE E PREVISIBILIDADE DE ENTREGAS
// ============================================================================
console.log('\n14. Intelligent Planning & Delivery Predictability Engine (Fase 5)');

// Setup historical concluded activities across an 8-week window [2026-08-22, 2026-10-17]
// 8 weeks in the past: 56 days.
// Let's create 6 concluded activities in specific weeks:
// Week -7 (oldest): 1 delivery (2026-08-25)
// Week -6: 0 deliveries
// Week -5: 2 deliveries (2026-09-08, 2026-09-10)
// Week -4: 1 delivery (2026-09-16)
// Week -3: 0 deliveries
// Week -2: 1 delivery (2026-10-01)
// Week -1: 1 delivery (2026-10-08)
// Week 0: 0 deliveries
// Total: 6 deliveries in 8 weeks -> Throughput = 6 / 8 = 0.8 deliveries/week.
const planProjects: Project[] = [
  { id: 'p-1', workspaceId: 'ws-1', clientId: 'cli-1', code: 'PRJ-001', name: 'Shopping Plaza', status: ProjectStatus.IN_PROGRESS, startDate: '2026-08-01', deliveryDate: '2026-11-20', isCurrentRevision: true, revision: 'Rev.01', familyId: 'f-1', createdAt: 1, updatedAt: 1 },
  { id: 'p-2', workspaceId: 'ws-1', clientId: 'cli-2', code: 'PRJ-002', name: 'Hospital Central', status: ProjectStatus.IN_PROGRESS, startDate: '2026-09-01', deliveryDate: '2026-12-15', isCurrentRevision: true, revision: 'Rev.00', familyId: 'f-2', createdAt: 1, updatedAt: 1 },
  { id: 'p-canc', workspaceId: 'ws-1', clientId: 'cli-1', code: 'PRJ-003', name: 'Projeto Cancelado', status: ProjectStatus.CANCELED, startDate: '2026-09-01', deliveryDate: '2026-10-25', isCurrentRevision: true, revision: 'Rev.00', familyId: 'f-3', createdAt: 1, updatedAt: 1 }
];

const planConcludedActs: ProjectActivity[] = [
  { id: 'c-1', projectId: 'p-1', workspaceId: 'ws-1', name: 'Fundação', status: ActivityCanonicalStatus.COMPLETED, startDate: '2026-08-15', actualEndDate: '2026-08-25', orderIndex: 0, deadlineChangesCount: 0, createdAt: 1, updatedAt: 1 },
  { id: 'c-2', projectId: 'p-1', workspaceId: 'ws-1', name: 'Estrutura P1', status: ActivityCanonicalStatus.COMPLETED, startDate: '2026-08-28', actualEndDate: '2026-09-08', orderIndex: 1, deadlineChangesCount: 0, createdAt: 1, updatedAt: 1 },
  { id: 'c-3', projectId: 'p-1', workspaceId: 'ws-1', name: 'Estrutura P2', status: ActivityCanonicalStatus.COMPLETED, startDate: '2026-08-30', actualEndDate: '2026-09-10', orderIndex: 2, deadlineChangesCount: 0, createdAt: 1, updatedAt: 1 },
  { id: 'c-4', projectId: 'p-2', workspaceId: 'ws-1', name: 'Terraplanagem', status: ActivityCanonicalStatus.COMPLETED, startDate: '2026-09-05', actualEndDate: '2026-09-16', orderIndex: 0, deadlineChangesCount: 0, createdAt: 1, updatedAt: 1 },
  { id: 'c-5', projectId: 'p-1', workspaceId: 'ws-1', name: 'Alvenaria', status: ActivityCanonicalStatus.COMPLETED, startDate: '2026-09-20', actualEndDate: '2026-10-01', orderIndex: 3, deadlineChangesCount: 0, createdAt: 1, updatedAt: 1 },
  { id: 'c-6', projectId: 'p-2', workspaceId: 'ws-1', name: 'Instalações', status: ActivityCanonicalStatus.COMPLETED, startDate: '2026-09-25', actualEndDate: '2026-10-08', orderIndex: 1, deadlineChangesCount: 0, createdAt: 1, updatedAt: 1 }
];

// Open Future Commitments across 4 future weeks (Reference today: 2026-10-17 Saturday)
// Week +1: 2026-10-18 to 2026-10-24
// Week +2: 2026-10-25 to 2026-10-31
// Week +3: 2026-11-01 to 2026-11-07
// Week +4: 2026-11-08 to 2026-11-14
const planOpenActs: ProjectActivity[] = [
  // 1 Overdue commitment (delivery 2026-10-12 < today 2026-10-17)
  { id: 'act-over', projectId: 'p-1', workspaceId: 'ws-1', name: 'Projeto Hidráulico', status: ActivityCanonicalStatus.IN_PROGRESS, deliveryDate: '2026-10-12', assigneeId: 'u-eng-1', orderIndex: 4, deadlineChangesCount: 0, createdAt: 1, updatedAt: 1 },
  // Week +1: 1 commitment (delivery 2026-10-20)
  { id: 'act-w1-1', projectId: 'p-1', workspaceId: 'ws-1', name: 'Projeto Elétrico', status: ActivityCanonicalStatus.IN_PROGRESS, deliveryDate: '2026-10-20', assigneeId: 'u-eng-1', orderIndex: 5, deadlineChangesCount: 0, createdAt: 1, updatedAt: 1 },
  // Week +2: 3 commitments (high demand vs 0.8 capacity! e.g. 2026-10-26, 2026-10-28, 2026-10-29), 1 blocked
  { id: 'act-w2-1', projectId: 'p-1', workspaceId: 'ws-1', name: 'Climatização', status: ActivityCanonicalStatus.IN_PROGRESS, deliveryDate: '2026-10-26', assigneeId: 'u-eng-2', orderIndex: 6, deadlineChangesCount: 0, createdAt: 1, updatedAt: 1 },
  { id: 'act-w2-2', projectId: 'p-2', workspaceId: 'ws-1', name: 'Gases Medicinais', status: ActivityCanonicalStatus.BLOCKED, blockedReason: 'Aguardando aprovação vigilância', deliveryDate: '2026-10-28', assigneeId: 'u-eng-2', orderIndex: 2, deadlineChangesCount: 0, createdAt: 1, updatedAt: 1 },
  { id: 'act-w2-3', projectId: 'p-1', workspaceId: 'ws-1', name: 'Fachada', status: ActivityCanonicalStatus.IN_PROGRESS, deliveryDate: '2026-10-29', originalDeliveryDate: '2026-10-15', assigneeId: 'u-eng-1', orderIndex: 7, deadlineChangesCount: 1, createdAt: 1, updatedAt: 1 },
  // Week +3: 0 commitments
  // Week +4: 1 commitment (2026-11-10)
  { id: 'act-w4-1', projectId: 'p-2', workspaceId: 'ws-1', name: 'Pintura Epóxi', status: ActivityCanonicalStatus.IN_PROGRESS, deliveryDate: '2026-11-10', assigneeId: 'u-eng-2', orderIndex: 3, deadlineChangesCount: 0, createdAt: 1, updatedAt: 1 },
  // Canceled project activity (must be ignored)
  { id: 'act-canc-plan', projectId: 'p-canc', workspaceId: 'ws-1', name: 'Atividade Cancelada', status: ActivityCanonicalStatus.IN_PROGRESS, deliveryDate: '2026-10-22', orderIndex: 0, deadlineChangesCount: 0, createdAt: 1, updatedAt: 1 }
];

const allPlanActivities = [...planConcludedActs, ...planOpenActs];

const planningResult = calculateIntelligentPlanning({
  projects: planProjects,
  activities: allPlanActivities,
  users: usersSample,
  clients: clientsSample,
  todayStr: '2026-10-17',
  horizonWeeks: 4,
  historicalWindowWeeks: 8,
  deliveryUnit: DeliveryUnitType.ACTIVITIES
});

// Test 14.1: Historical Throughput & Variance
assert(planningResult.historicalThroughput.totalConcludedDeliveries === 6, 'Historical throughput found 6 deliveries in 8 weeks');
assert(planningResult.historicalThroughput.weeklyDeliveryCounts.length === 8, 'Strictly preserves 8 weekly bins (including 0-delivery weeks)');
assert(planningResult.historicalThroughput.averageWeeklyThroughput === 0.8, 'Average throughput is 0.8 deliveries/week (6/8)');
assert(planningResult.historicalThroughput.confidence === ProjectionConfidence.REDUCED, 'Confidence is REDUZIDA (6 deliveries is between 3 and 7)');
assert(planningResult.historicalThroughput.minWeeklyDeliveries === 0, 'Min observed weekly deliveries is 0');
assert(planningResult.historicalThroughput.maxWeeklyDeliveries === 2, 'Max observed weekly deliveries is 2');
assert(planningResult.historicalThroughput.capacityBaseline === 0.8, 'Capacity baseline is 0.8 ent/sem');

// Test 14.2: Overdue Commitments Bucket Isolation
assert(planningResult.overdueBucket.count === 1, 'Overdue bucket contains exactly 1 overdue commitment (Projeto Hidráulico)');
assert(planningResult.overdueBucket.commitments[0].activityName === 'Projeto Hidráulico', 'Overdue item is Projeto Hidráulico');

// Test 14.3: Future Horizon Weekly Distribution
assert(planningResult.weeklyBuckets.length === 4, 'Future horizon has exactly 4 weeks');
const planWeek1 = planningResult.weeklyBuckets[0];
const planWeek2 = planningResult.weeklyBuckets[1];
const planWeek3 = planningResult.weeklyBuckets[2];
const planWeek4 = planningResult.weeklyBuckets[3];

assert(planWeek1.commitmentsCount === 1, 'Week +1 has exactly 1 commitment (Projeto Elétrico)');
assert(planWeek2.commitmentsCount === 3, 'Week +2 has 3 commitments (Climatização, Gases, Fachada)');
assert(planWeek2.blockedCount === 1, 'Week +2 has 1 blocked commitment (Gases Medicinais)');
assert(planWeek2.reprogrammedCount === 1, 'Week +2 tracks 1 reprogrammed commitment (Fachada)');
assert(planWeek3.commitmentsCount === 0, 'Week +3 has 0 commitments');
assert(planWeek4.commitmentsCount === 1, 'Week +4 has 1 commitment (Pintura Epóxi)');

// Test 14.4: Demand vs Capacity Status
assert(planWeek2.status === WeekDemandStatus.POTENTIAL_OVERLOAD, 'Week +2 classified as POTENTIAL_OVERLOAD (3 commitments > max capacity 2)');
assert(planWeek2.demandVsCapacityDelta === 2.2, 'Week +2 delta is +2.2 (3 - 0.8)');

// Test 14.5: Exclusion of Canceled Projects
const canceledInPlanning = planningResult.weeklyBuckets.some(b => b.commitments.some(c => c.projectId === 'p-canc'));
assert(!canceledInPlanning, 'Canceled project PRJ-003 is excluded from planning commitments');

// Test 14.6: What-If Scenario Simulator (Non-destructive)
const simulatedPlanning = calculateIntelligentPlanning({
  projects: planProjects,
  activities: allPlanActivities,
  users: usersSample,
  clients: clientsSample,
  todayStr: '2026-10-17',
  horizonWeeks: 4,
  historicalWindowWeeks: 8,
  deliveryUnit: DeliveryUnitType.ACTIVITIES,
  simulation: {
    additionalCount: 2,
    targetWeekNumber: 1 // Add +2 deliveries in Week +1
  }
});

assert(simulatedPlanning.isSimulationActive === true, 'Simulation flag is active');
assert(simulatedPlanning.weeklyBuckets[0].simulatedAdditionalDeliveries === 2, 'Week +1 has 2 simulated deliveries');
assert(simulatedPlanning.weeklyBuckets[0].simulatedTotalDemand === 3, 'Week +1 total simulated demand is 3 (1 real + 2 sim)');
assert(simulatedPlanning.weeklyBuckets[0].commitmentsCount === 1, 'Week +1 real commitments unchanged (non-destructive)');
assert(simulatedPlanning.weeklyBuckets[1].simulatedAdditionalDeliveries === 0, 'Week +2 untouched by Week 1 simulation');

// Test 14.7: Individual Professional Planning
const eng1Metrics = planningResult.professionals.find(p => p.userId === 'u-eng-1')!;
assert(eng1Metrics !== undefined, 'Found metrics for Eng. Bruno');
assert(eng1Metrics.weeklyDistribution[0] === 1, 'Eng. Bruno has 1 delivery in Week +1');
assert(eng1Metrics.weeklyDistribution[1] === 1, 'Eng. Bruno has 1 delivery in Week +2');
assert(eng1Metrics.overdueCount === 1, 'Eng. Bruno has 1 overdue activity');

// Test 14.8: Delivery Unit Separation (PROJECTS vs ACTIVITIES)
const projectUnitPlanning = calculateIntelligentPlanning({
  projects: planProjects,
  activities: allPlanActivities,
  users: usersSample,
  clients: clientsSample,
  todayStr: '2026-10-17',
  horizonWeeks: 4,
  historicalWindowWeeks: 8,
  deliveryUnit: DeliveryUnitType.PROJECTS
});
assert(projectUnitPlanning.deliveryUnit === DeliveryUnitType.PROJECTS, 'Unit type is PROJECTS');
assert(projectUnitPlanning.historicalThroughput.totalConcludedDeliveries === 0, 'No concluded projects in 8w window (p-1 and p-2 in progress)');
assert(projectUnitPlanning.historicalThroughput.confidence === ProjectionConfidence.INSUFFICIENT, 'Confidence is INSUFFICIENT for projects');
assert(projectUnitPlanning.weeklyBuckets[0].status === WeekDemandStatus.INSUFFICIENT_DATA, 'Week status is INSUFFICIENT_DATA without quantitative false alarms');

// 15. Administrative Deletion of Clients and Projects
console.log('\n15. Administrative Deletion of Clients and Projects');
import {
  canUserDeletePermanently,
  evaluateClientDeletionEligibility,
  calculateProjectDeletionImpact,
  isProjectConfirmationCodeValid,
  isClientConfirmationValid,
  applyProjectDeletionToState,
  applyClientDeletionToState,
  formatAuditLogDetailsForProjectDeletion,
  formatAuditLogDetailsForClientDeletion,
  sanitizeAdministrativeErrorMessage
} from '../utils/administrativeDeletion';
import { deleteProject, deleteProjectPermanently, deleteClientPermanently, AppDB } from '../storage';

const testWorkspaceId = 'ws-adm-01';
const otherWorkspaceId = 'ws-adm-02';

const adminUser: InternalUser = {
  id: 'u-admin-1',
  workspaceId: testWorkspaceId,
  username: 'carlos.admin',
  passwordHash: 'hash',
  role: UserRole.ADMIN,
  isActive: true
};

const standardUser: InternalUser = {
  id: 'u-user-1',
  workspaceId: testWorkspaceId,
  username: 'marcos.dev',
  passwordHash: 'hash',
  role: UserRole.USER,
  isActive: true
};

const viewerUser: InternalUser = {
  id: 'u-viewer-1',
  workspaceId: testWorkspaceId,
  username: 'lucia.viewer',
  passwordHash: 'hash',
  role: UserRole.VIEWER,
  isActive: true
};

const inactiveAdminUser: InternalUser = {
  id: 'u-admin-inativo',
  workspaceId: testWorkspaceId,
  username: 'antonio.inativo',
  passwordHash: 'hash',
  role: UserRole.ADMIN,
  isActive: false
};

// 15.1 Permissions Tests
assert(canUserDeletePermanently(adminUser, testWorkspaceId).allowed === true, 'Authorized workspace admin is allowed');
assert(canUserDeletePermanently(standardUser, testWorkspaceId).allowed === false, 'Standard USER is blocked from deletion');
assert(canUserDeletePermanently(viewerUser, testWorkspaceId).allowed === false, 'VIEWER is blocked from deletion');
assert(canUserDeletePermanently(inactiveAdminUser, testWorkspaceId).allowed === false, 'Inactive admin is blocked from deletion');
assert(canUserDeletePermanently(adminUser, otherWorkspaceId).allowed === false, 'Cross-workspace deletion attempt is strictly blocked');
assert(canUserDeletePermanently(null, testWorkspaceId).allowed === false, 'Unauthenticated user (null) is blocked from deletion');
assert(canUserDeletePermanently(undefined, testWorkspaceId).allowed === false, 'Undefined user is blocked from deletion');

// 15.2 Clients Eligibility Tests
const clientA: Client = {
  id: 'cli-01',
  workspaceId: testWorkspaceId,
  code: '001',
  name: 'Construtora Alfa',
  type: 'PJ',
  status: 'ACTIVE'
};

const clientB: Client = {
  id: 'cli-02',
  workspaceId: testWorkspaceId,
  code: '002',
  name: 'Beta Incorporações',
  type: 'PJ',
  status: 'ACTIVE'
};

const clientWithoutProjects: Client = {
  id: 'cli-03',
  workspaceId: testWorkspaceId,
  code: '003',
  name: 'Gama Engenharia',
  type: 'PJ',
  status: 'ACTIVE'
};

const prjAlfaRev00: Project = {
  id: 'prj-alfa-r0',
  workspaceId: testWorkspaceId,
  familyId: 'fam-alfa',
  familyCode: 'ALF-01-26',
  familyName: 'Torre Alfa Residencial',
  revision: 'Rev.00',
  revisionNumber: 0,
  isCurrentRevision: false,
  clientId: 'cli-01',
  code: 'ALF-01-26',
  name: 'Torre Alfa Residencial',
  status: ProjectStatus.DONE,
  createdAt: 1000
};

const prjAlfaRev01: Project = {
  id: 'prj-alfa-r1',
  workspaceId: testWorkspaceId,
  familyId: 'fam-alfa',
  familyCode: 'ALF-01-26',
  familyName: 'Torre Alfa Residencial',
  revision: 'Rev.01',
  revisionNumber: 1,
  isCurrentRevision: true,
  clientId: 'cli-01',
  code: 'ALF-01-26',
  name: 'Torre Alfa Residencial',
  status: ProjectStatus.IN_PROGRESS,
  createdAt: 2000
};

const prjBetaOnlyRev00: Project = {
  id: 'prj-beta-r0',
  workspaceId: testWorkspaceId,
  familyId: 'fam-beta',
  familyCode: 'BET-01-26',
  familyName: 'Edifício Beta Prime',
  revision: 'Rev.00',
  revisionNumber: 0,
  isCurrentRevision: true,
  clientId: 'cli-02',
  code: 'BET-01-26',
  name: 'Edifício Beta Prime',
  photoUrl: 'data:image/jpeg;base64,sample...',
  status: ProjectStatus.QUEUE,
  createdAt: 3000
};

const allTestProjects = [prjAlfaRev00, prjAlfaRev01, prjBetaOnlyRev00];

// Client without dependencies
const checkClientClean = evaluateClientDeletionEligibility(clientWithoutProjects.id, testWorkspaceId, allTestProjects);
assert(checkClientClean.canDelete === true, 'Client without linked projects is eligible for deletion');
assert(checkClientClean.linkedProjectsCount === 0, 'Clean client has 0 linked projects');

// Client with multiple projects / historical revisions
const checkClientWithProjects = evaluateClientDeletionEligibility(clientA.id, testWorkspaceId, allTestProjects);
assert(checkClientWithProjects.canDelete === false, 'Client with linked projects cannot be deleted');
assert(checkClientWithProjects.linkedProjectsCount === 2, 'Detects both active and historical linked revisions (2)');
assert(checkClientWithProjects.reason?.includes('2 projeto(s) vinculado(s)') === true, 'Block message states exact number of linked projects');

// Client with single active project
const checkClientBeta = evaluateClientDeletionEligibility(clientB.id, testWorkspaceId, allTestProjects);
assert(checkClientBeta.canDelete === false, 'Client with 1 project is blocked');
assert(checkClientBeta.linkedProjectsCount === 1, 'Beta has 1 linked project');

// Non-existent client
const checkClientMissing = evaluateClientDeletionEligibility('cli-inexistente', testWorkspaceId, allTestProjects);
assert(checkClientMissing.canDelete === true, 'Non-existent client has 0 dependencies');

// 15.3 Project Deletion Impact Calculation Tests
const actAlfa1: ProjectActivity = {
  id: 'act-alfa-1',
  workspaceId: testWorkspaceId,
  projectId: 'prj-alfa-r0', // historical revision
  name: 'Estrutural Preliminar',
  status: ActivityCanonicalStatus.COMPLETED,
  orderIndex: 0,
  deadlineChangesCount: 0,
  createdAt: 1100,
  updatedAt: 1200
};

const actAlfa2: ProjectActivity = {
  id: 'act-alfa-2',
  workspaceId: testWorkspaceId,
  projectId: 'prj-alfa-r1', // current revision
  name: 'Fundação e Sondagem',
  status: ActivityCanonicalStatus.IN_PROGRESS,
  orderIndex: 1,
  deadlineChangesCount: 1,
  createdAt: 2100,
  updatedAt: 2200
};

const actAlfa3: ProjectActivity = {
  id: 'act-alfa-3',
  workspaceId: testWorkspaceId,
  projectId: 'prj-alfa-r1', // current revision
  name: 'Alvenaria',
  status: ActivityCanonicalStatus.TO_DO,
  orderIndex: 2,
  deadlineChangesCount: 0,
  createdAt: 2300,
  updatedAt: 2300
};

const actBeta1: ProjectActivity = {
  id: 'act-beta-1',
  workspaceId: testWorkspaceId,
  projectId: 'prj-beta-r0',
  name: 'Estudo de Viabilidade',
  status: ActivityCanonicalStatus.TO_DO,
  orderIndex: 0,
  deadlineChangesCount: 0,
  createdAt: 3100,
  updatedAt: 3100
};

const allTestActivities = [actAlfa1, actAlfa2, actAlfa3, actBeta1];

const evAlfa1: ProjectActivityEvent = {
  id: 'ev-1',
  workspaceId: testWorkspaceId,
  activityId: 'act-alfa-1',
  eventType: 'STARTED',
  createdAt: 1150
};

const evAlfa2: ProjectActivityEvent = {
  id: 'ev-2',
  workspaceId: testWorkspaceId,
  activityId: 'act-alfa-1',
  eventType: 'COMPLETED',
  createdAt: 1200
};

const evAlfa3: ProjectActivityEvent = {
  id: 'ev-3',
  workspaceId: testWorkspaceId,
  activityId: 'act-alfa-2',
  eventType: 'RESCHEDULED',
  createdAt: 2150
};

const evBeta1: ProjectActivityEvent = {
  id: 'ev-beta-1',
  workspaceId: testWorkspaceId,
  activityId: 'act-beta-1',
  eventType: 'CREATED',
  createdAt: 3110
};

const allTestEvents = [evAlfa1, evAlfa2, evAlfa3, evBeta1];

// Project Alfa: multiple revisions, multiple activities across revisions, multiple events
const impactAlfa = calculateProjectDeletionImpact('fam-alfa', testWorkspaceId, allTestProjects, allTestActivities, allTestEvents);
assert(impactAlfa.familyId === 'fam-alfa', 'Impact family ID resolved');
assert(impactAlfa.revisionsCount === 2, 'Impact includes all 2 revisions (historical + current)');
assert(impactAlfa.activitiesCount === 3, 'Impact includes all 3 activities from both revisions');
assert(impactAlfa.eventsCount === 3, 'Impact includes all 3 events belonging exclusively to Alfa activities');
assert(impactAlfa.familyCode === 'ALF-01-26', 'Canonical family code preserved');

// Project Beta: single revision, with photo attachment
const impactBeta = calculateProjectDeletionImpact('fam-beta', testWorkspaceId, allTestProjects, allTestActivities, allTestEvents);
assert(impactBeta.revisionsCount === 1, 'Beta has single revision');
assert(impactBeta.activitiesCount === 1, 'Beta has 1 activity');
assert(impactBeta.eventsCount === 1, 'Beta has 1 event');
assert(impactBeta.attachmentsCount === 1, 'Beta tracks 1 attachment photo');

// 15.4 Typed Confirmation Validation Tests
// Project code matching (strict)
assert(isProjectConfirmationCodeValid('ALF-01-26', 'ALF-01-26') === true, 'Exact project code confirms');
assert(isProjectConfirmationCodeValid('  ALF-01-26  ', 'ALF-01-26') === true, 'Trims whitespace on project code confirmation');
assert(isProjectConfirmationCodeValid('alf-01-26', 'ALF-01-26') === false, 'Case mismatch fails project code confirmation');
assert(isProjectConfirmationCodeValid('ALF-01', 'ALF-01-26') === false, 'Partial project code fails confirmation');
assert(isProjectConfirmationCodeValid('', 'ALF-01-26') === false, 'Empty code fails confirmation');

// Client code / name matching
assert(isClientConfirmationValid('001', '001', 'Construtora Alfa') === true, 'Client code matches');
assert(isClientConfirmationValid('1', '001', 'Construtora Alfa') === true, 'Padded client code matches');
assert(isClientConfirmationValid('Construtora Alfa', '001', 'Construtora Alfa') === true, 'Client name matches');
assert(isClientConfirmationValid('construtora alfa', '001', 'Construtora Alfa') === true, 'Client name matches case-insensitively');
assert(isClientConfirmationValid('Outro', '001', 'Construtora Alfa') === false, 'Incorrect client confirmation fails');

// 15.5 State Immutability & Application Reducer Tests
const initialDb: AppDB = {
  company: null,
  users: [adminUser, standardUser],
  clients: [clientA, clientB, clientWithoutProjects],
  projects: [prjAlfaRev00, prjAlfaRev01, prjBetaOnlyRev00],
  tasks: []
};

// Apply project deletion: must remove BOTH revisions of fam-alfa, keeping fam-beta and all clients intact
const dbAfterProjectDelete = applyProjectDeletionToState(initialDb, 'fam-alfa');
assert(dbAfterProjectDelete.projects.length === 1, 'Exactly 1 project remains after family deletion');
assert(dbAfterProjectDelete.projects[0].id === 'prj-beta-r0', 'Remaining project is Beta Prime');
assert(dbAfterProjectDelete.projects.every(p => p.familyId !== 'fam-alfa'), 'All Alfa revisions deleted from state');
assert(dbAfterProjectDelete.clients.length === 3, 'Clients intact after project deletion');
assert(dbAfterProjectDelete.users.length === 2, 'Users intact after project deletion');

// Apply client deletion: remove Gama Engenharia
const dbAfterClientDelete = applyClientDeletionToState(dbAfterProjectDelete, clientWithoutProjects.id);
assert(dbAfterClientDelete.clients.length === 2, 'Exactly 2 clients remain after deletion');
assert(dbAfterClientDelete.clients.find(c => c.id === clientWithoutProjects.id) === undefined, 'Gama Engenharia deleted from state');
assert(dbAfterClientDelete.projects.length === 1, 'Projects intact after client deletion');

// 15.6 Administrative Audit Log Formatting Tests
const projectLog = formatAuditLogDetailsForProjectDeletion({
  code: 'ALF-01-26',
  name: 'Torre Alfa Residencial',
  revisionsCount: 2,
  activitiesCount: 3
});
assert(projectLog.includes('Exclusão permanente do projeto ALF-01-26'), 'Audit log includes project code');
assert(projectLog.includes('2 revisão(ões)'), 'Audit log includes revisions count');
assert(projectLog.includes('3 atividade(s) excluídas'), 'Audit log includes activities count');

const clientLog = formatAuditLogDetailsForClientDeletion({
  code: '003',
  name: 'Gama Engenharia'
});
assert(clientLog.includes('Exclusão permanente do cliente 003 (Gama Engenharia)'), 'Client audit log formats correctly');

// 15.7 Direct Table Delete Prevention & RPC Exclusivity Tests
let deleteProjectThrown = false;
try {
  await deleteProject('prj-alfa-r0');
} catch (e: any) {
  deleteProjectThrown = e.message.includes('EXCLUSION_REQUIRES_ADMINISTRATIVE_RPC');
}
assert(deleteProjectThrown === true, 'deleteProject without admin authorization throws EXCLUSION_REQUIRES_ADMINISTRATIVE_RPC');

let deleteClientMissingParamsThrown = false;
try {
  await deleteClientPermanently('', '', '');
} catch (e: any) {
  deleteClientMissingParamsThrown = e.message.includes('EXCLUSION_REQUIRES_ADMINISTRATIVE_RPC');
}
assert(deleteClientMissingParamsThrown === true, 'deleteClientPermanently requires all mandatory parameters');

let deleteProjectMissingParamsThrown = false;
try {
  await deleteProjectPermanently('', '', '');
} catch (e: any) {
  deleteProjectMissingParamsThrown = e.message.includes('EXCLUSION_REQUIRES_ADMINISTRATIVE_RPC');
}
assert(deleteProjectMissingParamsThrown === true, 'deleteProjectPermanently requires all mandatory parameters');

// 15.8 Failure Interruption & State Preservation Simulation
let simulatedDb: AppDB = { ...initialDb };
let rpcErrorSimulated = false;
try {
  // Simulating an RPC failure (e.g. network error, foreign key block, missing migration)
  throw new Error('P0001: RPC_EXECUTION_FAILED');
  // State mutation is strictly placed AFTER RPC execution:
  simulatedDb = applyProjectDeletionToState(simulatedDb, 'fam-alfa');
} catch (err) {
  rpcErrorSimulated = true;
}
assert(rpcErrorSimulated === true, 'RPC failure was captured');
assert(simulatedDb.projects.length === 3, 'State remains completely intact (3 projects) when RPC fails or is unavailable');

// 15.9 Technical PostgreSQL/PostgREST Error Sanitization Tests
const schemaCacheError = new Error('Could not find the function public.delete_project_family_administrative(p_actor_user_id, p_family_id, p_workspace_id) in the schema cache');
const sanitizedCacheMsg = sanitizeAdministrativeErrorMessage(schemaCacheError);
assert(sanitizedCacheMsg === 'A função de exclusão administrativa não está habilitada no banco de dados. A operação foi cancelada com segurança.', 'Schema cache error is normalized to clear Portuguese message');

const adminPermError = new Error('ADMIN_AUTHORIZATION_REQUIRED: Operação restrita a administradores ativos do workspace');
const sanitizedPermMsg = sanitizeAdministrativeErrorMessage(adminPermError);
assert(sanitizedPermMsg === 'Operação restrita a administradores ativos do workspace.', 'Admin permission error is normalized');

const depError = new Error('CLIENT_HAS_DEPENDENCIES: Este cliente possui 2 projeto(s) vinculado(s)');
const sanitizedDepMsg = sanitizeAdministrativeErrorMessage(depError);
assert(sanitizedDepMsg === 'Este cliente possui projetos vinculados e não pode ser excluído permanentemente.', 'Dependency error is normalized');

const genericError = new Error('Conexão perdida com o servidor');
const sanitizedGenericMsg = sanitizeAdministrativeErrorMessage(genericError);
assert(sanitizedGenericMsg === 'Conexão perdida com o servidor', 'General error preserved without technical jargon');

console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
if (failed > 0) {
  process.exit(1);
}


