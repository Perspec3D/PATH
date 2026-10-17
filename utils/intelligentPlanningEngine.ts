import { Project, ProjectActivity, InternalUser, Client, ProjectStatus } from '../types';
import { isProjectActivityClosed } from './projectActivityStatus';
import {
  ActivityCanonicalStatus,
  formatDisplayDate,
  getTodayDateString,
  normalizeActivityStatus,
  parseLocalDate,
  formatLocalDate,
  addCalendarDays,
  calculateCalendarDurationDays,
  calculateBusinessDurationDays
} from './activityOperationalModel';
import { isCurrentProjectRevision, getProjectFamilyId, getProjectRevisionNumber } from './projectRevision';

export type PlanningHorizonWeeks = 4 | 8 | 12;
export type HistoricalThroughputWindowWeeks = 4 | 8 | 12;

export enum DeliveryUnitType {
  ACTIVITIES = 'ACTIVITIES', // Entregáveis Operacionais (Atividades de Projetos)
  PROJECTS = 'PROJECTS'     // Entregas de Projeto / Revisão
}

export enum ProjectionConfidence {
  SUFFICIENT = 'CONFIÁVEL',
  REDUCED = 'AMOSTRA REDUZIDA',
  INSUFFICIENT = 'HISTÓRICO INSUFICIENTE'
}

export enum WeekDemandStatus {
  BALANCED = 'DENTRO DA CAPACIDADE',
  ELEVATED_DEMAND = 'DEMANDA ELEVADA',
  POTENTIAL_OVERLOAD = 'SOBRECARGA PROVÁVEL',
  HAS_BLOCKS = 'COM IMPEDIMENTOS',
  INSUFFICIENT_DATA = 'SEM HISTÓRICO COMPARÁVEL'
}

export interface PlanningCommitmentItem {
  id: string;
  unitType: DeliveryUnitType;
  projectId: string;
  projectCode: string;
  projectName: string;
  clientId: string;
  clientName: string;
  revision: string;
  revisionNumber: number;
  activityId?: string;
  activityName?: string;
  assigneeId?: string;
  assigneeName?: string;
  deliveryDate: string;
  originalDeliveryDate?: string;
  formattedDeliveryDate: string;
  formattedOriginalDeliveryDate?: string;
  isReprogrammed: boolean;
  status: string;
  canonicalStatus?: ActivityCanonicalStatus | ProjectStatus;
  isBlocked: boolean;
  blockedReason?: string;
  isOverdue: boolean;
  daysRemaining: number; // 0 for today, positive for future, negative for past
  daysOverdue: number | null;
  category?: string;
}

export interface HistoricalThroughputMetrics {
  windowWeeks: HistoricalThroughputWindowWeeks;
  windowStartDate: string;
  windowEndDate: string;
  totalConcludedDeliveries: number;
  weeklyDeliveryCounts: number[]; // strictly includes weeks with 0 deliveries
  averageWeeklyThroughput: number | null;
  weeklyVariance: number | null;
  weeklyStandardDeviation: number | null;
  minWeeklyDeliveries: number | null;
  maxWeeklyDeliveries: number | null;
  confidence: ProjectionConfidence;
  confidenceExplanation: string;
  capacityBaseline: number | null;
  capacityLowerBound: number | null;
  capacityUpperBound: number | null;
  averageCalendarLeadTimeDays: number | null;
  averageBusinessLeadTimeDays: number | null;
}

export interface PlanningWeekBucket {
  weekNumber: number; // 1 to horizonWeeks
  weekLabel: string;
  startDate: string;
  endDate: string;
  formattedRange: string;
  commitments: PlanningCommitmentItem[];
  commitmentsCount: number;
  blockedCount: number;
  reprogrammedCount: number;
  projectedCapacity: number | null;
  capacityLowerBound: number | null;
  capacityUpperBound: number | null;
  demandVsCapacityDelta: number | null;
  status: WeekDemandStatus;
  statusExplanation: string;
  // What-If Simulation Results
  simulatedAdditionalDeliveries: number;
  simulatedTotalDemand: number;
  simulatedDemandVsCapacityDelta: number | null;
  simulatedStatus: WeekDemandStatus;
}

