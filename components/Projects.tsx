
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  List,
  LayoutGrid,
  Calendar,
  MoreVertical,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Ban,
  ChevronRight,
  User,
  Plus,
  ArrowRight,
  Check,
  AlertCircle,
  Eye,
  CalendarDays,
  ExternalLink,
  Trash2,
  Loader2
} from 'lucide-react';
import { Project, ProjectStatus, Client, InternalUser, UserRole, LogModule, LogAction, ActivityType, ProjectActivity, ActivityExecution, ActivityExecutionStatus, ActiveWorkSessionContext, WorkSession, ActivityOvertimeEntry, ActivityCanonicalStatus, ActivityDeadlineStatus, ProjectActivityEvent } from '../types';
import { getNextGlobalProjectSeq, syncProject, createProjectRevision, deleteProject, deleteProjectPermanently, fetchProjectDeletionSummary, AppDB, logAction, logActionsBatch, fetchActivityTypes, fetchProjectActivities, syncProjectActivity, deleteProjectActivity, getNextUserOrderIndex, reorderUserQueue, fetchActivityExecutions, fetchWorkSessions, fetchActivityOvertimeEntries, createActivityOvertimeEntry, updateActivityOvertimeEntry, deleteActivityOvertimeEntry, fetchActiveWorkSessionContext, startOrResumeActivity, pauseActivityExecution, completeActivityExecution, OperationalMetricsDataset, reactivateProjectRevision, hasActiveWorkSessionsForProject, activateProjectRevisionSimultaneously, deactivateProjectRevision, fetchProjectActivityEvents, fetchProjectActivitiesEventsBatch, logProjectActivityEvent, transitionProjectActivityWithEvent } from '../storage';
import { AdministrativeDeleteModal } from './AdministrativeDeleteModal';
import { canUserDeletePermanently, calculateProjectDeletionImpact, applyProjectDeletionToState, ProjectDeletionImpact } from '../utils/administrativeDeletion';
import { generateDiffLogs, formatDateForLog } from '../utils/logDiff';
import { calculateAccountedOperationalMs, calculateOvertimeMs, calculateRegularOperationalMs, calculatePauseMetrics } from '../utils/operationalTime';
import { calculateProjectDeliveryPredictability, ProjectDeliveryPredictability, ProjectDeliveryPredictabilityStatus, getDeliveryPredictabilityBadge } from '../utils/deliveryForecast';
import { findActivitiesOutsideProjectPeriod, getAffectedActivitiesLabel, getProjectPeriodLabel, isActivityWithinProjectPeriod, isValidDateRange } from '../utils/projectDateIntegrity';
import { getProjectFamilyId, getProjectRevisionNumber, isCurrentProjectRevision } from '../utils/projectRevision';
import { normalizeActivityStatus, isActivityCompleted, isActivityInProgress, isActivityBlocked, isActivityToDo, getActivityStatusBadge, formatDisplayDate, getTodayDateString, evaluateDeadlineStatus, calculateActivityManagerialMetrics, calculateCalendarDurationDays, calculateDaysDifference, createActivityEventPayload } from '../utils/activityOperationalModel';

interface ProjectsProps {
  db: AppDB;
  setDb: (db: AppDB) => void;
  currentUser: InternalUser;
  theme: 'dark' | 'light';
  initialEditingProject?: Project | null;
  clearInitialEditingProject?: () => void;
  initialEditingActivity?: ProjectActivity | null;
  clearInitialEditingActivity?: () => void;
  onNavigateToTimeline?: () => void;
}

