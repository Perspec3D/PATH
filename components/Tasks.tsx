import React, { useState, useEffect, useMemo } from 'react';
import {
  InternalUser,
  UserRole,
  TeamTask,
  TaskType,
  LogModule,
  LogAction,
  ProjectActivity,
  Project,
  ActivityType,
  ActivityCanonicalStatus,
  ActivityDeadlineStatus
} from '../types';
import {
  AppDB,
  syncTeamTask,
  deleteTeamTask,
  logAction,
  fetchProjectActivities,
  fetchActivityTypes,
  syncProjectActivity,
  logProjectActivityEvent
} from '../storage';
import { generateDiffLogs, formatDateForLog } from '../utils/logDiff';
import {
  normalizeActivityStatus,
  evaluateDeadlineStatus,
  calculateCalendarDurationDays,
  calculateDaysDifference,
  createActivityEventPayload,
  getTodayDateString,
  getActivityStatusTheme,
  formatDisplayDate
} from '../utils/activityOperationalModel';
import { isCurrentProjectRevision } from '../utils/projectRevision';
import {
  Kanban,
  ListTodo,
  Search,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Ban,
  MoreVertical,
  Plus,
  Filter,
  User,
  RotateCcw,
  X,
  ArrowRight,
  Eye
} from 'lucide-react';
import { ActivityDetailsModal } from './ActivityDetailsModal';

interface TasksProps {
  db: AppDB;
  setDb: (db: AppDB) => void;
  currentUser: InternalUser;
  theme: 'dark' | 'light';
  onOpenProject?: (project: Project) => void;
}

