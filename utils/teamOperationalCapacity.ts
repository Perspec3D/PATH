import { Project, ProjectActivity, InternalUser } from '../types';
import {
  ActivityCanonicalStatus,
  calculateBusinessDurationDays,
  calculateCalendarDurationDays,
  addCalendarDays,
  formatDisplayDate,
  getTodayDateString,
  isActivityBlocked,
  isActivityClosed,
  isActivityInProgress,
  normalizeActivityStatus,
  parseLocalDate
} from './activityOperationalModel';
import { isCurrentProjectRevision } from './projectRevision';

export type HistoricalWindowWeeks = 4 | 8 | 12;

export enum SampleConfidence {
  SUFFICIENT = 'CONFIÁVEL',
  LOW = 'AMOSTRA REDUZIDA',
  INSUFFICIENT = 'HISTÓRICO INSUFICIENTE'
}

export interface ConcludedDelivery {
  activityId: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  activityName: string;
  assigneeId?: string;
  conclusionResponsibleId?: string;
  effectiveResponsibleId: string;
  startDate: string;
  concludedDate: string;
  calendarLeadTimeDays: number;
  businessLeadTimeDays: number;
  isOnTime: boolean;
}

export interface UpcomingCommitmentItem {
  id: string;
  projectId: string;
  name: string;
  deliveryDate: string;
  formattedDeliveryDate: string;
  projectName: string;
  projectCode: string;
  status: ActivityCanonicalStatus;
  isBlocked: boolean;
  isOverdue: boolean;
}

export interface ProfessionalCapacityMetrics {
  userId: string;
  username: string;
  userName: string;
  concludedCount: number;
  sampleConfidence: SampleConfidence;
  weeklyThroughput: number | null; // Entregas/semana no período histórico
  monthlyThroughput: number | null; // Entregas/mês no período histórico
  averageCalendarLeadTimeDays: number | null;
  averageBusinessLeadTimeDays: number | null;
  inProgressCount: number; // WIP atual
  blockedCount: number; // Atividades bloqueadas
  overdueCount: number; // Atividades atrasadas
  openActivitiesCount: number;
  wipLimit?: number;
  isWipLimitExceeded: boolean;
  upcomingDeliveries: UpcomingCommitmentItem[];
  theoreticalCapacityThroughput: number | null; // Cenário teórico Little's Law
  theoreticalCapacityExplanation?: string;
}

export interface UpcomingWeekProjection {
  weekNumber: number; // 1, 2, 3, 4
  weekLabel: string;
  startDate: string;
  endDate: string;
  commitmentsCount: number; // Compromissos cadastrados com data
  projectedCapacity: number | null; // Capacidade projetada a partir da vazão histórica
  blockedCommitmentsCount: number; // Riscos e impedimentos atuais
  overdueCommitmentsCount: number; // Prazos vencidos
  confidence: SampleConfidence;
  demandVsCapacityDelta: number | null; // compromissos - capacidade projetada
}

export interface TeamOperationalCapacityResult {
  windowWeeks: HistoricalWindowWeeks;
  windowStartDate: string;
  todayStr: string;
  // Indicadores Gerais da Equipe
  totalConcludedDeliveries: number;
  sampleConfidence: SampleConfidence;
  teamWeeklyThroughput: number | null;
  teamMonthlyThroughput: number | null;
  averageCalendarLeadTimeDays: number | null;
  averageBusinessLeadTimeDays: number | null;
  totalWip: number;
  totalBlocked: number;
  totalOverdue: number;
  // Análise Individual por Profissional
  professionals: ProfessionalCapacityMetrics[];
  exceededWipProfessionalsCount: number;
  // Planejamento Futuro (Próximas 4 semanas)
  weeklyProjections: UpcomingWeekProjection[];
  // Cenário Teórico da Equipe (Little's Law)
  teamTheoreticalWeeklyCapacity: number | null;
  theoreticalExplanation: string;
}

export interface CalculateTeamOperationalCapacityParams {
  projects: Project[];
  activities: ProjectActivity[];
  users: InternalUser[];
  todayStr?: string;
  windowWeeks?: HistoricalWindowWeeks;
  userWipLimits?: Record<string, number>;
  workDays?: number[];
  currentProjectIds?: Set<string>;
}