export const Projects: React.FC<ProjectsProps> = ({
  db,
  setDb,
  currentUser,
  theme,
  initialEditingProject,
  clearInitialEditingProject,
  initialEditingActivity,
  clearInitialEditingActivity,
  onNavigateToTimeline
}) => {
  const [showModal, setShowModal] = useState(false);
  const [showImageZoom, setShowImageZoom] = useState<string | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [clientFilter, setClientFilter] = useState<string>('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [showCanceledColumn, setShowCanceledColumn] = useState(false);
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ProjectStatus | null>(null);
  const [menuOpenProjectId, setMenuOpenProjectId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [status, setStatus] = useState<ProjectStatus>(ProjectStatus.QUEUE);
  const [startDate, setStartDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [expandedFamilyIds, setExpandedFamilyIds] = useState<string[]>([]);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionStartDate, setRevisionStartDate] = useState('');
  const [revisionDeliveryDate, setRevisionDeliveryDate] = useState('');
  const [revisionAssigneeId, setRevisionAssigneeId] = useState('');
  const [revisionNotes, setRevisionNotes] = useState('');
  const [isCreatingRevision, setIsCreatingRevision] = useState(false);

  // Project Activities States
  const [projectActivities, setProjectActivities] = useState<ProjectActivity[]>([]);
  const [activityExecutions, setActivityExecutions] = useState<ActivityExecution[]>([]);
  const [workSessions, setWorkSessions] = useState<WorkSession[]>([]);
  const [overtimeEntries, setOvertimeEntries] = useState<ActivityOvertimeEntry[]>([]);
  const [forecastDataset, setForecastDataset] = useState<OperationalMetricsDataset | null>(null);
  const [activeWorkContext, setActiveWorkContext] = useState<ActiveWorkSessionContext | null>(null);
  const [pendingActivity, setPendingActivity] = useState<ProjectActivity | null>(null);
  const [activityActionId, setActivityActionId] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [activeActivityTypes, setActiveActivityTypes] = useState<ActivityType[]>([]);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ProjectActivity | null>(null);
  const [actTypeId, setActTypeId] = useState('');
  const [actAssigneeId, setActAssigneeId] = useState('');
  const [actStatus, setActStatus] = useState<ProjectStatus | ActivityCanonicalStatus | string>(ActivityCanonicalStatus.TO_DO);
  const [actEstimatedDuration, setActEstimatedDuration] = useState('');
  const [actStartDate, setActStartDate] = useState('');
  const [actDeliveryDate, setActDeliveryDate] = useState('');
  const [actBlockedReason, setActBlockedReason] = useState('');
  const [actActualStartDate, setActActualStartDate] = useState('');
  const [actActualEndDate, setActActualEndDate] = useState('');
  const [actNotes, setActNotes] = useState('');
  const [allWorkspaceActivities, setAllWorkspaceActivities] = useState<ProjectActivity[]>([]);

  // Operational Model & Event History States
  const [projectActivitiesEvents, setProjectActivitiesEvents] = useState<Record<string, ProjectActivityEvent[]>>({});
  const [historyModalActivity, setHistoryModalActivity] = useState<ProjectActivity | null>(null);
  const [activityHistoryEvents, setActivityHistoryEvents] = useState<ProjectActivityEvent[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [blockingDialogActivity, setBlockingDialogActivity] = useState<ProjectActivity | null>(null);
  const [blockingReasonInput, setBlockingReasonInput] = useState('');
  const [completingDialogActivity, setCompletingDialogActivity] = useState<ProjectActivity | null>(null);
  const [completionDateInput, setCompletionDateInput] = useState('');
  const [reopeningDialogActivity, setReopeningDialogActivity] = useState<ProjectActivity | null>(null);
  const [reopeningReasonInput, setReopeningReasonInput] = useState('');
  const [transitioningActivityId, setTransitioningActivityId] = useState<string | null>(null);

  // Administrative Project Deletion States
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [projectDeletionImpact, setProjectDeletionImpact] = useState<ProjectDeletionImpact | null>(null);
  const [isLoadingDeletionImpact, setIsLoadingDeletionImpact] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadAllActs = async () => {
      try {
        const acts = await fetchProjectActivities(currentUser.workspaceId);
        if (isMounted) {
          setAllWorkspaceActivities(acts);
        }
      } catch (e) {
        console.error("Erro ao carregar atividades do workspace", e);
      }
    };
    loadAllActs();
    return () => { isMounted = false; };
  }, [currentUser.workspaceId]);

  const [showOvertimeModal, setShowOvertimeModal] = useState(false);
  const [overtimeActivity, setOvertimeActivity] = useState<ProjectActivity | null>(null);
  const [editingOvertimeEntry, setEditingOvertimeEntry] = useState<ActivityOvertimeEntry | null>(null);
  const [overtimeDate, setOvertimeDate] = useState('');
  const [overtimeHours, setOvertimeHours] = useState('');
  const [overtimeNotes, setOvertimeNotes] = useState('');
  const [isSavingOvertime, setIsSavingOvertime] = useState(false);
  const [usePrefix, setUsePrefix] = useState(false);
  const [codePrefix, setCodePrefix] = useState('');
  // Memoized maps for instant O(1) lookups during rendering
  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    db.clients.forEach(c => map.set(c.id, c));
    return map;
  }, [db.clients]);

  const userMap = useMemo(() => {
    const map = new Map<string, InternalUser>();
    db.users.forEach(u => map.set(u.id, u));
    return map;
  }, [db.users]);

  const { familyRevisionsMap, activeRevisionsCountMap } = useMemo(() => {
    const revMap = new Map<string, Project[]>();
    const countMap = new Map<string, number>();
    for (const project of db.projects) {
      const familyId = getProjectFamilyId(project);
      const list = revMap.get(familyId);
      if (list) {
        list.push(project);
      } else {
        revMap.set(familyId, [project]);
      }
      if (isCurrentProjectRevision(project)) {
        countMap.set(familyId, (countMap.get(familyId) || 0) + 1);
      }
    }
    return { familyRevisionsMap: revMap, activeRevisionsCountMap: countMap };
  }, [db.projects]);

  const sortedClients = useMemo(() => {
    return [...db.clients].sort((a, b) => parseInt(a.code || '0') - parseInt(b.code || '0'));
  }, [db.clients]);

  const activeClients = useMemo(() => {
    return sortedClients.filter((c: any) => c.status === 'ACTIVE');
  }, [sortedClients]);

  const activeUsers = useMemo(() => {
    return db.users.filter(u => u.isActive);
  }, [db.users]);

  const isHistoricalRevision = Boolean(editingProject && !isCurrentProjectRevision(editingProject));
  const editingFamilyRevisions = useMemo(() => {
    if (!editingProject) return [];
    const familyId = getProjectFamilyId(editingProject);
    const list = familyRevisionsMap.get(familyId) || [];
    return [...list].sort((a, b) => getProjectRevisionNumber(b) - getProjectRevisionNumber(a));
  }, [editingProject, familyRevisionsMap]);

  const editingActiveRevisions = useMemo(() => {
    return editingFamilyRevisions.filter(isCurrentProjectRevision);
  }, [editingFamilyRevisions]);

  const showMultipleActiveWarning = editingActiveRevisions.length > 1;
  const nextRevisionNumber = editingFamilyRevisions.length > 0
    ? Math.max(...editingFamilyRevisions.map(getProjectRevisionNumber)) + 1
    : 1;
  const nextRevisionLabel = `Rev.${String(nextRevisionNumber).padStart(2, '0')}`;
  const hasRunningOperationalSession = Boolean(activeWorkContext)
    || workSessions.some(session => session.endedAt === undefined);

  // Objective delivery predictability calculated for the currently edited project
  const editingProjectPredictability = useMemo(() => {
    if (!editingProject) return undefined;
    const predictabilities = calculateProjectDeliveryPredictability({
      projects: [editingProject, ...editingFamilyRevisions],
      activities: allWorkspaceActivities,
      todayStr: getTodayDateString()
    });
    return predictabilities.find(item => item.projectId === editingProject.id);
  }, [editingProject, editingFamilyRevisions, allWorkspaceActivities]);

  const resetForm = () => {
    setName('');
    setClientId('');
    setAssigneeId('');
    setStatus(ProjectStatus.QUEUE);
    setStartDate('');
    setDeliveryDate('');
    setPhotoUrl('');
    setNotes('');
    setCustomCode('');
    setProjectActivities([]);
    setActivityExecutions([]);
    setWorkSessions([]);
    setOvertimeEntries([]);
    setForecastDataset(null);
    setUsePrefix(false);
    setCodePrefix('');
    setEditingProject(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '---';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  // Fast O(1) working days calculation
  const calculateWorkingDays = (startStr: string, endStr: string): string => {
    if (!startStr || !endStr) return '---';
    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endStr.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return '---';
    if (start > end) return '0 dias';

    const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const fullWeeks = Math.floor(totalDays / 7);
    let workDays = fullWeeks * 5;
    const startDay = start.getDay();

    for (let i = 0; i < totalDays % 7; i++) {
      const d = (startDay + i) % 7;
      if (d !== 0 && d !== 6) workDays++;
    }
    return `${workDays} ${workDays === 1 ? 'dia' : 'dias'}`;
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Imagem muito grande! Máximo 2MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => setPhotoUrl(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Deseja realmente remover a imagem deste projeto?")) {
      setPhotoUrl('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Load active activity types of the workspace
  useEffect(() => {
    const loadActiveTypes = async () => {
      try {
        const types = await fetchActivityTypes(currentUser.workspaceId);
        setActiveActivityTypes(types.filter(t => t.isActive));
      } catch (err) {
        console.error("Erro ao carregar tipos de atividade:", err);
      }
    };
    loadActiveTypes();
  }, [currentUser.workspaceId]);

  const loadActiveWorkContext = async () => {
    try {
      const context = await fetchActiveWorkSessionContext(currentUser.workspaceId, currentUser.id);
      setActiveWorkContext(context);
      return context;
    } catch (err) {
      console.error('Erro ao restaurar sessão de trabalho ativa:', err);
      setActiveWorkContext(null);
      return null;
    }
  };

  useEffect(() => {
    loadActiveWorkContext();
  }, [currentUser.id, currentUser.workspaceId]);

  useEffect(() => {
    if (initialEditingProject) {
      openEdit(initialEditingProject);
      clearInitialEditingProject?.();
    }
  }, [initialEditingProject]);

  useEffect(() => {
    if (initialEditingActivity) {
      setEditingActivity(initialEditingActivity);
      setActTypeId(initialEditingActivity.activityTypeId || '');
      setActAssigneeId(initialEditingActivity.assigneeId || '');
      setActStatus(initialEditingActivity.status);
      setActEstimatedDuration(initialEditingActivity.estimatedDurationHours !== undefined ? initialEditingActivity.estimatedDurationHours.toString() : '');
      setActStartDate(initialEditingActivity.startDate || '');
      setActDeliveryDate(initialEditingActivity.deliveryDate || '');
      setActNotes(initialEditingActivity.notes || '');
      setShowActivityModal(true);
      clearInitialEditingActivity?.();
    }
  }, [initialEditingActivity]);

  const loadProjectActivities = async (projectId: string) => {
    setIsLoadingActivities(true);
    try {
      const data = await fetchProjectActivities(currentUser.workspaceId, projectId);
      const sortedActivities = data.sort((a, b) => a.orderIndex - b.orderIndex);
      setProjectActivities(sortedActivities);

      if (sortedActivities.length > 0) {
        const activityIds = sortedActivities.map(activity => activity.id);
        const [executions, entries, eventsBatch] = await Promise.all([
          fetchActivityExecutions(currentUser.workspaceId, { projectActivityIds: activityIds }),
          fetchActivityOvertimeEntries(currentUser.workspaceId, { projectActivityIds: activityIds }),
          fetchProjectActivitiesEventsBatch(currentUser.workspaceId, activityIds)
        ]);
        setActivityExecutions(executions);
        setOvertimeEntries(entries);
        setProjectActivitiesEvents(eventsBatch);
        const sessions = executions.length > 0
          ? await fetchWorkSessions(currentUser.workspaceId, {
              activityExecutionIds: executions.map(execution => execution.id)
            })
          : [];
        setWorkSessions(sessions);
        setForecastDataset({
          activities: sortedActivities,
          executions,
          sessions,
          overtimeEntries: entries
        });
      } else {
        setActivityExecutions([]);
        setWorkSessions([]);
        setOvertimeEntries([]);
        setProjectActivitiesEvents({});
        setForecastDataset({
          activities: [],
          executions: [],
          sessions: [],
          overtimeEntries: []
        });
      }
    } catch (err) {
      console.error("Erro ao carregar atividades do projeto:", err);
      setActivityExecutions([]);
      setWorkSessions([]);
      setOvertimeEntries([]);
      setProjectActivitiesEvents({});
      setForecastDataset(null);
    } finally {
      setIsLoadingActivities(false);
    }
  };

  const resetActForm = () => {
    setActTypeId('');
    setActAssigneeId('');
    setActStatus(ActivityCanonicalStatus.TO_DO);
    setActEstimatedDuration('');
    setActStartDate('');
    setActDeliveryDate('');
    setActBlockedReason('');
    setActActualStartDate('');
    setActActualEndDate('');
    setActNotes('');
    setEditingActivity(null);
  };

  const handleStartActivitySimplified = async (activity: ProjectActivity) => {
    if (isHistoricalRevision) {
      alert('Revisões inativas são somente para consulta.');
      return;
    }
    if (!validateActivityAssignee(activity)) return;
    if (transitioningActivityId === activity.id) return;
    setTransitioningActivityId(activity.id);

    try {
      const today = getTodayDateString();
      const prevStatus = activity.status;
      const newActualStartDate = activity.actualStartDate || today;

      const updatedActivity: ProjectActivity = {
        ...activity,
        status: ActivityCanonicalStatus.IN_PROGRESS,
        actualStartDate: newActualStartDate,
        blockedReason: undefined,
        updatedAt: Date.now()
      };

      const eventPayload = createActivityEventPayload(
        currentUser.workspaceId,
        activity.id,
        'STARTED',
        currentUser,
        {
          fromStatus: prevStatus,
          toStatus: ActivityCanonicalStatus.IN_PROGRESS,
          details: `${currentUser.username} iniciou a atividade em ${formatDisplayDate(newActualStartDate)}`,
          metadata: { actualStartDate: newActualStartDate }
        }
      );

      await transitionProjectActivityWithEvent(updatedActivity, eventPayload);

      await logAction(
        currentUser.workspaceId,
        currentUser,
        LogModule.PROJECTS,
        LogAction.STATUS_CHANGE,
        `${currentUser.username} iniciou a atividade ${activity.name} no projeto ${editingProject?.code || ''}`,
        editingProject?.code
      );

      setProjectActivities(prev => prev.map(a => a.id === activity.id ? updatedActivity : a));
      if (editingProject) {
        await loadProjectActivities(editingProject.id);
      }
    } catch (err: any) {
      console.error('Erro ao iniciar atividade:', err);
      alert('Erro ao iniciar atividade: ' + (err.message || 'Erro inesperado'));
    } finally {
      setTransitioningActivityId(null);
    }
  };

  const openBlockingDialog = (activity: ProjectActivity) => {
    if (isHistoricalRevision) {
      alert('Revisões inativas são somente para consulta.');
      return;
    }
    if (!validateActivityAssignee(activity)) return;
    setBlockingDialogActivity(activity);
    setBlockingReasonInput(activity.blockedReason || '');
  };

  const confirmBlockActivity = async () => {
    if (!blockingDialogActivity) return;
    if (!blockingReasonInput.trim()) {
      alert('Por favor, informe o motivo do bloqueio.');
      return;
    }
    const activity = blockingDialogActivity;
    if (transitioningActivityId === activity.id) return;
    setTransitioningActivityId(activity.id);

    try {
      const prevStatus = activity.status;
      const reason = blockingReasonInput.trim();

      const updatedActivity: ProjectActivity = {
        ...activity,
        status: ActivityCanonicalStatus.BLOCKED,
        blockedReason: reason,
        updatedAt: Date.now()
      };

      const eventPayload = createActivityEventPayload(
        currentUser.workspaceId,
        activity.id,
        'BLOCKED',
        currentUser,
        {
          fromStatus: prevStatus,
          toStatus: ActivityCanonicalStatus.BLOCKED,
          details: `Atividade bloqueada: ${reason}`,
          metadata: { blockedReason: reason }
        }
      );

      await transitionProjectActivityWithEvent(updatedActivity, eventPayload);

      await logAction(
        currentUser.workspaceId,
        currentUser,
        LogModule.PROJECTS,
        LogAction.STATUS_CHANGE,
        `${currentUser.username} bloqueou a atividade ${activity.name}: ${reason}`,
        editingProject?.code
      );

      setBlockingDialogActivity(null);
      setBlockingReasonInput('');
      setProjectActivities(prev => prev.map(a => a.id === activity.id ? updatedActivity : a));
      if (editingProject) {
        await loadProjectActivities(editingProject.id);
      }
    } catch (err: any) {
      console.error('Erro ao bloquear atividade:', err);
      alert('Erro ao bloquear atividade: ' + (err.message || 'Erro inesperado'));
    } finally {
      setTransitioningActivityId(null);
    }
  };

  const handleResumeActivitySimplified = async (activity: ProjectActivity) => {
    if (isHistoricalRevision) {
      alert('Revisões inativas são somente para consulta.');
      return;
    }
    if (!validateActivityAssignee(activity)) return;
    if (transitioningActivityId === activity.id) return;
    setTransitioningActivityId(activity.id);

    try {
      const prevStatus = activity.status;
      const prevReason = activity.blockedReason;

      const updatedActivity: ProjectActivity = {
        ...activity,
        status: ActivityCanonicalStatus.IN_PROGRESS,
        blockedReason: undefined,
        updatedAt: Date.now()
      };

      const eventPayload = createActivityEventPayload(
        currentUser.workspaceId,
        activity.id,
        'RESUMED',
        currentUser,
        {
          fromStatus: prevStatus,
          toStatus: ActivityCanonicalStatus.IN_PROGRESS,
          details: `${currentUser.username} retomou a atividade.${prevReason ? ` (Bloqueio anterior: ${prevReason})` : ''}`,
          metadata: { previousBlockedReason: prevReason }
        }
      );

      await transitionProjectActivityWithEvent(updatedActivity, eventPayload);

      await logAction(
        currentUser.workspaceId,
        currentUser,
        LogModule.PROJECTS,
        LogAction.STATUS_CHANGE,
        `${currentUser.username} retomou a atividade ${activity.name} no projeto ${editingProject?.code || ''}`,
        editingProject?.code
      );

      setProjectActivities(prev => prev.map(a => a.id === activity.id ? updatedActivity : a));
      if (editingProject) {
        await loadProjectActivities(editingProject.id);
      }
    } catch (err: any) {
      console.error('Erro ao retomar atividade:', err);
      alert('Erro ao retomar atividade: ' + (err.message || 'Erro inesperado'));
    } finally {
      setTransitioningActivityId(null);
    }
  };

  const openCompletionDialog = (activity: ProjectActivity) => {
    if (isHistoricalRevision) {
      alert('Revisões inativas são somente para consulta.');
      return;
    }
    if (!validateActivityAssignee(activity)) return;
    setCompletingDialogActivity(activity);
    setCompletionDateInput(activity.actualEndDate || getTodayDateString());
  };

  const confirmCompleteActivity = async () => {
    if (!completingDialogActivity) return;
    const activity = completingDialogActivity;
    if (!completionDateInput) {
      alert('Informe a data de conclusão real.');
      return;
    }
    if (transitioningActivityId === activity.id) return;
    setTransitioningActivityId(activity.id);

    try {
      const prevStatus = activity.status;
      const actualEnd = completionDateInput;
      const actualStart = activity.actualStartDate || activity.startDate || actualEnd;

      const updatedActivity: ProjectActivity = {
        ...activity,
        status: ActivityCanonicalStatus.COMPLETED,
        actualEndDate: actualEnd,
        actualStartDate: actualStart,
        conclusionResponsibleId: currentUser.id,
        deadlineAtConclusion: activity.deliveryDate,
        blockedReason: undefined,
        updatedAt: Date.now()
      };

      const leadDays = calculateCalendarDurationDays(actualStart, actualEnd);
      const deviation = calculateDaysDifference(actualEnd, activity.deliveryDate);
      const deviationLabel = deviation === 0 ? 'no prazo' : deviation !== null && deviation > 0 ? `${deviation}d de atraso` : `${Math.abs(deviation || 0)}d adiantada`;

      const eventPayload = createActivityEventPayload(
        currentUser.workspaceId,
        activity.id,
        'COMPLETED',
        currentUser,
        {
          fromStatus: prevStatus,
          toStatus: ActivityCanonicalStatus.COMPLETED,
          details: `Concluída em ${formatDisplayDate(actualEnd)} (${deviationLabel}, Lead Time: ${leadDays}d)`,
          metadata: {
            actualStartDate: actualStart,
            actualEndDate: actualEnd,
            leadTimeDays: leadDays,
            deviationDays: deviation
          }
        }
      );

      await transitionProjectActivityWithEvent(updatedActivity, eventPayload);

      await logAction(
        currentUser.workspaceId,
        currentUser,
        LogModule.PROJECTS,
        LogAction.STATUS_CHANGE,
        `${currentUser.username} concluiu a atividade ${activity.name} em ${formatDisplayDate(actualEnd)} no projeto ${editingProject?.code || ''}`,
        editingProject?.code
      );

      setCompletingDialogActivity(null);
      setCompletionDateInput('');
      setProjectActivities(prev => prev.map(a => a.id === activity.id ? updatedActivity : a));
      if (editingProject) {
        await loadProjectActivities(editingProject.id);
      }
    } catch (err: any) {
      console.error('Erro ao concluir atividade:', err);
      alert('Erro ao concluir atividade: ' + (err.message || 'Erro inesperado'));
    } finally {
      setTransitioningActivityId(null);
    }
  };

  const openReopenDialog = (activity: ProjectActivity) => {
    if (isHistoricalRevision) {
      alert('Revisões inativas são somente para consulta.');
      return;
    }
    if (!validateActivityAssignee(activity)) return;
    setReopeningDialogActivity(activity);
    setReopeningReasonInput('');
  };

  const confirmReopenActivity = async () => {
    if (!reopeningDialogActivity) return;
    const activity = reopeningDialogActivity;
    if (transitioningActivityId === activity.id) return;
    setTransitioningActivityId(activity.id);

    try {
      const prevStatus = activity.status;
      const prevEndDate = activity.actualEndDate;
      const reason = reopeningReasonInput.trim();

      const updatedActivity: ProjectActivity = {
        ...activity,
        status: ActivityCanonicalStatus.IN_PROGRESS,
        actualEndDate: undefined,
        updatedAt: Date.now()
      };

      const eventPayload = createActivityEventPayload(
        currentUser.workspaceId,
        activity.id,
        'REOPENED',
        currentUser,
        {
          fromStatus: prevStatus,
          toStatus: ActivityCanonicalStatus.IN_PROGRESS,
          details: `Atividade reaberta por ${currentUser.username}.${reason ? ` Motivo: ${reason}` : ''} (Conclusão anterior: ${formatDisplayDate(prevEndDate)})`,
          metadata: { previousEndDate: prevEndDate, reopenReason: reason }
        }
      );

      await transitionProjectActivityWithEvent(updatedActivity, eventPayload);

      await logAction(
        currentUser.workspaceId,
        currentUser,
        LogModule.PROJECTS,
        LogAction.STATUS_CHANGE,
        `${currentUser.username} reabriu a atividade ${activity.name} no projeto ${editingProject?.code || ''}`,
        editingProject?.code
      );

      setReopeningDialogActivity(null);
      setReopeningReasonInput('');
      setProjectActivities(prev => prev.map(a => a.id === activity.id ? updatedActivity : a));
      if (editingProject) {
        await loadProjectActivities(editingProject.id);
      }
    } catch (err: any) {
      console.error('Erro ao reabrir atividade:', err);
      alert('Erro ao reabrir atividade: ' + (err.message || 'Erro inesperado'));
    } finally {
      setTransitioningActivityId(null);
    }
  };

  const openHistoryModal = async (activity: ProjectActivity) => {
    setHistoryModalActivity(activity);
    setIsLoadingHistory(true);
    try {
      const events = await fetchProjectActivityEvents(currentUser.workspaceId, activity.id);
      setActivityHistoryEvents(events);
    } catch (err) {
      console.error('Erro ao carregar histórico da atividade:', err);
      setActivityHistoryEvents([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSaveProjectActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    if (!isCurrentProjectRevision(editingProject)) {
      alert('Revisões inativas são somente para consulta.');
      return;
    }
    if (!actTypeId) {
      alert("Selecione um tipo de atividade.");
      return;
    }

    if (!isActivityWithinProjectPeriod(
      actStartDate,
      actDeliveryDate,
      editingProject.startDate,
      editingProject.deliveryDate
    )) {
      alert(`Esta atividade deve estar dentro do período do projeto.\n${getProjectPeriodLabel(editingProject)}`);
      return;
    }

    const selectedType = activeActivityTypes.find(t => t.id === actTypeId);
    if (!selectedType) return;

    const durationVal = parseFloat(actEstimatedDuration);
    const duration = isNaN(durationVal) ? undefined : durationVal;

    const originalAssigneeId = editingActivity?.assigneeId;
    const newAssigneeId = actAssigneeId || undefined;

    // Calculate order_index
    let orderIdx = editingActivity?.orderIndex || 0;
    if (newAssigneeId !== originalAssigneeId) {
      if (newAssigneeId) {
        orderIdx = await getNextUserOrderIndex(currentUser.workspaceId, newAssigneeId);
      } else {
        orderIdx = 0;
      }
    }

    const canonicalStatus = normalizeActivityStatus(actStatus);
    const today = getTodayDateString();

    const activityData: ProjectActivity = {
      id: editingActivity?.id || crypto.randomUUID(),
      workspaceId: currentUser.workspaceId,
      projectId: editingProject.id,
      activityTypeId: actTypeId,
      name: selectedType.name,
      assigneeId: newAssigneeId,
      status: canonicalStatus,
      startDate: actStartDate || undefined,
      deliveryDate: actDeliveryDate || undefined,
      originalDeliveryDate: editingActivity
        ? (editingActivity.originalDeliveryDate || editingActivity.deliveryDate || actDeliveryDate)
        : actDeliveryDate,
      notes: actNotes || undefined,
      blockedReason: canonicalStatus === ActivityCanonicalStatus.BLOCKED ? (actBlockedReason || undefined) : undefined,
      estimatedDurationHours: duration,
      estimatedCurrentHours: editingActivity ? (editingActivity.estimatedCurrentHours ?? duration) : duration,
      orderIndex: orderIdx,
      actualStartDate: actActualStartDate || editingActivity?.actualStartDate || (canonicalStatus === ActivityCanonicalStatus.IN_PROGRESS ? today : undefined),
      actualEndDate: canonicalStatus === ActivityCanonicalStatus.COMPLETED
        ? (actActualEndDate || editingActivity?.actualEndDate || today)
        : undefined,
      conclusionResponsibleId: canonicalStatus === ActivityCanonicalStatus.COMPLETED
        ? (editingActivity?.conclusionResponsibleId || currentUser.id)
        : undefined,
      deadlineAtConclusion: canonicalStatus === ActivityCanonicalStatus.COMPLETED
        ? (editingActivity?.deadlineAtConclusion || actDeliveryDate || undefined)
        : undefined,
      deadlineChangesCount: editingActivity?.deadlineChangesCount || 0,
      createdAt: editingActivity?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    let isRescheduled = false;
    let oldEndDate = '';
    if (editingActivity) {
      if (actDeliveryDate && editingActivity.deliveryDate && actDeliveryDate !== editingActivity.deliveryDate) {
        activityData.deadlineChangesCount = (editingActivity.deadlineChangesCount || 0) + 1;
        isRescheduled = true;
        oldEndDate = editingActivity.deliveryDate;
      }
    }

    try {
      await syncProjectActivity(activityData);

      // Audit Events
      if (!editingActivity) {
        await logProjectActivityEvent(
          createActivityEventPayload(
            currentUser.workspaceId,
            activityData.id,
            'CREATED',
            currentUser,
            {
              toStatus: canonicalStatus,
              details: `Atividade criada: ${activityData.name} com previsão para ${formatDisplayDate(activityData.deliveryDate)}`,
              metadata: {
                startDate: activityData.startDate,
                deliveryDate: activityData.deliveryDate,
                assigneeId: activityData.assigneeId
              }
            }
          )
        );
      } else {
        if (isRescheduled) {
          await logProjectActivityEvent(
            createActivityEventPayload(
              currentUser.workspaceId,
              activityData.id,
              'RESCHEDULED',
              currentUser,
              {
                details: `Reprogramação de prazo: de ${formatDisplayDate(oldEndDate)} para ${formatDisplayDate(actDeliveryDate)}`,
                metadata: {
                  previousEndDate: oldEndDate,
                  newEndDate: actDeliveryDate,
                  changesCount: activityData.deadlineChangesCount
                }
              }
            )
          );
        }
        if (editingActivity.status !== canonicalStatus) {
          await logProjectActivityEvent(
            createActivityEventPayload(
              currentUser.workspaceId,
              activityData.id,
              'UPDATED',
              currentUser,
              {
                fromStatus: editingActivity.status,
                toStatus: canonicalStatus,
                details: `Status alterado de ${editingActivity.status} para ${canonicalStatus}`
              }
            )
          );
        }
      }

      if (originalAssigneeId && originalAssigneeId !== newAssigneeId) {
        await reorderUserQueue(currentUser.workspaceId, originalAssigneeId);
      }
      if (newAssigneeId && originalAssigneeId !== newAssigneeId) {
        await reorderUserQueue(currentUser.workspaceId, newAssigneeId);
      }

      await logAction(
        currentUser.workspaceId,
        currentUser,
        LogModule.PROJECTS,
        editingActivity ? LogAction.UPDATE : LogAction.CREATE,
        `${currentUser.username} ${editingActivity ? 'atualizou' : 'adicionou'} a atividade ${selectedType.name} no projeto ${editingProject.code}`,
        editingProject.code
      );

      await loadProjectActivities(editingProject.id);
      setShowActivityModal(false);
      resetActForm();
    } catch (err: any) {
      const technicalMessage = `${err?.message || ''} ${err?.details || ''}`;
      if (technicalMessage.includes('PROJECT_ACTIVITY_OUTSIDE_PROJECT_PERIOD')) {
        alert(`Esta atividade deve estar dentro do período do projeto.\n${getProjectPeriodLabel(editingProject)}`);
      } else {
        alert("Erro ao salvar atividade: " + err.message);
      }
    }
  };


  const handleUpdateCurrentEstimate = async (activity: ProjectActivity) => {
    if (isHistoricalRevision) {
      alert('Revisões inativas são somente para consulta.');
      return;
    }
    const currentVal = activity.estimatedCurrentHours ?? activity.estimatedDurationHours ?? 0;
    const newEstStr = prompt(`Atualizar Estimativa Atual para a atividade "${activity.name}":`, currentVal.toString());
    if (newEstStr === null) return; // cancel
    const newEst = parseFloat(newEstStr);
    if (isNaN(newEst) || newEst < 0) {
      alert("Por favor, digite um número válido.");
      return;
    }
    const updatedActivity = {
      ...activity,
      estimatedCurrentHours: newEst
    };
    try {
      await syncProjectActivity(updatedActivity);
      if (editingProject) {
        await loadProjectActivities(editingProject.id);
        await logAction(
          currentUser.workspaceId,
          currentUser,
          LogModule.PROJECTS,
          LogAction.UPDATE,
          `${currentUser.username} atualizou a estimativa atual da atividade ${activity.name} de ${currentVal}h para ${newEst}h no projeto ${editingProject.code}`,
          editingProject.code
        );
      }
    } catch (err: any) {
      console.error("Erro ao atualizar estimativa atual:", err);
      alert("Erro ao atualizar estimativa: " + err.message);
    }
  };

  const handleDeleteProjectAct = async (activity: ProjectActivity) => {
    if (isHistoricalRevision) {
      alert('Revisões inativas são somente para consulta.');
      return;
    }
    if (confirm(`Tem certeza que deseja excluir a atividade "${activity.name}"?`)) {
      try {
        await deleteProjectActivity(activity.id);
        if (activity.assigneeId) {
          await reorderUserQueue(currentUser.workspaceId, activity.assigneeId);
        }
        if (editingProject) {
          await logAction(
            currentUser.workspaceId,
            currentUser,
            LogModule.PROJECTS,
            LogAction.DELETE,
            `${currentUser.username} excluiu a atividade ${activity.name} no projeto ${editingProject.code}`,
            editingProject.code
          );
          await loadProjectActivities(editingProject.id);
        }
      } catch (err: any) {
        alert("Erro ao excluir atividade: " + err.message);
      }
    }
  };

  const handleReorderProjectActivity = async (index: number, direction: 'up' | 'down') => {
    if (isHistoricalRevision) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= projectActivities.length) return;

    const currentItem = projectActivities[index];
    const swapItem = projectActivities[newIndex];

    const tempIndex = currentItem.orderIndex;
    currentItem.orderIndex = swapItem.orderIndex;
    swapItem.orderIndex = tempIndex;

    try {
      await syncProjectActivity(currentItem);
      await syncProjectActivity(swapItem);
      
      if (editingProject) {
        await loadProjectActivities(editingProject.id);
      }
    } catch (err: any) {
      alert("Erro ao reordenar atividades: " + err.message);
    }
  };

  const isValidTimestamp = (value: number) => Number.isFinite(value) && value > 0;

  const formatElapsedTime = (durationMs: number | null) => {
    if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) {
      return 'Tempo indisponível';
    }
    const elapsedSeconds = Math.floor(durationMs / 1000);
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = elapsedSeconds % 60;
    return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  };

  const formatPauseDuration = (ms: number): string => {
    const totalMinutes = Math.round(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}h${minutes.toString().padStart(2, '0')}`;
  };

  const formatPauseAverage = (ms: number): string => {
    const totalMinutes = Math.round(ms / 60000);
    if (totalMinutes < 60) {
      return `${totalMinutes} min`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}h${minutes.toString().padStart(2, '0')}`;
  };

  const getActivitySessions = (activityId: string): WorkSession[] => {
    const executionIds = new Set(activityExecutions
      .filter(execution => execution.projectActivityId === activityId)
      .map(execution => execution.id));
    const sessions = workSessions.filter(session => executionIds.has(session.activityExecutionId));

    if (activeWorkContext?.activity.id !== activityId) return sessions;
    const knownIds = new Set(sessions.map(session => session.id));
    return [...sessions, ...activeWorkContext.sessions.filter(session => !knownIds.has(session.id))];
  };

  const getActivityOvertimeEntries = (activityId: string): ActivityOvertimeEntry[] => {
    const entries = overtimeEntries.filter(entry => entry.projectActivityId === activityId);
    if (activeWorkContext?.activity.id !== activityId) return entries;
    const knownIds = new Set(entries.map(entry => entry.id));
    return [...entries, ...activeWorkContext.overtimeEntries.filter(entry => !knownIds.has(entry.id))];
  };

  const getRegularOperationalMs = (activityId: string) => calculateRegularOperationalMs(
    getActivitySessions(activityId),
    db.company,
    clockNow
  );

  const getActivityOvertimeMs = (activityId: string) => calculateOvertimeMs(
    getActivityOvertimeEntries(activityId).map(entry => entry.authorizedHours)
  );

  const getAccountedOperationalMs = (activityId: string) => calculateAccountedOperationalMs(
    getActivitySessions(activityId),
    getActivityOvertimeEntries(activityId).map(entry => entry.authorizedHours),
    db.company,
    clockNow
  );

  const formatSessionStartedAt = (startedAt: number) => isValidTimestamp(startedAt)
    ? new Date(startedAt).toLocaleString('pt-BR')
    : 'Horário indisponível';

  const getOpenExecution = (activityId: string) => activityExecutions.find(execution =>
    execution.projectActivityId === activityId &&
    execution.internalUserId === currentUser.id &&
    ![ActivityExecutionStatus.COMPLETED, ActivityExecutionStatus.CANCELED].includes(execution.status)
  );

  const validateActivityAssignee = (activity: ProjectActivity) => {
    if (activity.assigneeId === currentUser.id) return true;
    const assignee = db.users.find(user => user.id === activity.assigneeId);
    if (assignee) {
      alert(`Esta atividade está atribuída a ${assignee.username}.`);
    } else {
      alert('Esta atividade ainda não possui um responsável definido.');
    }
    return false;
  };

  const refreshActivityExecutionState = async () => {
    await loadActiveWorkContext();
    if (editingProject) {
      await loadProjectActivities(editingProject.id);
    }
  };

  const handleStartOrResumeActivity = async (activity: ProjectActivity, pauseCurrent = false) => {
    if (isHistoricalRevision) {
      alert('Não é possível iniciar atividades em uma revisão inativa.');
      return;
    }
    if (!validateActivityAssignee(activity)) return;

    if (activeWorkContext && activeWorkContext.activity.id !== activity.id && !pauseCurrent) {
      setPendingActivity(activity);
      return;
    }

    setActivityActionId(activity.id);
    try {
      const transition = await startOrResumeActivity(activity.id, currentUser.id, pauseCurrent);
      const resumed = transition.transitionAction === 'RESUMED';
      const actionLabel = resumed ? 'retomou' : 'iniciou';

      if (pauseCurrent && activeWorkContext) {
        await logAction(
          currentUser.workspaceId,
          currentUser,
          LogModule.PROJECTS,
          LogAction.STATUS_CHANGE,
          `${currentUser.username} trocou da atividade ${activeWorkContext.activity.name} (${activeWorkContext.project.code}) para ${activity.name} (${editingProject?.code || 'projeto'})`,
          editingProject?.code
        );
      }

      if (transition.transitionAction !== 'ALREADY_RUNNING') {
        await logAction(
          currentUser.workspaceId,
          currentUser,
          LogModule.PROJECTS,
          LogAction.STATUS_CHANGE,
          `${currentUser.username} ${actionLabel} a atividade ${activity.name} no projeto ${editingProject?.code || ''}`,
          editingProject?.code
        );
      }

      setPendingActivity(null);
      await refreshActivityExecutionState();
    } catch (err: any) {
      console.error('Erro técnico ao iniciar ou retomar atividade:', err);
      const technicalMessage = `${err?.message || ''} ${err?.details || ''}`;
      if (technicalMessage.includes('ACTIVE_SESSION_EXISTS')) {
        await loadActiveWorkContext();
        setPendingActivity(activity);
      } else if (technicalMessage.includes('ACTIVITY_NOT_ASSIGNED_TO_USER')) {
        alert('Esta atividade não está mais atribuída ao usuário interno ativo.');
      } else {
        alert('Não foi possível iniciar a atividade.');
      }
    } finally {
      setActivityActionId(null);
    }
  };

  const handlePauseActivity = async (activity: ProjectActivity, execution?: ActivityExecution) => {
    if (isHistoricalRevision) return;
    if (!validateActivityAssignee(activity)) return;
    if (!execution) {
      alert('Não foi possível localizar a execução ativa desta atividade.');
      return;
    }

    setActivityActionId(activity.id);
    try {
      await pauseActivityExecution(execution.id, currentUser.id);
      await logAction(
        currentUser.workspaceId,
        currentUser,
        LogModule.PROJECTS,
        LogAction.STATUS_CHANGE,
        `${currentUser.username} pausou a atividade ${activity.name} no projeto ${editingProject?.code || ''}`,
        editingProject?.code
      );
      await refreshActivityExecutionState();
    } catch (err) {
      console.error('Erro técnico ao pausar atividade:', err);
      alert('Não foi possível pausar esta atividade.');
    } finally {
      setActivityActionId(null);
    }
  };

  const handleCompleteActivity = async (activity: ProjectActivity, execution?: ActivityExecution) => {
    if (isHistoricalRevision) return;
    if (!validateActivityAssignee(activity)) return;
    if (!execution) {
      alert('Não foi possível localizar a execução desta atividade.');
      return;
    }

    setActivityActionId(activity.id);
    try {
      await completeActivityExecution(execution.id, currentUser.id);
      await logAction(
        currentUser.workspaceId,
        currentUser,
        LogModule.PROJECTS,
        LogAction.STATUS_CHANGE,
        `${currentUser.username} concluiu a atividade ${activity.name} no projeto ${editingProject?.code || ''}`,
        editingProject?.code
      );
      await refreshActivityExecutionState();
    } catch (err) {
      console.error('Erro técnico ao concluir atividade:', err);
      alert('Não foi possível concluir esta atividade.');
    } finally {
      setActivityActionId(null);
    }
  };

  const resetOvertimeForm = () => {
    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    setEditingOvertimeEntry(null);
    setOvertimeDate(localDate);
    setOvertimeHours('');
    setOvertimeNotes('');
  };

  const openOvertimeModal = (activity: ProjectActivity) => {
    setOvertimeActivity(activity);
    resetOvertimeForm();
    setShowOvertimeModal(true);
  };

  const editOvertimeEntry = (entry: ActivityOvertimeEntry) => {
    setEditingOvertimeEntry(entry);
    setOvertimeDate(entry.date);
    setOvertimeHours(entry.authorizedHours.toString());
    setOvertimeNotes(entry.notes || '');
  };

  const handleSaveOvertime = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isHistoricalRevision) return;
    if (!overtimeActivity || currentUser.role !== UserRole.ADMIN) return;

    const hours = Number(overtimeHours.replace(',', '.'));
    if (!overtimeDate || !Number.isFinite(hours) || hours <= 0) {
      alert('Informe uma data e uma quantidade de horas maior que zero.');
      return;
    }

    setIsSavingOvertime(true);
    try {
      if (editingOvertimeEntry) {
        await updateActivityOvertimeEntry(
          editingOvertimeEntry.id,
          currentUser.id,
          overtimeDate,
          hours,
          overtimeNotes
        );
        await logAction(
          currentUser.workspaceId,
          currentUser,
          LogModule.PROJECTS,
          LogAction.UPDATE,
          `${currentUser.username} alterou uma hora extra de ${overtimeActivity.name} para ${hours}h em ${overtimeDate}`,
          editingProject?.code
        );
      } else {
        await createActivityOvertimeEntry(
          overtimeActivity.id,
          currentUser.id,
          overtimeDate,
          hours,
          overtimeNotes
        );
        await logAction(
          currentUser.workspaceId,
          currentUser,
          LogModule.PROJECTS,
          LogAction.CREATE,
          `${currentUser.username} adicionou ${hours}h extras à atividade ${overtimeActivity.name} em ${overtimeDate}`,
          editingProject?.code
        );
      }

      resetOvertimeForm();
      await refreshActivityExecutionState();
    } catch (err) {
      console.error('Erro técnico ao salvar hora extra:', err);
      alert('Não foi possível salvar a hora extra.');
    } finally {
      setIsSavingOvertime(false);
    }
  };

  const handleDeleteOvertime = async (entry: ActivityOvertimeEntry) => {
    if (isHistoricalRevision) return;
    if (!overtimeActivity || currentUser.role !== UserRole.ADMIN) return;
    if (!confirm(`Remover o lançamento de ${entry.authorizedHours}h em ${formatDate(entry.date)}?`)) return;

    setIsSavingOvertime(true);
    try {
      await deleteActivityOvertimeEntry(entry.id, currentUser.id);
      await logAction(
        currentUser.workspaceId,
        currentUser,
        LogModule.PROJECTS,
        LogAction.DELETE,
        `${currentUser.username} removeu ${entry.authorizedHours}h extras da atividade ${overtimeActivity.name} em ${entry.date}`,
        editingProject?.code
      );
      resetOvertimeForm();
      await refreshActivityExecutionState();
    } catch (err) {
      console.error('Erro técnico ao remover hora extra:', err);
      alert('Não foi possível remover a hora extra.');
    } finally {
      setIsSavingOvertime(false);
    }
  };

  const openEdit = (project: Project) => {
    setEditingProject(project);
    setName(project.name);
    setClientId(project.clientId);
    setAssigneeId(project.assigneeId || '');
    setStatus(project.status);
    setStartDate(project.startDate || '');
    setDeliveryDate(project.deliveryDate || '');
    setPhotoUrl(project.photoUrl || '');
    setNotes(project.notes || '');
    loadProjectActivities(project.id);
    // Extrai a sequência central se seguir o padrão [PREFIXO-][CLI]-[SEQ]-[YY]
    const parts = project.code.split('-');
    if (parts.length >= 3) {
      // As últimas 3 partes são sempre CLI-SEQ-YY
      const cliCode = parts[parts.length - 3];
      const seq = parts[parts.length - 2];
      const year = parts[parts.length - 1];

      const prefixParts = parts.slice(0, parts.length - 3);
      if (prefixParts.length > 0) {
        setUsePrefix(true);
        setCodePrefix(prefixParts.join('-'));
      } else {
        setUsePrefix(false);
        setCodePrefix('');
      }
      setCustomCode(seq);
    } else {
      setUsePrefix(false);
      setCodePrefix('');
      setCustomCode(project.code);
    }
    setShowModal(true);
  };

  useEffect(() => {
    if (initialEditingProject) {
      openEdit(initialEditingProject);
      if (clearInitialEditingProject) {
        clearInitialEditingProject();
      }
    }
  }, [initialEditingProject]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isHistoricalRevision) {
      alert('Revisões inativas são somente para consulta.');
      return;
    }
    const client = db.clients.find((c: Client) => c.id === clientId);
    if (!client) return;

    if (!isValidDateRange(startDate, deliveryDate)) {
      alert("O período do projeto deve possuir início e prazo final válidos.");
      return;
    }

    if (editingProject) {
      const affectedActivities = findActivitiesOutsideProjectPeriod(
        projectActivities,
        editingProject.id,
        startDate,
        deliveryDate
      );

      if (affectedActivities.length > 0) {
        alert(
          `Existem atividades fora do novo prazo do projeto.\n\n${getAffectedActivitiesLabel(affectedActivities)}\n\nAjuste manualmente as atividades ou escolha outro prazo para o projeto.`
        );
        return;
      }
    }

    const yearYY = new Date().getFullYear().toString().slice(-2);
    const seq = (customCode || getNextGlobalProjectSeq(db.projects)).toString().padStart(6, '0');
    const baseCode = `${client.code.padStart(3, '0')}-${seq}-${yearYY}`;
    const calculatedCode = usePrefix && codePrefix ? `${codePrefix}-${baseCode}` : baseCode;
    const finalCode = editingProject?.code || calculatedCode;

    if (db.projects.some((p: Project) => (
      p.code === finalCode
      && getProjectFamilyId(p) !== (editingProject ? getProjectFamilyId(editingProject) : '')
    ))) {
      alert("Este código de projeto já está em uso.");
      return;
    }

    const projectData: Project = {
      ...(editingProject || {}),
      id: editingProject?.id || crypto.randomUUID(),
      workspaceId: editingProject?.workspaceId || currentUser.workspaceId,
      clientId,
      assigneeId,
      code: finalCode,
      name,
      status,
      revision: editingProject?.revision || 'Rev.00',
      revisionNumber: editingProject?.revisionNumber ?? 0,
      isCurrentRevision: editingProject?.isCurrentRevision ?? true,
      startDate,
      dueDate: deliveryDate, // keeping legacy structure mapping
      deliveryDate,
      photoUrl,
      notes,
      createdAt: editingProject?.createdAt || Date.now(),
    };

    // Data Warehouse Historical Tracking for the Main Project
    if (editingProject && editingProject.status !== ProjectStatus.DONE && status === ProjectStatus.DONE) {
       projectData.actualEndDate = new Date().toISOString().split('T')[0];
       projectData.conclusionResponsibleId = currentUser.id;
       projectData.deadlineAtConclusion = projectData.deliveryDate || projectData.dueDate;
    }
    if (editingProject && editingProject.status === ProjectStatus.QUEUE && status !== ProjectStatus.QUEUE) {
       projectData.actualStartDate = new Date().toISOString().split('T')[0];
    }


    try {
      const savedProject = await syncProject(projectData, currentUser.id);

      let newProjects;
      if (editingProject) {
        newProjects = db.projects.map((p: Project) => p.id === editingProject.id ? savedProject : p);
        
        const diffLogs = generateDiffLogs(editingProject, projectData, {
          name: { label: 'Nome' },
          clientId: { label: 'Cliente', format: (id) => db.clients.find((c: Client) => c.id === id)?.name || id },
          assigneeId: { label: 'Responsável', format: (id) => db.users.find((u: InternalUser) => u.id === id)?.username || 'Sem Resp.' },
          status: { label: 'Status' },
          revision: { label: 'Revisão' },
          startDate: { label: 'Data de Início', format: formatDateForLog },
          deliveryDate: { label: 'Prazo', format: formatDateForLog },
          notes: { label: 'Anotações' }
        }, `o projeto ${projectData.code}`);

        if (diffLogs.length > 0) {
          const logEntries = diffLogs.map(log => ({
            details: `${currentUser.username} ${log}`,
            itemId: projectData.code
          }));
          await logActionsBatch(currentUser.workspaceId, currentUser, LogModule.PROJECTS, LogAction.UPDATE, logEntries);
        } else {
          await logAction(currentUser.workspaceId, currentUser, LogModule.PROJECTS, LogAction.UPDATE, `${currentUser.username} atualizou o projeto ${projectData.code}`, projectData.code);
        }
      } else {
        newProjects = [...db.projects, savedProject];
        await logAction(currentUser.workspaceId, currentUser, LogModule.PROJECTS, LogAction.CREATE, `${currentUser.username} criou o projeto ${projectData.code}`, projectData.code);
      }

      setDb({ ...db, projects: newProjects });
      setShowModal(false);
      resetForm();
    } catch (err: any) {
      const technicalMessage = `${err?.message || ''} ${err?.details || ''}`;
      if (technicalMessage.includes('PROJECT_DATE_RANGE_EXCLUDES_ACTIVITIES')) {
        alert("Existem atividades fora do novo prazo do projeto. Ajuste manualmente as atividades ou escolha outro prazo para o projeto.");
      } else {
        alert("Erro ao salvar no Supabase: " + (err.message || "Erro desconhecido"));
      }
    }
  };

  const openCreateRevisionModal = () => {
    if (!editingProject || !isCurrentProjectRevision(editingProject)) return;
    setRevisionStartDate('');
    setRevisionDeliveryDate('');
    setRevisionAssigneeId(editingProject.assigneeId || '');
    setRevisionNotes('');
    setShowRevisionModal(true);
  };

  const handleCreateRevision = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingProject?.familyId) return;
    if (!isValidDateRange(revisionStartDate, revisionDeliveryDate)) {
      alert('Informe um período válido para a nova revisão.');
      return;
    }
    if (!revisionAssigneeId) {
      alert('Selecione o responsável pela nova revisão.');
      return;
    }

    setIsCreatingRevision(true);
    try {
      const newRevision = await createProjectRevision(
        editingProject.familyId,
        currentUser.id,
        revisionStartDate,
        revisionDeliveryDate,
        revisionAssigneeId,
        revisionNotes
      );
      const updatedProjects = db.projects
        .map(project => getProjectFamilyId(project) === editingProject.familyId
          ? { ...project, isCurrentRevision: false }
          : project)
        .concat(newRevision);

      await logAction(
        currentUser.workspaceId,
        currentUser,
        LogModule.PROJECTS,
        LogAction.CREATE,
        `${currentUser.username} criou ${newRevision.revision} da família ${newRevision.code}; ${editingProject.revision} deixou de ser a revisão atual`,
        newRevision.code
      );

      setDb({ ...db, projects: updatedProjects });
      setShowRevisionModal(false);
      openEdit(newRevision);
    } catch (err: any) {
      const message = `${err?.message || ''} ${err?.details || ''}`;
      if (message.includes('ACTIVE_WORK_SESSION_MUST_BE_PAUSED')) {
        alert('Pause a atividade atualmente em execução antes de criar uma nova revisão.');
      } else if (message.includes('ADMIN_REQUIRED')) {
        alert('Apenas administradores podem criar uma nova revisão.');
      } else {
        alert('Não foi possível criar a nova revisão: ' + (err?.message || 'Erro desconhecido'));
      }
    } finally {
      setIsCreatingRevision(false);
    }
  };

  const handleReactivateRevision = async (targetProject: Project) => {
    const familyId = getProjectFamilyId(targetProject);
    if (!familyId) return;

    const activeRevisions = db.projects.filter(
      p => getProjectFamilyId(p) === familyId && isCurrentProjectRevision(p)
    );

    for (const activeRev of activeRevisions) {
      try {
        const hasActiveSessions = await hasActiveWorkSessionsForProject(
          currentUser.workspaceId,
          activeRev.id
        );
        if (hasActiveSessions) {
          alert(
            `Existe uma atividade em execução na revisão ${activeRev.revision}.\nPause a atividade antes de trocar a revisão ativa.`
          );
          return;
        }
      } catch (err) {
        console.error("Erro ao verificar sessões ativas:", err);
      }
    }

    if (!window.confirm(`Deseja reativar a revisão ${targetProject.revision}? Todas as outras revisões ativas desta família serão inativadas.`)) {
      return;
    }

    try {
      const updatedProject = await reactivateProjectRevision(
        familyId,
        targetProject.id,
        currentUser.id
      );

      const updatedProjects = db.projects.map(p => {
        if (getProjectFamilyId(p) === familyId) {
          return {
            ...p,
            isCurrentRevision: p.id === targetProject.id
          };
        }
        return p;
      });

      setDb({ ...db, projects: updatedProjects });

      if (editingProject && getProjectFamilyId(editingProject) === familyId) {
        const nextEditingProject = updatedProjects.find(p => p.id === targetProject.id) || null;
        if (nextEditingProject) {
          openEdit(nextEditingProject);
        } else {
          setShowModal(false);
        }
      }

      alert(`Revisão ${targetProject.revision} reativada com sucesso!`);
    } catch (err: any) {
      const message = `${err?.message || ''} ${err?.details || ''}`;
      if (message.includes('ACTIVE_WORK_SESSION_MUST_BE_PAUSED')) {
        alert(
          "Existe uma atividade em execução em alguma revisão ativa.\nPause a atividade antes de trocar a revisão ativa."
        );
      } else {
        alert("Erro ao reativar a revisão: " + (err?.message || "Erro desconhecido"));
      }
    }
  };

  const handleActivateSimultaneously = async (targetProject: Project) => {
    const familyId = getProjectFamilyId(targetProject);
    if (!familyId) return;

    if (!window.confirm(`Deseja ativar a revisão ${targetProject.revision} simultaneamente com as outras revisões ativas?`)) {
      return;
    }

    try {
      const updatedProject = await activateProjectRevisionSimultaneously(
        familyId,
        targetProject.id,
        currentUser.id
      );

      const updatedProjects = db.projects.map(p => {
        if (p.id === targetProject.id) {
          return { ...p, isCurrentRevision: true };
        }
        return p;
      });

      setDb({ ...db, projects: updatedProjects });

      if (editingProject && editingProject.id === targetProject.id) {
        setEditingProject({ ...editingProject, isCurrentRevision: true });
      }

      alert(`Revisão ${targetProject.revision} ativada simultaneamente com sucesso!`);
    } catch (err: any) {
      alert("Erro ao ativar simultaneamente: " + (err?.message || "Erro desconhecido"));
    }
  };

  const handleDeactivateRevision = async (targetProject: Project) => {
    const familyId = getProjectFamilyId(targetProject);
    if (!familyId) return;

    // Check for active work sessions on this project (revision) before deactivating
    try {
      const hasActiveSessions = await hasActiveWorkSessionsForProject(
        currentUser.workspaceId,
        targetProject.id
      );
      if (hasActiveSessions) {
        alert(
          "Existe uma atividade em execução nesta revisão.\n\nPause ou conclua a atividade antes de desativar a revisão."
        );
        return;
      }
    } catch (err) {
      console.error("Erro ao verificar sessões ativas:", err);
    }

    if (!window.confirm(`Deseja desativar a revisão ${targetProject.revision}? Ela deixará de consumir capacidade e de participar do forecast.`)) {
      return;
    }

    try {
      const updatedProject = await deactivateProjectRevision(
        familyId,
        targetProject.id,
        currentUser.id
      );

      const updatedProjects = db.projects.map(p => {
        if (p.id === targetProject.id) {
          return { ...p, isCurrentRevision: false };
        }
        return p;
      });

      setDb({ ...db, projects: updatedProjects });

      if (editingProject && editingProject.id === targetProject.id) {
        setEditingProject({ ...editingProject, isCurrentRevision: false });
      }

      alert(`Revisão ${targetProject.revision} desativada com sucesso!`);
    } catch (err: any) {
      const message = `${err?.message || ''} ${err?.details || ''}`;
      if (message.includes('ACTIVE_WORK_SESSION_MUST_BE_PAUSED')) {
        alert(
          "Existe uma atividade em execução nesta revisão.\n\nPause ou conclua a atividade antes de desativar a revisão."
        );
      } else {
        alert("Erro ao desativar a revisão: " + (err?.message || "Erro desconhecido"));
      }
    }
  };


  const handleCreateFolder = async () => {
    if (!clientId) {
      alert("Por favor, selecione um cliente primeiro.");
      return;
    }
    if (!name) {
      alert("Por favor, preencha o nome do projeto primeiro.");
      return;
    }
    const previewCode = getPreviewCode();
    if (previewCode === "---") {
      alert("Não foi possível gerar o código do projeto. Verifique os dados.");
      return;
    }
    
    // Concatena o nome base e sanitiza para evitar caracteres proibidos no sistema de arquivos ou API (como /, \, <, >, :, ", |, ?, *, etc)
    const familyCode = editingProject?.familyCode || editingProject?.code || previewCode;
    const familyName = editingProject?.familyName || editingProject?.name || name;
    const revisionFolderName = editingProject?.revision || 'Rev.00';
    const folderName = `${familyCode} - ${familyName}`;
    const safeFolderName = folderName.replace(/[<>:"\/\\|?*]/g, '-').trim().replace(/\.$/, '');
    
    try {
      if (!('showDirectoryPicker' in window)) {
        alert("Seu navegador não suporta a criação direta de pastas. Recomendamos usar o Google Chrome ou Microsoft Edge no computador.");
        return;
      }
      const dirHandle = await (window as any).showDirectoryPicker({
        id: 'projetos-perspec3d',
        mode: 'readwrite',
        startIn: 'desktop'
      });
      const familyHandle = await dirHandle.getDirectoryHandle(safeFolderName, { create: true });
      await familyHandle.getDirectoryHandle(revisionFolderName, { create: true });
      alert(`Estrutura "${safeFolderName} / ${revisionFolderName}" garantida com sucesso!`);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        alert("Erro ao criar pasta: " + error.message);
      }
    }
  };

  const handleInitiateDeleteProject = async () => {
    if (!editingProject) return;

    // 1. Validar permissões administrativas
    const permCheck = canUserDeletePermanently(currentUser, currentUser.workspaceId);
    if (!permCheck.allowed) {
      alert(permCheck.reason || 'Apenas administradores podem excluir projetos.');
      return;
    }

    const familyId = editingProject.familyId || editingProject.id;
    setIsLoadingDeletionImpact(true);
    setShowDeleteConfirmModal(true);

    try {
      // 1. Calcular impacto com base nos dados locais carregados
      const localImpact = calculateProjectDeletionImpact(
        familyId,
        currentUser.workspaceId,
        db.projects,
        allWorkspaceActivities
      );
      setProjectDeletionImpact(localImpact);

      // 2. Consultar o backend Supabase para obter contagens canônicas completas
      const remoteSummary = await fetchProjectDeletionSummary(familyId, currentUser.workspaceId, currentUser.id);
      if (remoteSummary) {
        setProjectDeletionImpact({
          familyId,
          familyCode: remoteSummary.familyCode || editingProject.familyCode || editingProject.code,
          familyName: remoteSummary.familyName || editingProject.familyName || editingProject.name,
          revisionsCount: remoteSummary.revisionsCount || localImpact.revisionsCount,
          revisions: localImpact.revisions,
          activitiesCount: remoteSummary.activitiesCount,
          activities: localImpact.activities,
          eventsCount: remoteSummary.eventsCount,
          attachmentsCount: remoteSummary.attachmentsCount
        });
      }
    } catch (err) {
      console.warn('Erro ao consultar impacto remoto do projeto, mantendo dados locais:', err);
    } finally {
      setIsLoadingDeletionImpact(false);
    }
  };

  const handleConfirmDeleteProject = async () => {
    if (!editingProject) return;

    const familyId = editingProject.familyId || editingProject.id;
    await deleteProjectPermanently(familyId, currentUser.workspaceId, currentUser.id, currentUser.passwordHash);

    // Identificar todos os IDs de revisões pertencentes à família para limpar atividades locais
    const familyProjectIds = db.projects
      .filter(p => (p.familyId ? p.familyId === familyId : p.id === familyId))
      .map(p => p.id);
    if (!familyProjectIds.includes(editingProject.id)) {
      familyProjectIds.push(editingProject.id);
    }

    // Filtrar atividades em memória
    setAllWorkspaceActivities(prev => prev.filter(act => !familyProjectIds.includes(act.projectId)));

    // Atualizar estado de db.projects de forma atômica
    const newDb = applyProjectDeletionToState(db, familyId);
    setDb(newDb);

    // Limpar initialEditingProject se estiver ativo
    clearInitialEditingProject?.();

    setShowDeleteConfirmModal(false);
    setShowModal(false);
    resetForm();
    alert('Projeto excluído permanentemente.');
  };

  const getDeliveryDateStyle = (dateStr: string, currentStatus: ProjectStatus) => {
    if (!dateStr || currentStatus === ProjectStatus.DONE || currentStatus === ProjectStatus.CANCELED) return 'text-slate-500 font-medium';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = dateStr.split('-').map(Number);
    const delivery = new Date(y, m - 1, d);
    delivery.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((delivery.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'text-rose-500 font-black';
    if (diffDays === 1) return 'text-orange-500 font-black';
    if (diffDays === 2) return 'text-amber-400 font-black';

    return 'text-slate-500 font-black';
  };


  const filteredProjects = useMemo(() => {
    const searchLower = search.toLowerCase();

    return Array.from(familyRevisionsMap.entries())
      .map(([familyId, revisions]) => {
        const ordered = [...revisions].sort((a, b) => getProjectRevisionNumber(b) - getProjectRevisionNumber(a));
        const current = ordered.find(isCurrentProjectRevision) || ordered[0];
        const matchesFamily = ordered.some(project => {
          const matchesSearch = !search || project.name.toLowerCase().includes(searchLower) || project.code.toLowerCase().includes(searchLower);
          const matchesStatus = statusFilter === 'ALL' || project.status === statusFilter;
          const matchesClient = clientFilter === 'ALL' || project.clientId === clientFilter;
          const matchesAssignee = assigneeFilter === 'ALL' || project.assigneeId === assigneeFilter;
          return matchesSearch && matchesStatus && matchesClient && matchesAssignee;
        });
        return { familyId, ordered, current, matchesFamily };
      })
      .filter(family => family.matchesFamily)
      .sort((a, b) => b.current.createdAt - a.current.createdAt)
      .flatMap(family => expandedFamilyIds.includes(family.familyId)
        ? [family.current, ...family.ordered.filter(project => project.id !== family.current.id)]
        : [family.current]);
  }, [familyRevisionsMap, search, statusFilter, clientFilter, assigneeFilter, expandedFamilyIds]);

  const getStatusColor = (s: ProjectStatus) => {
    switch (s) {
      case ProjectStatus.DONE: return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case ProjectStatus.IN_PROGRESS: return 'bg-blue-600/10 text-blue-400 border border-blue-500/20';
      case ProjectStatus.PAUSED: return 'bg-purple-600/10 text-purple-400 border border-purple-500/20';
      case ProjectStatus.QUEUE: return 'bg-slate-700/10 text-slate-400 border border-slate-700/30';
      case ProjectStatus.CANCELED: return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
      default: return 'bg-slate-700/10 text-slate-400 border border-slate-700/30';
    }
  };

  const getPreviewCode = () => {
    if (editingProject) return editingProject.code;
    const client = clientMap.get(clientId);
    if (!client) return "---";
    const baseSeq = customCode || getNextGlobalProjectSeq(db.projects);
    const seq = baseSeq.toString().padStart(6, '0');
    const yearYY = new Date().getFullYear().toString().slice(-2);
    const baseCode = `${client.code.padStart(3, '0')}-${seq}-${yearYY}`;
    return usePrefix && codePrefix ? `${codePrefix}-${baseCode}` : baseCode;
  };

  // Map of blocked activities count per project for O(1) card lookups
  const blockedActivitiesCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const act of allWorkspaceActivities) {
      if (isActivityBlocked(act.status)) {
        map.set(act.projectId, (map.get(act.projectId) || 0) + 1);
      }
    }
    return map;
  }, [allWorkspaceActivities]);

  const kanbanColumns = useMemo(() => {
    const cols: Record<ProjectStatus, Project[]> = {
      [ProjectStatus.QUEUE]: [],
      [ProjectStatus.IN_PROGRESS]: [],
      [ProjectStatus.PAUSED]: [],
      [ProjectStatus.DONE]: [],
      [ProjectStatus.CANCELED]: []
    };
    for (const proj of filteredProjects) {
      if (cols[proj.status]) {
        cols[proj.status].push(proj);
      }
    }
    return cols;
  }, [filteredProjects]);

  const kanbanColumnConfigs = useMemo(() => {
    const base = [
      {
        status: ProjectStatus.QUEUE,
        title: 'FILA DE ESPERA',
        badge: 'A Fazer',
        headerBg: 'bg-slate-100 dark:bg-slate-800/80',
        headerBorder: 'border-slate-300 dark:border-slate-700',
        headerText: 'text-slate-700 dark:text-slate-300'
      },
      {
        status: ProjectStatus.IN_PROGRESS,
        title: 'EM ANDAMENTO',
        badge: 'Em Execução',
        headerBg: 'bg-sky-50 dark:bg-sky-500/10',
        headerBorder: 'border-sky-300 dark:border-sky-500/40',
        headerText: 'text-sky-700 dark:text-sky-300'
      },
      {
        status: ProjectStatus.PAUSED,
        title: 'PAUSADO',
        badge: 'Suspenso',
        headerBg: 'bg-purple-50 dark:bg-purple-500/10',
        headerBorder: 'border-purple-300 dark:border-purple-500/40',
        headerText: 'text-purple-700 dark:text-purple-300'
      },
      {
        status: ProjectStatus.DONE,
        title: 'CONCLUÍDO',
        badge: 'Finalizado',
        headerBg: 'bg-emerald-50 dark:bg-emerald-500/10',
        headerBorder: 'border-emerald-300 dark:border-emerald-500/40',
        headerText: 'text-emerald-700 dark:text-emerald-300'
      }
    ];

    if (showCanceledColumn || statusFilter === ProjectStatus.CANCELED || kanbanColumns[ProjectStatus.CANCELED].length > 0) {
      base.push({
        status: ProjectStatus.CANCELED,
        title: 'CANCELADO',
        badge: 'Cancelado',
        headerBg: 'bg-rose-50 dark:bg-rose-500/10',
        headerBorder: 'border-rose-300 dark:border-rose-500/40',
        headerText: 'text-rose-700 dark:text-rose-300'
      });
    }

    return base;
  }, [showCanceledColumn, statusFilter, kanbanColumns]);

  const evaluateProjectHealth = (project: Project, todayDate: string) => {
    const isHistorical = !isCurrentProjectRevision(project);
    const blockedCount = blockedActivitiesCountMap.get(project.id) || 0;
    const isClosed = project.status === ProjectStatus.DONE || project.status === ProjectStatus.CANCELED;

    let isOverdue = false;
    let isDueToday = false;
    let isDueSoon = false;
    let daysDiff: number | null = null;

    if (project.deliveryDate && !isClosed) {
      daysDiff = calculateDaysDifference(project.deliveryDate, todayDate);
      if (daysDiff !== null) {
        if (daysDiff < 0) {
          isOverdue = true;
        } else if (daysDiff === 0) {
          isDueToday = true;
        } else if (daysDiff <= 3) {
          isDueSoon = true;
        }
      }
    }

    const familyRevisions = familyRevisionsMap.get(getProjectFamilyId(project)) || [];
    const isReprogrammed = familyRevisions.length > 1;

    return {
      isHistorical,
      blockedCount,
      isOverdue,
      isDueToday,
      isDueSoon,
      daysDiff,
      isClosed,
      isReprogrammed,
      familyRevisions
    };
  };

  const handleProjectStatusTransition = async (project: Project, targetStatus: ProjectStatus) => {
    if (currentUser.role === UserRole.VIEWER) {
      alert('Usuários com perfil Visualizador não possuem permissão para alterar o status do projeto.');
      return;
    }

    if (!isCurrentProjectRevision(project)) {
      alert('Esta é uma revisão histórica arquivada. Apenas a revisão ativa do projeto pode ter seu status alterado.');
      return;
    }

    if (project.status === targetStatus) return;

    const todayStr = getTodayDateString();
    const updatedProject: Project = {
      ...project,
      status: targetStatus,
    };

    // Regra 1: Ao sair da Fila de Espera para execução, registrar início real caso não exista
    if (project.status === ProjectStatus.QUEUE && targetStatus !== ProjectStatus.QUEUE && !updatedProject.actualStartDate) {
      updatedProject.actualStartDate = todayStr;
    }

    // Regra 2: Conclusão do projeto (mantendo regras existentes de fechamento e rastreabilidade)
    if (targetStatus === ProjectStatus.DONE && project.status !== ProjectStatus.DONE) {
      updatedProject.actualEndDate = todayStr;
      updatedProject.conclusionResponsibleId = currentUser.id;
      updatedProject.deadlineAtConclusion = project.deliveryDate || project.dueDate;
    }

    // Regra 3: Reabertura de projeto concluído
    if (project.status === ProjectStatus.DONE && targetStatus !== ProjectStatus.DONE) {
      updatedProject.actualEndDate = undefined;
      updatedProject.conclusionResponsibleId = undefined;
      updatedProject.deadlineAtConclusion = undefined;
    }

    // REGRA FUNDAMENTAL (ETAPA 4): Não concluir automaticamente todas as atividades ao mover o projeto para CONCLUÍDO.
    // As atividades mantêm seus status reais autênticos no sistema.

    try {
      const savedProject = await syncProject(updatedProject, currentUser.id);
      const newProjects = db.projects.map((p: Project) => p.id === savedProject.id ? savedProject : p);
      setDb({ ...db, projects: newProjects });

      await logAction(
        currentUser.workspaceId,
        currentUser,
        LogModule.PROJECTS,
        LogAction.UPDATE,
        `${currentUser.username} alterou o status do projeto ${project.code} de "${project.status}" para "${targetStatus}" via Kanban`,
        project.code
      );
    } catch (err: any) {
      console.error('Erro ao atualizar status do projeto no Kanban:', err);
      alert('Falha ao atualizar o status do projeto. Verifique sua conexão e tente novamente.');
    }
  };

  const handleProjectDragStart = (e: React.DragEvent, projectId: string) => {
    e.dataTransfer.setData('text/plain', projectId);
    setDraggedProjectId(projectId);
  };

  const handleProjectDragOver = (e: React.DragEvent, status: ProjectStatus) => {
    e.preventDefault();
    if (dragOverColumn !== status) {
      setDragOverColumn(status);
    }
  };

  const handleProjectDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverColumn(null);
  };

  const handleProjectDrop = (e: React.DragEvent, targetStatus: ProjectStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const projectId = e.dataTransfer.getData('text/plain') || draggedProjectId;
    setDraggedProjectId(null);

    if (!projectId) return;
    const project = db.projects.find(p => p.id === projectId);
    if (!project) return;

    handleProjectStatusTransition(project, targetStatus);
  };

  useEffect(() => {
    const handleClickOutside = () => {
      if (menuOpenProjectId) {
        setMenuOpenProjectId(null);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [menuOpenProjectId]);

  const todayStr = getTodayDateString();

  return (
    <div className="space-y-6">
      {/* Topo do Módulo com Alternador de Visualização */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight transition-colors">Gestão de Projetos</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Acompanhamento e fluxo operacional dos projetos do workspace</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Alternador de Visualização: Lista | Kanban | Cronograma */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900/60 p-1 rounded-2xl border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <List size={15} />
              <span>Lista</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
                viewMode === 'kanban'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid size={15} />
              <span>Kanban</span>
            </button>
            {onNavigateToTimeline && (
              <button
                type="button"
                onClick={onNavigateToTimeline}
                className="flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-black text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-all"
                title="Acessar Cronograma Geral (Gantt)"
              >
                <Calendar size={15} />
                <span>Cronograma</span>
              </button>
            )}
          </div>

          {currentUser.role !== UserRole.VIEWER && (
            <button
              onClick={() => { resetForm(); setShowModal(true); }}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-500/20 flex items-center font-bold text-sm"
            >
              <Plus size={18} className="mr-1.5" />
              Criar Projeto
            </button>
          )}
        </div>
      </div>

      {/* Painel de Filtros Unificado */}
      <div className="bg-white dark:bg-[#1e293b] p-6 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 items-center justify-between transition-colors">
        <div className="flex flex-wrap flex-1 gap-4 items-center">
          <div className="relative flex-1 min-w-[250px]">
            <input
              type="text"
              placeholder="Pesquisar projetos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm text-slate-900 dark:text-white"
            />
            <svg className="w-5 h-5 absolute left-4 top-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <select
            className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-bold cursor-pointer transition-colors"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">Status: Todos</option>
            {Object.values(ProjectStatus).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-bold cursor-pointer transition-colors"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
          >
            <option value="ALL">Cliente: Todos</option>
            {sortedClients.map((c: Client) => <option key={c.id} value={c.id}>{c.code.padStart(3, '0')} - {c.name}</option>)}
          </select>
          <select
            className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-bold cursor-pointer transition-colors"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
          >
            <option value="ALL">Responsável: Todos</option>
            {activeUsers.map(u => (
              <option key={u.id} value={u.id}>{u.username.split(' ')[0]}</option>
            ))}
          </select>
        </div>

        {viewMode === 'kanban' && (
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowCanceledColumn(!showCanceledColumn)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                showCanceledColumn || kanbanColumns[ProjectStatus.CANCELED].length > 0
                  ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-900 text-rose-700 dark:text-rose-300'
                  : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {showCanceledColumn ? 'Ocultar Cancelados' : `Exibir Cancelados (${kanbanColumns[ProjectStatus.CANCELED].length})`}
            </button>
          </div>
        )}
      </div>

      {/* VISUALIZAÇÃO 1: LISTA (TABELA EXISTENTE) */}
      {viewMode === 'list' && (
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 dark:bg-[#2a374a] border-b border-slate-200 dark:border-slate-800 transition-colors">
                <th className="w-2 px-0 py-4"></th>
                <th className="px-2.5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-12">Mini</th>
                <th className="px-2.5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[450px]">Nome do Projeto</th>
                <th className="px-2.5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-44 text-center">Código</th>
                <th className="px-2.5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-40">Cliente</th>
                <th className="px-2.5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-36">Status</th>
                <th className="px-2.5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-32">Responsável</th>
                <th className="px-2.5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-32">Prazo</th>
                <th className="px-2.5 py-4 text-right w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 transition-colors">
              {filteredProjects.map((project: Project) => {
                const client = clientMap.get(project.clientId);
                const assignee = userMap.get(project.assigneeId || '');
                const workingDays = calculateWorkingDays(project.startDate || '', project.deliveryDate || '');
                const dateStyle = getDeliveryDateStyle(project.deliveryDate || '', project.status);
                const familyId = getProjectFamilyId(project);
                const familyRevisions = familyRevisionsMap.get(familyId) || [];
                const activeCount = activeRevisionsCountMap.get(familyId) || 0;
                const hasSimultaneousActive = activeCount > 1;
                const isHistorical = !isCurrentProjectRevision(project);
                const isExpanded = expandedFamilyIds.includes(familyId);

                return (
                  <tr key={project.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors group relative border-l-4 border-transparent ${isHistorical ? 'bg-slate-50/70 dark:bg-slate-950/25 opacity-80' : ''}`}>
                    <td className="w-2 p-0">
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${project.status === ProjectStatus.DONE ? 'bg-emerald-500' : project.status === ProjectStatus.IN_PROGRESS ? 'bg-blue-500' : project.status === ProjectStatus.PAUSED ? 'bg-purple-500' : project.status === ProjectStatus.CANCELED ? 'bg-orange-500' : 'bg-slate-600'}`}></div>
                    </td>
                    <td className="px-2.5 py-4 text-center">
                      <div className="flex justify-center">
                        <div
                          className="cursor-pointer transition-transform hover:scale-110 active:scale-95"
                          onClick={() => project.photoUrl && setShowImageZoom(project.photoUrl)}
                        >
                          {project.photoUrl ? (
                            <img src={project.photoUrl} className="w-8 h-8 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700 shadow-lg mx-auto transition-colors" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-300 dark:text-slate-600 border border-slate-100 dark:border-slate-700/50 mx-auto transition-colors">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-2.5 py-4">
                      <button onClick={() => openEdit(project)} className="font-bold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left outline-none whitespace-normal break-words leading-tight block w-full">
                        {project.name}
                      </button>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-[8px] font-black uppercase tracking-widest ${isHistorical ? 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
                          {isHistorical ? 'INATIVA' : 'ATIVA'}
                        </span>
                        {!isHistorical && hasSimultaneousActive && (
                          <span className="rounded-md px-2 py-0.5 text-[8px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <span>⚠</span> <span>{activeCount} REVISÕES ATIVAS</span>
                          </span>
                        )}
                        {isHistorical && currentUser.role !== UserRole.VIEWER && (
                          <button
                            type="button"
                            onClick={() => handleReactivateRevision(project)}
                            className="text-[8px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 px-2 py-0.5 rounded-md transition-all active:scale-95"
                          >
                            Reativar esta revisão
                          </button>
                        )}
                        {isHistorical && currentUser.role === UserRole.ADMIN && (
                          <button
                            type="button"
                            onClick={() => handleActivateSimultaneously(project)}
                            className="text-[8px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 px-2 py-0.5 rounded-md transition-all active:scale-95 border border-amber-200 dark:border-amber-900/30"
                          >
                            Ativar Simultaneamente
                          </button>
                        )}
                        {!isHistorical && currentUser.role === UserRole.ADMIN && (
                          <button
                            type="button"
                            onClick={() => handleDeactivateRevision(project)}
                            className="text-[8px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 px-2 py-0.5 rounded-md transition-all active:scale-95 border border-rose-200 dark:border-rose-900/30"
                          >
                            Desativar Revisão
                          </button>
                        )}
                        {familyRevisions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setExpandedFamilyIds(current => current.includes(familyId) ? current.filter(id => id !== familyId) : [...current, familyId])}
                            className="text-[8px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            {isExpanded ? 'Ocultar histórico' : `Ver histórico (${familyRevisions.length - 1})`}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-2.5 py-4 text-center">
                      <div className="flex flex-col whitespace-nowrap">
                        <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400 tracking-tighter uppercase font-black transition-colors">
                          {project.code}
                        </span>
                        <span className="text-[9px] text-slate-400 dark:text-slate-600 font-black uppercase tracking-widest transition-colors">{project.revision}</span>
                      </div>
                    </td>
                    <td className="px-2.5 py-4">
                      <button
                        onClick={() => client && setViewingClient(client)}
                        className="text-[11px] text-slate-400 font-medium hover:text-indigo-400 transition-colors outline-none text-left truncate max-w-[150px] block"
                      >
                        {client?.name || '---'}
                      </button>
                    </td>
                    <td className="px-2.5 py-4 text-center">
                      <span className={`inline-block px-2 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest min-w-[110px] text-center shadow-sm ${getStatusColor(project.status)}`}>
                        {project.status}
                      </span>
                    </td>
                    <td className="px-2.5 py-4">
                      {assignee ? (
                        <div className="flex items-center space-x-1.5">
                          <div className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[8px] font-black text-indigo-600 dark:text-indigo-400 uppercase transition-colors">
                            {assignee.username.charAt(0)}
                          </div>
                          <span className="text-[11px] text-slate-600 dark:text-slate-300 font-bold truncate max-w-[100px] transition-colors">{assignee.username}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-600 italic">---</span>
                      )}
                    </td>
                    <td className="px-2.5 py-4 text-center">
                      <div className="flex flex-col items-center space-y-0.5">
                        <div className="flex items-center text-[9px] font-bold text-slate-500 whitespace-nowrap">
                          <span className="text-emerald-500 mr-1.5 font-black">→</span>
                          {formatDate(project.startDate)}
                        </div>
                        <div className={`text-[11px] font-black flex items-center whitespace-nowrap ${dateStyle}`}>
                          {formatDate(project.deliveryDate)}
                          <span className="text-rose-500 ml-1.5 font-black">→</span>
                        </div>
                        <div className="text-[8px] font-black text-slate-500 dark:text-slate-600 bg-slate-100 dark:bg-slate-800/60 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700/50 uppercase tracking-tighter mt-0.5 transition-colors">
                          {workingDays.split(' ')[0]}d úteis
                        </div>
                      </div>
                    </td>
                    <td className="px-2.5 py-4 text-right">
                      <button onClick={() => openEdit(project)} className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors bg-slate-100 dark:bg-slate-800/40 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg">
                        {currentUser.role === UserRole.VIEWER ? (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredProjects.length === 0 && <div className="py-24 text-center text-slate-600 font-black uppercase tracking-[0.2em] text-xs">Nenhum projeto encontrado</div>}
        </div>
      </div>
      )}

      {/* VISUALIZAÇÃO 2: KANBAN DE PROJETOS */}
      {viewMode === 'kanban' && (
        <div className="space-y-4">
          <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 ${kanbanColumnConfigs.length > 4 ? 'xl:grid-cols-5' : 'xl:grid-cols-4'} gap-4`}>
            {kanbanColumnConfigs.map((col) => {
              const projectsInCol = kanbanColumns[col.status] || [];
              const isDragOver = dragOverColumn === col.status;

              return (
                <div
                  key={col.status}
                  onDragOver={(e) => handleProjectDragOver(e, col.status)}
                  onDragLeave={handleProjectDragLeave}
                  onDrop={(e) => handleProjectDrop(e, col.status)}
                  className={`flex flex-col rounded-3xl p-3 bg-slate-50/70 dark:bg-[#1e293b]/50 border transition-all duration-200 min-h-[500px] ${
                    isDragOver
                      ? 'border-indigo-500 bg-indigo-50/30 dark:bg-indigo-500/10 shadow-lg scale-[1.01]'
                      : 'border-slate-200/80 dark:border-slate-800'
                  }`}
                >
                  {/* Cabeçalho da Coluna */}
                  <div className={`p-3.5 rounded-2xl border ${col.headerBg} ${col.headerBorder} flex items-center justify-between mb-3 shadow-sm`}>
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs font-black uppercase tracking-wider ${col.headerText}`}>
                        {col.title}
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-white/40 dark:bg-black/20 text-current">
                        {col.badge}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-black bg-white dark:bg-slate-900 ${col.headerText} shadow-sm`}>
                      {projectsInCol.length}
                    </span>
                  </div>

                  {/* Lista de Cartões */}
                  <div className="space-y-3 flex-1 overflow-y-auto max-h-[calc(100vh-280px)] custom-scrollbar pr-0.5">
                    {projectsInCol.map((project: Project) => {
                      const health = evaluateProjectHealth(project, todayStr);
                      const client = clientMap.get(project.clientId);
                      const assignee = userMap.get(project.assigneeId || '');
                      const isMenuOpen = menuOpenProjectId === project.id;
                      const revNumber = getProjectRevisionNumber(project);

                      return (
                        <div
                          key={project.id}
                          draggable={!health.isHistorical && currentUser.role !== UserRole.VIEWER}
                          onDragStart={(e) => handleProjectDragStart(e, project.id)}
                          onClick={() => openEdit(project)}
                          className={`p-4 rounded-2xl bg-white dark:bg-[#0f172a] border transition-all cursor-grab active:cursor-grabbing group relative select-none shadow-sm hover:shadow-md hover:border-indigo-500/50 ${
                            health.isHistorical
                              ? 'opacity-70 bg-slate-50/60 dark:bg-slate-900/40 cursor-default border-slate-200 dark:border-slate-800'
                              : 'border-slate-200 dark:border-slate-800/90'
                          }`}
                        >
                          {/* Topo do Card: Código, Revisão & Menu Acessível */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                {project.code}
                              </span>
                              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/50">
                                Rev.{String(revNumber).padStart(2, '0')}
                              </span>
                              {health.isHistorical && (
                                <span className="px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                  Arquivado
                                </span>
                              )}
                            </div>

                            {/* Menu Acessível */}
                            <div className="relative" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setMenuOpenProjectId(isMenuOpen ? null : project.id)}
                                title="Ações do projeto..."
                                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                              >
                                <MoreVertical size={14} />
                              </button>

                              {/* Dropdown Acessível */}
                              {isMenuOpen && (
                                <div
                                  className="absolute right-0 top-6 z-30 w-52 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-2 space-y-1 text-xs animate-in fade-in duration-150"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                                    Mover status para:
                                  </div>

                                  {project.status !== ProjectStatus.QUEUE && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setMenuOpenProjectId(null);
                                        handleProjectStatusTransition(project, ProjectStatus.QUEUE);
                                      }}
                                      className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold flex items-center gap-2"
                                    >
                                      <span className="w-2 h-2 rounded-full bg-slate-400" />
                                      <span>Fila de Espera</span>
                                    </button>
                                  )}

                                  {project.status !== ProjectStatus.IN_PROGRESS && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setMenuOpenProjectId(null);
                                        handleProjectStatusTransition(project, ProjectStatus.IN_PROGRESS);
                                      }}
                                      className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-sky-600 dark:text-sky-400 font-bold flex items-center gap-2"
                                    >
                                      <span className="w-2 h-2 rounded-full bg-sky-500" />
                                      <span>Em Andamento</span>
                                    </button>
                                  )}

                                  {project.status !== ProjectStatus.PAUSED && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setMenuOpenProjectId(null);
                                        handleProjectStatusTransition(project, ProjectStatus.PAUSED);
                                      }}
                                      className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-purple-600 dark:text-purple-400 font-bold flex items-center gap-2"
                                    >
                                      <span className="w-2 h-2 rounded-full bg-purple-500" />
                                      <span>Pausado</span>
                                    </button>
                                  )}

                                  {project.status !== ProjectStatus.DONE && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setMenuOpenProjectId(null);
                                        handleProjectStatusTransition(project, ProjectStatus.DONE);
                                      }}
                                      className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-2"
                                    >
                                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                      <span>Concluído</span>
                                    </button>
                                  )}

                                  {project.status !== ProjectStatus.CANCELED && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setMenuOpenProjectId(null);
                                        handleProjectStatusTransition(project, ProjectStatus.CANCELED);
                                      }}
                                      className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-rose-600 dark:text-rose-400 font-bold flex items-center gap-2"
                                    >
                                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                                      <span>Cancelado</span>
                                    </button>
                                  )}

                                  <div className="border-t border-slate-100 dark:border-slate-800 my-1 pt-1" />

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMenuOpenProjectId(null);
                                      openEdit(project);
                                    }}
                                    className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium flex items-center gap-2"
                                  >
                                    <Eye size={13} className="text-slate-400" />
                                    <span>Ver Detalhes</span>
                                  </button>

                                  {onNavigateToTimeline && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setMenuOpenProjectId(null);
                                        onNavigateToTimeline();
                                      }}
                                      className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium flex items-center gap-2"
                                    >
                                      <Calendar size={13} className="text-slate-400" />
                                      <span>Ver no Cronograma</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Nome do Projeto */}
                          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2 mb-1.5 leading-snug">
                            {project.name}
                          </h4>

                          {/* Cliente */}
                          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate mb-3">
                            {client?.name || 'Cliente Geral'}
                          </p>

                          {/* Badges de Saúde Operacional */}
                          <div className="flex flex-wrap items-center gap-1.5 mb-3">
                            {health.isOverdue && health.daysDiff !== null && (
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center gap-1">
                                <AlertTriangle size={10} />
                                <span>Atrasado ({Math.abs(health.daysDiff)}d)</span>
                              </span>
                            )}
                            {health.isDueToday && (
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                                <Clock size={10} />
                                <span>Vence Hoje</span>
                              </span>
                            )}
                            {health.isDueSoon && health.daysDiff !== null && (
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-500/20 flex items-center gap-1">
                                <Clock size={10} />
                                <span>Vence em {health.daysDiff}d</span>
                              </span>
                            )}
                            {health.blockedCount > 0 && (
                              <span
                                className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-[#78350F]/20 dark:bg-[#78350F]/50 text-amber-900 dark:text-[#FDE68A] border border-[#FBBF24]/50 flex items-center gap-1"
                                title={`${health.blockedCount} atividade(s) bloqueada(s) no projeto`}
                              >
                                <Ban size={10} className="text-[#FBBF24]" />
                                <span>{health.blockedCount} bloqueada{health.blockedCount > 1 ? 's' : ''}</span>
                              </span>
                            )}
                            {health.isReprogrammed && (
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                {health.familyRevisions.length}ª Rev.
                              </span>
                            )}
                          </div>

                          {/* Rodapé do Card: Responsável & Prazo */}
                          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
                            <div className="flex items-center space-x-1.5 min-w-0">
                              <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[9px] font-black text-slate-700 dark:text-slate-200 flex-shrink-0">
                                {assignee?.username?.charAt(0).toUpperCase() || '—'}
                              </div>
                              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate max-w-[85px]">
                                {assignee?.username?.split(' ')[0] || 'Sem Resp.'}
                              </span>
                            </div>

                            <div className="flex items-center space-x-1 text-[10px] font-black text-slate-500 flex-shrink-0">
                              <Calendar size={11} className="text-slate-400" />
                              <span>{formatDisplayDate(project.deliveryDate) || 'Sem prazo'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {projectsInCol.length === 0 && (
                      <div className="py-12 text-center text-slate-400 dark:text-slate-600 text-[11px] font-bold">
                        Nenhum projeto
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL: Cadastro/Edição de Projeto */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-[#0f172a] rounded-[40px] shadow-2xl w-full max-w-2xl h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-white/5 transition-all duration-500">
            <div className="px-8 py-6 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-white/5 flex items-center justify-between transition-colors">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight transition-colors">
                  {currentUser.role === UserRole.VIEWER || isHistoricalRevision ? 'Visualizar Detalhes' : (editingProject ? 'Editar Detalhes' : 'Novo Projeto')}
                </h3>
                {editingProject && (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">{editingProject.revision}</span>
                    <span className={`rounded-md px-2 py-0.5 text-[8px] font-black uppercase tracking-widest ${isHistoricalRevision ? 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
                      {isHistoricalRevision ? 'INATIVA' : 'ATIVA'}
                    </span>
                    {isHistoricalRevision && currentUser.role !== UserRole.VIEWER && (
                      <button
                        type="button"
                        onClick={() => handleReactivateRevision(editingProject)}
                        className="text-[8px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 px-2 py-0.5 rounded-md transition-all active:scale-95"
                      >
                        Reativar esta revisão
                      </button>
                    )}
                    {isHistoricalRevision && currentUser.role === UserRole.ADMIN && (
                      <button
                        type="button"
                        onClick={() => handleActivateSimultaneously(editingProject)}
                        className="text-[8px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 px-2 py-0.5 rounded-md transition-all active:scale-95 border border-amber-200 dark:border-amber-900/30"
                      >
                        Ativar Simultaneamente
                      </button>
                    )}
                    {!isHistoricalRevision && currentUser.role === UserRole.ADMIN && (
                      <button
                        type="button"
                        onClick={() => handleDeactivateRevision(editingProject)}
                        className="text-[8px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 px-2 py-0.5 rounded-md transition-all active:scale-95 border border-rose-200 dark:border-rose-900/30"
                      >
                        Desativar Revisão
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button onClick={() => setShowModal(false)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300 dark:hover:bg-white/20 transition-all active:scale-95">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8 dark:bg-[#0f172a] transition-colors">
              {showMultipleActiveWarning && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-slate-800 dark:text-slate-200">
                  <div className="flex items-center space-x-2 text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1">
                    <span>⚠</span>
                    <span>Múltiplas revisões desta família estão ativas</span>
                  </div>
                  <p className="text-xs font-medium">
                    As seguintes revisões estão ativas simultaneamente: {editingActiveRevisions.map(r => r.revision).sort().join(', ')}
                  </p>
                </div>
              )}
              {/* Conteúdo do Formulário */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-2">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50 flex items-center space-x-3 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-600/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-1">Código do Projeto</p>
                    <p className="text-sm font-mono text-indigo-600 dark:text-indigo-400 font-bold transition-colors">{getPreviewCode()}</p>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50 transition-colors">
                  <label className="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1 transition-colors">Identificador de Projeto</label>
                  <input
                    type="text"
                    value={customCode}
                    disabled={currentUser.role === UserRole.VIEWER || Boolean(editingProject)}
                    onChange={(e) => setCustomCode(e.target.value)}
                    className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono transition-colors disabled:opacity-60"
                    placeholder="Ex: 000042"
                  />
                </div>
              </div>

              {/* PREFIX SETUP */}
              <div className="bg-slate-50 dark:bg-slate-900/40 p-5 rounded-[24px] border border-slate-100 dark:border-white/5 space-y-4">
                <label className={`flex items-center space-x-3 cursor-pointer group ${currentUser.role === UserRole.VIEWER ? 'pointer-events-none opacity-60' : ''}`}>
                  <div className={`w-10 h-6 rounded-full transition-all relative ${usePrefix ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${usePrefix ? 'left-5' : 'left-1'}`} />
                  </div>
                  <input
                    type="checkbox"
                    checked={usePrefix}
                    disabled={currentUser.role === UserRole.VIEWER || Boolean(editingProject)}
                    onChange={(e) => setUsePrefix(e.target.checked)}
                    className="hidden"
                  />
                  <span className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest group-hover:text-indigo-500 transition-colors">Adicionar Prefixo no Código</span>
                </label>

                {usePrefix && (
                  <div className="animate-in slide-in-from-top-2 duration-300">
                    <input
                      type="text"
                      value={codePrefix}
                      disabled={currentUser.role === UserRole.VIEWER || Boolean(editingProject)}
                      onChange={(e) => setCodePrefix(e.target.value)}
                      placeholder="Ex: Estudo, Protótipo, Interno..."
                      className="w-full px-5 py-3 bg-white dark:bg-slate-900 border border-indigo-500/30 dark:border-indigo-500/20 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all shadow-lg shadow-indigo-500/5 disabled:opacity-60"
                    />
                    <p className="text-[9px] font-bold text-indigo-500/60 uppercase tracking-wider mt-2 ml-1">O prefixo aparecerá antes do código do cliente</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-5">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Cliente *</label>
                    <select required value={clientId} disabled={!!editingProject || currentUser.role === UserRole.VIEWER} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition-colors disabled:opacity-60" onChange={(e) => setClientId(e.target.value)}>
                      <option value="">Selecione o Cliente...</option>
                      {activeClients.map((c: Client) => <option key={c.id} value={c.id}>{c.code.padStart(3, '0')} - {c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Responsável *</label>
                    <select required value={assigneeId} disabled={currentUser.role === UserRole.VIEWER || isHistoricalRevision} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition-colors disabled:opacity-60" onChange={(e) => setAssigneeId(e.target.value)}>
                      <option value="">Selecione um usuário...</option>
                      {activeUsers.map((u: InternalUser) => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Nome do Projeto *</label>
                    <input type="text" required value={name} disabled={currentUser.role === UserRole.VIEWER || isHistoricalRevision} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition-colors disabled:opacity-60" placeholder="Ex: Reforma Pavimento Superior" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1 transition-colors">Revisão</label>
                      <input type="text" value={editingProject?.revision || 'Rev.00'} disabled className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-500 dark:text-slate-400 outline-none font-medium transition-colors" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1 transition-colors">Status</label>
                      <select value={status} disabled={currentUser.role === UserRole.VIEWER || isHistoricalRevision} onChange={(e: any) => setStatus(e.target.value)} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 outline-none font-medium cursor-pointer transition-colors disabled:opacity-60">
                        {Object.values(ProjectStatus).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1 transition-colors">Data Início</label>
                      <input type="date" value={startDate} max={deliveryDate || undefined} disabled={currentUser.role === UserRole.VIEWER || isHistoricalRevision} onInvalid={(e) => e.currentTarget.setCustomValidity('O período do projeto deve possuir início e prazo final válidos.')} onInput={(e) => e.currentTarget.setCustomValidity('')} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition-colors disabled:opacity-60" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1 transition-colors">Data Entrega</label>
                      <input type="date" value={deliveryDate} min={startDate || undefined} disabled={currentUser.role === UserRole.VIEWER || isHistoricalRevision} onInvalid={(e) => e.currentTarget.setCustomValidity('O período do projeto deve possuir início e prazo final válidos.')} onInput={(e) => e.currentTarget.setCustomValidity('')} onChange={(e) => setDeliveryDate(e.target.value)} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition-colors disabled:opacity-60" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1 transition-colors">Imagem do Projeto</label>
                    <div className="relative h-56 w-full rounded-2xl bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 border-dashed overflow-hidden flex flex-col items-center justify-center group transition-all hover:border-indigo-500/50">
                      {photoUrl ? (
                        <div className="relative w-full h-full">
                          <img src={photoUrl} className="absolute inset-0 w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-slate-900/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center space-y-3 p-4">
                            {currentUser.role !== UserRole.VIEWER && !isHistoricalRevision && (
                              <>
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full py-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-lg hover:bg-indigo-700 transition">Alterar Foto</button>
                                <button type="button" onClick={removePhoto} className="w-full py-2 bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-lg hover:bg-rose-700 transition">Remover Imagem</button>
                              </>
                            )}
                            {currentUser.role === UserRole.VIEWER && (
                              <span className="text-[10px] font-black text-white uppercase tracking-widest">Somente Leitura</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center pointer-events-none text-center px-4">
                          <svg className="w-10 h-10 text-slate-700 mb-2 group-hover:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest text-center">Clique para Carregar Foto</span>
                        </div>
                      )}
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className={`absolute inset-0 cursor-pointer ${photoUrl ? 'hidden' : 'opacity-0'}`} />
                    </div>
                    <p className="text-[9px] font-bold text-slate-500 text-center uppercase tracking-widest leading-relaxed mt-2">
                      Formatos: JPG, PNG | Máximo 2MB
                    </p>
                  </div>
                </div>
              </div>

              {editingProject && isCurrentProjectRevision(editingProject) && ![ProjectStatus.DONE, ProjectStatus.CANCELED].includes(editingProject.status) && (
                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                      Previsão de Entrega e Saúde do Projeto
                    </h4>
                    {editingProjectPredictability && (() => {
                      const badge = getDeliveryPredictabilityBadge(editingProjectPredictability.status);
                      return (
                        <span className={`px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${badge.badgeBg} ${badge.badgeText} ${badge.badgeBorder}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dotColor}`} />
                          {badge.label}
                        </span>
                      );
                    })()}
                  </div>

                  {!editingProjectPredictability ? (
                    <div className="p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-center text-[9px] font-black uppercase tracking-widest text-slate-400 animate-pulse">
                      Avaliando prazos e impedimentos...
                    </div>
                  ) : (
                    <div className="p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-100 dark:border-slate-800">
                          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Prazo Global</p>
                          <p className="mt-1 text-sm font-black text-slate-800 dark:text-white">
                            {editingProjectPredictability.formattedDeliveryDate}
                          </p>
                          {editingProjectPredictability.daysRemaining !== null && (
                            <span className={`text-[8px] font-black uppercase tracking-wider block mt-0.5 ${
                              editingProjectPredictability.isOverdue ? 'text-rose-500' :
                              editingProjectPredictability.isNearDeadline ? 'text-amber-500' :
                              'text-emerald-500'
                            }`}>
                              {editingProjectPredictability.daysRemaining < 0
                                ? `Vencido há ${Math.abs(editingProjectPredictability.daysRemaining)}d`
                                : editingProjectPredictability.daysRemaining === 0
                                  ? 'Vence hoje'
                                  : `Em ${editingProjectPredictability.daysRemaining}d`}
                            </span>
                          )}
                        </div>

                        <div className="p-3 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-100 dark:border-slate-800">
                          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Em Andamento</p>
                          <p className="mt-1 text-sm font-black text-sky-600 dark:text-sky-400">
                            {editingProjectPredictability.inProgressActivitiesCount}
                          </p>
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block mt-0.5">
                            de {editingProjectPredictability.openActivitiesCount} abertas
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-100 dark:border-slate-800">
                          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Impedimentos</p>
                          <p className={`mt-1 text-sm font-black ${editingProjectPredictability.blockedActivitiesCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>
                            {editingProjectPredictability.blockedActivitiesCount}
                          </p>
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block mt-0.5">
                            {editingProjectPredictability.blockedActivitiesCount > 0 ? 'bloqueada(s)' : 'sem bloqueios'}
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-100 dark:border-slate-800">
                          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Atividades Atrasadas</p>
                          <p className={`mt-1 text-sm font-black ${editingProjectPredictability.overdueActivitiesCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
                            {editingProjectPredictability.overdueActivitiesCount}
                          </p>
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block mt-0.5">
                            {editingProjectPredictability.overdueActivitiesCount > 0 ? 'prazo vencido' : 'no prazo'}
                          </span>
                        </div>
                      </div>

                      {editingProjectPredictability.attentionReasons.length > 0 && (
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1">
                          <p className="text-[8px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                            Alertas de Prazo e Fluxo
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {editingProjectPredictability.attentionReasons.map((reason, idx) => (
                              <span key={idx} className="px-2 py-0.5 rounded-md bg-amber-500/15 text-[9px] font-bold text-amber-700 dark:text-amber-300">
                                ⚠ {reason}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {editingProjectPredictability.reprogrammingCount > 0 && (
                        <div className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[9px] font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between">
                          <span>Histórico de Reprogramação: {editingProjectPredictability.reprogrammingCount} revisão(ões)</span>
                          {editingProjectPredictability.originalDeliveryDate && (
                            <span className="text-slate-400 font-mono text-[8px]">
                              Prazo original: {editingProjectPredictability.formattedOriginalDeliveryDate}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ATIVIDADES */}
              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800/50 transition-colors">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] flex items-center transition-colors">
                    <svg className="w-4 h-4 mr-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                    Atividades do Projeto
                  </h4>
                  {currentUser.role !== UserRole.VIEWER && editingProject && !isHistoricalRevision && (
                    <button
                      type="button"
                      onClick={() => {
                        resetActForm();
                        setShowActivityModal(true);
                      }}
                      className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest rounded-lg border border-indigo-100 dark:border-indigo-500/20 hover:bg-indigo-600 hover:text-white transition-all flex items-center"
                    >
                      <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                      Adicionar Atividade
                    </button>
                  )}
                </div>

                {!editingProject ? (
                  <div className="py-8 text-center bg-slate-50 dark:bg-slate-900/30 rounded-2xl border-2 border-dashed border-slate-100 dark:border-slate-800/50 transition-colors">
                    <p className="text-[10px] text-slate-400 dark:text-slate-600 font-bold uppercase tracking-widest leading-loose">Salve o projeto primeiro para poder<br />cadastrar atividades</p>
                  </div>
                ) : isLoadingActivities ? (
                  <div className="py-8 text-center text-slate-400 dark:text-slate-600 text-[10px] font-black uppercase tracking-widest animate-pulse">
                    Carregando atividades...
                  </div>
                ) : projectActivities.length === 0 ? (
                  <div className="py-8 text-center bg-slate-50 dark:bg-slate-900/30 rounded-2xl border-2 border-dashed border-slate-100 dark:border-slate-800/50 transition-colors">
                    <p className="text-[10px] text-slate-400 dark:text-slate-600 font-bold uppercase tracking-widest leading-loose">Nenhuma atividade cadastrada</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar transition-colors">
                    {projectActivities.map((activity, index) => {
                      const assignee = db.users.find(u => u.id === activity.assigneeId);
                      const actType = activeActivityTypes.find(t => t.id === activity.activityTypeId);
                      const statusBadge = getActivityStatusBadge(activity.status);
                      const events = projectActivitiesEvents[activity.id] || [];
                      const metrics = calculateActivityManagerialMetrics(activity, events);
                      const isTransitioning = transitioningActivityId === activity.id;
                      const hasRescheduled = Boolean(activity.originalDeliveryDate && activity.deliveryDate && activity.originalDeliveryDate !== activity.deliveryDate);

                      const isBlocked = isActivityBlocked(activity.status);

                      return (
                        <div
                          key={activity.id}
                          className={`min-w-0 p-4 sm:p-5 rounded-2xl shadow-sm transition-all group/task border ${
                            isBlocked
                              ? 'bg-amber-50/25 dark:bg-amber-950/20 border-amber-500/50 dark:border-amber-500/40 border-l-4 border-l-[#FBBF24]'
                              : 'bg-white dark:bg-slate-900/90 border-slate-200/80 dark:border-slate-800 hover:border-indigo-500/40'
                          }`}
                        >
                          {/* Header: Prioridade + Nome + Categoria + Badges de Status e Prazo */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                              {!isHistoricalRevision && (
                                <div className="flex flex-col items-center space-y-0.5 pt-0.5">
                                  <button
                                    type="button"
                                    onClick={() => handleReorderProjectActivity(index, 'up')}
                                    disabled={index === 0}
                                    className={`p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition ${index === 0 ? 'opacity-20 cursor-not-allowed' : 'text-slate-400 hover:text-indigo-600'}`}
                                    title="Subir prioridade"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" /></svg>
                                  </button>
                                  <span className="text-[9px] font-black text-slate-400 font-mono">{activity.orderIndex}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleReorderProjectActivity(index, 'down')}
                                    disabled={index === projectActivities.length - 1}
                                    className={`p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition ${index === projectActivities.length - 1 ? 'opacity-20 cursor-not-allowed' : 'text-slate-400 hover:text-indigo-600'}`}
                                    title="Descer prioridade"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                                  </button>
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 break-words">{activity.name}</h4>
                                  {actType?.category && (
                                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-[9px] font-black text-slate-500 dark:text-slate-400 rounded-md uppercase tracking-wider">
                                      {actType.category}
                                    </span>
                                  )}
                                </div>

                                {/* Responsável */}
                                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                  <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                  </svg>
                                  <span>Responsável: <strong className="font-semibold text-slate-700 dark:text-slate-200">{assignee ? assignee.username : 'Não atribuído'}</strong></span>
                                </div>
                              </div>
                            </div>

                            {/* Badges de Status Canônico e Prazo */}
                            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0">
                              <span
                                style={statusBadge.badgeStyle}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${statusBadge.badgeBg} ${statusBadge.badgeText} ${statusBadge.badgeBorder}`}
                              >
                                {isBlocked ? (
                                  <svg className="w-2.5 h-2.5 text-[#FBBF24] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                  </svg>
                                ) : (
                                  <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dotBg}`} />
                                )}
                                {statusBadge.label}
                              </span>
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[9px] font-bold border ${metrics.isOverdue ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25' : metrics.isUpcoming ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25' : metrics.isOnTime ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'}`}>
                                {metrics.deadlineLabel}
                              </span>
                            </div>
                          </div>

                          {/* Grade de Datas e Prazos */}
                          <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2.5 py-2 px-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/80 text-[11px]">
                            <div>
                              <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Início</span>
                              <span className="text-slate-700 dark:text-slate-300">
                                {activity.actualStartDate ? (
                                  <>Real: <strong className="font-bold text-slate-900 dark:text-white">{formatDisplayDate(activity.actualStartDate)}</strong></>
                                ) : activity.startDate ? (
                                  <>Planejado: <strong className="font-bold">{formatDisplayDate(activity.startDate)}</strong></>
                                ) : (
                                  <span className="text-slate-400">Não definido</span>
                                )}
                              </span>
                            </div>

                            <div>
                              <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Previsão Término</span>
                              <div className="flex flex-wrap items-center gap-1">
                                <strong className="font-bold text-slate-900 dark:text-white">{formatDisplayDate(activity.deliveryDate)}</strong>
                                {hasRescheduled && (
                                  <span className="px-1.5 py-0.2 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[8px] font-bold rounded" title={`Original: ${formatDisplayDate(activity.originalDeliveryDate)} (${metrics.deadlineChangesCount} reprogramações)`}>
                                    (Orig: {formatDisplayDate(activity.originalDeliveryDate)})
                                  </span>
                                )}
                              </div>
                            </div>

                            <div>
                              <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Conclusão Real</span>
                              <span className="text-slate-700 dark:text-slate-300">
                                {activity.actualEndDate ? (
                                  <>
                                    <strong className="font-bold text-emerald-600 dark:text-emerald-400">{formatDisplayDate(activity.actualEndDate)}</strong>
                                    {metrics.leadTimeRealizedDays !== null && (
                                      <span className="ml-1 text-[9px] text-slate-400">({metrics.leadTimeRealizedDays}d lead time)</span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-slate-400">Pendente</span>
                                )}
                              </span>
                            </div>
                          </div>

                          {/* Motivo do Bloqueio se bloqueada */}
                          {isActivityBlocked(activity.status) && (
                            <div className="mt-3 px-3.5 py-2.5 rounded-xl bg-[#78350F]/15 dark:bg-[#78350F]/30 border-2 border-[#FBBF24]/70 text-slate-800 dark:text-amber-100 text-xs flex items-start gap-2.5 shadow-sm">
                              <span className="p-1 rounded-md bg-[#FBBF24] text-[#78350F] shrink-0 font-black">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                              </span>
                              <div className="flex-1 min-w-0">
                                <span className="font-black text-[9px] uppercase tracking-wider text-amber-800 dark:text-[#FDE68A] block">
                                  Atividade Bloqueada
                                </span>
                                <p className="mt-0.5 text-xs font-semibold leading-relaxed break-words text-slate-900 dark:text-amber-100">
                                  {activity.blockedReason || 'Motivo de bloqueio não informado'}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Anotações */}
                          {activity.notes && (
                            <p className="mt-2 text-[10px] italic text-slate-500 dark:text-slate-400 break-words">
                              Obs: {activity.notes}
                            </p>
                          )}

                          {/* Ações Operacionais */}
                          <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {!isHistoricalRevision && (
                                <>
                                  {isActivityToDo(activity.status) && (
                                    <button
                                      type="button"
                                      onClick={() => handleStartActivitySimplified(activity)}
                                      disabled={isTransitioning}
                                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-sm transition disabled:opacity-50"
                                    >
                                      {isTransitioning ? 'Iniciando...' : 'Iniciar'}
                                    </button>
                                  )}

                                  {isActivityInProgress(activity.status) && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => openBlockingDialog(activity)}
                                        disabled={isTransitioning}
                                        className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500 hover:text-white text-amber-600 dark:text-amber-400 text-[9px] font-black uppercase tracking-widest rounded-lg border border-amber-500/25 transition disabled:opacity-50"
                                      >
                                        Bloquear
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openCompletionDialog(activity)}
                                        disabled={isTransitioning}
                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-sm transition disabled:opacity-50"
                                      >
                                        Concluir
                                      </button>
                                    </>
                                  )}

                                  {isActivityBlocked(activity.status) && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleResumeActivitySimplified(activity)}
                                        disabled={isTransitioning}
                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-sm transition disabled:opacity-50"
                                      >
                                        {isTransitioning ? 'Retomando...' : 'Retomar'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openCompletionDialog(activity)}
                                        disabled={isTransitioning}
                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-sm transition disabled:opacity-50"
                                      >
                                        Concluir
                                      </button>
                                    </>
                                  )}

                                  {isActivityCompleted(activity.status) && (
                                    <button
                                      type="button"
                                      onClick={() => openReopenDialog(activity)}
                                      disabled={isTransitioning}
                                      className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-700 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest rounded-lg transition disabled:opacity-50"
                                    >
                                      Reabrir
                                    </button>
                                  )}
                                </>
                              )}

                              {/* Histórico */}
                              <button
                                type="button"
                                onClick={() => openHistoryModal(activity)}
                                className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest rounded-lg transition inline-flex items-center gap-1"
                                title="Histórico de auditoria"
                              >
                                <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Histórico
                              </button>
                            </div>

                            {currentUser.role !== UserRole.VIEWER && !isHistoricalRevision && (
                              <div className="flex items-center space-x-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingActivity(activity);
                                    setActTypeId(activity.activityTypeId || '');
                                    setActAssigneeId(activity.assigneeId || '');
                                    setActStatus(normalizeActivityStatus(activity.status));
                                    setActEstimatedDuration(activity.estimatedDurationHours !== undefined ? activity.estimatedDurationHours.toString() : '');
                                    setActStartDate(activity.startDate || '');
                                    setActDeliveryDate(activity.deliveryDate || '');
                                    setActBlockedReason(activity.blockedReason || '');
                                    setActActualStartDate(activity.actualStartDate || '');
                                    setActActualEndDate(activity.actualEndDate || '');
                                    setActNotes(activity.notes || '');
                                    setShowActivityModal(true);
                                  }}
                                  className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition"
                                  title="Editar Atividade"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProjectAct(activity)}
                                  className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition"
                                  title="Excluir Atividade"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1 transition-colors">Anotações do Projeto</label>
                <textarea
                  value={notes}
                  disabled={currentUser.role === UserRole.VIEWER || isHistoricalRevision}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium min-h-[100px] resize-none transition-colors disabled:opacity-60"
                  placeholder="Observações técnicas, contatos adicionais ou notas de andamento..."
                />
              </div>

              <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 transition-colors bg-white dark:bg-[#0f172a] sticky bottom-0 z-10">
                {/* Ação Destrutiva Privilegiada no rodapé esquerdo */}
                {editingProject && currentUser.role === UserRole.ADMIN ? (
                  <button
                    type="button"
                    onClick={handleInitiateDeleteProject}
                    className="py-4 px-5 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200/50 dark:border-rose-500/20 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2 active:scale-95"
                    title="Excluir Projeto e todas as suas revisões"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Excluir Projeto</span>
                  </button>
                ) : <div />}

                {/* Ações de Revisão, Pasta, Cancelamento e Salvamento */}
                <div className="flex flex-wrap items-center gap-3 ml-auto">
                  {editingProject && !isHistoricalRevision && (
                  <button
                    type="button"
                    onClick={openCreateRevisionModal}
                    className="py-4 px-5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all active:scale-[0.98] font-black text-[9px] uppercase tracking-widest whitespace-nowrap"
                    title="Criar nova revisão operacional"
                  >
                    Nova revisão
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCreateFolder}
                  className="py-4 px-6 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 dark:hover:text-white transition-all active:scale-[0.98] font-black text-[10px] uppercase tracking-[0.2em] whitespace-nowrap"
                  title="Criar pasta do projeto"
                >
                  <svg className="w-5 h-5 sm:mr-2 text-amber-500" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                  <span className="hidden sm:inline">Criar Pasta do Projeto</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-200 dark:hover:bg-slate-700 dark:hover:text-white transition-all active:scale-[0.98]"
                >
                  {currentUser.role === UserRole.VIEWER ? 'Fechar' : 'Cancelar'}
                </button>
                  {currentUser.role !== UserRole.VIEWER && !isHistoricalRevision && (
                    <button
                      type="submit"
                      className="py-4 px-6 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all active:scale-[0.98]"
                    >
                      {editingProject ? 'Salvar Alterações' : 'Criar Projeto'}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRevisionModal && editingProject && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[140] flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-white/5 dark:bg-[#0f172a]">
            <div className="border-b border-slate-100 px-7 py-6 dark:border-white/5">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Família</p>
              <h3 className="mt-1 text-sm font-black text-slate-900 dark:text-white">{editingProject.code} — {editingProject.familyName || editingProject.name}</h3>
              <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Nova revisão: {nextRevisionLabel}</p>
            </div>
            <form onSubmit={handleCreateRevision} className="space-y-5 p-7">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-400">Data de início</label>
                  <input type="date" required value={revisionStartDate} max={revisionDeliveryDate || undefined} onChange={event => setRevisionStartDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-400">Data de entrega</label>
                  <input type="date" required value={revisionDeliveryDate} min={revisionStartDate || undefined} onChange={event => setRevisionDeliveryDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-400">Responsável</label>
                <select required value={revisionAssigneeId} onChange={event => setRevisionAssigneeId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <option value="">Selecione...</option>
                  {db.users.filter(user => user.isActive).map(user => <option key={user.id} value={user.id}>{user.username}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-400">Observações opcionais</label>
                <textarea value={revisionNotes} onChange={event => setRevisionNotes(event.target.value)} className="min-h-[90px] w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
              </div>
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[9px] font-bold leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                A nova revisão começa em Fila de Espera e sem atividades. Execuções, sessões e horas extras da revisão anterior não serão copiadas.
              </p>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowRevisionModal(false)} disabled={isCreatingRevision} className="flex-1 rounded-xl bg-slate-100 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:bg-slate-800 dark:text-slate-400">Cancelar</button>
                <button type="submit" disabled={isCreatingRevision} className="flex-1 rounded-xl bg-indigo-600 py-3 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50">{isCreatingRevision ? 'Criando...' : `Criar ${nextRevisionLabel}`}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Activity Modal */}
      {showActivityModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[120] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-[#0f172a] rounded-[32px] shadow-2xl w-full max-w-md max-h-[calc(100vh-40px)] md:max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-white/5 transition-all duration-500">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/30 flex justify-between items-center transition-colors">
              <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-sm transition-colors">
                {editingActivity ? 'Editar Atividade' : 'Adicionar Atividade'}
              </h3>
              <button type="button" onClick={() => setShowActivityModal(false)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300 dark:hover:bg-white/20 transition-all active:scale-95">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSaveProjectActivity} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-8 space-y-5">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Tipo de Atividade *</label>
                  <select
                    required
                    value={actTypeId}
                    onChange={(e) => setActTypeId(e.target.value)}
                    className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition-colors"
                  >
                    <option value="">Selecione o tipo de atividade...</option>
                    {activeActivityTypes.map(t => (
                      <option key={t.id} value={t.id}>{t.name} {t.category ? `(${t.category})` : ''}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Responsável</label>
                  <select
                    value={actAssigneeId}
                    onChange={(e) => setActAssigneeId(e.target.value)}
                    className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition-colors"
                  >
                    <option value="">Não atribuído</option>
                    {db.users.filter(u => u.isActive).map(u => (
                      <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
                    ))}
                  </select>
                </div>

                {/* Status Canônico */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Status Operacional *</label>
                  <select
                    value={actStatus}
                    onChange={(e) => setActStatus(e.target.value as ActivityCanonicalStatus)}
                    className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition-colors"
                  >
                    <option value={ActivityCanonicalStatus.TO_DO}>A FAZER</option>
                    <option value={ActivityCanonicalStatus.IN_PROGRESS}>EM ANDAMENTO</option>
                    <option value={ActivityCanonicalStatus.BLOCKED}>BLOQUEADA</option>
                    <option value={ActivityCanonicalStatus.COMPLETED}>CONCLUÍDA</option>
                  </select>
                </div>

                {/* Motivo do Bloqueio (visível quando BLOQUEADA) */}
                {actStatus === ActivityCanonicalStatus.BLOCKED && (
                  <div>
                    <label className="block text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-2 px-1">Motivo do Bloqueio *</label>
                    <textarea
                      required
                      value={actBlockedReason}
                      onChange={(e) => setActBlockedReason(e.target.value)}
                      className="w-full px-4 py-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700/60 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 outline-none font-medium min-h-[60px] resize-none"
                      placeholder="Descreva o motivo que está impedindo o avanço desta atividade..."
                    />
                  </div>
                )}

                {/* Datas de Início Planejado e Previsão de Término */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Início Planejado</label>
                    <input
                      type="date"
                      value={actStartDate}
                      min={editingProject?.startDate}
                      max={editingProject?.deliveryDate}
                      onInvalid={(e) => e.currentTarget.setCustomValidity(`Esta atividade deve estar dentro do período do projeto. ${editingProject ? getProjectPeriodLabel(editingProject) : ''}`)}
                      onInput={(e) => e.currentTarget.setCustomValidity('')}
                      onChange={(e) => setActStartDate(e.target.value)}
                      className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Previsão Término *</label>
                    <input
                      type="date"
                      required
                      value={actDeliveryDate}
                      min={editingProject?.startDate}
                      max={editingProject?.deliveryDate}
                      onInvalid={(e) => e.currentTarget.setCustomValidity(`Esta atividade deve estar dentro do período do projeto. ${editingProject ? getProjectPeriodLabel(editingProject) : ''}`)}
                      onInput={(e) => e.currentTarget.setCustomValidity('')}
                      onChange={(e) => setActDeliveryDate(e.target.value)}
                      className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition-colors"
                    />
                  </div>
                </div>

                {/* Referência do Prazo Original */}
                {editingActivity && editingActivity.originalDeliveryDate && editingActivity.originalDeliveryDate !== actDeliveryDate && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-[10px] text-amber-700 dark:text-amber-300">
                    <span>Previsão Original de Referência: <strong className="font-bold">{formatDisplayDate(editingActivity.originalDeliveryDate)}</strong></span>
                    <p className="mt-0.5 text-[9px] opacity-80">Alterar a previsão registrará uma reprogramação no histórico de auditoria.</p>
                  </div>
                )}

                {/* Data Real de Conclusão se CONCLUÍDA */}
                {actStatus === ActivityCanonicalStatus.COMPLETED && (
                  <div>
                    <label className="block text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-2 px-1">Data Real de Conclusão</label>
                    <input
                      type="date"
                      value={actActualEndDate || getTodayDateString()}
                      onChange={(e) => setActActualEndDate(e.target.value)}
                      className="w-full px-4 py-3 bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-700/60 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                    />
                  </div>
                )}

                {editingProject && (
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 px-1">
                    {getProjectPeriodLabel(editingProject)}
                  </p>
                )}

                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Observações</label>
                  <textarea
                    value={actNotes}
                    onChange={(e) => setActNotes(e.target.value)}
                    className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium min-h-[80px] resize-none transition-colors"
                    placeholder="Instruções adicionais para esta atividade..."
                  />
                </div>
              </div>

              <div className="px-8 py-6 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/30 flex space-x-3 transition-colors">
                <button
                  type="button"
                  onClick={() => setShowActivityModal(false)}
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl text-xs font-black uppercase tracking-widest hover:text-slate-700 dark:hover:text-white transition active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:bg-indigo-700 transition active:scale-95"
                >
                  Salvar Atividade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showOvertimeModal && overtimeActivity && currentUser.role === UserRole.ADMIN && !isHistoricalRevision && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[135] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0f172a] rounded-[28px] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-white/5">
            <div className="px-7 py-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between sticky top-0 bg-white dark:bg-[#0f172a] z-10">
              <div>
                <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-sm">Horas extras</h3>
                <p className="text-xs text-slate-500 mt-1">{overtimeActivity.name}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowOvertimeModal(false);
                  setOvertimeActivity(null);
                  resetOvertimeForm();
                }}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-white/10 text-slate-500 hover:text-slate-900 dark:hover:text-white transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-7 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800 p-4">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tempo regular</p>
                  <p className="font-mono text-sm font-bold text-slate-700 dark:text-slate-200 mt-1">{formatElapsedTime(getRegularOperationalMs(overtimeActivity.id))}</p>
                </div>
                <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-4">
                  <p className="text-[9px] font-black text-cyan-600 dark:text-cyan-400 uppercase tracking-widest">Horas extras</p>
                  <p className="font-mono text-sm font-bold text-cyan-600 dark:text-cyan-400 mt-1">{formatElapsedTime(getActivityOvertimeMs(overtimeActivity.id))}</p>
                </div>
                <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4">
                  <p className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Total contabilizado</p>
                  <p className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1">{formatElapsedTime(getAccountedOperationalMs(overtimeActivity.id))}</p>
                </div>
              </div>

              <form onSubmit={handleSaveOvertime} className="rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800 p-5 space-y-4">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  {editingOvertimeEntry ? 'Editar lançamento' : 'Adicionar hora extra'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Data</label>
                    <input
                      type="date"
                      required
                      value={overtimeDate}
                      onChange={event => setOvertimeDate(event.target.value)}
                      className="w-full px-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Quantidade de horas</label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      placeholder="Ex: 2 ou 2,5"
                      value={overtimeHours}
                      onChange={event => setOvertimeHours(event.target.value)}
                      className="w-full px-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Observação opcional</label>
                  <textarea
                    value={overtimeNotes}
                    onChange={event => setOvertimeNotes(event.target.value)}
                    placeholder="Ex: Entrega urgente"
                    className="w-full px-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-cyan-500 min-h-[72px] resize-none"
                  />
                </div>
                <div className="flex gap-3">
                  {editingOvertimeEntry && (
                    <button type="button" onClick={resetOvertimeForm} className="flex-1 py-3 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-widest">
                      Cancelar edição
                    </button>
                  )}
                  <button disabled={isSavingOvertime} type="submit" className="flex-1 py-3 bg-cyan-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-cyan-700 transition disabled:opacity-50">
                    {isSavingOvertime ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>

              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Lançamentos</h4>
                {getActivityOvertimeEntries(overtimeActivity.id).length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">Nenhuma hora extra cadastrada.</p>
                ) : getActivityOvertimeEntries(overtimeActivity.id).map(entry => (
                  <div key={entry.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{formatDate(entry.date)} · {formatElapsedTime(entry.authorizedHours * 60 * 60 * 1000)}</p>
                      {entry.notes && <p className="text-xs text-slate-500 mt-1">{entry.notes}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => editOvertimeEntry(entry)} disabled={isSavingOvertime} className="px-3 py-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg text-[9px] font-black uppercase tracking-widest disabled:opacity-50">Editar</button>
                      <button type="button" onClick={() => handleDeleteOvertime(entry)} disabled={isSavingOvertime} className="px-3 py-2 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-lg text-[9px] font-black uppercase tracking-widest disabled:opacity-50">Excluir</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingActivity && activeWorkContext && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[140] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0f172a] rounded-[28px] shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-white/5">
            <div className="px-7 py-6 border-b border-slate-100 dark:border-white/5">
              <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-sm">
                Você já possui uma atividade em execução.
              </h3>
            </div>
            <div className="p-7 space-y-5">
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800 p-5 space-y-3">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Projeto</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{activeWorkContext.project.code} — {activeWorkContext.project.name}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Atividade</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{activeWorkContext.activity.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Início</p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-1">{formatSessionStartedAt(activeWorkContext.session.startedAt)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tempo contabilizado</p>
                    <p className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1">{formatElapsedTime(getAccountedOperationalMs(activeWorkContext.activity.id))}</p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Para iniciar <strong className="text-slate-800 dark:text-slate-200">{pendingActivity.name}</strong>, a atividade atual será pausada no mesmo instante.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingActivity(null)}
                  disabled={activityActionId === pendingActivity.id}
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:text-slate-700 dark:hover:text-white transition disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleStartOrResumeActivity(pendingActivity, true)}
                  disabled={activityActionId === pendingActivity.id}
                  className="flex-[1.7] py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  {activityActionId === pendingActivity.id ? 'Aguarde...' : 'Pausar atual e iniciar esta'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImageZoom && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100] flex items-center justify-center p-8" onClick={() => setShowImageZoom(null)}>
          <div className="relative max-w-full max-h-full">
            <img src={showImageZoom} className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain animate-in zoom-in duration-300" />
          </div>
        </div>
      )}

      {viewingClient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-[#0f172a] rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-white/5 transition-all duration-500">
            {/* Header */}
            <div className="px-8 py-6 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-white/5 flex items-center justify-between transition-colors">
              <div className="flex items-center space-x-4">
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl text-indigo-600 dark:text-indigo-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight transition-colors">{viewingClient.name}</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mt-1 transition-colors">Ficha de Identificação</p>
                </div>
              </div>
              <button
                onClick={() => setViewingClient(null)}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300 dark:hover:bg-white/20 transition-all active:scale-95"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-8 space-y-8 dark:bg-[#0f172a] transition-colors">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Coluna 1: Identificação e Contato */}
                <div className="space-y-6">
                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors">
                      <svg className="w-4 h-4 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Código do Cliente</p>
                      <p className="text-slate-900 dark:text-white font-bold font-mono text-sm tracking-widest transition-colors">#{viewingClient.code.padStart(3, '0')}</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors">
                      <svg className="w-4 h-4 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">E-mail</p>
                      <p className="text-slate-900 dark:text-white font-bold text-sm truncate transition-colors">{viewingClient.email || 'Não informado'}</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors">
                      <svg className="w-4 h-4 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Telefone</p>
                      <p className="text-slate-900 dark:text-white font-bold text-sm transition-colors">{viewingClient.phone || 'Não informado'}</p>
                    </div>
                  </div>
                </div>

                {/* Coluna 2: Localização */}
                <div className="space-y-6">
                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors">
                      <svg className="w-4 h-4 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Cidade / UF</p>
                      <p className="text-slate-900 dark:text-white font-bold text-sm transition-colors">{viewingClient.city && viewingClient.state ? `${viewingClient.city} - ${viewingClient.state}` : 'Não informado'}</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors">
                      <svg className="w-4 h-4 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Endereço Residencial/Comercial</p>
                      <p className="text-slate-900 dark:text-white font-bold text-sm leading-tight transition-colors">{viewingClient.address ? `${viewingClient.address}, nº ${viewingClient.number || 'S/N'}` : 'Não informado'}</p>
                      {viewingClient.neighborhood && <p className="text-slate-400 text-[11px] font-medium mt-0.5">{viewingClient.neighborhood}</p>}
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors">
                      <svg className="w-4 h-4 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Status Ativo</p>
                      <div className="mt-1 flex items-center space-x-2">
                        <span className={`w-2 h-2 rounded-full ${viewingClient.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
                        <span className={`text-[11px] font-black uppercase tracking-[0.1em] ${viewingClient.status === 'ACTIVE' ? 'text-emerald-500' : 'text-slate-400'}`}>
                          {viewingClient.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex transition-colors">
                <button
                  onClick={() => setViewingClient(null)}
                  className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-200 dark:hover:bg-slate-700 dark:hover:text-white transition-all active:scale-[0.98]"
                >
                  Fechar Painel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Bloqueio de Atividade */}
      {blockingDialogActivity && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0f172a] rounded-[28px] shadow-2xl w-full max-w-lg border border-slate-200 dark:border-white/10 overflow-hidden">
            <div className="px-7 py-6 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900 dark:text-white uppercase tracking-wider">Bloquear Atividade</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-xs">{blockingDialogActivity.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBlockingDialogActivity(null);
                  setBlockingReasonInput('');
                }}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-7 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Motivo do Bloqueio *
                </label>
                <textarea
                  autoFocus
                  rows={3}
                  value={blockingReasonInput}
                  onChange={(e) => setBlockingReasonInput(e.target.value)}
                  placeholder="Ex: Aguardando aprovação do cliente sobre a cota do telhado..."
                  className="w-full px-4 py-3 rounded-xl border border-amber-300/80 dark:border-amber-700/60 bg-amber-50/30 dark:bg-amber-950/20 text-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-amber-500 resize-none font-medium"
                />
                <p className="mt-1.5 text-[10px] text-slate-400">
                  O motivo será registrado no histórico e exibido no cartão da atividade para toda a equipe.
                </p>
              </div>
            </div>

            <div className="px-7 py-5 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-white/5 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setBlockingDialogActivity(null);
                  setBlockingReasonInput('');
                }}
                className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black text-xs uppercase tracking-wider hover:bg-slate-200 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmBlockActivity}
                disabled={!blockingReasonInput.trim() || transitioningActivityId === blockingDialogActivity.id}
                className="flex-1 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-600/20 transition disabled:opacity-50"
              >
                {transitioningActivityId === blockingDialogActivity.id ? 'Bloqueando...' : 'Confirmar Bloqueio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Conclusão de Atividade */}
      {completingDialogActivity && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0f172a] rounded-[28px] shadow-2xl w-full max-w-lg border border-slate-200 dark:border-white/10 overflow-hidden">
            <div className="px-7 py-6 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900 dark:text-white uppercase tracking-wider">Concluir Atividade</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-xs">{completingDialogActivity.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCompletingDialogActivity(null);
                  setCompletionDateInput('');
                }}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-7 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Data Real de Conclusão *
                </label>
                <input
                  type="date"
                  required
                  value={completionDateInput}
                  onChange={(e) => setCompletionDateInput(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
                <div className="mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 flex flex-col gap-1">
                  <span>Previsão cadastrada: <strong className="text-slate-700 dark:text-slate-200">{formatDisplayDate(completingDialogActivity.deliveryDate)}</strong></span>
                  {completingDialogActivity.originalDeliveryDate && completingDialogActivity.originalDeliveryDate !== completingDialogActivity.deliveryDate && (
                    <span>Previsão original: <strong className="text-slate-700 dark:text-slate-200">{formatDisplayDate(completingDialogActivity.originalDeliveryDate)}</strong></span>
                  )}
                  <span className="text-[9px] text-slate-400 mt-0.5">A data informada será a referência definitiva de entrega desta atividade para os indicadores gerenciais.</span>
                </div>
              </div>
            </div>

            <div className="px-7 py-5 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-white/5 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setCompletingDialogActivity(null);
                  setCompletionDateInput('');
                }}
                className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black text-xs uppercase tracking-wider hover:bg-slate-200 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmCompleteActivity}
                disabled={!completionDateInput || transitioningActivityId === completingDialogActivity.id}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
              >
                {transitioningActivityId === completingDialogActivity.id ? 'Concluindo...' : 'Confirmar Conclusão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reabertura de Atividade */}
      {reopeningDialogActivity && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0f172a] rounded-[28px] shadow-2xl w-full max-w-lg border border-slate-200 dark:border-white/10 overflow-hidden">
            <div className="px-7 py-6 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900 dark:text-white uppercase tracking-wider">Reabrir Atividade</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-xs">{reopeningDialogActivity.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReopeningDialogActivity(null);
                  setReopeningReasonInput('');
                }}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-7 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Esta atividade retornará ao status <strong className="text-blue-600 dark:text-blue-400 font-bold">EM ANDAMENTO</strong> e a data de conclusão anterior (<strong className="font-semibold">{formatDisplayDate(reopeningDialogActivity.actualEndDate)}</strong>) será arquivada no histórico.
              </p>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Motivo da Reabertura (Opcional)
                </label>
                <input
                  type="text"
                  value={reopeningReasonInput}
                  onChange={(e) => setReopeningReasonInput(e.target.value)}
                  placeholder="Ex: Ajustes solicitados pelo cliente na revisão técnica..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
              </div>
            </div>

            <div className="px-7 py-5 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-white/5 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setReopeningDialogActivity(null);
                  setReopeningReasonInput('');
                }}
                className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black text-xs uppercase tracking-wider hover:bg-slate-200 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmReopenActivity}
                disabled={transitioningActivityId === reopeningDialogActivity.id}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-indigo-600/20 transition disabled:opacity-50"
              >
                {transitioningActivityId === reopeningDialogActivity.id ? 'Reabrindo...' : 'Reabrir Atividade'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Histórico de Auditoria */}
      {historyModalActivity && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0f172a] rounded-[28px] shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col border border-slate-200 dark:border-white/10 overflow-hidden">
            <div className="px-7 py-6 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900 dark:text-white uppercase tracking-wider">Histórico de Eventos</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-xs">{historyModalActivity.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHistoryModalActivity(null);
                  setActivityHistoryEvents([]);
                }}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-7 overflow-y-auto flex-1 space-y-4">
              {isLoadingHistory ? (
                <div className="py-12 text-center text-slate-400 text-xs font-bold uppercase tracking-widest animate-pulse">
                  Carregando histórico...
                </div>
              ) : activityHistoryEvents.length === 0 ? (
                <div className="py-12 text-center bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Nenhum evento registrado para esta atividade ainda.</p>
                </div>
              ) : (
                <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                  {activityHistoryEvents.map((evt) => {
                    const eventDate = new Date(evt.createdAt);
                    const formattedTime = !isNaN(eventDate.getTime())
                      ? `${String(eventDate.getDate()).padStart(2, '0')}/${String(eventDate.getMonth() + 1).padStart(2, '0')}/${eventDate.getFullYear()} às ${String(eventDate.getHours()).padStart(2, '0')}:${String(eventDate.getMinutes()).padStart(2, '0')}`
                      : 'Data indisponível';

                    const eventBadgeStyle =
                      evt.eventType === 'CREATED' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' :
                      evt.eventType === 'STARTED' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' :
                      evt.eventType === 'BLOCKED' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' :
                      evt.eventType === 'RESUMED' ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20' :
                      evt.eventType === 'RESCHEDULED' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' :
                      evt.eventType === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' :
                      evt.eventType === 'REOPENED' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' :
                      'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';

                    return (
                      <div key={evt.id} className="relative group">
                        <div className="absolute -left-6 top-1.5 w-3 h-3 rounded-full bg-indigo-500 ring-4 ring-white dark:ring-[#0f172a]" />
                        <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${eventBadgeStyle}`}>
                              {evt.eventType}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">{formattedTime}</span>
                          </div>
                          {evt.details && (
                            <p className="mt-2 text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                              {evt.details}
                            </p>
                          )}
                          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                            <span>Registrado por: <strong className="text-slate-600 dark:text-slate-300 font-semibold">{evt.actorName || 'Sistema'}</strong></span>
                            {evt.toStatus && <span>Status: <strong className="text-slate-600 dark:text-slate-300 font-semibold">{evt.toStatus}</strong></span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-7 py-5 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-white/5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setHistoryModalActivity(null);
                  setActivityHistoryEvents([]);
                }}
                className="w-full py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black text-xs uppercase tracking-wider hover:bg-slate-200 transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação administrativa para exclusão de projeto */}
      {editingProject && (
        <AdministrativeDeleteModal
          isOpen={showDeleteConfirmModal}
          onClose={() => setShowDeleteConfirmModal(false)}
          onConfirm={handleConfirmDeleteProject}
          entityType="PROJECT"
          entityCode={editingProject.familyCode || editingProject.code}
          entityName={editingProject.familyName || editingProject.name}
          impact={projectDeletionImpact}
          isLoadingImpact={isLoadingDeletionImpact}
        />
      )}
    </div>
  );
};