export const Tasks: React.FC<TasksProps> = ({ db, setDb, currentUser, theme, onOpenProject }) => {
  // Navigation tab: Kanban (Atividades de Projeto) vs Tarefas Avulsas (Team Tasks)
  const [activeTab, setActiveTab] = useState<'kanban' | 'team_tasks'>('kanban');

  // ==========================================================================
  // KANBAN: STATE & LOGIC
  // ==========================================================================
  const [projectActivities, setProjectActivities] = useState<ProjectActivity[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);

  // Kanban filters
  const [kanbanSearchText, setKanbanSearchText] = useState('');
  const [kanbanSelectedProject, setKanbanSelectedProject] = useState('all');
  const [kanbanSelectedAssignee, setKanbanSelectedAssignee] = useState('all');
  const [kanbanSelectedDeadline, setKanbanSelectedDeadline] = useState<'all' | 'overdue' | 'upcoming'>('all');

  // Drag & drop state
  const [draggedActivityId, setDraggedActivityId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ActivityCanonicalStatus | null>(null);
  const [menuOpenActivityId, setMenuOpenActivityId] = useState<string | null>(null);

  // Transition Dialogs
  const [blockingActivity, setBlockingActivity] = useState<ProjectActivity | null>(null);
  const [blockingReasonInput, setBlockingReasonInput] = useState('');

  const [completingActivity, setCompletingActivity] = useState<ProjectActivity | null>(null);
  const [completionDateInput, setCompletionDateInput] = useState('');

  const [reopeningActivity, setReopeningActivity] = useState<ProjectActivity | null>(null);
  const [reopeningReasonInput, setReopeningReasonInput] = useState('');
  const [reopenTargetStatus, setReopenTargetStatus] = useState<ActivityCanonicalStatus>(ActivityCanonicalStatus.IN_PROGRESS);

  const [isTransitioning, setIsTransitioning] = useState(false);

  // Details Modal state
  const [detailsModalActivity, setDetailsModalActivity] = useState<ProjectActivity | null>(null);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);

  // Load project activities for workspace
  const loadActivities = async () => {
    if (!currentUser?.workspaceId) return;
    setIsLoadingActivities(true);
    setActivitiesError(null);
    try {
      const data = await fetchProjectActivities(currentUser.workspaceId);
      setProjectActivities(data);
    } catch (err: any) {
      console.error('Erro ao carregar atividades no Kanban:', err);
      setActivitiesError('Não foi possível carregar as atividades.');
    } finally {
      setIsLoadingActivities(false);
    }
  };

  useEffect(() => {
    loadActivities();
    if (currentUser?.workspaceId) {
      fetchActivityTypes(currentUser.workspaceId)
        .then(types => setActivityTypes(types))
        .catch(err => console.warn('Erro ao carregar tipos de atividade:', err));
    }
  }, [currentUser?.workspaceId]);

  // Current revisions map for projects
  const activeProjects = useMemo(() => {
    return db.projects.filter(isCurrentProjectRevision);
  }, [db.projects]);

  const activeProjectIds = useMemo(() => {
    return new Set(activeProjects.map(p => p.id));
  }, [activeProjects]);

  const projectMap = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    for (const p of db.projects) {
      map.set(p.id, { code: p.code, name: p.name });
    }
    return map;
  }, [db.projects]);

  const todayStr = useMemo(() => getTodayDateString(), []);

  // Filtered Kanban activities (strictly active revisions)
  const filteredKanbanActivities = useMemo(() => {
    return projectActivities.filter(act => {
      // 1. Revision isolation: must belong to active/current revision
      if (!activeProjectIds.has(act.projectId)) {
        return false;
      }

      // 2. Project filter
      if (kanbanSelectedProject !== 'all' && act.projectId !== kanbanSelectedProject) {
        return false;
      }

      // 3. Assignee filter
      if (kanbanSelectedAssignee !== 'all' && act.assigneeId !== kanbanSelectedAssignee) {
        return false;
      }

      // 4. Text search
      if (kanbanSearchText.trim()) {
        const text = kanbanSearchText.toLowerCase();
        const proj = projectMap.get(act.projectId);
        const assignee = db.users.find(u => u.id === act.assigneeId);
        const matchName = act.name.toLowerCase().includes(text);
        const matchProject = proj ? (proj.code.toLowerCase().includes(text) || proj.name.toLowerCase().includes(text)) : false;
        const matchAssignee = assignee ? assignee.username.toLowerCase().includes(text) : false;
        if (!matchName && !matchProject && !matchAssignee) {
          return false;
        }
      }

      // 5. Deadline status filter
      if (kanbanSelectedDeadline !== 'all') {
        const deadline = evaluateDeadlineStatus(act, todayStr);
        if (kanbanSelectedDeadline === 'overdue' && deadline.status !== ActivityDeadlineStatus.OVERDUE) {
          return false;
        }
        if (kanbanSelectedDeadline === 'upcoming' && deadline.status !== ActivityDeadlineStatus.UPCOMING) {
          return false;
        }
      }

      return true;
    });
  }, [
    projectActivities,
    activeProjectIds,
    kanbanSelectedProject,
    kanbanSelectedAssignee,
    kanbanSearchText,
    kanbanSelectedDeadline,
    projectMap,
    db.users,
    todayStr
  ]);

  // Group activities into 4 canonical columns
  const kanbanColumns = useMemo(() => {
    const cols: Record<ActivityCanonicalStatus, ProjectActivity[]> = {
      [ActivityCanonicalStatus.TO_DO]: [],
      [ActivityCanonicalStatus.IN_PROGRESS]: [],
      [ActivityCanonicalStatus.BLOCKED]: [],
      [ActivityCanonicalStatus.COMPLETED]: []
    };

    for (const act of filteredKanbanActivities) {
      const canonical = normalizeActivityStatus(act.status);
      cols[canonical].push(act);
    }

    return cols;
  }, [filteredKanbanActivities]);

  // Request status transition (either drag & drop or menu action)
  const handleRequestTransition = (
    activity: ProjectActivity,
    targetStatus: ActivityCanonicalStatus
  ) => {
    if (currentUser.role === UserRole.VIEWER) {
      alert('Usuários com perfil de visualização não têm permissão para alterar status.');
      return;
    }

    const currentCanonical = normalizeActivityStatus(activity.status);
    if (currentCanonical === targetStatus) return;

    setMenuOpenActivityId(null);

    // If target is BLOCKED: requires reason dialog
    if (targetStatus === ActivityCanonicalStatus.BLOCKED) {
      setBlockingActivity(activity);
      setBlockingReasonInput(activity.blockedReason || '');
      return;
    }

    // If target is COMPLETED: requires completion date dialog
    if (targetStatus === ActivityCanonicalStatus.COMPLETED) {
      setCompletingActivity(activity);
      setCompletionDateInput(activity.actualEndDate || todayStr);
      return;
    }

    // If moving from COMPLETED to open status (Reabertura)
    if (currentCanonical === ActivityCanonicalStatus.COMPLETED) {
      setReopeningActivity(activity);
      setReopenTargetStatus(targetStatus);
      setReopeningReasonInput('');
      return;
    }

    // Direct transition to IN_PROGRESS or TO_DO
    executeDirectTransition(activity, targetStatus);
  };

  // Direct status transition execution
  const executeDirectTransition = async (
    activity: ProjectActivity,
    targetStatus: ActivityCanonicalStatus
  ) => {
    if (isTransitioning) return;
    setIsTransitioning(true);

    try {
      const prevStatus = activity.status;
      const proj = projectMap.get(activity.projectId);
      let updatedActivity: ProjectActivity = {
        ...activity,
        status: targetStatus,
        updatedAt: Date.now()
      };

      if (targetStatus === ActivityCanonicalStatus.IN_PROGRESS) {
        // If starting for first time, record actualStartDate
        const actualStart = activity.actualStartDate || todayStr;
        updatedActivity = {
          ...updatedActivity,
          actualStartDate: actualStart,
          blockedReason: undefined
        };

        await syncProjectActivity(updatedActivity);

        const isResuming = normalizeActivityStatus(prevStatus) === ActivityCanonicalStatus.BLOCKED;
        await logProjectActivityEvent(
          createActivityEventPayload(
            currentUser.workspaceId,
            activity.id,
            isResuming ? 'RESUMED' : 'STARTED',
            currentUser,
            {
              fromStatus: prevStatus,
              toStatus: ActivityCanonicalStatus.IN_PROGRESS,
              details: isResuming
                ? `${currentUser.username} retomou a atividade.${activity.blockedReason ? ` (Bloqueio anterior: ${activity.blockedReason})` : ''}`
                : `${currentUser.username} iniciou a atividade em ${formatDisplayDate(actualStart)}`,
              metadata: { actualStartDate: actualStart, previousBlockedReason: activity.blockedReason }
            }
          )
        );

        await logAction(
          currentUser.workspaceId,
          currentUser,
          LogModule.PROJECTS,
          LogAction.STATUS_CHANGE,
          `${currentUser.username} alterou status da atividade "${activity.name}" para EM ANDAMENTO no projeto ${proj?.code || ''}`,
          proj?.code
        );
      } else if (targetStatus === ActivityCanonicalStatus.TO_DO) {
        updatedActivity = {
          ...updatedActivity,
          blockedReason: undefined
        };

        await syncProjectActivity(updatedActivity);

        await logProjectActivityEvent(
          createActivityEventPayload(
            currentUser.workspaceId,
            activity.id,
            'UPDATED',
            currentUser,
            {
              fromStatus: prevStatus,
              toStatus: ActivityCanonicalStatus.TO_DO,
              details: `${currentUser.username} moveu a atividade para A FAZER`,
              metadata: {}
            }
          )
        );

        await logAction(
          currentUser.workspaceId,
          currentUser,
          LogModule.PROJECTS,
          LogAction.STATUS_CHANGE,
          `${currentUser.username} alterou status da atividade "${activity.name}" para A FAZER no projeto ${proj?.code || ''}`,
          proj?.code
        );
      }

      setProjectActivities(prev => prev.map(a => a.id === activity.id ? updatedActivity : a));
    } catch (err: any) {
      console.error('Erro ao atualizar status:', err);
      alert('Erro ao atualizar status: ' + (err.message || 'Erro inesperado'));
    } finally {
      setIsTransitioning(false);
    }
  };

  // Confirm blocking transition
  const handleConfirmBlock = async () => {
    if (!blockingActivity) return;
    if (!blockingReasonInput.trim()) {
      alert('Por favor, informe o motivo do bloqueio.');
      return;
    }
    const activity = blockingActivity;
    const proj = projectMap.get(activity.projectId);
    setIsTransitioning(true);

    try {
      const prevStatus = activity.status;
      const reason = blockingReasonInput.trim();

      const updatedActivity: ProjectActivity = {
        ...activity,
        status: ActivityCanonicalStatus.BLOCKED,
        blockedReason: reason,
        updatedAt: Date.now()
      };

      await syncProjectActivity(updatedActivity);

      await logProjectActivityEvent(
        createActivityEventPayload(
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
        )
      );

      await logAction(
        currentUser.workspaceId,
        currentUser,
        LogModule.PROJECTS,
        LogAction.STATUS_CHANGE,
        `${currentUser.username} bloqueou a atividade "${activity.name}": ${reason}`,
        proj?.code
      );

      setProjectActivities(prev => prev.map(a => a.id === activity.id ? updatedActivity : a));
      setBlockingActivity(null);
      setBlockingReasonInput('');
    } catch (err: any) {
      console.error('Erro ao bloquear atividade:', err);
      alert('Erro ao bloquear atividade: ' + (err.message || 'Erro inesperado'));
    } finally {
      setIsTransitioning(false);
    }
  };

  // Confirm completion transition
  const handleConfirmComplete = async () => {
    if (!completingActivity) return;
    if (!completionDateInput) {
      alert('Informe a data real de conclusão.');
      return;
    }
    const activity = completingActivity;
    const proj = projectMap.get(activity.projectId);
    setIsTransitioning(true);

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

      await syncProjectActivity(updatedActivity);

      const leadDays = calculateCalendarDurationDays(actualStart, actualEnd);
      const deviation = calculateDaysDifference(actualEnd, activity.deliveryDate);
      const deviationLabel = deviation === 0 ? 'no prazo' : deviation !== null && deviation > 0 ? `${deviation}d de atraso` : `${Math.abs(deviation || 0)}d adiantada`;

      await logProjectActivityEvent(
        createActivityEventPayload(
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
        )
      );

      await logAction(
        currentUser.workspaceId,
        currentUser,
        LogModule.PROJECTS,
        LogAction.STATUS_CHANGE,
        `${currentUser.username} concluiu a atividade "${activity.name}" em ${formatDisplayDate(actualEnd)} no projeto ${proj?.code || ''}`,
        proj?.code
      );

      setProjectActivities(prev => prev.map(a => a.id === activity.id ? updatedActivity : a));
      setCompletingActivity(null);
      setCompletionDateInput('');
    } catch (err: any) {
      console.error('Erro ao concluir atividade:', err);
      alert('Erro ao concluir atividade: ' + (err.message || 'Erro inesperado'));
    } finally {
      setIsTransitioning(false);
    }
  };

  // Confirm reopen transition
  const handleConfirmReopen = async () => {
    if (!reopeningActivity) return;
    const activity = reopeningActivity;
    const proj = projectMap.get(activity.projectId);
    setIsTransitioning(true);

    try {
      const prevStatus = activity.status;
      const prevEndDate = activity.actualEndDate;
      const reason = reopeningReasonInput.trim();

      const updatedActivity: ProjectActivity = {
        ...activity,
        status: reopenTargetStatus,
        actualEndDate: undefined,
        updatedAt: Date.now()
      };

      await syncProjectActivity(updatedActivity);

      await logProjectActivityEvent(
        createActivityEventPayload(
          currentUser.workspaceId,
          activity.id,
          'REOPENED',
          currentUser,
          {
            fromStatus: prevStatus,
            toStatus: reopenTargetStatus,
            details: `Atividade reaberta por ${currentUser.username}.${reason ? ` Motivo: ${reason}` : ''} (Conclusão anterior: ${formatDisplayDate(prevEndDate)})`,
            metadata: { previousEndDate: prevEndDate, reopenReason: reason }
          }
        )
      );

      await logAction(
        currentUser.workspaceId,
        currentUser,
        LogModule.PROJECTS,
        LogAction.STATUS_CHANGE,
        `${currentUser.username} reabriu a atividade "${activity.name}" no projeto ${proj?.code || ''}`,
        proj?.code
      );

      setProjectActivities(prev => prev.map(a => a.id === activity.id ? updatedActivity : a));
      setReopeningActivity(null);
      setReopeningReasonInput('');
    } catch (err: any) {
      console.error('Erro ao reabrir atividade:', err);
      alert('Erro ao reabrir atividade: ' + (err.message || 'Erro inesperado'));
    } finally {
      setIsTransitioning(false);
    }
  };

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, activityId: string) => {
    e.dataTransfer.setData('text/plain', activityId);
    setDraggedActivityId(activityId);
  };

  const handleDragOver = (e: React.DragEvent, status: ActivityCanonicalStatus) => {
    e.preventDefault();
    if (dragOverColumn !== status) {
      setDragOverColumn(status);
    }
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: ActivityCanonicalStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const activityId = e.dataTransfer.getData('text/plain') || draggedActivityId;
    setDraggedActivityId(null);

    if (!activityId) return;
    const act = projectActivities.find(a => a.id === activityId);
    if (!act) return;

    handleRequestTransition(act, targetStatus);
  };

  // ==========================================================================
  // TEAM TASKS (AVULSAS): STATE & LOGIC
  // ==========================================================================
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TeamTask | null>(null);

  // Filter states
  const [filterText, setFilterText] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedAssignee, setSelectedAssignee] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');

  // Form states
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>(TaskType.REUNIAO);
  const [assigneeId, setAssigneeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reminder, setReminder] = useState('none');
  const [invitedUsers, setInvitedUsers] = useState<string[]>([]);

  const activeUsers = db.users.filter(u => u.isActive);

  const openNewTaskModal = () => {
    setEditingTask(null);
    setTitle('');
    setType(TaskType.REUNIAO);
    setAssigneeId('');
    setStartDate('');
    setEndDate('');
    setDescription('');
    setStartTime('');
    setEndTime('');
    setReminder('none');
    setInvitedUsers([]);
    setIsModalOpen(true);
  };

  const openEditTaskModal = (task: TeamTask) => {
    setEditingTask(task);
    setTitle(task.title);
    setType(task.type);
    setAssigneeId(task.assigneeId);
    setStartDate(task.startDate);
    setEndDate(task.endDate);
    setDescription(task.description || '');
    setStartTime(task.startTime || '');
    setEndTime(task.endTime || '');
    setReminder(task.reminder || 'none');
    setInvitedUsers(task.invitedUsers || []);
    setIsModalOpen(true);
  };

  const handleDelete = async (taskId: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta tarefa?')) {
      try {
        await deleteTeamTask(taskId);
        const taskToDelete = db.tasks.find(t => t.id === taskId);
        if (taskToDelete) {
          await logAction(currentUser.workspaceId, currentUser, LogModule.TASKS, LogAction.DELETE, `${currentUser.username} excluiu a tarefa "${taskToDelete.title}"`, taskToDelete.title);
        }
        setDb({ ...db, tasks: db.tasks.filter(t => t.id !== taskId) });
      } catch (err: any) {
        alert("Erro ao excluir: " + (err.message || "Erro desconhecido"));
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !assigneeId || !startDate || !endDate) {
      alert("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      alert("A data final não pode ser menor que a data inicial.");
      return;
    }

    if (reminder !== 'none' && !startTime) {
      alert("Por favor, defina a hora de início para configurar um lembrete.");
      return;
    }

    if (startDate === endDate && startTime && endTime && startTime > endTime) {
      alert("A hora de início não pode ser maior que a hora de fim no mesmo dia.");
      return;
    }

    const isTimingOrReminderChanged = editingTask ? (
      editingTask.startTime !== startTime ||
      editingTask.endTime !== endTime ||
      editingTask.reminder !== reminder ||
      editingTask.startDate !== startDate
    ) : false;

    const filteredInvitedUsers = invitedUsers.filter(id => id !== assigneeId);

    const taskData: TeamTask = {
      id: editingTask ? editingTask.id : crypto.randomUUID(),
      workspaceId: currentUser.workspaceId,
      title,
      type,
      assigneeId,
      startDate,
      endDate,
      description,
      createdAt: editingTask ? editingTask.createdAt : Date.now(),
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      reminder: reminder || 'none',
      reminderDismissed: editingTask ? (isTimingOrReminderChanged ? false : editingTask.reminderDismissed) : false,
      snoozeUntil: editingTask ? (isTimingOrReminderChanged ? undefined : editingTask.snoozeUntil) : undefined,
      invitedUsers: filteredInvitedUsers,
      reminderState: editingTask ? (isTimingOrReminderChanged ? {} : editingTask.reminderState || {}) : {}
    };

    try {
      await syncTeamTask(taskData);
      if (editingTask) {
        setDb({ ...db, tasks: db.tasks.map(t => t.id === editingTask.id ? taskData : t) });

        const diffLogs = generateDiffLogs(editingTask, taskData, {
          title: { label: 'Título' },
          type: { label: 'Tipo' },
          assigneeId: { label: 'Responsável', format: (id) => db.users.find(u => u.id === id)?.username || 'Sem Resp.' },
          invitedUsers: {
            label: 'Participantes',
            format: (ids) => {
              const arrayIds = Array.isArray(ids) ? ids : [];
              return arrayIds.map(id => db.users.find(u => u.id === id)?.username || '').filter(Boolean).join(', ') || 'Nenhum';
            }
          },
          startDate: { label: 'Data Início', format: formatDateForLog },
          endDate: { label: 'Data Fim', format: formatDateForLog },
          description: { label: 'Descrição' },
          startTime: { label: 'Hora Início' },
          endTime: { label: 'Hora Fim' },
          reminder: {
            label: 'Lembrete',
            format: (r) => {
              switch (r) {
                case 'none': return 'Sem lembrete';
                case 'on_time': return 'No horário';
                case '5m': return '5 min antes';
                case '10m': return '10 min antes';
                case '15m': return '15 min antes';
                case '30m': return '30 min antes';
                case '1h': return '1 hora antes';
                default: return 'Sem lembrete';
              }
            }
          }
        }, `a tarefa "${taskData.title}"`);

        if (diffLogs.length > 0) {
          for (const log of diffLogs) {
            await logAction(currentUser.workspaceId, currentUser, LogModule.TASKS, LogAction.UPDATE, `${currentUser.username} ${log}`, taskData.title);
          }
        } else {
          await logAction(currentUser.workspaceId, currentUser, LogModule.TASKS, LogAction.UPDATE, `${currentUser.username} atualizou a tarefa "${taskData.title}"`, taskData.title);
        }
      } else {
        setDb({ ...db, tasks: [...db.tasks, taskData] });
        await logAction(currentUser.workspaceId, currentUser, LogModule.TASKS, LogAction.CREATE, `${currentUser.username} criou a tarefa "${taskData.title}"`, taskData.title);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      alert("Erro ao salvar a tarefa: " + (err.message || "Erro desconhecido"));
    }
  };

  const getTaskTypeBadgeColor = (tType: TaskType) => {
    switch (tType) {
      case TaskType.REUNIAO: return 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border-blue-200 dark:border-blue-500/30';
      case TaskType.ESTUDO: return 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400 border-purple-200 dark:border-purple-500/30';
      case TaskType.FOLGA: return 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400 border-teal-200 dark:border-teal-500/30';
      case TaskType.FERIAS: return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30';
      case TaskType.TREINAMENTO: return 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 border-orange-200 dark:border-orange-500/30';
      case TaskType.VISITA_TECNICA: return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border-amber-200 dark:border-amber-500/30';
      case TaskType.OUTROS: return 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400 border-slate-200 dark:border-slate-500/30';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400 border-slate-200 dark:border-slate-500/30';
    }
  };

  const filteredAndSortedTeamTasks = [...db.tasks]
    .filter(task => {
      if (filterText.trim()) {
        const text = filterText.toLowerCase();
        const assignee = db.users.find(u => u.id === task.assigneeId);
        const matchTitle = task.title.toLowerCase().includes(text);
        const matchDesc = task.description?.toLowerCase().includes(text) || false;
        const matchAssignee = assignee?.username.toLowerCase().includes(text) || false;
        const matchInvited = task.invitedUsers?.some(id =>
          db.users.find(u => u.id === id)?.username.toLowerCase().includes(text)
        ) || false;

        if (!matchTitle && !matchDesc && !matchAssignee && !matchInvited) {
          return false;
        }
      }

      if (selectedType !== 'all' && task.type !== selectedType) {
        return false;
      }

      if (selectedAssignee !== 'all') {
        const isAssignee = task.assigneeId === selectedAssignee;
        const isInvited = task.invitedUsers?.includes(selectedAssignee) || false;
        if (!isAssignee && !isInvited) {
          return false;
        }
      }

      if (selectedPeriod === 'today') {
        return task.startDate <= todayStr && task.endDate >= todayStr;
      } else if (selectedPeriod === 'upcoming') {
        return task.endDate >= todayStr;
      } else if (selectedPeriod === 'past') {
        return task.endDate < todayStr;
      }

      return true;
    })
    .sort((a, b) => {
      if (a.startDate !== b.startDate) {
        return a.startDate.localeCompare(b.startDate);
      }
      const timeA = a.startTime || '00:00';
      const timeB = b.startTime || '00:00';
      if (timeA !== timeB) {
        return timeA.localeCompare(timeB);
      }
      return a.title.localeCompare(b.title);
    });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Cabeçalho Principal com Seletor de Modo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {activeTab === 'kanban' ? 'Quadro Kanban' : 'Tarefas da Equipe'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
            {activeTab === 'kanban'
              ? 'Gestão visual do fluxo de execução por status canônico (A FAZER, EM ANDAMENTO, BLOQUEADA, CONCLUÍDA)'
              : 'Gerencie atividades avulsas, bloqueios de agenda e compromissos internos'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Seletor de Visualização */}
          <div className="p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 flex items-center shadow-inner">
            <button
              onClick={() => setActiveTab('kanban')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center space-x-2 transition-all ${
                activeTab === 'kanban'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Kanban className="w-4 h-4" />
              <span>Kanban</span>
            </button>
            <button
              onClick={() => setActiveTab('team_tasks')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center space-x-2 transition-all ${
                activeTab === 'team_tasks'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <ListTodo className="w-4 h-4" />
              <span>Tarefas Avulsas</span>
            </button>
          </div>

          {activeTab === 'team_tasks' && currentUser.role !== UserRole.VIEWER && (
            <button
              onClick={openNewTaskModal}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 transition-all active:scale-95 flex items-center justify-center shrink-0"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Nova Tarefa
            </button>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* ABA 1: QUADRO KANBAN DE ATIVIDADES DE PROJETO                        */}
      {/* ==================================================================== */}
      {activeTab === 'kanban' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Painel de Filtros do Kanban */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* Busca por texto */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  value={kanbanSearchText}
                  onChange={e => setKanbanSearchText(e.target.value)}
                  placeholder="Buscar atividade, projeto ou responsável..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500"
                />
              </div>

              {/* Filtro por Projeto */}
              <div>
                <select
                  value={kanbanSelectedProject}
                  onChange={e => setKanbanSelectedProject(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500"
                >
                  <option value="all">Todos os Projetos</option>
                  {activeProjects.map(p => (
                    <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                  ))}
                </select>
              </div>

              {/* Filtro por Responsável */}
              <div>
                <select
                  value={kanbanSelectedAssignee}
                  onChange={e => setKanbanSelectedAssignee(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500"
                >
                  <option value="all">Qualquer Responsável</option>
                  {activeUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
                </select>
              </div>

              {/* Filtro por Prazo */}
              <div>
                <select
                  value={kanbanSelectedDeadline}
                  onChange={e => setKanbanSelectedDeadline(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500"
                >
                  <option value="all">Todos os Prazos</option>
                  <option value="overdue">Apenas Atrasadas</option>
                  <option value="upcoming">Vencimento Próximo</option>
                </select>
              </div>
            </div>

            {(kanbanSearchText || kanbanSelectedProject !== 'all' || kanbanSelectedAssignee !== 'all' || kanbanSelectedDeadline !== 'all') && (
              <button
                onClick={() => {
                  setKanbanSearchText('');
                  setKanbanSelectedProject('all');
                  setKanbanSelectedAssignee('all');
                  setKanbanSelectedDeadline('all');
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 transition-all shrink-0"
              >
                Limpar Filtros
              </button>
            )}
          </div>

          {/* 4 Colunas Canônicas do Kanban */}
          {isLoadingActivities ? (
            <div className="py-24 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
              Carregando fluxo de atividades...
            </div>
          ) : activitiesError ? (
            <div className="py-24 text-center text-xs font-bold text-rose-500">
              {activitiesError}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
              {/* Coluna 1: A FAZER */}
              <KanbanColumn
                title="A FAZER"
                canonical={ActivityCanonicalStatus.TO_DO}
                count={kanbanColumns[ActivityCanonicalStatus.TO_DO].length}
                activities={kanbanColumns[ActivityCanonicalStatus.TO_DO]}
                headerBg="bg-slate-100 dark:bg-slate-800"
                headerBorder="border-slate-300 dark:border-slate-700"
                headerText="text-slate-700 dark:text-slate-300"
                isDragOver={dragOverColumn === ActivityCanonicalStatus.TO_DO}
                projectMap={projectMap}
                users={db.users}
                todayStr={todayStr}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragStart={handleDragStart}
                onTransition={handleRequestTransition}
                onOpenDetails={setDetailsModalActivity}
                menuOpenId={menuOpenActivityId}
                setMenuOpenId={setMenuOpenActivityId}
              />

              {/* Coluna 2: EM ANDAMENTO (WIP) */}
              <KanbanColumn
                title="EM ANDAMENTO"
                canonical={ActivityCanonicalStatus.IN_PROGRESS}
                count={kanbanColumns[ActivityCanonicalStatus.IN_PROGRESS].length}
                activities={kanbanColumns[ActivityCanonicalStatus.IN_PROGRESS]}
                headerBg="bg-sky-50 dark:bg-sky-500/10"
                headerBorder="border-sky-300 dark:border-sky-500/40"
                headerText="text-sky-700 dark:text-sky-300"
                badgeText="WIP"
                isDragOver={dragOverColumn === ActivityCanonicalStatus.IN_PROGRESS}
                projectMap={projectMap}
                users={db.users}
                todayStr={todayStr}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragStart={handleDragStart}
                onTransition={handleRequestTransition}
                onOpenDetails={setDetailsModalActivity}
                menuOpenId={menuOpenActivityId}
                setMenuOpenId={setMenuOpenActivityId}
              />

              {/* Coluna 3: BLOQUEADA */}
              <KanbanColumn
                title="BLOQUEADA"
                canonical={ActivityCanonicalStatus.BLOCKED}
                count={kanbanColumns[ActivityCanonicalStatus.BLOCKED].length}
                activities={kanbanColumns[ActivityCanonicalStatus.BLOCKED]}
                headerBg="bg-[#78350F]/20 dark:bg-[#78350F]/40"
                headerBorder="border-[#FBBF24]"
                headerText="text-amber-800 dark:text-[#FDE68A]"
                badgeText="Impedimento"
                isDragOver={dragOverColumn === ActivityCanonicalStatus.BLOCKED}
                projectMap={projectMap}
                users={db.users}
                todayStr={todayStr}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragStart={handleDragStart}
                onTransition={handleRequestTransition}
                onOpenDetails={setDetailsModalActivity}
                menuOpenId={menuOpenActivityId}
                setMenuOpenId={setMenuOpenActivityId}
              />

              {/* Coluna 4: CONCLUÍDA */}
              <KanbanColumn
                title="CONCLUÍDA"
                canonical={ActivityCanonicalStatus.COMPLETED}
                count={kanbanColumns[ActivityCanonicalStatus.COMPLETED].length}
                activities={kanbanColumns[ActivityCanonicalStatus.COMPLETED]}
                headerBg="bg-emerald-50 dark:bg-emerald-500/10"
                headerBorder="border-emerald-300 dark:border-emerald-500/40"
                headerText="text-emerald-700 dark:text-emerald-300"
                isDragOver={dragOverColumn === ActivityCanonicalStatus.COMPLETED}
                projectMap={projectMap}
                users={db.users}
                todayStr={todayStr}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragStart={handleDragStart}
                onTransition={handleRequestTransition}
                onOpenDetails={setDetailsModalActivity}
                menuOpenId={menuOpenActivityId}
                setMenuOpenId={setMenuOpenActivityId}
              />
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* ABA 2: TAREFAS AVULSAS DA EQUIPE (COMPROMISSOS)                     */}
      {/* ==================================================================== */}
      {activeTab === 'team_tasks' && (
        <div className="bg-white dark:bg-[#1e293b] rounded-[32px] shadow-sm dark:shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors duration-500 animate-in fade-in duration-200">
          {/* Painel de Filtros */}
          <div className="p-6 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/10 flex flex-col xl:flex-row gap-4 items-stretch xl:items-center justify-between">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* Campo de Busca */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </span>
                <input
                  type="text"
                  value={filterText}
                  onChange={e => setFilterText(e.target.value)}
                  placeholder="Buscar tarefa..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                />
              </div>

              {/* Filtro por Tipo */}
              <div>
                <select
                  value={selectedType}
                  onChange={e => setSelectedType(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                >
                  <option value="all">Todos os Tipos</option>
                  {Object.values(TaskType).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Filtro por Responsável */}
              <div>
                <select
                  value={selectedAssignee}
                  onChange={e => setSelectedAssignee(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                >
                  <option value="all">Qualquer Responsável</option>
                  {activeUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
                </select>
              </div>

              {/* Filtro por Período */}
              <div>
                <select
                  value={selectedPeriod}
                  onChange={e => setSelectedPeriod(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                >
                  <option value="all">Qualquer Período</option>
                  <option value="today">Hoje</option>
                  <option value="upcoming">Ativos / Próximos</option>
                  <option value="past">Passados</option>
                </select>
              </div>
            </div>

            {(filterText || selectedType !== 'all' || selectedAssignee !== 'all' || selectedPeriod !== 'all') && (
              <button
                onClick={() => {
                  setFilterText('');
                  setSelectedType('all');
                  setSelectedAssignee('all');
                  setSelectedPeriod('all');
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 transition-all flex items-center justify-center space-x-1.5 shrink-0 shadow-sm active:scale-95"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                <span>Limpar Filtros</span>
              </button>
            )}
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 transition-colors">
                  <th className="p-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Título / Tipo</th>
                  <th className="p-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Responsável</th>
                  <th className="p-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Período</th>
                  <th className="p-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Horário</th>
                  <th className="p-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 transition-colors">
                {filteredAndSortedTeamTasks.map(task => {
                  const assignee = db.users.find(u => u.id === task.assigneeId);
                  return (
                    <tr key={task.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors group">
                      <td className="p-5">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900 dark:text-white mb-1 transition-colors">
                            {task.title}
                          </span>
                          {task.description && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5 line-clamp-1 max-w-[240px]" title={task.description}>
                              {task.description}
                            </span>
                          )}
                          <span className={`self-start px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${getTaskTypeBadgeColor(task.type)}`}>
                            {task.type}
                          </span>
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase transition-colors">
                            {assignee ? assignee.username.charAt(0) : '?'}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 transition-colors">{assignee ? assignee.username : 'Desconhecido'}</span>
                            {task.invitedUsers && task.invitedUsers.length > 0 && (
                              <div className="flex items-center -space-x-1.5 mt-1 overflow-hidden">
                                {task.invitedUsers.map(id => {
                                  const u = db.users.find(usr => usr.id === id);
                                  if (!u) return null;
                                  return (
                                    <div
                                      key={id}
                                      title={u.username}
                                      className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 border border-white dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-[8px] uppercase cursor-help shrink-0"
                                    >
                                      {u.username.charAt(0)}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="flex flex-col space-y-1">
                          <div className="flex items-center text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors">
                            <span className="w-10 text-[9px] font-black uppercase tracking-widest text-slate-400">De:</span>
                            {new Date(task.startDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </div>
                          <div className="flex items-center text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors">
                            <span className="w-10 text-[9px] font-black uppercase tracking-widest text-slate-400">Até:</span>
                            {new Date(task.endDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="flex flex-col text-xs font-semibold text-slate-600 dark:text-slate-300 transition-colors">
                          {task.startTime || task.endTime ? (
                            <div className="flex items-center space-x-1">
                              <svg className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              <span>{task.startTime || '--:--'}</span>
                              <span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal">às</span>
                              <span>{task.endTime || '--:--'}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 font-medium text-[11px] uppercase tracking-wider flex items-center">
                              <svg className="w-3.5 h-3.5 text-slate-400/50 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              Período Integral
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-5 text-right">
                        {currentUser.role !== UserRole.VIEWER && (
                          <div className="flex justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEditTaskModal(task)}
                              className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-500/30 rounded-xl transition-all shadow-sm"
                              title="Editar"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button
                              onClick={() => handleDelete(task.id)}
                              className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all shadow-sm"
                              title="Excluir"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredAndSortedTeamTasks.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm font-medium">
                      {db.tasks.length === 0 ? 'Nenhuma tarefa cadastrada.' : 'Nenhuma tarefa encontrada para os filtros selecionados.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: NOVA / EDITAR TAREFA AVULSA (TEAM TASK)                       */}
      {/* ==================================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1e293b] rounded-[32px] shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-700 p-8 transform transition-all max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                {editingTask ? 'Editar Tarefa' : 'Nova Tarefa'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 p-4 rounded-2xl mb-6 flex items-start space-x-3">
              <div className="shrink-0 mt-0.5 text-indigo-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-1">Aviso de Expiração Automática</p>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Esta tarefa será mantida no sistema por <strong>30 dias</strong> e depois será excluída automaticamente para não poluir o banco de dados. Se um lembrete for configurado, o alerta será exibido dentro do PERSPECPATH no horário definido.
                </p>
              </div>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Título da Tarefa *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  placeholder="Ex: Férias do Colaborador X"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Tipo *</label>
                  <select
                    required
                    value={type}
                    onChange={e => setType(e.target.value as TaskType)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  >
                    {Object.values(TaskType).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Responsável *</label>
                  <select
                    required
                    value={assigneeId}
                    onChange={e => setAssigneeId(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  >
                    <option value="">Selecione...</option>
                    {activeUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.username}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Participantes Convidados</label>
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl max-h-36 overflow-y-auto custom-scrollbar space-y-2">
                  {activeUsers.filter(u => u.id !== assigneeId).map(u => {
                    const isChecked = invitedUsers.includes(u.id);
                    return (
                      <label key={u.id} className="flex items-center space-x-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setInvitedUsers(invitedUsers.filter(id => id !== u.id));
                            } else {
                              setInvitedUsers([...invitedUsers, u.id]);
                            }
                          }}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{u.username}</span>
                      </label>
                    );
                  })}
                  {activeUsers.filter(u => u.id !== assigneeId).length === 0 && (
                    <span className="text-xs text-slate-400 dark:text-slate-500">Nenhum outro usuário disponível</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Data Início *</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Data Fim *</label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Hora Início</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Hora Fim</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Lembrete</label>
                  <select
                    value={reminder}
                    onChange={e => setReminder(e.target.value)}
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
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors resize-none h-24"
                  placeholder="Detalhes adicionais (opcional)..."
                />
              </div>

              <div className="flex space-x-3 pt-6 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 p-4 rounded-2xl font-black uppercase text-xs tracking-widest text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 p-4 rounded-2xl font-black uppercase text-xs tracking-widest text-white shadow-xl shadow-indigo-500/20 active:scale-95 transition-all"
                >
                  Salvar Tarefa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* DIÁLOGOS DE TRANSIÇÃO DO KANBAN                                      */}
      {/* ==================================================================== */}

      {/* Diálogo de Bloqueio */}
      {blockingActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1e293b] rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <Ban className="w-5 h-5 text-[#FBBF24]" />
                <h3 className="text-base font-black text-slate-900 dark:text-white">Bloquear Atividade</h3>
              </div>
              <button
                onClick={() => setBlockingActivity(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300">
              Atividade: <strong className="text-slate-900 dark:text-white">{blockingActivity.name}</strong>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                Motivo do Bloqueio *
              </label>
              <textarea
                value={blockingReasonInput}
                onChange={e => setBlockingReasonInput(e.target.value)}
                rows={3}
                placeholder="Ex: Aguardando aprovação do cliente ou retorno do fornecedor..."
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-[#FBBF24] resize-none"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBlockingActivity(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmBlock}
                disabled={isTransitioning || !blockingReasonInput.trim()}
                className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-[#78350F] hover:bg-[#78350F]/90 text-[#FDE68A] border border-[#FBBF24] shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {isTransitioning ? 'Bloqueando...' : 'Confirmar Bloqueio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diálogo de Conclusão */}
      {completingActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1e293b] rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <h3 className="text-base font-black text-slate-900 dark:text-white">Concluir Atividade</h3>
              </div>
              <button
                onClick={() => setCompletingActivity(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300">
              Atividade: <strong className="text-slate-900 dark:text-white">{completingActivity.name}</strong>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                Data Real de Conclusão *
              </label>
              <input
                type="date"
                value={completionDateInput}
                onChange={e => setCompletionDateInput(e.target.value)}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCompletingActivity(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmComplete}
                disabled={isTransitioning || !completionDateInput}
                className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50"
              >
                {isTransitioning ? 'Concluindo...' : 'Confirmar Conclusão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diálogo de Reabertura */}
      {reopeningActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1e293b] rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <RotateCcw className="w-5 h-5 text-indigo-500" />
                <h3 className="text-base font-black text-slate-900 dark:text-white">Reabrir Atividade</h3>
              </div>
              <button
                onClick={() => setReopeningActivity(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300">
              Atividade: <strong className="text-slate-900 dark:text-white">{reopeningActivity.name}</strong>
              <p className="text-[11px] text-slate-400 mt-1">
                A data real de conclusão será removida e a atividade retornará para <strong>{reopenTargetStatus}</strong>.
              </p>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                Motivo da Reabertura (opcional)
              </label>
              <input
                type="text"
                value={reopeningReasonInput}
                onChange={e => setReopeningReasonInput(e.target.value)}
                placeholder="Ex: Ajustes solicitados pelo cliente..."
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReopeningActivity(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmReopen}
                disabled={isTransitioning}
                className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50"
              >
                {isTransitioning ? 'Reabrindo...' : 'Confirmar Reabertura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: DETALHES DA ATIVIDADE E PROJETO NO KANBAN                     */}
      {/* ==================================================================== */}
      {detailsModalActivity && (
        <ActivityDetailsModal
          activity={detailsModalActivity}
          onClose={() => setDetailsModalActivity(null)}
          onOpenProject={onOpenProject}
          allActivities={projectActivities}
          projects={db.projects}
          clients={db.clients}
          users={db.users}
          activityTypes={activityTypes}
          onSelectActivity={setDetailsModalActivity}
        />
      )}
    </div>
  );
};

// ============================================================================
// COMPONENTE AUXILIAR: COLUNA DO KANBAN
// ============================================================================
interface KanbanColumnProps {
  title: string;
  canonical: ActivityCanonicalStatus;
  count: number;
  activities: ProjectActivity[];
  headerBg: string;
  headerBorder: string;
  headerText: string;
  badgeText?: string;
  isDragOver: boolean;
  projectMap: Map<string, { code: string; name: string }>;
  users: InternalUser[];
  todayStr: string;
  onDragOver: (e: React.DragEvent, status: ActivityCanonicalStatus) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, status: ActivityCanonicalStatus) => void;
  onDragStart: (e: React.DragEvent, activityId: string) => void;
  onTransition: (activity: ProjectActivity, targetStatus: ActivityCanonicalStatus) => void;
  onOpenDetails: (activity: ProjectActivity) => void;
  menuOpenId: string | null;
  setMenuOpenId: (id: string | null) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({
  title,
  canonical,
  count,
  activities,
  headerBg,
  headerBorder,
  headerText,
  badgeText,
  isDragOver,
  projectMap,
  users,
  todayStr,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onTransition,
  onOpenDetails,
  menuOpenId,
  setMenuOpenId
}) => {
  return (
    <div
      onDragOver={e => onDragOver(e, canonical)}
      onDragLeave={onDragLeave}
      onDrop={e => onDrop(e, canonical)}
      className={`flex flex-col rounded-3xl p-3 bg-slate-50/70 dark:bg-[#1e293b]/50 border transition-all duration-200 min-h-[460px] ${
        isDragOver
          ? 'border-indigo-500 bg-indigo-50/30 dark:bg-indigo-500/10 shadow-lg scale-[1.01]'
          : 'border-slate-200/80 dark:border-slate-800'
      }`}
    >
      {/* Cabeçalho da Coluna */}
      <div className={`p-3.5 rounded-2xl border ${headerBg} ${headerBorder} flex items-center justify-between mb-3 shadow-sm`}>
        <div className="flex items-center space-x-2">
          <span className={`text-xs font-black uppercase tracking-wider ${headerText}`}>
            {title}
          </span>
          {badgeText && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-white/40 dark:bg-black/20 text-current">
              {badgeText}
            </span>
          )}
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-black bg-white dark:bg-slate-900 ${headerText} shadow-sm`}>
          {count}
        </span>
      </div>

      {/* Cartões da Coluna */}
      <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[calc(100vh-280px)] custom-scrollbar pr-0.5">
        {activities.map(act => {
          const proj = projectMap.get(act.projectId);
          const assignee = users.find(u => u.id === act.assigneeId);
          const deadlineEval = evaluateDeadlineStatus(act, todayStr);
          const isMenuOpen = menuOpenId === act.id;

          const isOverdue = deadlineEval.status === ActivityDeadlineStatus.OVERDUE && canonical !== ActivityCanonicalStatus.COMPLETED;
          const isUpcoming = deadlineEval.status === ActivityDeadlineStatus.UPCOMING && canonical !== ActivityCanonicalStatus.COMPLETED;
          const isBlocked = canonical === ActivityCanonicalStatus.BLOCKED;

          return (
            <div
              key={act.id}
              draggable
              onDragStart={e => onDragStart(e, act.id)}
              className="p-3.5 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800/90 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing group relative select-none"
            >
              {/* Topo do Card: Projeto & Menu Acessível */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                {proj ? (
                  <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 truncate max-w-[170px]" title={`${proj.code} - ${proj.name}`}>
                    {proj.code}
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-400 font-bold uppercase">Projeto</span>
                )}

                {/* Botão de Menu Acessível */}
                <div className="relative">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setMenuOpenId(isMenuOpen ? null : act.id);
                    }}
                    onMouseDown={e => e.stopPropagation()}
                    onDragStart={e => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    title="Ações da atividade..."
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>

                  {/* Dropdown Acessível */}
                  {isMenuOpen && (
                    <div
                      className="absolute right-0 top-6 z-30 w-48 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-1.5 space-y-1 text-xs animate-in fade-in duration-150"
                      onClick={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                    >
                      {/* Ação: Ver detalhes */}
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setMenuOpenId(null);
                          onOpenDetails(act);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-2"
                      >
                        <Eye className="w-3.5 h-3.5 shrink-0" />
                        <span>Ver detalhes</span>
                      </button>

                      <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                      <div className="px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Mover para:
                      </div>
                      {canonical !== ActivityCanonicalStatus.TO_DO && (
                        <button
                          onClick={() => onTransition(act, ActivityCanonicalStatus.TO_DO)}
                          className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold flex items-center gap-1.5"
                        >
                          <span className="w-2 h-2 rounded-full bg-slate-400" />
                          <span>A FAZER</span>
                        </button>
                      )}
                      {canonical !== ActivityCanonicalStatus.IN_PROGRESS && (
                        <button
                          onClick={() => onTransition(act, ActivityCanonicalStatus.IN_PROGRESS)}
                          className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-sky-600 dark:text-sky-400 font-bold flex items-center gap-1.5"
                        >
                          <span className="w-2 h-2 rounded-full bg-sky-500" />
                          <span>EM ANDAMENTO</span>
                        </button>
                      )}
                      {canonical !== ActivityCanonicalStatus.BLOCKED && (
                        <button
                          onClick={() => onTransition(act, ActivityCanonicalStatus.BLOCKED)}
                          className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-amber-500/10 text-amber-600 dark:text-[#FDE68A] font-bold flex items-center gap-1.5"
                        >
                          <span className="w-2 h-2 rounded-full bg-[#FBBF24]" />
                          <span>BLOQUEADA</span>
                        </button>
                      )}
                      {canonical !== ActivityCanonicalStatus.COMPLETED && (
                        <button
                          onClick={() => onTransition(act, ActivityCanonicalStatus.COMPLETED)}
                          className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5"
                        >
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span>CONCLUÍDA</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Título da Atividade (Clicável para ver detalhes sem disparar drag) */}
              <h4
                onClick={e => {
                  e.stopPropagation();
                  onOpenDetails(act);
                }}
                onMouseDown={e => e.stopPropagation()}
                onDragStart={e => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                title="Clique para ver detalhes"
                className="text-xs font-bold text-slate-900 dark:text-white leading-snug mb-2.5 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                {act.name}
              </h4>

              {/* Badge discreto de Bloqueio se aplicável */}
              {isBlocked && act.blockedReason && (
                <div className="mb-2 px-2 py-1 rounded-lg bg-[#78350F]/15 border border-[#FBBF24]/40 text-[#FDE68A] text-[10px] font-medium leading-tight flex items-start gap-1">
                  <Ban className="w-3 h-3 text-[#FBBF24] shrink-0 mt-0.5" />
                  <span className="line-clamp-2" title={act.blockedReason}>{act.blockedReason}</span>
                </div>
              )}

              {/* Rodapé do Card: Responsável e Prazo */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                {/* Responsável */}
                <div className="flex items-center space-x-1.5 min-w-0">
                  <div className="w-5 h-5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-black text-[9px] flex items-center justify-center uppercase shrink-0">
                    {(assignee?.username || '?').charAt(0)}
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                    {assignee?.username || 'Não atribuído'}
                  </span>
                </div>

                {/* Prazo e Indicador Discreto */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {act.deliveryDate && (
                    <span className="text-[10px] font-semibold text-slate-400">
                      {new Date(act.deliveryDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </span>
                  )}

                  {isOverdue && (
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                      Atrasada
                    </span>
                  )}

                  {isUpcoming && (
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      Breve
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {activities.length === 0 && (
          <div className="py-10 text-center text-xs text-slate-400 italic">
            Nenhuma atividade nesta coluna.
          </div>
        )}
      </div>
    </div>
  );
};