/**
 * Motor centralizado de cálculo de Capacidade Operacional baseado em fluxo real:
 * - Lead time histórico (dias úteis e corridos separados)
 * - Vazão histórica de entregas (Throughput semanal/mensal)
 * - WIP atual e bloqueios operacionais
 * - Projeção futura com base na vazão observada
 * - Amostras insuficientes claramente sinalizadas, sem números fictícios ou horas estimadas
 */
export const calculateTeamOperationalCapacity = ({
  projects,
  activities,
  users,
  todayStr = getTodayDateString(),
  windowWeeks = 8,
  userWipLimits = {},
  workDays = [1, 2, 3, 4, 5],
  currentProjectIds
}: CalculateTeamOperationalCapacityParams): TeamOperationalCapacityResult => {
  const windowDays = windowWeeks * 7;
  const windowStartDate = addCalendarDays(todayStr, -windowDays) || todayStr;

  // Mapa de projetos por ID para busca rápida
  const projectMap = new Map<string, Project>();
  for (const p of projects) {
    projectMap.set(p.id, p);
  }

  // Filtragem de projetos ativos atuais se não informados
  const effectiveCurrentProjectIds = currentProjectIds || new Set(
    projects.filter(isCurrentProjectRevision).map(p => p.id)
  );

  // 1. Extração de Entregas Históricas Concluídas dentro da Janela
  const concludedDeliveries: ConcludedDelivery[] = [];
  const deliveriesByUser = new Map<string, ConcludedDelivery[]>();

  for (const act of activities) {
    if (!effectiveCurrentProjectIds.has(act.projectId)) continue;

    const canonical = normalizeActivityStatus(act.status);
    if (canonical !== ActivityCanonicalStatus.COMPLETED) continue;

    const concludedDate = act.actualEndDate || act.deliveryDate;
    const startDate = act.actualStartDate || act.startDate;

    // Regra: Excluir registros sem datas comprováveis
    if (!concludedDate || !startDate) continue;

    // Conclusão deve ter ocorrido dentro da janela de análise [windowStartDate, todayStr]
    if (concludedDate < windowStartDate || concludedDate > todayStr) continue;

    const calendarLead = calculateCalendarDurationDays(startDate, concludedDate);
    const businessLead = calculateBusinessDurationDays(startDate, concludedDate, workDays);

    if (calendarLead === null || businessLead === null) continue;

    // Atribuição da entrega: responsabilidade de conclusão ou responsável atribuído
    const responsibleId = act.conclusionResponsibleId || act.assigneeId || 'unassigned';
    const parent = projectMap.get(act.projectId);

    const targetDeadline = act.deadlineAtConclusion || act.deliveryDate;
    const isOnTime = targetDeadline ? concludedDate <= targetDeadline : true;

    const deliveryItem: ConcludedDelivery = {
      activityId: act.id,
      projectId: act.projectId,
      projectCode: parent?.code || '—',
      projectName: parent?.name || 'Projeto',
      activityName: act.name,
      assigneeId: act.assigneeId,
      conclusionResponsibleId: act.conclusionResponsibleId,
      effectiveResponsibleId: responsibleId,
      startDate,
      concludedDate,
      calendarLeadTimeDays: calendarLead,
      businessLeadTimeDays: businessLead,
      isOnTime
    };

    concludedDeliveries.push(deliveryItem);

    if (responsibleId !== 'unassigned') {
      const list = deliveriesByUser.get(responsibleId) || [];
      list.push(deliveryItem);
      deliveriesByUser.set(responsibleId, list);
    }
  }

  // 2. Cálculo de Lead Time e Amostra Geral da Equipe
  const totalConcluded = concludedDeliveries.length;
  let teamSampleConfidence = SampleConfidence.INSUFFICIENT;
  if (totalConcluded >= 5) {
    teamSampleConfidence = SampleConfidence.SUFFICIENT;
  } else if (totalConcluded >= 2) {
    teamSampleConfidence = SampleConfidence.LOW;
  }

  const teamTotalCalendarDays = concludedDeliveries.reduce((acc, d) => acc + d.calendarLeadTimeDays, 0);
  const teamTotalBusinessDays = concludedDeliveries.reduce((acc, d) => acc + d.businessLeadTimeDays, 0);

  const averageCalendarLeadTimeDays = totalConcluded > 0
    ? Math.round((teamTotalCalendarDays / totalConcluded) * 10) / 10
    : null;

  const averageBusinessLeadTimeDays = totalConcluded > 0
    ? Math.round((teamTotalBusinessDays / totalConcluded) * 10) / 10
    : null;

  // Vazão da equipe (Throughput): entregas / semanas da janela
  const teamWeeklyThroughput = teamSampleConfidence !== SampleConfidence.INSUFFICIENT
    ? Math.round((totalConcluded / windowWeeks) * 10) / 10
    : null;

  const teamMonthlyThroughput = teamWeeklyThroughput !== null
    ? Math.round((teamWeeklyThroughput * 4.33) * 10) / 10
    : null;

  // 3. WIP Atual, Bloqueios e Atrasos
  const openActivities = activities.filter(act => (
    effectiveCurrentProjectIds.has(act.projectId) && !isActivityClosed(act.status)
  ));

  const totalWip = openActivities.filter(act => isActivityInProgress(act.status)).length;
  const totalBlocked = openActivities.filter(act => isActivityBlocked(act.status)).length;
  const totalOverdue = openActivities.filter(act => {
    return act.deliveryDate ? act.deliveryDate < todayStr : false;
  }).length;

  // 4. Métricas Individuais por Profissional
  const activeUsers = users.filter(u => u.isActive);
  const professionals: ProfessionalCapacityMetrics[] = activeUsers.map(user => {
    const userDeliveries = deliveriesByUser.get(user.id) || [];
    const count = userDeliveries.length;

    let sampleConfidence = SampleConfidence.INSUFFICIENT;
    if (count >= 5) {
      sampleConfidence = SampleConfidence.SUFFICIENT;
    } else if (count >= 2) {
      sampleConfidence = SampleConfidence.LOW;
    }

    const totalCalDays = userDeliveries.reduce((acc, d) => acc + d.calendarLeadTimeDays, 0);
    const totalBusDays = userDeliveries.reduce((acc, d) => acc + d.businessLeadTimeDays, 0);

    const avgCalLead = count > 0 ? Math.round((totalCalDays / count) * 10) / 10 : null;
    const avgBusLead = count > 0 ? Math.round((totalBusDays / count) * 10) / 10 : null;

    const weeklyThroughput = sampleConfidence !== SampleConfidence.INSUFFICIENT
      ? Math.round((count / windowWeeks) * 10) / 10
      : null;

    const monthlyThroughput = weeklyThroughput !== null
      ? Math.round((weeklyThroughput * 4.33) * 10) / 10
      : null;

    // WIP e atividades ativas do profissional
    const userOpenActivities = openActivities.filter(act => act.assigneeId === user.id);
    const inProgressCount = userOpenActivities.filter(act => isActivityInProgress(act.status)).length;
    const blockedCount = userOpenActivities.filter(act => isActivityBlocked(act.status)).length;
    const overdueCount = userOpenActivities.filter(act => act.deliveryDate ? act.deliveryDate < todayStr : false).length;

    const wipLimit = userWipLimits[user.id];
    const isWipLimitExceeded = Boolean(wipLimit && wipLimit > 0 && inProgressCount > wipLimit);

    // Próximas entregas ordenadas por data
    const upcomingDeliveries: UpcomingCommitmentItem[] = userOpenActivities
      .filter(act => Boolean(act.deliveryDate))
      .sort((a, b) => (a.deliveryDate || '').localeCompare(b.deliveryDate || ''))
      .slice(0, 5)
      .map(act => {
        const parent = projectMap.get(act.projectId);
        const canonical = normalizeActivityStatus(act.status);
        return {
          id: act.id,
          projectId: act.projectId,
          name: act.name,
          deliveryDate: act.deliveryDate!,
          formattedDeliveryDate: formatDisplayDate(act.deliveryDate),
          projectName: parent?.name || 'Projeto',
          projectCode: parent?.code || '—',
          status: canonical,
          isBlocked: canonical === ActivityCanonicalStatus.BLOCKED,
          isOverdue: act.deliveryDate ? act.deliveryDate < todayStr : false
        };
      });

    // Cenário teórico restritivo: (dias úteis da semana / lead time médio em dias úteis)
    // Hipótese: fluxo estritamente sequencial sem esperas ociosas
    const workDaysPerWeek = workDays.length;
    const theoreticalCapacityThroughput = (avgBusLead !== null && avgBusLead > 0 && sampleConfidence !== SampleConfidence.INSUFFICIENT)
      ? Math.round((workDaysPerWeek / avgBusLead) * 10) / 10
      : null;

    const theoreticalCapacityExplanation = theoreticalCapacityThroughput !== null
      ? `Cenário Teórico Restritivo: ${workDaysPerWeek} dias úteis / ${avgBusLead} dias úteis de lead time. Assume execução sequencial sem filas externas.`
      : undefined;

    const displayName = user.username || 'Profissional';

    return {
      userId: user.id,
      username: displayName,
      userName: displayName,
      concludedCount: count,
      sampleConfidence,
      weeklyThroughput,
      monthlyThroughput,
      averageCalendarLeadTimeDays: avgCalLead,
      averageBusinessLeadTimeDays: avgBusLead,
      inProgressCount,
      blockedCount,
      overdueCount,
      openActivitiesCount: userOpenActivities.length,
      wipLimit,
      isWipLimitExceeded,
      upcomingDeliveries,
      theoreticalCapacityThroughput,
      theoreticalCapacityExplanation
    };
  });

  const exceededWipCount = professionals.filter(p => p.isWipLimitExceeded).length;

  // 5. Planejamento Futuro — Projeção para as Próximas 4 Semanas
  const weeklyProjections: UpcomingWeekProjection[] = [];
  for (let w = 1; w <= 4; w++) {
    const startOffset = (w - 1) * 7 + 1;
    const endOffset = w * 7;
    const weekStart = addCalendarDays(todayStr, startOffset) || todayStr;
    const weekEnd = addCalendarDays(todayStr, endOffset) || todayStr;

    // Atividades abertas com prazo nesta semana
    const weekCommitments = openActivities.filter(act => {
      if (!act.deliveryDate) return false;
      // Para a primeira semana, inclui compromissos já vencidos pendentes de conclusão
      if (w === 1 && act.deliveryDate < weekStart) return true;
      return act.deliveryDate >= weekStart && act.deliveryDate <= weekEnd;
    });

    const commitmentsCount = weekCommitments.length;
    const blockedCount = weekCommitments.filter(act => isActivityBlocked(act.status)).length;
    const overdueCount = weekCommitments.filter(act => act.deliveryDate && act.deliveryDate < todayStr).length;

    const projectedCapacity = teamWeeklyThroughput !== null
      ? teamWeeklyThroughput
      : null;

    const delta = projectedCapacity !== null
      ? Math.round((commitmentsCount - projectedCapacity) * 10) / 10
      : null;

    weeklyProjections.push({
      weekNumber: w,
      weekLabel: `Semana +${w} (${formatDisplayDate(weekStart)} a ${formatDisplayDate(weekEnd)})`,
      startDate: weekStart,
      endDate: weekEnd,
      commitmentsCount,
      projectedCapacity,
      blockedCommitmentsCount: blockedCount,
      overdueCommitmentsCount: overdueCount,
      confidence: teamSampleConfidence,
      demandVsCapacityDelta: delta
    });
  }

  // 6. Cenário Teórico Global da Equipe (Little's Law)
  const activeUserCount = activeUsers.length;
  const workDaysPerWeek = workDays.length;
  const teamTheoreticalWeeklyCapacity = (averageBusinessLeadTimeDays !== null && averageBusinessLeadTimeDays > 0 && teamSampleConfidence !== SampleConfidence.INSUFFICIENT)
    ? Math.round(((workDaysPerWeek * activeUserCount) / averageBusinessLeadTimeDays) * 10) / 10
    : null;

  const theoreticalExplanation = 'Cenário teórico baseado em Little\'s Law (dias úteis da equipe ÷ lead time médio em dias úteis). Apresentado exclusivamente como balizador conceitual sob a hipótese restritiva de dedicação contínua sem filas de espera.';

  return {
    windowWeeks,
    windowStartDate,
    todayStr,
    totalConcludedDeliveries: totalConcluded,
    sampleConfidence: teamSampleConfidence,
    teamWeeklyThroughput,
    teamMonthlyThroughput,
    averageCalendarLeadTimeDays,
    averageBusinessLeadTimeDays,
    totalWip,
    totalBlocked,
    totalOverdue,
    professionals,
    exceededWipProfessionalsCount: exceededWipCount,
    weeklyProjections,
    teamTheoreticalWeeklyCapacity,
    theoreticalExplanation
  };
};