export interface ProfessionalPlanningMetrics {
  userId: string;
  userName: string;
  currentWip: number;
  activeBlocksCount: number;
  overdueCount: number;
  totalAssignedInHorizon: number;
  weeklyDistribution: number[]; // Count for each week 1..horizon
  individualHistoricalThroughput: number | null; // Deliveries/week if confidence >= REDUCED
  individualConcludedCount: number;
  individualConfidence: ProjectionConfidence;
  wipLimit?: number;
  isWipLimitExceeded: boolean;
  commitments: PlanningCommitmentItem[];
}

export interface WhatIfSimulationParams {
  additionalCount: number; // e.g. 1, 2, 3
  targetWeekNumber: number; // 1 to horizonWeeks
  targetAssigneeId?: string;
  targetCategory?: string;
}

export interface IntelligentPlanningResult {
  horizonWeeks: PlanningHorizonWeeks;
  historicalWindowWeeks: HistoricalThroughputWindowWeeks;
  deliveryUnit: DeliveryUnitType;
  todayStr: string;
  historicalThroughput: HistoricalThroughputMetrics;
  weeklyBuckets: PlanningWeekBucket[];
  overdueBucket: {
    commitments: PlanningCommitmentItem[];
    count: number;
    blockedCount: number;
  };
  totalHorizonCommitmentsCount: number;
  professionals: ProfessionalPlanningMetrics[];
  isSimulationActive: boolean;
  activeSimulation?: WhatIfSimulationParams;
}

export interface IntelligentPlanningInput {
  projects: Project[];
  activities: ProjectActivity[];
  users: InternalUser[];
  clients: Client[];
  todayStr?: string;
  horizonWeeks?: PlanningHorizonWeeks; // default 8
  historicalWindowWeeks?: HistoricalThroughputWindowWeeks; // default 8
  deliveryUnit?: DeliveryUnitType; // default ACTIVITIES
  userWipLimits?: Record<string, number>;
  simulation?: WhatIfSimulationParams;
  workDays?: number[]; // default [1, 2, 3, 4, 5]
}

/**
 * Computes calendar day difference (target - from).
 */
