import { Project, ProjectActivity, InternalUser, Client, ProjectStatus } from '../types';
import { isProjectActivityClosed } from './projectActivityStatus';
import {
  ActivityCanonicalStatus,
  formatDisplayDate,
  getTodayDateString,
  normalizeActivityStatus,
  parseLocalDate,
  formatLocalDate
} from './activityOperationalModel';
import { isCurrentProjectRevision, getProjectFamilyId, getProjectRevisionNumber } from './projectRevision';

export enum AlertSeverity {
  CRITICAL = 'CRÍTICA',
  ATTENTION = 'ATENÇÃO',
  INFORMATIVE = 'INFORMATIVA'
}

export enum AlertCategory {
  PROJECT_OVERDUE = 'PROJECT_OVERDUE',         // Projeto com prazo vencido (CRÍTICA)
  ACTIVITY_OVERDUE = 'ACTIVITY_OVERDUE',       // Atividade atrasada (ATENÇÃO)
  ACTIVE_BLOCK = 'ACTIVE_BLOCK',               // Atividade bloqueada (ATENÇÃO)
  UPCOMING_DELIVERY = 'UPCOMING_DELIVERY',     // Próximas entregas em até 3 dias úteis (ATENÇÃO)
  WIP_LIMIT_EXCEEDED = 'WIP_LIMIT_EXCEEDED',   // Limite orientativo de WIP excedido (ATENÇÃO)
  INCOMPLETE_DATA = 'INCOMPLETE_DATA'          // Dados gerenciais incompletos (INFORMATIVA)
}

export interface ActivityAlertDetail {
  activityId: string;
  activityName: string;
  category: AlertCategory;
  severity: AlertSeverity;
  assigneeId?: string;
  assigneeName?: string;
  deliveryDate?: string;
  formattedDeliveryDate: string;
  daysRemaining: number | null;
  daysOverdue: number | null;
  blockedReason?: string;
  blockedSinceDate?: string;
  description: string;
}

export interface ProjectAttentionItem {
  type: 'project';
  id: string; // project.id
  projectId: string;
  projectCode: string;
  projectName: string;
  clientId: string;
  clientName: string;
  clientCode?: string;
  projectAssigneeId?: string;
  projectAssigneeName?: string;
  projectDeliveryDate?: string;
  formattedProjectDeliveryDate: string;
  projectRevision: string;
  daysRemaining: number | null;
  daysOverdue: number | null;
  
  maxSeverity: AlertSeverity;
  primaryReason: string;
  primaryCategory: AlertCategory;
  categories: AlertCategory[];
  
  activities: ActivityAlertDetail[];
  
  overdueActivitiesCount: number;
  blockedActivitiesCount: number;
  upcomingActivitiesCount: number;
  incompleteDataCount: number;
  
  linkedAlertDescriptions: string[];

  sortSeverityWeight: number; // 3 for CRITICAL, 2 for ATTENTION, 1 for INFORMATIVE
  sortDaysOverdue: number;
  sortDaysRemaining: number;
}

export interface TeamWipAttentionItem {
  type: 'team';
  id: string; // 'wip-' + userId
  userId: string;
  userName: string;
  inProgressCount: number;
  wipLimit: number;
  exceededBy: number;
  maxSeverity: AlertSeverity;
  primaryReason: string;
  primaryCategory: AlertCategory.WIP_LIMIT_EXCEEDED;
  categories: AlertCategory[];
  inProgressActivities: {
    id: string;
    name: string;
    projectId: string;
    projectCode: string;
    projectName: string;
    deliveryDate?: string;
  }[];
  sortSeverityWeight: number; // 2
  sortDaysOverdue: number;
  sortDaysRemaining: number;
}

export type ConsolidatedAttentionItem = ProjectAttentionItem | TeamWipAttentionItem;

export interface ManagementAttentionSummary {
  overdueProjectsCount: number;
  blockedActivitiesCount: number;
  upcomingDeliveriesCount: number;
  wipExceededUsersCount: number;
  criticalAlertsCount: number;
  attentionAlertsCount: number;
  informativeAlertsCount: number;
  totalAlertsCount: number;
}

