
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Project, ProjectStatus, Client, InternalUser, UserRole, TeamTask, TaskType, ProjectActivity, ActivityExecution, ActivityExecutionStatus, ActivityOvertimeEntry, WorkSession, ActiveWorkSessionContext, ActivityType, LogModule, LogAction } from '../types';
import { syncProject, AppDB, syncTeamTask, deleteTeamTask, fetchProjectActivities, fetchActivityExecutions, fetchActivityOvertimeEntries, fetchWorkSessions, fetchActiveWorkSessionContext, startOrResumeActivity, pauseActivityExecution, completeActivityExecution, logAction, fetchActivityTypes } from '../storage';
import { isProjectActivityClosed } from '../utils/projectActivityStatus';
import { HoverTooltipPortal } from './InfoTooltip';
import { findActivitiesOutsideProjectPeriod, getAffectedActivitiesLabel, isValidDateRange } from '../utils/projectDateIntegrity';
import { isCurrentProjectRevision } from '../utils/projectRevision';
import { calculateAccountedOperationalMs, calculateOvertimeMs, calculateRegularOperationalMs, calculatePauseMetrics } from '../utils/operationalTime';

interface GanttProps {
  db: AppDB;
  setDb: (db: AppDB) => void;
  currentUser: InternalUser;
  theme: 'dark' | 'light';
  onOpenProject?: (project: Project) => void;
  onEditActivity?: (project: Project, activity: ProjectActivity) => void;
}