const dayDiff = (fromStr: string, targetStr: string): number => {
  const from = parseLocalDate(fromStr);
  const target = parseLocalDate(targetStr);
  if (!from || !target) return 0;
  return Math.round((target.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
};

/**
 * Pure, deterministic Intelligent Planning and Predictability Engine (Fase 5).
 */
export const calculateIntelligentPlanning = (
  input: IntelligentPlanningInput
): IntelligentPlanningResult => {
  const today = input.todayStr || getTodayDateString();
  const horizonWeeks = input.horizonWeeks || 8;
  const historicalWindowWeeks = input.historicalWindowWeeks || 8;
  const deliveryUnit = input.deliveryUnit || DeliveryUnitType.ACTIVITIES;
  const workDays = input.workDays || [1, 2, 3, 4, 5];
  const simulation = input.simulation && input.simulation.additionalCount > 0
    ? input.simulation
    : undefined;

  // Build lookups for O(1) performance
  const userMap = new Map<string, InternalUser>();
  for (const u of input.users) userMap.set(u.id, u);

  const clientMap = new Map<string, Client>();
  for (const c of input.clients) clientMap.set(c.id, c);

  const projectMap = new Map<string, Project>();
  for (const p of input.projects) projectMap.set(p.id, p);

  // Filter current revision active projects and project IDs
  const currentProjectIds = new Set<string>();
  const activeProjects: Project[] = [];

  for (const p of input.projects) {
    if (isCurrentProjectRevision(p)) {
      currentProjectIds.add(p.id);
      if (p.status !== ProjectStatus.DONE && p.status !== ProjectStatus.CANCELED) {
        activeProjects.push(p);
      }
    }
  }

  // =========================================================================
  // 1. VAZÃO HISTÓRICA E CAPACIDADE OBSERVADA (ETAPA 4 & 5)
  // =========================================================================
  const windowDays = historicalWindowWeeks * 7;
  const windowStartDate = addCalendarDays(today, -windowDays) || today;
  const windowEndDate = today;

  // Initialize weekly bins for the historical window: strictly preserving 0-delivery weeks
  const historicalWeeklyBins: number[] = new Array(historicalWindowWeeks).fill(0);
  let totalConcludedInWindow = 0;
  let totalCalLeadDays = 0;
  let totalBusLeadDays = 0;
  let leadSampleCount = 0;

  // Track per-user concluded counts in the window
  const userConcludedMap = new Map<string, number>();

  if (deliveryUnit === DeliveryUnitType.ACTIVITIES) {
    // Populacão canônica: Atividades concluídas
    for (const act of input.activities) {
      if (!currentProjectIds.has(act.projectId)) continue;
      if (normalizeActivityStatus(act.status) !== ActivityCanonicalStatus.COMPLETED) continue;

      const concludedDate = act.actualEndDate || act.deliveryDate;
      const startDate = act.actualStartDate || act.startDate;
      if (!concludedDate) continue;

      // Check if conclusion falls within historical window [windowStartDate, windowEndDate]
      if (concludedDate < windowStartDate || concludedDate > windowEndDate) continue;

      // Determine week slot in the past (0 = oldest week, W-1 = most recent week)
      const offsetDays = dayDiff(windowStartDate, concludedDate);
      const weekIndex = Math.min(historicalWindowWeeks - 1, Math.max(0, Math.floor(offsetDays / 7)));
      historicalWeeklyBins[weekIndex]++;
      totalConcludedInWindow++;

      // User attribution
      const responsibleId = act.conclusionResponsibleId || act.assigneeId;
      if (responsibleId) {
        userConcludedMap.set(responsibleId, (userConcludedMap.get(responsibleId) || 0) + 1);
      }

      // Lead time metrics
      if (startDate && startDate <= concludedDate) {
        const cal = calculateCalendarDurationDays(startDate, concludedDate);
        const bus = calculateBusinessDurationDays(startDate, concludedDate, workDays);
        if (cal !== null && bus !== null) {
          totalCalLeadDays += cal;
          totalBusLeadDays += bus;
          leadSampleCount++;
        }
      }
    }
  } else {
    // Populacão canônica: Projetos / Revisões concluídas
    for (const prj of input.projects) {
      if (prj.status !== ProjectStatus.DONE) continue;

      const concludedDate = prj.actualEndDate || prj.deliveryDate;
      const startDate = prj.actualStartDate || prj.startDate;
      if (!concludedDate) continue;

      if (concludedDate < windowStartDate || concludedDate > windowEndDate) continue;

      const offsetDays = dayDiff(windowStartDate, concludedDate);
      const weekIndex = Math.min(historicalWindowWeeks - 1, Math.max(0, Math.floor(offsetDays / 7)));
      historicalWeeklyBins[weekIndex]++;
      totalConcludedInWindow++;

      if (prj.assigneeId) {
        userConcludedMap.set(prj.assigneeId, (userConcludedMap.get(prj.assigneeId) || 0) + 1);
      }

      if (startDate && startDate <= concludedDate) {
        const cal = calculateCalendarDurationDays(startDate, concludedDate);
        const bus = calculateBusinessDurationDays(startDate, concludedDate, workDays);
        if (cal !== null && bus !== null) {
          totalCalLeadDays += cal;
          totalBusLeadDays += bus;
          leadSampleCount++;
        }
      }
    }
  }

  // Statistical evaluation of observed throughput
  let confidence = ProjectionConfidence.INSUFFICIENT;
  let confidenceExplanation = '';

  if (totalConcludedInWindow >= 8) {
    confidence = ProjectionConfidence.SUFFICIENT;
    confidenceExplanation = `Amostra consistente de ${totalConcludedInWindow} entregas concluídas em ${historicalWindowWeeks} semanas observadas. Projeção baseada na média e dispersão histórica.`;
  } else if (totalConcludedInWindow >= 3) {
    confidence = ProjectionConfidence.REDUCED;
    confidenceExplanation = `Amostra reduzida de ${totalConcludedInWindow} entregas em ${historicalWindowWeeks} semanas. A projeção apresenta a faixa observada, devendo ser interpretada com cautela.`;
  } else {
    confidence = ProjectionConfidence.INSUFFICIENT;
    confidenceExplanation = `Histórico insuficiente (${totalConcludedInWindow} entrega(s) concluída(s)). O PERSPECPATH não projeta capacidade com menos de 3 entregas observadas para evitar falsa precisão.`;
  }

  let averageWeeklyThroughput: number | null = null;
  let weeklyVariance: number | null = null;
  let weeklyStandardDeviation: number | null = null;
  let minWeeklyDeliveries: number | null = null;
  let maxWeeklyDeliveries: number | null = null;
  let capacityBaseline: number | null = null;
  let capacityLowerBound: number | null = null;
  let capacityUpperBound: number | null = null;

  if (confidence !== ProjectionConfidence.INSUFFICIENT) {
    // Average weekly throughput
    averageWeeklyThroughput = Math.round((totalConcludedInWindow / historicalWindowWeeks) * 10) / 10;
    capacityBaseline = averageWeeklyThroughput;

    // Variance & Standard Deviation across all W weeks (including 0-delivery weeks)
    let sumSquaredDiff = 0;
    let minObserved = Infinity;
    let maxObserved = -Infinity;

    for (const count of historicalWeeklyBins) {
      sumSquaredDiff += Math.pow(count - averageWeeklyThroughput, 2);
      if (count < minObserved) minObserved = count;
      if (count > maxObserved) maxObserved = count;
    }

    weeklyVariance = Math.round((sumSquaredDiff / historicalWindowWeeks) * 100) / 100;
    weeklyStandardDeviation = Math.round(Math.sqrt(weeklyVariance) * 10) / 10;
    minWeeklyDeliveries = minObserved === Infinity ? 0 : minObserved;
    maxWeeklyDeliveries = maxObserved === -Infinity ? 0 : maxObserved;

    if (confidence === ProjectionConfidence.SUFFICIENT) {
      capacityLowerBound = Math.max(0, Math.round((averageWeeklyThroughput - 0.75 * weeklyStandardDeviation) * 10) / 10);
      capacityUpperBound = Math.round((averageWeeklyThroughput + 0.75 * weeklyStandardDeviation) * 10) / 10;
    } else {
      capacityLowerBound = minWeeklyDeliveries;
      capacityUpperBound = maxWeeklyDeliveries;
    }
  }

  const averageCalendarLeadTimeDays = leadSampleCount > 0
    ? Math.round((totalCalLeadDays / leadSampleCount) * 10) / 10
    : null;

  const averageBusinessLeadTimeDays = leadSampleCount > 0
    ? Math.round((totalBusLeadDays / leadSampleCount) * 10) / 10
    : null;

  const historicalThroughput: HistoricalThroughputMetrics = {
    windowWeeks: historicalWindowWeeks,
    windowStartDate,
    windowEndDate,
    totalConcludedDeliveries: totalConcludedInWindow,
    weeklyDeliveryCounts: historicalWeeklyBins,
    averageWeeklyThroughput,
    weeklyVariance,
    weeklyStandardDeviation,
    minWeeklyDeliveries,
    maxWeeklyDeliveries,
    confidence,
    confidenceExplanation,
    capacityBaseline,
    capacityLowerBound,
    capacityUpperBound,
    averageCalendarLeadTimeDays,
    averageBusinessLeadTimeDays
  };

  // =========================================================================
  // 2. EXTRAÇÃO E PADRONIZAÇÃO DOS COMPROMISSOS FUTUROS (ETAPA 2 & 3)
  // =========================================================================
  const allCommitments: PlanningCommitmentItem[] = [];

  if (deliveryUnit === DeliveryUnitType.ACTIVITIES) {
    for (const act of input.activities) {
      if (!currentProjectIds.has(act.projectId)) continue;
      if (isProjectActivityClosed(act.status)) continue;
      if (!act.deliveryDate) continue;

      const parentProject = projectMap.get(act.projectId);
      if (!parentProject) continue;
      // Exclude canceled projects
      if (parentProject.status === ProjectStatus.CANCELED || parentProject.status === ProjectStatus.DONE) continue;

      const client = clientMap.get(parentProject.clientId);
      const assignee = act.assigneeId ? userMap.get(act.assigneeId) : undefined;
      const canonical = normalizeActivityStatus(act.status);
      const remDays = dayDiff(today, act.deliveryDate);
      const isOverdue = remDays < 0;
      const daysOverdue = isOverdue ? Math.abs(remDays) : null;
      const isBlocked = canonical === ActivityCanonicalStatus.BLOCKED;

      const origDate = act.originalDeliveryDate || act.deliveryDate;
      const isReprogrammed = Boolean(act.originalDeliveryDate && act.originalDeliveryDate !== act.deliveryDate);

      allCommitments.push({
        id: act.id,
        unitType: DeliveryUnitType.ACTIVITIES,
        projectId: parentProject.id,
        projectCode: parentProject.code,
        projectName: parentProject.name,
        clientId: parentProject.clientId,
        clientName: client?.name || 'Cliente não identificado',
        revision: parentProject.revision || `Rev.${String(getProjectRevisionNumber(parentProject)).padStart(2, '0')}`,
        revisionNumber: getProjectRevisionNumber(parentProject),
        activityId: act.id,
        activityName: act.name,
        assigneeId: act.assigneeId,
        assigneeName: assignee?.username,
        deliveryDate: act.deliveryDate,
        originalDeliveryDate: origDate,
        formattedDeliveryDate: formatDisplayDate(act.deliveryDate),
        formattedOriginalDeliveryDate: formatDisplayDate(origDate),
        isReprogrammed,
        status: act.status,
        canonicalStatus: canonical,
        isBlocked,
        blockedReason: act.blockedReason,
        isOverdue,
        daysRemaining: remDays,
        daysOverdue
      });
    }
  } else {
    // Populacão de Projetos / Revisões Ativas
    for (const prj of activeProjects) {
      if (!prj.deliveryDate) continue;

      const client = clientMap.get(prj.clientId);
      const assignee = prj.assigneeId ? userMap.get(prj.assigneeId) : undefined;
      const remDays = dayDiff(today, prj.deliveryDate);
      const isOverdue = remDays < 0;
      const daysOverdue = isOverdue ? Math.abs(remDays) : null;

      const familyId = getProjectFamilyId(prj);
      const rev0 = input.projects.find(p => getProjectFamilyId(p) === familyId && getProjectRevisionNumber(p) === 0);
      const origDate = rev0?.deliveryDate || prj.deliveryDate;
      const isReprogrammed = Boolean(rev0?.deliveryDate && rev0.deliveryDate !== prj.deliveryDate);

      allCommitments.push({
        id: prj.id,
        unitType: DeliveryUnitType.PROJECTS,
        projectId: prj.id,
        projectCode: prj.code,
        projectName: prj.name,
        clientId: prj.clientId,
        clientName: client?.name || 'Cliente não identificado',
        revision: prj.revision || `Rev.${String(getProjectRevisionNumber(prj)).padStart(2, '0')}`,
        revisionNumber: getProjectRevisionNumber(prj),
        assigneeId: prj.assigneeId,
        assigneeName: assignee?.username,
        deliveryDate: prj.deliveryDate,
        originalDeliveryDate: origDate,
        formattedDeliveryDate: formatDisplayDate(prj.deliveryDate),
        formattedOriginalDeliveryDate: formatDisplayDate(origDate),
        isReprogrammed,
        status: prj.status,
        canonicalStatus: prj.status,
        isBlocked: false, // Projects don't have canonical blocked status, activities do
        isOverdue,
        daysRemaining: remDays,
        daysOverdue
      });
    }
  }

  // =========================================================================
  // 3. SEPARAÇÃO DE VENCIDOS E DISTRIBUIÇÃO SEMANAL FUTURA (ETAPAS 3, 5, 6, 7)
  // =========================================================================
  const overdueCommitments: PlanningCommitmentItem[] = [];
  const futureCommitments: PlanningCommitmentItem[] = [];

  for (const c of allCommitments) {
    if (c.deliveryDate < today) {
      overdueCommitments.push(c);
    } else {
      futureCommitments.push(c);
    }
  }

  // Sort overdue by most overdue first
  overdueCommitments.sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0));

  // Build future weekly buckets 1..horizonWeeks
  const weeklyBuckets: PlanningWeekBucket[] = [];

  for (let w = 1; w <= horizonWeeks; w++) {
    const startOffset = (w - 1) * 7 + 1;
    const endOffset = w * 7;
    const startDate = addCalendarDays(today, startOffset) || today;
    const endDate = addCalendarDays(today, endOffset) || today;

    // Filter commitments falling in this weekly range [startDate, endDate]
    const weekItems = futureCommitments.filter(c => c.deliveryDate >= startDate && c.deliveryDate <= endDate);
    // Sort commitments inside week by deliveryDate ascending
    weekItems.sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));

    const count = weekItems.length;
    const blockedCount = weekItems.filter(c => c.isBlocked).length;
    const reprogrammedCount = weekItems.filter(c => c.isReprogrammed).length;

    // Delta demand vs historical capacity
    const delta = capacityBaseline !== null
      ? Math.round((count - capacityBaseline) * 10) / 10
      : null;

    // Baseline Week Status
    let status = WeekDemandStatus.BALANCED;
    let statusExplanation = 'Demanda compatível com o fluxo histórico observado.';

    if (confidence === ProjectionConfidence.INSUFFICIENT) {
      status = WeekDemandStatus.INSUFFICIENT_DATA;
      statusExplanation = 'Demanda programada registrada. Sem alertas quantitativos de sobrecarga por histórico insuficiente.';
    } else if (capacityUpperBound !== null && count > capacityUpperBound) {
      status = WeekDemandStatus.POTENTIAL_OVERLOAD;
      statusExplanation = `Atenção: Demanda de ${count} compromisso(s) excede a faixa de dispersão histórica esperada (máx. ${capacityUpperBound}). Avalie nivelamento.`;
    } else if (capacityBaseline !== null && count > capacityBaseline) {
      status = WeekDemandStatus.ELEVATED_DEMAND;
      statusExplanation = `Demanda acima da média (${count} vs ${capacityBaseline} ent/sem), mas dentro da variabilidade suportada pela equipe.`;
    } else if (blockedCount > 0) {
      status = WeekDemandStatus.HAS_BLOCKS;
      statusExplanation = `A semana possui ${blockedCount} compromisso(s) com impedimentos ativos que necessitam de resolução.`;
    }

    // What-If Simulation on this specific week
    const isSimulatedWeek = Boolean(simulation && simulation.targetWeekNumber === w);
    const simulatedAdditional = isSimulatedWeek && simulation ? simulation.additionalCount : 0;
    const simulatedTotalDemand = count + simulatedAdditional;

    const simulatedDelta = capacityBaseline !== null
      ? Math.round((simulatedTotalDemand - capacityBaseline) * 10) / 10
      : null;

    let simulatedStatus = status;
    if (isSimulatedWeek && simulation) {
      if (confidence === ProjectionConfidence.INSUFFICIENT) {
        simulatedStatus = WeekDemandStatus.INSUFFICIENT_DATA;
      } else if (capacityUpperBound !== null && simulatedTotalDemand > capacityUpperBound) {
        simulatedStatus = WeekDemandStatus.POTENTIAL_OVERLOAD;
      } else if (capacityBaseline !== null && simulatedTotalDemand > capacityBaseline) {
        simulatedStatus = WeekDemandStatus.ELEVATED_DEMAND;
      } else if (blockedCount > 0) {
        simulatedStatus = WeekDemandStatus.HAS_BLOCKS;
      } else {
        simulatedStatus = WeekDemandStatus.BALANCED;
      }
    }

    weeklyBuckets.push({
      weekNumber: w,
      weekLabel: `Semana +${w}`,
      startDate,
      endDate,
      formattedRange: `${formatDisplayDate(startDate)} a ${formatDisplayDate(endDate)}`,
      commitments: weekItems,
      commitmentsCount: count,
      blockedCount,
      reprogrammedCount,
      projectedCapacity: capacityBaseline,
      capacityLowerBound,
      capacityUpperBound,
      demandVsCapacityDelta: delta,
      status,
      statusExplanation,
      simulatedAdditionalDeliveries: simulatedAdditional,
      simulatedTotalDemand,
      simulatedDemandVsCapacityDelta: simulatedDelta,
      simulatedStatus
    });
  }

  // =========================================================================
  // 4. VISÃO INDIVIDUAL NÃO-PUNITIVA POR PROFISSIONAL (ETAPA 8)
  // =========================================================================
  const activeUsers = input.users.filter(u => u.isActive);
  const professionals: ProfessionalPlanningMetrics[] = [];

  for (const user of activeUsers) {
    const userCommitments = futureCommitments.filter(c => c.assigneeId === user.id);
    const userOverdue = overdueCommitments.filter(c => c.assigneeId === user.id);

    // Distribution across weeks
    const weeklyDistribution: number[] = [];
    for (const b of weeklyBuckets) {
      const cnt = b.commitments.filter(c => c.assigneeId === user.id).length;
      weeklyDistribution.push(cnt);
    }

    // Active WIP & Blocks
    let currentWip = 0;
    let activeBlocksCount = 0;

    for (const act of input.activities) {
      if (act.assigneeId !== user.id) continue;
      if (!currentProjectIds.has(act.projectId)) continue;
      const canonical = normalizeActivityStatus(act.status);
      if (canonical === ActivityCanonicalStatus.IN_PROGRESS) currentWip++;
      if (canonical === ActivityCanonicalStatus.BLOCKED) activeBlocksCount++;
    }

    // Individual Historical Throughput
    const userConcludedCount = userConcludedMap.get(user.id) || 0;
    let userConfidence = ProjectionConfidence.INSUFFICIENT;
    let userThroughput: number | null = null;

    if (userConcludedCount >= 8) {
      userConfidence = ProjectionConfidence.SUFFICIENT;
      userThroughput = Math.round((userConcludedCount / historicalWindowWeeks) * 10) / 10;
    } else if (userConcludedCount >= 3) {
      userConfidence = ProjectionConfidence.REDUCED;
      userThroughput = Math.round((userConcludedCount / historicalWindowWeeks) * 10) / 10;
    }

    const wipLimit = input.userWipLimits?.[user.id];
    const isWipLimitExceeded = Boolean(wipLimit && wipLimit > 0 && currentWip > wipLimit);

    professionals.push({
      userId: user.id,
      userName: user.username,
      currentWip,
      activeBlocksCount,
      overdueCount: userOverdue.length,
      totalAssignedInHorizon: userCommitments.length,
      weeklyDistribution,
      individualHistoricalThroughput: userThroughput,
      individualConcludedCount: userConcludedCount,
      individualConfidence: userConfidence,
      wipLimit,
      isWipLimitExceeded,
      commitments: userCommitments
    });
  }

  // Sort professionals alphabetically for stable presentation (NO RANKING)
  professionals.sort((a, b) => a.userName.localeCompare(b.userName));

  const totalHorizonCommitmentsCount = weeklyBuckets.reduce((acc, b) => acc + b.commitmentsCount, 0);

  return {
    horizonWeeks,
    historicalWindowWeeks,
    deliveryUnit,
    todayStr: today,
    historicalThroughput,
    weeklyBuckets,
    overdueBucket: {
      commitments: overdueCommitments,
      count: overdueCommitments.length,
      blockedCount: overdueCommitments.filter(c => c.isBlocked).length
    },
    totalHorizonCommitmentsCount,
    professionals,
    isSimulationActive: Boolean(simulation),
    activeSimulation: simulation
  };
};