export interface ManagementAttentionEngineResult {
  summary: ManagementAttentionSummary;
  items: ConsolidatedAttentionItem[];
}

export interface ManagementAttentionEngineInput {
  projects: Project[];
  activities: ProjectActivity[];
  users: InternalUser[];
  clients: Client[];
  todayStr?: string;
  userWipLimits?: Record<string, number>;
  eventsByActivityId?: Record<string, { eventType?: string; created_at?: string; createdAt?: number }[]>;
  upcomingBusinessDaysHorizon?: number; // default: 3
  workDays?: number[]; // default: [1, 2, 3, 4, 5]
}

/**
 * Calculates calendar day difference (targetDate - fromDate).
 * Positive = targetDate is in the future.
 * Negative = targetDate is in the past (overdue).
 */
export const calculateDayDifference = (fromDateStr: string, targetDateStr?: string | null): number | null => {
  if (!targetDateStr) return null;
  const from = parseLocalDate(fromDateStr);
  const target = parseLocalDate(targetDateStr);
  if (!from || !target) return null;
  const msDiff = target.getTime() - from.getTime();
  return Math.round(msDiff / (1000 * 60 * 60 * 24));
};

/**
 * Adds business days to a date string, skipping non-working days.
 */
export const addBusinessDaysSafely = (
  dateStr: string,
  businessDaysToAdd: number,
  workDays: number[] = [1, 2, 3, 4, 5]
): string => {
  const d = parseLocalDate(dateStr);
  if (!d) return dateStr;
  let added = 0;
  while (added < businessDaysToAdd) {
    d.setDate(d.getDate() + 1);
    if (workDays.includes(d.getDay())) {
      added++;
    }
  }
  return formatLocalDate(d);
};

/**
 * Pure, deterministic Management Attention Engine for PERSPECPATH.
 */