export const Gantt: React.FC<GanttProps> = ({
  db,
  setDb,
  currentUser,
  theme,
  onOpenProject,
  onEditActivity
}) => {
  const allProjects = db.projects || [];
  const allClients = db.clients || [];
  const allUsers = db.users || [];

  const [viewMode, setViewMode] = useState<'selector' | 'flow' | 'assignments'>('selector');
  const [projectActivities, setProjectActivities] = useState<ProjectActivity[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);

  const loadProjectActivitiesConsolidated = async () => {
    setIsLoadingActivities(true);
    try {
      const data = await fetchProjectActivities(currentUser.workspaceId);
      setProjectActivities(data);
    } catch (err) {
      console.error("Erro ao carregar atividades no Gantt:", err);
    } finally {
      setIsLoadingActivities(false);
    }
  };

  useEffect(() => {
    loadProjectActivitiesConsolidated();
  }, [currentUser.workspaceId, viewMode]);

  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [viewingUserCarga, setViewingUserCarga] = useState<any | null>(null);

  // Form State for local Edit Modal (Consultancy Base)
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [status, setStatus] = useState<ProjectStatus>(ProjectStatus.QUEUE);
  const [revision, setRevision] = useState('');
  const [startDate, setStartDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');

  const [editingTeamTask, setEditingTeamTask] = useState<TeamTask | null>(null);
  
  // States for ActivityQuickViewModal
  const [selectedQuickViewActivity, setSelectedQuickViewActivity] = useState<any | null>(null);
  const [activityExecutions, setActivityExecutions] = useState<ActivityExecution[]>([]);
  const [overtimeEntries, setOvertimeEntries] = useState<ActivityOvertimeEntry[]>([]);
  const [workSessions, setWorkSessions] = useState<WorkSession[]>([]);
  const [activeWorkContext, setActiveWorkContext] = useState<ActiveWorkSessionContext | null>(null);
  const [pendingActivity, setPendingActivity] = useState<ProjectActivity | null>(null);
  const [activityActionId, setActivityActionId] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const [isLoadingQuickViewData, setIsLoadingQuickViewData] = useState(false);
  const [activeActivityTypes, setActiveActivityTypes] = useState<ActivityType[]>([]);

  // Helpers for operational time
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

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '---';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const formatDecimalHours = (hours: number): string => {
    const isNegative = hours < 0;
    const absHours = Math.abs(hours);
    const h = Math.floor(absHours);
    const m = Math.round((absHours - h) * 60);
    const formatted = m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
    return isNegative ? `-${formatted}` : formatted;
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
  ) || 0;

  const getActivityOvertimeMs = (activityId: string) => calculateOvertimeMs(
    getActivityOvertimeEntries(activityId).map(entry => entry.authorizedHours)
  ) || 0;

  const getAccountedOperationalMs = (activityId: string) => calculateAccountedOperationalMs(
    getActivitySessions(activityId),
    getActivityOvertimeEntries(activityId).map(entry => entry.authorizedHours),
    db.company,
    clockNow
  ) || 0;

  const getOpenExecution = (activityId: string) => activityExecutions.find(execution =>
    execution.projectActivityId === activityId &&
    execution.internalUserId === currentUser.id &&
    execution.status !== 'COMPLETED' && execution.status !== 'CANCELED'
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

  // Load active activity types on mount
  useEffect(() => {
    const loadActiveTypes = async () => {
      try {
        const types = await fetchActivityTypes(currentUser.workspaceId);
        setActiveActivityTypes(types.filter(t => t.isActive));
      } catch (err) {
        console.error('Erro ao carregar tipos de atividade:', err);
      }
    };
    loadActiveTypes();
  }, [currentUser.workspaceId]);

  // Load quick view details for activity
  const loadQuickViewData = async (activityId: string) => {
    setIsLoadingQuickViewData(true);
    try {
      const [executions, entries, context] = await Promise.all([
        fetchActivityExecutions(currentUser.workspaceId, { projectActivityIds: [activityId] }),
        fetchActivityOvertimeEntries(currentUser.workspaceId, { projectActivityIds: [activityId] }),
        fetchActiveWorkSessionContext(currentUser.workspaceId, currentUser.id)
      ]);
      setActivityExecutions(executions);
      setOvertimeEntries(entries);
      setActiveWorkContext(context);
      
      const sessions = executions.length > 0
        ? await fetchWorkSessions(currentUser.workspaceId, {
            activityExecutionIds: executions.map(execution => execution.id)
          })
        : [];
      setWorkSessions(sessions);
    } catch (err) {
      console.error("Erro ao carregar detalhes operacionais da atividade:", err);
      setActivityExecutions([]);
      setOvertimeEntries([]);
      setWorkSessions([]);
    } finally {
      setIsLoadingQuickViewData(false);
    }
  };

  useEffect(() => {
    if (selectedQuickViewActivity) {
      loadQuickViewData(selectedQuickViewActivity.id);
    } else {
      setActivityExecutions([]);
      setOvertimeEntries([]);
      setWorkSessions([]);
    }
  }, [selectedQuickViewActivity?.id]);

  const hasRunningOperationalSession = Boolean(activeWorkContext?.session.startedAt);
  useEffect(() => {
    if (!hasRunningOperationalSession) return;
    setClockNow(Date.now());
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeWorkContext?.session.id, hasRunningOperationalSession]);

  const refreshActivityExecutionState = async (activityId: string) => {
    const context = await fetchActiveWorkSessionContext(currentUser.workspaceId, currentUser.id);
    setActiveWorkContext(context);
    await loadQuickViewData(activityId);
    loadProjectActivitiesConsolidated();
  };

  const handleStartOrResumeActivity = async (activity: ProjectActivity, pauseCurrent = false) => {
    const parentProject = allProjects.find(p => p.id === activity.projectId);
    const isHistorical = parentProject ? !isCurrentProjectRevision(parentProject) : false;
    if (isHistorical) {
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
          `${currentUser.username} trocou da atividade ${activeWorkContext.activity.name} (${activeWorkContext.project.code}) para ${activity.name} (${parentProject?.code || 'projeto'})`,
          parentProject?.code
        );
      }

      if (transition.transitionAction !== 'ALREADY_RUNNING') {
        await logAction(
          currentUser.workspaceId,
          currentUser,
          LogModule.PROJECTS,
          LogAction.STATUS_CHANGE,
          `${currentUser.username} ${actionLabel} a atividade ${activity.name} no projeto ${parentProject?.code || ''}`,
          parentProject?.code
        );
      }

      setPendingActivity(null);
      await refreshActivityExecutionState(activity.id);
    } catch (err: any) {
      console.error('Erro técnico ao iniciar ou retomar atividade:', err);
      const technicalMessage = `${err?.message || ''} ${err?.details || ''}`;
      if (technicalMessage.includes('ACTIVE_SESSION_EXISTS')) {
        const context = await fetchActiveWorkSessionContext(currentUser.workspaceId, currentUser.id);
        setActiveWorkContext(context);
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
    const parentProject = allProjects.find(p => p.id === activity.projectId);
    const isHistorical = parentProject ? !isCurrentProjectRevision(parentProject) : false;
    if (isHistorical) return;
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
        `${currentUser.username} pausou a atividade ${activity.name} no projeto ${parentProject?.code || ''}`,
        parentProject?.code
      );
      await refreshActivityExecutionState(activity.id);
    } catch (err) {
      console.error('Erro técnico ao pausar atividade:', err);
      alert('Não foi possível pausar esta atividade.');
    } finally {
      setActivityActionId(null);
    }
  };

  const handleCompleteActivity = async (activity: ProjectActivity, execution?: ActivityExecution) => {
    const parentProject = allProjects.find(p => p.id === activity.projectId);
    const isHistorical = parentProject ? !isCurrentProjectRevision(parentProject) : false;
    if (isHistorical) return;
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
        `${currentUser.username} concluiu a atividade ${activity.name} no projeto ${parentProject?.code || ''}`,
        parentProject?.code
      );
      await refreshActivityExecutionState(activity.id);
    } catch (err) {
      console.error('Erro técnico ao concluir atividade:', err);
      alert('Não foi possível concluir esta atividade.');
    } finally {
      setActivityActionId(null);
    }
  };

  const formatSessionStartedAt = (startedAt: number) => {
    if (!startedAt || !Number.isFinite(startedAt) || startedAt <= 0) return 'Horário indisponível';
    return new Date(startedAt).toLocaleString('pt-BR');
  };

  const [taskTitle, setTaskTitle] = useState('');
  const [taskType, setTaskType] = useState<TaskType>(TaskType.REUNIAO);
  const [taskAssigneeId, setTaskAssigneeId] = useState('');
  const [taskStartDate, setTaskStartDate] = useState('');
  const [taskEndDate, setTaskEndDate] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskStartTime, setTaskStartTime] = useState('');
  const [taskEndTime, setTaskEndTime] = useState('');
  const [taskReminder, setTaskReminder] = useState('none');
  const [taskInvitedUsers, setTaskInvitedUsers] = useState<string[]>([]);

  const [expandedProjects, setExpandedProjects] = useState<string[]>([]);

  const toggleExpand = (projectId: string) => {
    setExpandedProjects(current =>
      current.includes(projectId)
        ? current.filter(id => id !== projectId)
        : [...current, projectId]
    );
  };

  const openEdit = (project: Project) => {
    setEditingProject(project);
    setName(project.name);
    setClientId(project.clientId);
    setAssigneeId(project.assigneeId || '');
    setStatus(project.status);
    setRevision(project.revision);
    setStartDate(project.startDate || '');
    setDeliveryDate(project.deliveryDate || '');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    if (!isCurrentProjectRevision(editingProject)) {
      alert('Revisões inativas são somente para consulta.');
      return;
    }

    if (!isValidDateRange(startDate, deliveryDate)) {
      alert("O período do projeto deve possuir início e prazo final válidos.");
      return;
    }

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

    const projectData: Project = {
      ...editingProject,
      workspaceId: currentUser.workspaceId,
      name,
      clientId,
      assigneeId,
      status, // Ensure status is included
      revision,
      startDate,
      deliveryDate,
      dueDate: deliveryDate
    };

    try {
      await syncProject(projectData);
      const newProjects = db.projects.map((p: Project) => p.id === editingProject.id ? projectData : p);
      setDb({ ...db, projects: newProjects });
      setEditingProject(null);
    } catch (err: any) {
      const technicalMessage = `${err?.message || ''} ${err?.details || ''}`;
      if (technicalMessage.includes('PROJECT_DATE_RANGE_EXCLUDES_ACTIVITIES')) {
        alert("Existem atividades fora do novo prazo do projeto. Ajuste manualmente as atividades ou escolha outro prazo para o projeto.");
      } else {
        alert("Erro ao salvar no Supabase: " + (err.message || "Erro desconhecido"));
      }
    }
  };

  const openEditTeamTask = (task: any) => {
    const originalTask = db.tasks.find(t => t.id === task.id);
    if (originalTask) {
      setEditingTeamTask(originalTask);
      setTaskTitle(originalTask.title);
      setTaskType(originalTask.type);
      setTaskAssigneeId(originalTask.assigneeId);
      setTaskStartDate(originalTask.startDate);
      setTaskEndDate(originalTask.endDate);
      setTaskDescription(originalTask.description || '');
      setTaskStartTime(originalTask.startTime || '');
      setTaskEndTime(originalTask.endTime || '');
      setTaskReminder(originalTask.reminder || 'none');
      setTaskInvitedUsers(originalTask.invitedUsers || []);
    }
  };

  const handleSaveTeamTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeamTask) return;
    
    if (new Date(taskEndDate) < new Date(taskStartDate)) {
      alert("A data final não pode ser menor que a data inicial.");
      return;
    }

    if (taskReminder !== 'none' && !taskStartTime) {
      alert("Por favor, defina a hora de início para configurar um lembrete.");
      return;
    }

    if (taskStartDate === taskEndDate && taskStartTime && taskEndTime && taskStartTime > taskEndTime) {
      alert("A hora de início não pode ser maior que a hora de fim no mesmo dia.");
      return;
    }

    const isTimingOrReminderChanged = editingTeamTask ? (
      editingTeamTask.startTime !== taskStartTime ||
      editingTeamTask.endTime !== taskEndTime ||
      editingTeamTask.reminder !== taskReminder ||
      editingTeamTask.startDate !== taskStartDate
    ) : false;

    const filteredInvitedUsers = taskInvitedUsers.filter(id => id !== taskAssigneeId);

    const taskData: TeamTask = {
      ...editingTeamTask,
      title: taskTitle,
      type: taskType,
      assigneeId: taskAssigneeId,
      startDate: taskStartDate,
      endDate: taskEndDate,
      description: taskDescription,
      startTime: taskStartTime || undefined,
      endTime: taskEndTime || undefined,
      reminder: taskReminder || 'none',
      reminderDismissed: editingTeamTask ? (isTimingOrReminderChanged ? false : editingTeamTask.reminderDismissed) : false,
      snoozeUntil: editingTeamTask ? (isTimingOrReminderChanged ? undefined : editingTeamTask.snoozeUntil) : undefined,
      invitedUsers: filteredInvitedUsers,
      reminderState: editingTeamTask ? (isTimingOrReminderChanged ? {} : editingTeamTask.reminderState || {}) : {}
    };

    try {
      await syncTeamTask(taskData);
      setDb({ ...db, tasks: db.tasks.map(t => t.id === taskData.id ? taskData : t) });
      setEditingTeamTask(null);
    } catch (err: any) {
      alert("Erro ao salvar: " + (err.message || "Erro desconhecido"));
    }
  };

  const handleDeleteTeamTask = async () => {
    if (!editingTeamTask) return;
    if (window.confirm("Deseja realmente excluir esta tarefa? Qualquer usuário pode realizar esta ação.")) {
      try {
        await deleteTeamTask(editingTeamTask.id);
        setDb({ ...db, tasks: db.tasks.filter(t => t.id !== editingTeamTask.id) });
        setEditingTeamTask(null);
      } catch (err: any) {
        alert("Erro ao excluir: " + (err.message || "Erro desconhecido"));
      }
    }
  };

  // Filtragem operacional (Projetos em andamento ou ativos)
  const activeProjects = useMemo(() => {
    return allProjects.filter((p: Project) =>
      isCurrentProjectRevision(p) &&
      [ProjectStatus.QUEUE, ProjectStatus.IN_PROGRESS, ProjectStatus.PAUSED].includes(p.status) &&
      p.startDate && p.deliveryDate // Apenas com datas definidas
    );
  }, [allProjects]);

  // Janela Temporal Dinâmica
  const { timelineDates, minDate } = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    if (activeProjects.length === 0) {
      const start = new Date(today); start.setDate(today.getDate() - 5);
      const end = new Date(today); end.setDate(today.getDate() + 5);
      const timeline: Date[] = [];
      let cur = new Date(start);
      while (cur <= end) { timeline.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
      return { timelineDates: timeline, minDate: start };
    }
    const dates = activeProjects.map(p => ({
      start: p.startDate ? new Date(p.startDate + 'T12:00:00') : today,
      end: p.deliveryDate ? new Date(p.deliveryDate + 'T12:00:00') : today
    }));
    let min = new Date(Math.min(...dates.map(d => d.start.getTime()), today.getTime()));
    let max = new Date(Math.max(...dates.map(d => d.end.getTime()), today.getTime()));
    min.setDate(min.getDate() - 5);
    max.setDate(max.getDate() + 5);
    const timeline: Date[] = [];
    let current = new Date(min);
    while (current <= max) { timeline.push(new Date(current)); current.setDate(current.getDate() + 1); }
    return { timelineDates: timeline, minDate: min };
  }, [activeProjects]);

  const getStatusColor = (status: ProjectStatus | string) => {
    switch (status) {
      case ProjectStatus.IN_PROGRESS: return 'bg-indigo-600';
      case ProjectStatus.PAUSED: return 'bg-purple-500';
      case ProjectStatus.QUEUE: return 'bg-slate-500';
      case ProjectStatus.DONE: return 'bg-emerald-500';
      case ProjectStatus.CANCELED: return 'bg-orange-500';
      case 'ACTIVITY': return 'bg-amber-500';
      default: return 'bg-slate-700';
    }
  };

  const getProjectMarkerColor = (projectId?: string) => {
    if (!projectId) return 'bg-slate-400';
    const colors = [
      'bg-pink-400', 'bg-cyan-400', 'bg-yellow-400', 'bg-rose-400',
      'bg-violet-400', 'bg-orange-400', 'bg-emerald-400', 'bg-teal-400',
      'bg-indigo-400', 'bg-fuchsia-400', 'bg-lime-400'
    ];
    let hash = 0;
    for (let i = 0; i < projectId.length; i++) {
      hash = projectId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const dayWidth = 64;
  const todayStr = new Date().toDateString();

  if (viewMode === 'selector') {
    return (
      <div className="space-y-8 animate-in fade-in duration-500 pb-12 relative">
        {/* BACKGROUND GLOWING ORBS DISCRETOS */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-indigo-600/5 dark:bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-emerald-600/5 dark:bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse delay-1000" />

        {/* CABEÇALHO PADRÃO DO SAAS */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight transition-colors uppercase">
              Central de Cronogramas
            </h1>
            <p className="text-slate-550 dark:text-slate-400 text-sm font-medium transition-colors">
              Painel integrado para monitoramento de projetos e capacidade da equipe
            </p>
          </div>
        </div>

        {/* CARDS PRINCIPAIS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full max-w-7xl relative z-10">
          {/* CARD: FLUXO GERAL */}
          <div
            onClick={() => setViewMode('flow')}
            className="group cursor-pointer relative transition-all duration-300 transform hover:scale-[1.01] flex flex-col justify-between min-h-[320px] bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-[40px] p-8 shadow-sm dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)] hover:border-indigo-500/40 dark:hover:border-indigo-400/40 hover:shadow-md transition-all duration-550"
          >
            {/* Aura de fundo suave */}
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all duration-1000" />

            <div>
              {/* Header Card */}
              <div className="flex items-center space-x-4 mb-6">
                <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-all duration-500">
                  <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                </div>
                <div>
                  <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] block">Planejamento Cronológico</span>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-wider mt-0.5">
                    Fluxo <span className="text-indigo-600 dark:text-indigo-400">Geral</span>
                  </h3>
                </div>
              </div>

              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium leading-relaxed mb-8">
                Monitore prazos, entregas e marcos críticos em uma linha do tempo operacional unificada. Acesse o cronograma completo de projetos ativos do sistema.
              </p>
            </div>

            {/* Ações */}
            <div className="px-6 py-3.5 rounded-2xl border border-indigo-500/20 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-extrabold text-xs uppercase tracking-widest bg-indigo-500/5 group-hover:bg-indigo-650 dark:group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 flex items-center justify-center space-x-2">
              <span>Acessar Cronograma</span>
              <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </div>
          </div>

          {/* CARD: TIME & CARGA */}
          <div
            onClick={() => setViewMode('assignments')}
            className="group cursor-pointer relative transition-all duration-300 transform hover:scale-[1.01] flex flex-col justify-between min-h-[320px] bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-[40px] p-8 shadow-sm dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)] hover:border-emerald-500/40 dark:hover:border-emerald-400/40 hover:shadow-md transition-all duration-300"
          >
            {/* Aura de fundo suave */}
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all duration-1000" />

            <div>
              {/* Header Card */}
              <div className="flex items-center space-x-4 mb-6">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-all duration-500">
                  <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                  </svg>
                </div>
                <div>
                  <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em] block">Capacidade da Equipe</span>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-wider mt-0.5">
                    Time <span className="text-emerald-600 dark:text-emerald-400">& Carga</span>
                  </h3>
                </div>
              </div>

              <p className="text-slate-555 dark:text-slate-400 text-sm font-medium leading-relaxed mb-8">
                Gerencie a alocação de atividades, identifique sobreposições de prazos e otimize a capacidade produtiva de cada profissional da equipe.
              </p>
            </div>

            {/* Ações */}
            <div className="px-6 py-3.5 rounded-2xl border border-emerald-500/20 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs uppercase tracking-widest bg-emerald-500/5 group-hover:bg-emerald-655 dark:group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300 flex items-center justify-center space-x-2">
              <span>Acessar Atribuições</span>
              <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <button
            onClick={() => setViewMode('selector')}
            className="group mb-2 flex items-center text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <svg className="w-4 h-4 mr-1 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
            Voltar para Seleção
          </button>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight transition-colors">
            {viewMode === 'flow' ? 'Cronograma de Fluxo' : 'Cronograma de Atribuições'}
          </h1>
          <p className="text-slate-500 dark:text-slate-500 text-sm font-medium transition-colors">
            {viewMode === 'flow' ? 'Controle temporal de projetos operacionais' : 'Gestão de carga e disponibilidade da equipe'}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-[#1e293b] rounded-[40px] shadow-sm dark:shadow-2xl border border-slate-200 dark:border-slate-700 p-3 overflow-hidden relative transition-colors duration-500">
        <div className="overflow-auto max-h-[calc(100vh-240px)] rounded-[24px] scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700/50 scrollbar-track-transparent">
          <div style={{ minWidth: `${320 + timelineDates.length * dayWidth}px` }} className="flex flex-col pb-64">
            {/* HEADER FIXO (TOP E LEFT) */}
            <div className="flex sticky top-0 z-50 bg-white dark:bg-[#1e293b] transition-colors">
              {/* Canto superior esquerdo fixo */}
              <div className="w-80 border-r border-b border-slate-100 dark:border-slate-700/80 px-6 h-16 flex items-center shrink-0 sticky left-0 z-[60] bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur-md transition-colors">
                <span className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-400">
                  {viewMode === 'flow' ? 'Projetos Ativos' : 'Equipe / Atribuições'}
                </span>
              </div>

              {/* Cabeçalho de Datas fixo no Topo */}
              <div className="flex border-b border-slate-100 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/50 flex-1 h-16 relative transition-colors">
                {/* Hoje Highlight no Header */}
                <div className="absolute inset-0 flex pointer-events-none z-10">
                  {timelineDates.map((date, i) => {
                    const isToday = date.toDateString() === todayStr;
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    return (
                      <div key={i} style={{ width: `${dayWidth}px` }} className={`h-full shrink-0 ${isToday ? 'bg-orange-500/10 border-x border-orange-500/40' : isWeekend ? 'bg-indigo-50/30 dark:bg-indigo-500/[0.05]' : ''}`}></div>
                    );
                  })}
                </div>
                <div className="flex items-stretch relative z-20">
                  {timelineDates.map((date, idx) => {
                    const isToday = date.toDateString() === todayStr;
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    return (
                      <div key={idx} style={{ width: `${dayWidth}px` }} className={`shrink-0 flex flex-col items-center justify-center border-r border-slate-100 dark:border-slate-700/80 ${isToday ? 'bg-orange-500/20' : isWeekend ? 'bg-indigo-50/50 dark:bg-indigo-500/10' : ''} transition-colors`}>
                        <span className={`text-[10px] font-black ${isToday ? 'text-orange-600 dark:text-orange-400 scale-110' : isWeekend ? 'text-slate-400 dark:text-slate-400' : 'text-slate-600 dark:text-slate-200'}`}>
                          {date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </span>
                        <span className={`text-[8px] font-black uppercase tracking-tighter mt-1 ${isToday ? 'text-orange-600 dark:text-orange-500' : isWeekend ? 'text-slate-400 dark:text-slate-500' : 'text-slate-400 dark:text-slate-500'}`}>
                          {date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* CONTEÚDO */}
            <div className="flex flex-col divide-y divide-slate-700/80 relative">
              {viewMode === 'flow' ? (
                activeProjects.map((project: Project) => {
                  const client = allClients.find((c: Client) => c.id === project.clientId);
                  const isExpanded = expandedProjects.includes(project.id);
                  const hasActivities = projectActivities.some(pa => pa.projectId === project.id);

                  const start = project.startDate ? new Date(project.startDate + 'T12:00:00') : null;
                  const end = project.deliveryDate ? new Date(project.deliveryDate + 'T12:00:00') : null;
                  let offset = 0; let width = 0;
                  if (start && end) {
                    const diffStart = Math.floor((start.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
                    const diffDuration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    offset = diffStart * dayWidth; width = diffDuration * dayWidth;
                  }

                  return (
                    <React.Fragment key={project.id}>
                      {/* LINHA DO PROJETO PAI */}
                      <div className="flex group/row hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors relative hover:z-[60]">
                        {/* Sidebar Projeto: FIXO NA ESQUERDA */}
                        <div className="w-80 px-6 h-20 flex items-center border-r border-slate-100 dark:border-slate-700/80 shrink-0 sticky left-0 z-40 bg-white/95 dark:bg-[#1e293b]/95 backdrop-blur-sm group hover:bg-slate-50 dark:hover:bg-slate-800 transition-all border-l-4 border-transparent">
                          {hasActivities ? (
                            <button
                              onClick={() => toggleExpand(project.id)}
                              className={`w-6 h-6 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 mr-3 transition-colors ${isExpanded ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-white hover:border-indigo-200 dark:hover:border-slate-500'}`}
                            >
                              {isExpanded ? (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M18 12H6" /></svg>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 6v12m6-6H6" /></svg>
                              )}
                            </button>
                          ) : (
                            <div className="w-9" />
                          )}

                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(project)}>
                            <span className="text-[9px] font-mono font-black text-indigo-500/40 dark:text-indigo-400/40 uppercase tracking-tighter mb-0.5 block">{project.code}</span>
                            <h4 className="text-xs font-black text-slate-900 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 leading-tight whitespace-normal transition-colors">{project.name}</h4>
                            <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold truncate mt-1 italic transition-colors">{client?.name || 'Cliente s/ Ref.'}</p>
                          </div>
                        </div>

                        {/* Timeline Row */}
                        <div className="flex-1 h-20 relative bg-slate-50/10 dark:bg-slate-900/10 overflow-visible transition-colors">
                          <div className="absolute inset-0 flex pointer-events-none z-10">
                            {timelineDates.map((date, i) => {
                              const isToday = date.toDateString() === todayStr;
                              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                              return (
                                <div key={i} style={{ width: `${dayWidth}px` }} className={`h-full border-r border-slate-100 dark:border-slate-700/80 shrink-0 ${isToday ? 'bg-orange-500/10 border-x border-orange-500/30' : isWeekend ? 'bg-indigo-50/20 dark:bg-indigo-500/[0.02]' : ''}`}></div>
                              );
                            })}
                          </div>

                          {width > 0 && (
                            <HoverTooltipPortal
                              tooltipClassName="w-[240px] p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)] ring-1 ring-slate-200 dark:ring-white/10"
                              tooltip={
                                <>
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">{project.code}</p>
                                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${getStatusColor(project.status)} text-white`}>{project.status}</span>
                                </div>
                                <p className="text-xs font-bold text-slate-900 dark:text-white mb-3 leading-tight whitespace-normal">{project.name}</p>
                                <div className="grid grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-800 pt-3">
                                  <div><p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase mb-1">Início</p><p className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{start?.toLocaleDateString('pt-BR')}</p></div>
                                  <div><p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase mb-1">Entrega</p><p className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{end?.toLocaleDateString('pt-BR')}</p></div>
                                </div>
                                </>
                              }
                            >
                              <div
                                style={{ left: `${offset}px`, width: `${width}px` }}
                                className={`absolute top-1/2 -translate-y-1/2 h-7 rounded-full shadow-lg border-b-2 transition-all duration-300 hover:brightness-110 dark:hover:brightness-125 z-20 cursor-pointer ${getStatusColor(project.status)} border-white/5 flex items-center px-3`}
                                onClick={() => openEdit(project)}
                              >
                                <div className={`w-2 h-2 rounded-full mr-2 shrink-0 shadow-sm ${getProjectMarkerColor(project.id)}`} />
                                <span className="text-[9px] font-black text-white/90 truncate uppercase tracking-tighter">
                                  {project.name}
                                </span>
                              </div>
                            </HoverTooltipPortal>
                          )}
                        </div>
                      </div>

                      {/* RENDERIZAÇÃO DAS NOVAS ATIVIDADES DO PROJETO SE EXPANDIDO */}
                      {isExpanded && projectActivities
                        .filter(pa => pa.projectId === project.id)
                        .map((pa) => {
                          const st = {
                            ...pa,
                            type: 'projectActivity',
                            parentProject: project
                          };
                          const stStart = st.startDate ? new Date(st.startDate + 'T12:00:00') : null;
                          const stEnd = st.deliveryDate ? new Date(st.deliveryDate + 'T12:00:00') : null;
                          let stOffset = 0; let stWidth = 0;
                          if (stStart && stEnd) {
                            const diffStart = Math.floor((stStart.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
                            const diffDuration = Math.ceil((stEnd.getTime() - stStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                            stOffset = diffStart * dayWidth; stWidth = diffDuration * dayWidth;
                          }

                          return (
                            <div key={st.id} className="flex group/sub hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors relative hover:z-[55] bg-slate-100/30 dark:bg-slate-900/20">
                              {/* Sidebar da atividade do projeto */}
                              <div className="w-80 pl-16 pr-6 h-12 flex flex-col justify-center border-r border-slate-100 dark:border-slate-700/80 shrink-0 sticky left-0 z-40 bg-white/95 dark:bg-[#1e293b]/95 backdrop-blur-sm border-l-4 border-indigo-500/10 transition-colors">
                                <h5 className="text-[11px] font-bold text-slate-600 dark:text-slate-400 truncate leading-tight transition-colors">{st.name}</h5>
                                <p className="text-[8px] text-slate-400 dark:text-slate-600 font-black uppercase tracking-widest mt-0.5 transition-colors">
                                  {allUsers.find(u => u.id === st.assigneeId)?.username.split(' ')[0] || 'S/ RESP.'}
                                </p>
                              </div>

                              {/* Timeline da atividade do projeto */}
                              <div className="flex-1 h-12 relative bg-slate-50/5 dark:bg-slate-900/5 overflow-visible transition-colors">
                                <div className="absolute inset-0 flex pointer-events-none z-10">
                                  {timelineDates.map((date, i) => {
                                    const isToday = date.toDateString() === todayStr;
                                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                                    return (
                                      <div key={i} style={{ width: `${dayWidth}px` }} className={`h-full border-r border-slate-100 dark:border-slate-700/40 shrink-0 ${isToday ? 'bg-orange-500/5 transition-colors' : isWeekend ? 'bg-indigo-50/10 dark:bg-indigo-500/[0.01]' : ''}`}></div>
                                    );
                                  })}
                                </div>

                                {stWidth > 0 && (
                                  <HoverTooltipPortal
                                    tooltipClassName="w-[180px] p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl ring-1 ring-white/5"
                                    tooltip={
                                      <>
                                      <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex flex-col">
                                          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">ATIVIDADE DO PROJETO</p>
                                          <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mt-0.5">{project.code}</p>
                                        </div>
                                        <span className={`px-1.5 py-0.5 rounded-[4px] text-[7px] font-black uppercase tracking-widest ${getStatusColor(st.status)} text-white`}>{st.status}</span>
                                      </div>
                                      <p className="text-[10px] font-bold text-white mb-2 leading-tight">{st.name}</p>
                                      <div className="flex justify-between items-center text-[9px] font-medium text-slate-400">
                                        <span>{stStart?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                                        <svg className="w-2 h-2 mx-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                        <span>{stEnd?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                                      </div>
                                      </>
                                    }
                                  >
                                    <div
                                      style={{ left: `${stOffset}px`, width: `${stWidth}px` }}
                                      className={`absolute top-1/2 -translate-y-1/2 h-4 rounded-full shadow-sm transition-all duration-300 hover:brightness-125 z-20 ${getStatusColor(st.status)} opacity-80 hover:opacity-100 flex items-center px-2`}
                                    >
                                      <div className={`w-1.5 h-1.5 rounded-full mr-1.5 shrink-0 ${getProjectMarkerColor(project.id)}`} />
                                      <span className="text-[7px] font-black text-white/90 truncate uppercase tracking-tighter">
                                        {st.name}
                                      </span>
                                    </div>
                                  </HoverTooltipPortal>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </React.Fragment>
                  );
                })
              ) : (
                // --- VISÃO DE ATRIBUIÇÕES (TEAM LOAD) ---
                allUsers.map((user) => {
                  const userProjectActivities = projectActivities
                    .filter(pa => 
                      pa.assigneeId === user.id && 
                      pa.startDate && 
                      pa.deliveryDate && 
                      !isProjectActivityClosed(pa.status)
                    )
                    .map(pa => {
                      const parent = allProjects.find(p => p.id === pa.projectId);
                      if (!parent) return null;
                      // Garantir que o projeto pai está ativo
                      if (!isCurrentProjectRevision(parent) || ![ProjectStatus.QUEUE, ProjectStatus.IN_PROGRESS, ProjectStatus.PAUSED].includes(parent.status)) return null;
                      return {
                        ...pa,
                        type: 'projectActivity' as const,
                        parentProject: parent
                      };
                    })
                    .filter((item): item is NonNullable<typeof item> => item !== null);

                  const userTeamTasks = (db.tasks || [])
                    .filter(t => 
                      (t.assigneeId === user.id || (t.invitedUsers && t.invitedUsers.includes(user.id))) &&
                      t.startDate &&
                      t.endDate
                    )
                    .map(t => ({
                      ...t,
                      type: 'teamTask',
                      activityType: t.type,
                      deliveryDate: t.endDate,
                      name: t.title,
                      status: 'ACTIVITY'
                    }));

                  const allAssignments = [...userProjectActivities, ...userTeamTasks];
                  const distinctProjectsCount = new Set(userProjectActivities.map(activity => activity.parentProject?.id).filter(Boolean)).size;
                  const teamTasksCount = userTeamTasks.length;

                  if (allAssignments.length === 0) return null;

                  // --- CÁLCULO DE RAIAS E CONFLITOS (INNER LOGIC) ---
                  const tasksWithLanes: any[] = [];
                  const assignedLanes: { end: Date }[][] = [];
                  const sortedAssignments = [...allAssignments].sort((a: any, b: any) =>
                    new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
                  );

                  sortedAssignments.forEach((task: any) => {
                    const start = new Date(task.startDate + 'T12:00:00');
                    const end = new Date(task.deliveryDate + 'T12:00:00');
                    let laneIndex = 0;
                    while (true) {
                      if (!assignedLanes[laneIndex]) {
                        assignedLanes[laneIndex] = [{ end }];
                        break;
                      }
                      const hasOverlap = assignedLanes[laneIndex].some(occ => start <= occ.end);
                      if (!hasOverlap) {
                        assignedLanes[laneIndex].push({ end });
                        break;
                      }
                      laneIndex++;
                    }
                    tasksWithLanes.push({ ...task, laneIndex });
                  });

                  // Detectar conflitos por dia (2 ou mais atividades operacionais no mesmo dia)
                  const conflictMap = new Map();
                  timelineDates.forEach(date => {
                    let activeActivitiesCount = 0;

                    allAssignments.forEach((t: any) => {
                      if (t.type === 'teamTask') return;
                      if (isProjectActivityClosed(t.status)) return;

                      const s = new Date(t.startDate + 'T12:00:00');
                      const e = new Date(t.deliveryDate + 'T12:00:00');
                      if (date >= s && date <= e) {
                        activeActivitiesCount++;
                      }
                    });

                    if (activeActivitiesCount > 1) {
                      conflictMap.set(date.toDateString(), true);
                    }
                  });

                  const totalLanes = assignedLanes.length || 1;
                  const rowHeight = Math.max(112, totalLanes * 42 + 40); // Increased lane height to 42px for better spacing

                  return (
                    <div className="flex group/user relative hover:bg-slate-800/20 transition-all duration-300 hover:z-[60]" key={user.id}>
                      {/* Sidebar Usuário */}
                      <div
                        className="w-80 px-6 flex items-center border-r border-slate-100 dark:border-slate-700/80 shrink-0 sticky left-0 z-40 bg-white/95 dark:bg-[#1e293b]/95 backdrop-blur-sm group hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer border-l-4 border-transparent hover:border-emerald-500/40"
                        onClick={() => setViewingUserCarga({ user, assignments: allAssignments, distinctCount: distinctProjectsCount })}
                        style={{ height: `${rowHeight}px` }}
                      >
                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-500 font-black text-sm uppercase overflow-hidden mr-4 group-hover:border-emerald-500/50 transition-colors">
                          {user.username.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-black text-slate-900 dark:text-slate-100 truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors uppercase tracking-tight">{user.username}</h4>
                          <div className="flex flex-col mt-1 space-y-0.5">
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{distinctProjectsCount} Tarefa(s) ativa(s)</p>
                            <p className="text-[9px] text-emerald-500/60 font-black uppercase tracking-widest flex items-center">
                              <span className="w-1 h-1 rounded-full bg-emerald-500 mr-1.5" />
                              {distinctProjectsCount} {distinctProjectsCount === 1 ? 'Projeto' : 'Projetos'}
                            </p>
                            {teamTasksCount > 0 && (
                              <p className="text-[9px] text-indigo-500/60 font-black uppercase tracking-widest flex items-center">
                                <span className="w-1 h-1 rounded-full bg-indigo-500 mr-1.5" />
                                {teamTasksCount} {teamTasksCount === 1 ? 'Tarefa avulsa' : 'Tarefas avulsas'}
                              </p>
                            )}
                          </div>
                          {conflictMap.size > 0 && (
                            <span className="inline-block mt-2 px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-500 text-[8px] font-black rounded-full uppercase tracking-tighter animate-pulse">
                              Conflito de Prazos
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Timeline Usuário */}
                      <div style={{ height: `${rowHeight}px` }} className="flex-1 relative bg-slate-50/10 dark:bg-slate-900/10 overflow-visible transition-colors">
                        {/* Background Grid & Conflict Highlight */}
                        <div className="absolute inset-0 flex pointer-events-none z-10">
                          {timelineDates.map((date, i) => {
                            const isConflict = conflictMap.has(date.toDateString());
                            const isToday = date.toDateString() === todayStr;
                            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                            return (
                              <div key={i} style={{ width: `${dayWidth}px` }} className={`h-full border-r border-slate-100 dark:border-slate-700/80 shrink-0 transition-colors duration-500 ${isConflict ? 'bg-red-500/10' : ''} ${isToday ? 'bg-orange-500/10 shadow-[inset_0_0_20px_rgba(249,115,22,0.1)]' : isWeekend && !isConflict ? 'bg-indigo-50/30 dark:bg-indigo-500/[0.03]' : ''}`}>
                              </div>
                            );
                          })}
                        </div>

                        {tasksWithLanes.map((task: any) => {
                          const start = task.startDate ? new Date(task.startDate + 'T12:00:00') : null;
                          const end = task.deliveryDate ? new Date(task.deliveryDate + 'T12:00:00') : null;
                          if (!start || !end) return null;
                          const diffStart = Math.floor((start.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
                          const diffDuration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                          const offset = diffStart * dayWidth;
                          const width = diffDuration * dayWidth;
                          const isProjectActivity = task.type === 'projectActivity';
                          const barHeight = isProjectActivity ? 'h-5' : 'h-8';
                          const topPos = 16 + (task.laneIndex * 42) + (isProjectActivity ? 6 : 0);
                          return (
                            <HoverTooltipPortal
                              key={task.id}
                              tooltipClassName="w-[220px] p-4 bg-slate-900 border border-slate-700 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] ring-1 ring-white/10"
                              tooltip={
                                <>
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex flex-col">
                                      <p className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.2em]">
                                        {task.type === 'project' ? 'PROJETO PAI' : task.type === 'projectActivity' ? 'ATIVIDADE DO PROJETO' : 'TAREFA / BLOQUEIO'}
                                      </p>
                                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-0.5">
                                        {task.type === 'project' ? (task as any).code : task.type === 'projectActivity' ? (task as any).parentProject?.code : (task as any).activityType || task.type}
                                      </p>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${getStatusColor(task.status)} text-white`}>{task.status === 'ACTIVITY' ? 'AVULSA' : task.status}</span>
                                  </div>
                                  <p className="text-xs font-bold text-white mb-1 leading-tight whitespace-normal">{task.name}</p>
                                  {task.type === 'projectActivity' && <p className="text-[9px] text-slate-500 font-black uppercase mb-3 truncate">Ref: {task.parentProject?.name}</p>}
                                  {task.type === 'teamTask' && (
                                    <div className="text-[10px] text-slate-400 font-medium mb-3 whitespace-normal break-words space-y-1">
                                      {task.description && <p className="text-xs text-slate-300 mb-2 italic">"{task.description}"</p>}
                                      <p><strong className="text-slate-500 uppercase text-[8px] tracking-wider">Responsável:</strong> {allUsers.find(u => u.id === task.assigneeId)?.username || 'Desconhecido'}</p>
                                      {task.invitedUsers && task.invitedUsers.length > 0 && (
                                        <p><strong className="text-slate-500 uppercase text-[8px] tracking-wider">Convidados:</strong> {allUsers.filter(u => task.invitedUsers?.includes(u.id)).map(u => u.username).join(', ')}</p>
                                      )}
                                    </div>
                                  )}
                                  <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-3">
                                    <div>
                                      <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Início</p>
                                      <p className="text-[10px] font-bold text-slate-300">{start?.toLocaleDateString('pt-BR')}</p>
                                      {task.type === 'teamTask' && task.startTime && <p className="text-[10px] font-bold text-indigo-400 mt-0.5">{task.startTime}</p>}
                                    </div>
                                    <div>
                                      <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Entrega</p>
                                      <p className="text-[10px] font-bold text-slate-300">{end?.toLocaleDateString('pt-BR')}</p>
                                      {task.type === 'teamTask' && task.endTime && <p className="text-[10px] font-bold text-indigo-400 mt-0.5">{task.endTime}</p>}
                                    </div>
                                  </div>
                                </>
                              }
                            >
                            <div
                              style={{ left: `${offset}px`, width: `${width}px`, top: `${topPos}px` }}
                              className={`absolute ${barHeight} rounded-full shadow-lg border-b-2 transition-all duration-300 hover:brightness-125 z-20 hover:z-50 cursor-pointer ${getStatusColor(task.status)} border-white/5 opacity-80 hover:opacity-100 flex items-center px-3 group/task active:scale-95`}
                              onClick={() => {
                                if (task.type === 'project') openEdit(task);
                                else if (task.type === 'projectActivity' && task.parentProject) setSelectedQuickViewActivity(task);
                                else if (task.type === 'teamTask') openEditTeamTask(task);
                              }}
                            >
                               <div className={`w-2 h-2 rounded-full mr-2 shrink-0 shadow-sm ${getProjectMarkerColor(task.type === 'project' ? task.id : task.type === 'projectActivity' ? task.parentProject?.id : task.id)}`} />
                              <span className="text-[8px] font-black text-white/90 truncate uppercase tracking-tighter flex items-center gap-1.5">
                                {task.type === 'teamTask' && (
                                  <span className="px-1 py-0.2 bg-white/20 text-white rounded-[4px] text-[7px] font-black uppercase tracking-wider shrink-0 border border-white/10">
                                    TAREFA
                                  </span>
                                )}
                                <span className="truncate">
                                  {task.type === 'projectActivity'
                                    ? `[ATIVIDADE] ${task.name}`
                                    : task.type === 'teamTask'
                                      ? (task.startTime ? `${task.startTime} - ${task.name}` : task.name)
                                      : task.name}
                                </span>
                              </span>

                            </div>
                            </HoverTooltipPortal>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal (Portal para cadastro via cronograma) */}
      {
        editingProject && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[200] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#1e293b] rounded-[32px] shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-700 p-8 animate-in zoom-in duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar transition-colors">
              <h3 className="text-slate-900 dark:text-white font-black uppercase mb-6 text-sm tracking-widest transition-colors">
                {currentUser.role === UserRole.VIEWER ? 'Consultar Detalhes' : 'Consultar / Alterar Cadastro'}
              </h3>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-1">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 block transition-colors">Código</label>
                    <div className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50 p-3 rounded-xl text-indigo-600 dark:text-indigo-400 font-mono font-bold text-xs transition-colors">
                      {editingProject.code}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 block transition-colors">Nome do Projeto</label>
                    <input type="text" required value={name} disabled={currentUser.role === UserRole.VIEWER} onChange={e => setName(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors disabled:opacity-60" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 block transition-colors">Início</label>
                    <input type="date" value={startDate} max={deliveryDate || undefined} disabled={currentUser.role === UserRole.VIEWER} onInvalid={(e) => e.currentTarget.setCustomValidity('O período do projeto deve possuir início e prazo final válidos.')} onInput={(e) => e.currentTarget.setCustomValidity('')} onChange={e => setStartDate(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none transition-colors disabled:opacity-60" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 block transition-colors">Entrega</label>
                    <input type="date" value={deliveryDate} min={startDate || undefined} disabled={currentUser.role === UserRole.VIEWER} onInvalid={(e) => e.currentTarget.setCustomValidity('O período do projeto deve possuir início e prazo final válidos.')} onInput={(e) => e.currentTarget.setCustomValidity('')} onChange={e => setDeliveryDate(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none transition-colors disabled:opacity-60" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 block transition-colors">Status</label>
                    <select value={status} disabled={currentUser.role === UserRole.VIEWER} onChange={(e: any) => setStatus(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none transition-colors disabled:opacity-60">
                      {Object.values(ProjectStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 block transition-colors">Revisão</label>
                    <input type="text" value={revision} disabled className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-500 dark:text-slate-400 outline-none transition-colors" />
                  </div>
                </div>

                <div className="flex space-x-3 pt-6 border-t border-slate-100 dark:border-slate-800 transition-colors">
                  <button type="button" onClick={() => setEditingProject(null)} className="flex-1 bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl font-black uppercase text-xs tracking-widest text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all">
                    {currentUser.role === UserRole.VIEWER ? 'Fechar' : 'Cancelar'}
                  </button>
                  {currentUser.role !== UserRole.VIEWER && (
                    <button type="submit" className="flex-1 bg-indigo-600 p-4 rounded-2xl font-black uppercase text-xs tracking-widest text-white shadow-xl shadow-indigo-500/20 active:scale-95 transition-all">Salvar Projeto</button>
                  )}
                </div>
              </form>
            </div>
          </div>
        )
      }

      {/* Modal de Tarefa Avulsa */}
      {editingTeamTask && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1e293b] rounded-[32px] shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-700 p-8 animate-in zoom-in duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar transition-colors">
            <h3 className="text-slate-900 dark:text-white font-black uppercase mb-6 text-sm tracking-widest transition-colors">
              Detalhes da Tarefa / Bloqueio
            </h3>
            <form onSubmit={handleSaveTeamTask} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Título da Tarefa *</label>
                <input type="text" required value={taskTitle} onChange={e => setTaskTitle(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Tipo *</label>
                  <select required value={taskType} onChange={e => setTaskType(e.target.value as TaskType)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors">
                    {Object.values(TaskType).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Responsável *</label>
                  <select required value={taskAssigneeId} onChange={e => setTaskAssigneeId(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors">
                    {allUsers.filter(u => u.isActive).map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Participantes Convidados</label>
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl max-h-36 overflow-y-auto custom-scrollbar space-y-2">
                  {allUsers.filter(u => u.isActive && u.id !== taskAssigneeId).map(u => {
                    const isChecked = taskInvitedUsers.includes(u.id);
                    return (
                      <label key={u.id} className="flex items-center space-x-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setTaskInvitedUsers(taskInvitedUsers.filter(id => id !== u.id));
                            } else {
                              setTaskInvitedUsers([...taskInvitedUsers, u.id]);
                            }
                          }}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{u.username}</span>
                      </label>
                    );
                  })}
                  {allUsers.filter(u => u.isActive && u.id !== taskAssigneeId).length === 0 && (
                    <span className="text-xs text-slate-400 dark:text-slate-500">Nenhum outro usuário disponível</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Data Início *</label>
                  <input type="date" required value={taskStartDate} onChange={e => setTaskStartDate(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Data Fim *</label>
                  <input type="date" required value={taskEndDate} onChange={e => setTaskEndDate(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Hora Início</label>
                  <input
                    type="time"
                    value={taskStartTime}
                    onChange={e => setTaskStartTime(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Hora Fim</label>
                  <input
                    type="time"
                    value={taskEndTime}
                    onChange={e => setTaskEndTime(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Lembrete</label>
                  <select
                    value={taskReminder}
                    onChange={e => setTaskReminder(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  >
                    <option value="none">Sem lembrete</option>
                    <option value="on_time">No horário da tarefa</option>
                    <option value="5m">5 minutos antes</option>
                    <option value="10m">10 minutos antes</option>
                    <option value="15m">15 minutos antes</option>
                    <option value="30m">30 minutos antes</option>
                    <option value="1h">1 hora antes</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Descrição / Observação</label>
                <textarea value={taskDescription} onChange={e => setTaskDescription(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors resize-none h-24" />
              </div>
              <div className="flex space-x-3 pt-6 border-t border-slate-100 dark:border-slate-800 transition-colors">
                <button type="button" onClick={handleDeleteTeamTask} className="flex-1 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 p-4 rounded-2xl font-black uppercase text-xs tracking-widest transition-all">Excluir</button>
                <button type="button" onClick={() => setEditingTeamTask(null)} className="flex-1 bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl font-black uppercase text-xs tracking-widest text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all">Cancelar</button>
                <button type="submit" className="flex-1 bg-indigo-600 p-4 rounded-2xl font-black uppercase text-xs tracking-widest text-white shadow-xl shadow-indigo-500/20 active:scale-95 transition-all">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE RESUMO DE CARGA */}
      {viewingUserCarga && (
        <UserCargaModal
          data={viewingUserCarga}
          onClose={() => setViewingUserCarga(null)}
          getStatusColor={getStatusColor}
          getProjectMarkerColor={getProjectMarkerColor}
        />
      )}

      {/* ActivityQuickViewModal */}
      {selectedQuickViewActivity && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[140] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0f172a] rounded-[28px] shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-white/5 transition-colors">
            {/* Header */}
            <div className="px-7 py-5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
                  Atividade do Projeto
                </p>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                  {selectedQuickViewActivity.parentProject.code} — {selectedQuickViewActivity.parentProject.name}
                  <span className="ml-2 text-xs font-medium text-slate-400">({selectedQuickViewActivity.parentProject.revision})</span>
                </h4>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedQuickViewActivity(null)} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-7 space-y-6">
              {/* Banner Revisão Inativa */}
              {selectedQuickViewActivity && !isCurrentProjectRevision(selectedQuickViewActivity.parentProject) && (
                <div className="bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider text-center border border-slate-250 dark:border-slate-700/50">
                  ⚠️ Revisão Inativa (Somente Consulta)
                </div>
              )}

              {/* Atividade Info */}
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  {selectedQuickViewActivity.name}
                </h3>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${getStatusColor(selectedQuickViewActivity.status)} text-white`}>
                    {selectedQuickViewActivity.status}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Categoria: {activeActivityTypes.find(t => t.id === selectedQuickViewActivity.activityTypeId)?.category || 'Geral'}
                  </span>
                </div>
              </div>

              {/* Bloco de Planejamento */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-white/5 p-5 rounded-2xl text-xs transition-colors">
                <div>
                  <p className="text-[9px] font-black text-slate-450 dark:text-slate-500 uppercase tracking-widest mb-1">Responsável</p>
                  <p className="font-bold text-slate-800 dark:text-slate-250">
                    {db.users.find(u => u.id === selectedQuickViewActivity.assigneeId)?.username || 'Não atribuído'}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-450 dark:text-slate-500 uppercase tracking-widest mb-1">Estimado</p>
                  <p className="font-bold text-slate-800 dark:text-slate-250">
                    {selectedQuickViewActivity.estimatedDurationHours !== undefined && selectedQuickViewActivity.estimatedDurationHours > 0 
                      ? `${selectedQuickViewActivity.estimatedDurationHours}h` 
                      : 'Sem estimativa'}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-450 dark:text-slate-500 uppercase tracking-widest mb-1">Período Planejado</p>
                  <p className="font-bold text-slate-800 dark:text-slate-250">
                    {formatDate(selectedQuickViewActivity.startDate)} até {formatDate(selectedQuickViewActivity.deliveryDate)}
                  </p>
                </div>
              </div>

              {/* Bloco Operacional */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-white/5 p-4 rounded-2xl text-center">
                    <p className="text-[8px] font-black text-slate-455 dark:text-slate-500 uppercase tracking-widest mb-1">Tempo Contabilizado</p>
                    <p className="text-xs font-mono font-bold text-slate-900 dark:text-white mt-1">
                      {formatElapsedTime(getAccountedOperationalMs(selectedQuickViewActivity.id))}
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-white/5 p-4 rounded-2xl text-center">
                    <p className="text-[8px] font-black text-slate-455 dark:text-slate-500 uppercase tracking-widest mb-1">Horas Extras</p>
                    <p className="text-xs font-mono font-bold text-slate-900 dark:text-white mt-1">
                      {formatElapsedTime(getActivityOvertimeMs(selectedQuickViewActivity.id))}
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-white/5 p-4 rounded-2xl text-center">
                    <p className="text-[8px] font-black text-slate-455 dark:text-slate-500 uppercase tracking-widest mb-1">Saldo Estimado</p>
                    <p className={`text-xs font-mono font-bold mt-1 ${
                      selectedQuickViewActivity.estimatedDurationHours !== undefined && selectedQuickViewActivity.estimatedDurationHours > 0
                        ? (selectedQuickViewActivity.estimatedDurationHours - getAccountedOperationalMs(selectedQuickViewActivity.id) / (1000 * 60 * 60) < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-600 dark:text-emerald-400')
                        : 'text-slate-400 dark:text-slate-500'
                    }`}>
                      {selectedQuickViewActivity.estimatedDurationHours !== undefined && selectedQuickViewActivity.estimatedDurationHours > 0
                        ? formatDecimalHours(selectedQuickViewActivity.estimatedDurationHours - getAccountedOperationalMs(selectedQuickViewActivity.id) / (1000 * 60 * 60))
                        : 'Sem estimativa'}
                    </p>
                  </div>
                </div>

                {/* Sessão Ativa */}
                {activeWorkContext && activeWorkContext.activity.id === selectedQuickViewActivity.id && (
                  <div className="flex items-center justify-between px-5 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                      <span className="font-bold uppercase tracking-wider text-[10px]">Atividade em Execução</span>
                    </div>
                    <span className="font-medium text-[10px]">
                      Desde: {formatSessionStartedAt(activeWorkContext.session.startedAt)}
                    </span>
                  </div>
                )}

                {/* Bloco de Pausas */}
                {(selectedQuickViewActivity.status === ProjectStatus.IN_PROGRESS ||
                  selectedQuickViewActivity.status === ProjectStatus.PAUSED ||
                  selectedQuickViewActivity.status === ProjectStatus.DONE ||
                  getActivitySessions(selectedQuickViewActivity.id).length > 0) && (
                  (() => {
                    const isPaused = selectedQuickViewActivity.status === ProjectStatus.PAUSED ||
                      getOpenExecution(selectedQuickViewActivity.id)?.status === ActivityExecutionStatus.PAUSED;
                    const pauseMetrics = calculatePauseMetrics(
                      getActivitySessions(selectedQuickViewActivity.id),
                      db.company,
                      clockNow,
                      isPaused
                    );
                    return (
                      <div className="flex flex-wrap gap-2 text-[10px] items-center mt-4">
                        <div className="flex-1 min-w-[200px] px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-white/5 text-slate-600 dark:border-slate-400 inline-flex flex-wrap items-center gap-x-4 gap-y-1.5 font-medium transition-colors">
                          <span className="font-black uppercase tracking-widest text-[8px] border-b sm:border-b-0 sm:border-r border-slate-300 dark:border-slate-700 pb-1 sm:pb-0 sm:pr-4">Pausas</span>
                          <span>Quantidade: <strong className="text-slate-800 dark:text-slate-200">{pauseMetrics.count}</strong></span>
                          <span>Tempo em pausa: <strong className="text-slate-800 dark:text-slate-200">{formatPauseDuration(pauseMetrics.totalMs)}</strong></span>
                          <span>Média: <strong className="text-slate-800 dark:text-slate-200">{formatPauseAverage(pauseMetrics.averageMs)}</strong></span>
                        </div>
                        {isPaused && pauseMetrics.currentPauseMs > 0 && (
                          <div className="px-4 py-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 font-bold uppercase tracking-wider inline-flex items-center gap-2">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-purple-500" />
                            </span>
                            <span>Pausa Atual: </span>
                            <span className="font-mono text-[11px] font-bold">{formatPauseDuration(pauseMetrics.currentPauseMs)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-7 py-5 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-white/5 flex flex-wrap items-center gap-3">
              {/* Botoes Operacionais */}
              {isCurrentProjectRevision(selectedQuickViewActivity.parentProject) && selectedQuickViewActivity.status !== ProjectStatus.DONE && selectedQuickViewActivity.status !== ProjectStatus.CANCELED && (
                <div className="flex gap-2">
                  {activeWorkContext && activeWorkContext.activity.id === selectedQuickViewActivity.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handlePauseActivity(selectedQuickViewActivity, getOpenExecution(selectedQuickViewActivity.id))}
                        disabled={activityActionId === selectedQuickViewActivity.id}
                        className="px-4 py-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-xl border border-amber-500/20 hover:bg-amber-500 hover:text-white transition disabled:opacity-50"
                      >
                        Pausar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCompleteActivity(selectedQuickViewActivity, getOpenExecution(selectedQuickViewActivity.id))}
                        disabled={activityActionId === selectedQuickViewActivity.id}
                        className="px-4 py-2.5 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-600/15 transition disabled:opacity-50"
                      >
                        Concluir
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStartOrResumeActivity(selectedQuickViewActivity)}
                        disabled={activityActionId === selectedQuickViewActivity.id}
                        className="px-4 py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-600/15 transition disabled:opacity-50"
                      >
                        {selectedQuickViewActivity.status === ProjectStatus.PAUSED ? 'Retomar' : 'Iniciar'}
                      </button>
                      {(selectedQuickViewActivity.status === ProjectStatus.IN_PROGRESS || selectedQuickViewActivity.status === ProjectStatus.PAUSED) && (
                        <button
                          type="button"
                          onClick={() => handleCompleteActivity(selectedQuickViewActivity, getOpenExecution(selectedQuickViewActivity.id))}
                          disabled={activityActionId === selectedQuickViewActivity.id}
                          className="px-4 py-2.5 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-600/15 transition disabled:opacity-50"
                        >
                          Concluir
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="flex-1" />

              {isCurrentProjectRevision(selectedQuickViewActivity.parentProject) && (
                <button
                  type="button"
                  onClick={() => {
                    onEditActivity?.(selectedQuickViewActivity.parentProject, selectedQuickViewActivity);
                    setSelectedQuickViewActivity(null);
                  }}
                  className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                  Editar Atividade
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onOpenProject?.(selectedQuickViewActivity.parentProject);
                  setSelectedQuickViewActivity(null);
                }}
                className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                Abrir Projeto
              </button>

              <button
                type="button"
                onClick={() => setSelectedQuickViewActivity(null)}
                className="px-3.5 py-2.5 bg-slate-200 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-300 dark:hover:bg-slate-600 transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Conflict Modal */}
      {pendingActivity && activeWorkContext && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0f172a] rounded-[28px] shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-white/5 transition-colors">
            <div className="px-7 py-6 border-b border-slate-100 dark:border-white/5">
              <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-sm">
                Você já possui uma atividade em execução.
              </h3>
            </div>
            <div className="p-7 space-y-5">
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800 p-5 space-y-3">
                <div>
                  <p className="text-[9px] font-black text-slate-450 uppercase tracking-widest">Projeto</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{activeWorkContext.project.code} — {activeWorkContext.project.name}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-455 uppercase tracking-widest">Atividade</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{activeWorkContext.activity.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[9px] font-black text-slate-455 uppercase tracking-widest">Início</p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-1">{formatSessionStartedAt(activeWorkContext.session.startedAt)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-455 uppercase tracking-widest">Tempo contabilizado</p>
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
    </div >
  );
};

// --- MODAL DE RESUMO DE CARGA ---
const UserCargaModal: React.FC<{
  data: { user: InternalUser, assignments: any[], distinctCount: number },
  onClose: () => void,
  getStatusColor: (s: ProjectStatus) => string,
  getProjectMarkerColor: (id?: string) => string
}> = ({ data, onClose, getStatusColor, getProjectMarkerColor }) => {
  // Agrupar tarefas por projeto pai
  const groupedTasks = data.assignments.reduce((acc: any, task: any) => {
    const parentId = task.type === 'project' ? task.id : task.type === 'projectActivity' ? (task.parentProject?.id || 'unknown') : 'activities';
    if (!acc[parentId]) {
      acc[parentId] = {
        project: task.type === 'project' ? task : task.type === 'projectActivity' ? (task.parentProject || { id: 'unknown', name: 'Projeto não encontrado', code: 'PROJETO', status: 'UNKNOWN' }) : { id: 'activities', name: 'Tarefas / Bloqueios Avulsos', code: 'ATIVIDADES', status: 'ACTIVITY' },
        tasks: []
      };
    }
    acc[parentId].tasks.push(task);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in duration-300 transition-colors">
        {/* Header Modal */}
        <div className="px-8 py-8 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-emerald-500/5 to-transparent transition-colors">
          <div className="flex items-center space-x-5">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-black text-2xl uppercase shadow-inner">
              {data.user.username.charAt(0)}
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter transition-colors">{data.user.username}</h2>
              <div className="flex items-center space-x-3 mt-1">
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">{data.assignments.length} Tarefa(s) Totais</p>
                <span className="w-1 h-1 rounded-full bg-slate-700" />
                <p className="text-[10px] text-emerald-600 dark:text-emerald-500 font-black uppercase tracking-[0.2em] transition-colors">{data.distinctCount} Projetos</p>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition-all">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-8 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          <div className="space-y-8">
            {Object.values(groupedTasks).map((group: any) => (
              <div key={group.project.id} className="bg-slate-50 dark:bg-slate-800/20 border border-slate-100 dark:border-white/5 rounded-3xl p-6 hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-colors group">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100 dark:border-white/5">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full shadow-sm ${getProjectMarkerColor(group.project.id)}`} />
                    <div>
                      <h4 className="text-sm font-black text-slate-900 dark:text-white group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors uppercase">{group.project.name}</h4>
                      <p className="text-[10px] text-indigo-600/60 dark:text-indigo-400/60 font-mono font-bold mt-0.5 transition-colors">{group.project.code}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${getStatusColor(group.project.status)} text-white`}>
                    {group.project.status}
                  </span>
                </div>

                <div className="space-y-3">
                  {group.tasks.map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between pl-6 relative">
                      <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 transition-colors" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate transition-colors">{t.name}</p>
                        <p className="text-[9px] text-slate-400 dark:text-slate-500 font-medium uppercase mt-0.5 tracking-tighter transition-colors">
                          {t.startDate ? new Date(t.startDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'S/ data'} → {t.deliveryDate ? new Date(t.deliveryDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'S/ data'}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-lg text-[7px] font-black uppercase tracking-widest ${getStatusColor(t.status)} text-white/90`}>
                        {t.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-slate-100/50 dark:bg-slate-950/40 border-t border-slate-100 dark:border-white/5 text-center transition-colors">
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-[0.2em] transition-colors">Painel de Controle de Carga Operacional</p>
        </div>
      </div>
    </div>
  );
};