export const calculateManagementAttention = (
  input: ManagementAttentionEngineInput
): ManagementAttentionEngineResult => {
  const today = input.todayStr || getTodayDateString();
  const workDays = input.workDays || [1, 2, 3, 4, 5];
  const horizonBusinessDays = input.upcomingBusinessDaysHorizon !== undefined ? input.upcomingBusinessDaysHorizon : 3;
  const upcomingHorizonDate = addBusinessDaysSafely(today, horizonBusinessDays, workDays);

  // Quick Map indexes for O(1) lookups
  const userMap = new Map<string, InternalUser>();
  for (const u of input.users) {
    userMap.set(u.id, u);
  }

  const clientMap = new Map<string, Client>();
  for (const c of input.clients) {
    clientMap.set(c.id, c);
  }

  // Filter current revision active projects (exclude DONE, CANCELED and non-current revisions)
  const activeProjects: Project[] = [];
  const currentProjectIds = new Set<string>();

  for (const p of input.projects) {
    if (isCurrentProjectRevision(p)) {
      currentProjectIds.add(p.id);
      if (p.status !== ProjectStatus.DONE && p.status !== ProjectStatus.CANCELED) {
        activeProjects.push(p);
      }
    }
  }

  const activeProjectMap = new Map<string, Project>();
  for (const p of activeProjects) {
    activeProjectMap.set(p.id, p);
  }

  // Index activities by active project
  const activitiesByProjectId = new Map<string, ProjectActivity[]>();
  for (const act of input.activities) {
    if (currentProjectIds.has(act.projectId)) {
      const list = activitiesByProjectId.get(act.projectId);
      if (list) {
        list.push(act);
      } else {
        activitiesByProjectId.set(act.projectId, [act]);
      }
    }
  }

  // Summary accumulators
  let overdueProjectsCount = 0;
  let blockedActivitiesCount = 0;
  let upcomingDeliveriesCount = 0;

  const projectItems: ProjectAttentionItem[] = [];

  // Evaluate each active project
  for (const project of activeProjects) {
    const client = clientMap.get(project.clientId);
    const clientName = client?.name || 'Cliente não identificado';
    const clientCode = client?.code;
    const projectAssignee = project.assigneeId ? userMap.get(project.assigneeId) : undefined;
    const projectAssigneeName = projectAssignee?.username;

    const diffDays = calculateDayDifference(today, project.deliveryDate);
    const isProjectOverdue = project.deliveryDate ? diffDays !== null && diffDays < 0 : false;
    const daysOverdue = isProjectOverdue && diffDays !== null ? Math.abs(diffDays) : null;
    const daysRemaining = diffDays !== null ? diffDays : null;

    if (isProjectOverdue) {
      overdueProjectsCount++;
    }

    // Check project delivery upcoming
    const isProjectUpcoming = Boolean(
      project.deliveryDate &&
      !isProjectOverdue &&
      project.deliveryDate >= today &&
      project.deliveryDate <= upcomingHorizonDate
    );
    if (isProjectUpcoming) {
      upcomingDeliveriesCount++;
    }

    // Check project incomplete data
    const isProjectIncomplete = !project.deliveryDate || !project.startDate;

    // Evaluate activities for this project
    const projectActs = activitiesByProjectId.get(project.id) || [];
    const activityAlerts: ActivityAlertDetail[] = [];

    let projectOverdueActsCount = 0;
    let projectBlockedActsCount = 0;
    let projectUpcomingActsCount = 0;
    let projectIncompleteActsCount = 0;

    for (const act of projectActs) {
      if (isProjectActivityClosed(act.status)) {
        continue;
      }

      const canonicalStatus = normalizeActivityStatus(act.status);
      const actDiff = calculateDayDifference(today, act.deliveryDate);
      const isActOverdue = act.deliveryDate ? actDiff !== null && actDiff < 0 : false;
      const actDaysOverdue = isActOverdue && actDiff !== null ? Math.abs(actDiff) : null;
      const actAssignee = act.assigneeId ? userMap.get(act.assigneeId) : undefined;

      // 1. Blocked Activity (ATENÇÃO)
      if (canonicalStatus === ActivityCanonicalStatus.BLOCKED) {
        blockedActivitiesCount++;
        projectBlockedActsCount++;

        let blockedDate: string | undefined;
        const events = input.eventsByActivityId?.[act.id];
        if (events && events.length > 0) {
          const blockEvent = events.find(e => e.eventType === 'ACTIVITY_BLOCKED');
          if (blockEvent) {
            const rawDate = blockEvent.created_at || (blockEvent.createdAt ? new Date(blockEvent.createdAt).toISOString() : undefined);
            if (rawDate) {
              blockedDate = formatDisplayDate(rawDate.slice(0, 10));
            }
          }
        }

        activityAlerts.push({
          activityId: act.id,
          activityName: act.name,
          category: AlertCategory.ACTIVE_BLOCK,
          severity: AlertSeverity.ATTENTION,
          assigneeId: act.assigneeId,
          assigneeName: actAssignee?.username,
          deliveryDate: act.deliveryDate,
          formattedDeliveryDate: formatDisplayDate(act.deliveryDate),
          daysRemaining: actDiff,
          daysOverdue: actDaysOverdue,
          blockedReason: act.blockedReason || 'Impedimento ativo',
          blockedSinceDate: blockedDate,
          description: actDaysOverdue !== null
            ? `Atividade bloqueada e vencida há ${actDaysOverdue}d: ${act.blockedReason || 'Aguardando desbloqueio'}`
            : `Atividade bloqueada: ${act.blockedReason || 'Aguardando desbloqueio'}`
        });
      }

      // 2. Overdue Activity (ATENÇÃO) - para atividades ativas com prazo vencido não bloqueadas
      if (isActOverdue && canonicalStatus !== ActivityCanonicalStatus.BLOCKED) {
        projectOverdueActsCount++;
        activityAlerts.push({
          activityId: act.id,
          activityName: act.name,
          category: AlertCategory.ACTIVITY_OVERDUE,
          severity: AlertSeverity.ATTENTION,
          assigneeId: act.assigneeId,
          assigneeName: actAssignee?.username,
          deliveryDate: act.deliveryDate,
          formattedDeliveryDate: formatDisplayDate(act.deliveryDate),
          daysRemaining: actDiff,
          daysOverdue: actDaysOverdue,
          description: `Atividade atrasada há ${actDaysOverdue} dia(s)`
        });
      }

      // 3. Upcoming Activity (ATENÇÃO)
      const isActUpcoming = Boolean(
        act.deliveryDate &&
        !isActOverdue &&
        act.deliveryDate >= today &&
        act.deliveryDate <= upcomingHorizonDate &&
        canonicalStatus !== ActivityCanonicalStatus.BLOCKED
      );
      if (isActUpcoming) {
        projectUpcomingActsCount++;
        upcomingDeliveriesCount++;
        activityAlerts.push({
          activityId: act.id,
          activityName: act.name,
          category: AlertCategory.UPCOMING_DELIVERY,
          severity: AlertSeverity.ATTENTION,
          assigneeId: act.assigneeId,
          assigneeName: actAssignee?.username,
          deliveryDate: act.deliveryDate,
          formattedDeliveryDate: formatDisplayDate(act.deliveryDate),
          daysRemaining: actDiff,
          daysOverdue: null,
          description: `Entrega em ${actDiff === 0 ? 'hoje' : `${actDiff} dia(s)`}`
        });
      }

      // 4. Incomplete Activity Data (INFORMATIVA)
      if (!act.deliveryDate || !act.assigneeId) {
        projectIncompleteActsCount++;
        activityAlerts.push({
          activityId: act.id,
          activityName: act.name,
          category: AlertCategory.INCOMPLETE_DATA,
          severity: AlertSeverity.INFORMATIVE,
          assigneeId: act.assigneeId,
          assigneeName: actAssignee?.username,
          deliveryDate: act.deliveryDate,
          formattedDeliveryDate: formatDisplayDate(act.deliveryDate),
          daysRemaining: null,
          daysOverdue: null,
          description: !act.deliveryDate && !act.assigneeId
            ? 'Atividade sem prazo e sem responsável definidos'
            : !act.deliveryDate
              ? 'Atividade sem prazo definido'
              : 'Atividade sem responsável atribuído'
        });
      }
    }

    // Determine if this project has any attention reasons
    const hasProjectIssues = isProjectOverdue || isProjectUpcoming || isProjectIncomplete || activityAlerts.length > 0;
    if (!hasProjectIssues) {
      continue;
    }

    // Determine max severity
    let maxSeverity = AlertSeverity.INFORMATIVE;
    let sortSeverityWeight = 1;

    if (isProjectOverdue) {
      maxSeverity = AlertSeverity.CRITICAL;
      sortSeverityWeight = 3;
    } else if (
      projectBlockedActsCount > 0 ||
      projectOverdueActsCount > 0 ||
      isProjectUpcoming ||
      projectUpcomingActsCount > 0
    ) {
      maxSeverity = AlertSeverity.ATTENTION;
      sortSeverityWeight = 2;
    }

    // Determine primary category and reason
    let primaryCategory: AlertCategory;
    let primaryReason: string;

    if (isProjectOverdue) {
      primaryCategory = AlertCategory.PROJECT_OVERDUE;
      primaryReason = `Prazo do projeto vencido há ${daysOverdue} dia(s) (${formatDisplayDate(project.deliveryDate)})`;
    } else if (projectBlockedActsCount > 0) {
      primaryCategory = AlertCategory.ACTIVE_BLOCK;
      const firstBlocked = activityAlerts.find(a => a.category === AlertCategory.ACTIVE_BLOCK);
      primaryReason = projectBlockedActsCount === 1 && firstBlocked
        ? `1 atividade bloqueada: ${firstBlocked.activityName} (${firstBlocked.blockedReason})`
        : `${projectBlockedActsCount} atividades bloqueadas com impedimento ativo`;
    } else if (projectOverdueActsCount > 0) {
      primaryCategory = AlertCategory.ACTIVITY_OVERDUE;
      const firstOverdue = activityAlerts.find(a => a.category === AlertCategory.ACTIVITY_OVERDUE);
      primaryReason = projectOverdueActsCount === 1 && firstOverdue
        ? `1 atividade atrasada: ${firstOverdue.activityName} (vencida há ${firstOverdue.daysOverdue}d)`
        : `${projectOverdueActsCount} atividades com prazo de entrega vencido`;
    } else if (isProjectUpcoming) {
      primaryCategory = AlertCategory.UPCOMING_DELIVERY;
      primaryReason = `Entrega do projeto prevista em ${daysRemaining === 0 ? 'hoje' : `${daysRemaining} dia(s)`} (${formatDisplayDate(project.deliveryDate)})`;
    } else if (projectUpcomingActsCount > 0) {
      primaryCategory = AlertCategory.UPCOMING_DELIVERY;
      primaryReason = `${projectUpcomingActsCount} atividade(s) com entrega prevista nos próximos ${horizonBusinessDays} dias úteis`;
    } else {
      primaryCategory = AlertCategory.INCOMPLETE_DATA;
      primaryReason = !project.deliveryDate
        ? 'Projeto sem prazo global de entrega definido'
        : 'Projeto com dados gerenciais incompletos';
    }

    // Collect all distinct categories
    const categoriesSet = new Set<AlertCategory>();
    if (isProjectOverdue) categoriesSet.add(AlertCategory.PROJECT_OVERDUE);
    if (isProjectUpcoming) categoriesSet.add(AlertCategory.UPCOMING_DELIVERY);
    if (isProjectIncomplete) categoriesSet.add(AlertCategory.INCOMPLETE_DATA);
    for (const a of activityAlerts) {
      categoriesSet.add(a.category);
    }
    const categories = Array.from(categoriesSet);

    // Linked alert summaries (excluding the primary message when redundant)
    const linkedAlertDescriptions: string[] = [];
    if (isProjectOverdue && projectBlockedActsCount > 0) {
      linkedAlertDescriptions.push(`${projectBlockedActsCount} atividade(s) bloqueada(s)`);
    }
    if (isProjectOverdue && projectOverdueActsCount > 0) {
      linkedAlertDescriptions.push(`${projectOverdueActsCount} atividade(s) atrasada(s)`);
    }
    if (!isProjectOverdue && projectBlockedActsCount > 0 && projectOverdueActsCount > 0) {
      linkedAlertDescriptions.push(`${projectOverdueActsCount} atividade(s) atrasada(s)`);
    }
    if (projectUpcomingActsCount > 0 && primaryCategory !== AlertCategory.UPCOMING_DELIVERY) {
      linkedAlertDescriptions.push(`${projectUpcomingActsCount} entrega(s) próxima(s)`);
    }
    if (projectIncompleteActsCount > 0 && primaryCategory !== AlertCategory.INCOMPLETE_DATA) {
      linkedAlertDescriptions.push(`${projectIncompleteActsCount} atividade(s) com dados incompletos`);
    }

    projectItems.push({
      type: 'project',
      id: project.id,
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      clientId: project.clientId,
      clientName,
      clientCode,
      projectAssigneeId: project.assigneeId,
      projectAssigneeName,
      projectDeliveryDate: project.deliveryDate,
      formattedProjectDeliveryDate: formatDisplayDate(project.deliveryDate),
      projectRevision: project.revision || `Rev.${String(getProjectRevisionNumber(project)).padStart(2, '0')}`,
      daysRemaining,
      daysOverdue,
      maxSeverity,
      primaryReason,
      primaryCategory,
      categories,
      activities: activityAlerts,
      overdueActivitiesCount: projectOverdueActsCount,
      blockedActivitiesCount: projectBlockedActsCount,
      upcomingActivitiesCount: projectUpcomingActsCount,
      incompleteDataCount: projectIncompleteActsCount,
      linkedAlertDescriptions,
      sortSeverityWeight,
      sortDaysOverdue: daysOverdue || 0,
      sortDaysRemaining: daysRemaining !== null && daysRemaining >= 0 ? daysRemaining : 999
    });
  }

  // 2.5 Concentração de WIP por Profissional
  let wipExceededUsersCount = 0;
  const teamWipItems: TeamWipAttentionItem[] = [];

  if (input.userWipLimits) {
    for (const user of input.users) {
      if (!user.isActive) continue;
      const limit = input.userWipLimits[user.id];
      // Only signal if a valid limit > 0 was configured
      if (limit !== undefined && limit > 0) {
        // Collect in-progress activities
        const userInProgressActivities: TeamWipAttentionItem['inProgressActivities'] = [];
        for (const act of input.activities) {
          if (
            act.assigneeId === user.id &&
            normalizeActivityStatus(act.status) === ActivityCanonicalStatus.IN_PROGRESS &&
            currentProjectIds.has(act.projectId)
          ) {
            const prj = activeProjectMap.get(act.projectId);
            userInProgressActivities.push({
              id: act.id,
              name: act.name,
              projectId: act.projectId,
              projectCode: prj?.code || 'PRJ',
              projectName: prj?.name || 'Projeto',
              deliveryDate: act.deliveryDate
            });
          }
        }

        const count = userInProgressActivities.length;
        if (count > limit) {
          wipExceededUsersCount++;
          const exceededBy = count - limit;
          teamWipItems.push({
            type: 'team',
            id: `wip-${user.id}`,
            userId: user.id,
            userName: user.username,
            inProgressCount: count,
            wipLimit: limit,
            exceededBy,
            maxSeverity: AlertSeverity.ATTENTION,
            primaryReason: `WIP acima do limite orientativo (${count} em andamento, limite: ${limit})`,
            primaryCategory: AlertCategory.WIP_LIMIT_EXCEEDED,
            categories: [AlertCategory.WIP_LIMIT_EXCEEDED],
            inProgressActivities: userInProgressActivities,
            sortSeverityWeight: 2,
            sortDaysOverdue: 0,
            sortDaysRemaining: 500
          });
        }
      }
    }
  }

  // Merge and sort all items deterministically
  const allItems: ConsolidatedAttentionItem[] = [...projectItems, ...teamWipItems];

  allItems.sort((a, b) => {
    // 1. Severity weight descending (CRÍTICA > ATENÇÃO > INFORMATIVA)
    if (b.sortSeverityWeight !== a.sortSeverityWeight) {
      return b.sortSeverityWeight - a.sortSeverityWeight;
    }
    // 2. Days overdue descending (highest delay first)
    if (b.sortDaysOverdue !== a.sortDaysOverdue) {
      return b.sortDaysOverdue - a.sortDaysOverdue;
    }
    // 3. Days remaining ascending (soonest deadline first)
    if (a.sortDaysRemaining !== b.sortDaysRemaining) {
      return a.sortDaysRemaining - b.sortDaysRemaining;
    }
    // 4. Stable tie-breaker: ID / Code
    const aKey = a.type === 'project' ? a.projectCode : a.userName;
    const bKey = b.type === 'project' ? b.projectCode : b.userName;
    return aKey.localeCompare(bKey);
  });

  // Calculate summary counts
  let criticalAlertsCount = 0;
  let attentionAlertsCount = 0;
  let informativeAlertsCount = 0;

  for (const item of allItems) {
    if (item.maxSeverity === AlertSeverity.CRITICAL) criticalAlertsCount++;
    else if (item.maxSeverity === AlertSeverity.ATTENTION) attentionAlertsCount++;
    else informativeAlertsCount++;
  }

  return {
    summary: {
      overdueProjectsCount,
      blockedActivitiesCount,
      upcomingDeliveriesCount,
      wipExceededUsersCount,
      criticalAlertsCount,
      attentionAlertsCount,
      informativeAlertsCount,
      totalAlertsCount: allItems.length
    },
    items: allItems
  };
};
