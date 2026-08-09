
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Project, ProjectStatus, Client, InternalUser, ProjectSubTask, UserRole, LogModule, LogAction, ActivityType, ProjectActivity, ActivityExecution, ActivityExecutionStatus, ActiveWorkSessionContext, WorkSession, ActivityOvertimeEntry } from '../types';
import { getNextGlobalProjectSeq, syncProject, deleteProject, AppDB, logAction, fetchActivityTypes, fetchProjectActivities, syncProjectActivity, deleteProjectActivity, getNextUserOrderIndex, reorderUserQueue, fetchActivityExecutions, fetchWorkSessions, fetchActivityOvertimeEntries, createActivityOvertimeEntry, updateActivityOvertimeEntry, deleteActivityOvertimeEntry, fetchActiveWorkSessionContext, startOrResumeActivity, pauseActivityExecution, completeActivityExecution } from '../storage';
import { generateDiffLogs, formatDateForLog } from '../utils/logDiff';
import { calculateAccountedOperationalMs, calculateOvertimeMs, calculateRegularOperationalMs } from '../utils/operationalTime';

interface ProjectsProps {
  db: AppDB;
  setDb: (db: AppDB) => void;
  currentUser: InternalUser;
  theme: 'dark' | 'light';
}

export const Projects: React.FC<ProjectsProps> = ({ db, setDb, currentUser, theme }) => {
  const [showModal, setShowModal] = useState(false);
  const [showImageZoom, setShowImageZoom] = useState<string | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [clientFilter, setClientFilter] = useState<string>('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [status, setStatus] = useState<ProjectStatus>(ProjectStatus.QUEUE);
  const [revision, setRevision] = useState('Rev.00');
  const [startDate, setStartDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [subtasks, setSubtasks] = useState<ProjectSubTask[]>([]);

  // Project Activities States
  const [projectActivities, setProjectActivities] = useState<ProjectActivity[]>([]);
  const [activityExecutions, setActivityExecutions] = useState<ActivityExecution[]>([]);
  const [workSessions, setWorkSessions] = useState<WorkSession[]>([]);
  const [overtimeEntries, setOvertimeEntries] = useState<ActivityOvertimeEntry[]>([]);
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
  const [actStatus, setActStatus] = useState<ProjectStatus>(ProjectStatus.QUEUE);
  const [actEstimatedDuration, setActEstimatedDuration] = useState('');
  const [actStartDate, setActStartDate] = useState('');
  const [actDeliveryDate, setActDeliveryDate] = useState('');
  const [actNotes, setActNotes] = useState('');
  const [showOvertimeModal, setShowOvertimeModal] = useState(false);
  const [overtimeActivity, setOvertimeActivity] = useState<ProjectActivity | null>(null);
  const [editingOvertimeEntry, setEditingOvertimeEntry] = useState<ActivityOvertimeEntry | null>(null);
  const [overtimeDate, setOvertimeDate] = useState('');
  const [overtimeHours, setOvertimeHours] = useState('');
  const [overtimeNotes, setOvertimeNotes] = useState('');
  const [isSavingOvertime, setIsSavingOvertime] = useState(false);
  const [usePrefix, setUsePrefix] = useState(false);
  const [codePrefix, setCodePrefix] = useState('');
  const hasRunningOperationalSession = Boolean(activeWorkContext)
    || workSessions.some(session => session.endedAt === undefined);

  const resetForm = () => {
    setName('');
    setClientId('');
    setAssigneeId('');
    setStatus(ProjectStatus.QUEUE);
    setRevision('Rev.00');
    setStartDate('');
    setDeliveryDate('');
    setPhotoUrl('');
    setNotes('');
    setCustomCode('');
    setSubtasks([]);
    setProjectActivities([]);
    setActivityExecutions([]);
    setWorkSessions([]);
    setOvertimeEntries([]);
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

  const calculateWorkingDays = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return '---';
    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endStr.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return '---';
    if (start > end) return '0 dias';
    let count = 0;
    const curDate = new Date(start.getTime());
    while (curDate <= end) {
      const dayOfWeek = curDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
      curDate.setDate(curDate.getDate() + 1);
    }
    return `${count} ${count === 1 ? 'dia' : 'dias'}`;
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
    if (!hasRunningOperationalSession) return;
    setClockNow(Date.now());
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeWorkContext?.session.id, hasRunningOperationalSession]);

  const loadProjectActivities = async (projectId: string) => {
    setIsLoadingActivities(true);
    try {
      const data = await fetchProjectActivities(currentUser.workspaceId, projectId);
      const sortedActivities = data.sort((a, b) => a.orderIndex - b.orderIndex);
      setProjectActivities(sortedActivities);

      if (sortedActivities.length > 0) {
        const activityIds = sortedActivities.map(activity => activity.id);
        const [executions, entries] = await Promise.all([
          fetchActivityExecutions(currentUser.workspaceId, { projectActivityIds: activityIds }),
          fetchActivityOvertimeEntries(currentUser.workspaceId, { projectActivityIds: activityIds })
        ]);
        setActivityExecutions(executions);
        setOvertimeEntries(entries);
        const sessions = executions.length > 0
          ? await fetchWorkSessions(currentUser.workspaceId, {
              activityExecutionIds: executions.map(execution => execution.id)
            })
          : [];
        setWorkSessions(sessions);
      } else {
        setActivityExecutions([]);
        setWorkSessions([]);
        setOvertimeEntries([]);
      }
    } catch (err) {
      console.error("Erro ao carregar atividades do projeto:", err);
      setActivityExecutions([]);
      setWorkSessions([]);
      setOvertimeEntries([]);
    } finally {
      setIsLoadingActivities(false);
    }
  };

  const resetActForm = () => {
    setActTypeId('');
    setActAssigneeId('');
    setActStatus(ProjectStatus.QUEUE);
    setActEstimatedDuration('');
    setActStartDate('');
    setActDeliveryDate('');
    setActNotes('');
    setEditingActivity(null);
  };

  const handleSaveProjectActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    if (!actTypeId) {
      alert("Selecione um tipo de atividade.");
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

    const activityData: ProjectActivity = {
      id: editingActivity?.id || crypto.randomUUID(),
      workspaceId: currentUser.workspaceId,
      projectId: editingProject.id,
      activityTypeId: actTypeId,
      name: selectedType.name,
      assigneeId: newAssigneeId,
      status: actStatus,
      startDate: actStartDate || undefined,
      deliveryDate: actDeliveryDate || undefined,
      notes: actNotes || undefined,
      estimatedDurationHours: duration,
      orderIndex: orderIdx,
      actualStartDate: editingActivity?.actualStartDate,
      actualEndDate: editingActivity?.actualEndDate,
      conclusionResponsibleId: editingActivity?.conclusionResponsibleId,
      deadlineAtConclusion: editingActivity?.deadlineAtConclusion,
      deadlineChangesCount: editingActivity?.deadlineChangesCount || 0,
      createdAt: editingActivity?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    if (editingActivity) {
      activityData.deadlineChangesCount = editingActivity.deadlineChangesCount || 0;
      if (actDeliveryDate && editingActivity.deliveryDate && actDeliveryDate !== editingActivity.deliveryDate) {
        activityData.deadlineChangesCount = (editingActivity.deadlineChangesCount || 0) + 1;
      }
      if (editingActivity.status !== ProjectStatus.DONE && actStatus === ProjectStatus.DONE) {
        activityData.actualEndDate = new Date().toISOString().split('T')[0];
        activityData.conclusionResponsibleId = currentUser.id;
        activityData.deadlineAtConclusion = actDeliveryDate || undefined;
      }
      if (editingActivity.status === ProjectStatus.QUEUE && actStatus !== ProjectStatus.QUEUE) {
        activityData.actualStartDate = new Date().toISOString().split('T')[0];
      }
    } else {
      activityData.deadlineChangesCount = 0;
      if (actStatus === ProjectStatus.DONE) {
        activityData.actualEndDate = new Date().toISOString().split('T')[0];
        activityData.conclusionResponsibleId = currentUser.id;
        activityData.deadlineAtConclusion = actDeliveryDate || undefined;
      } else if (actStatus !== ProjectStatus.QUEUE) {
        activityData.actualStartDate = new Date().toISOString().split('T')[0];
      }
    }

    try {
      await syncProjectActivity(activityData);

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
      alert("Erro ao salvar atividade: " + err.message);
    }
  };

  const handleDeleteProjectAct = async (activity: ProjectActivity) => {
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
    setRevision(project.revision);
    setStartDate(project.startDate || '');
    setDeliveryDate(project.deliveryDate || '');
    setPhotoUrl(project.photoUrl || '');
    setNotes(project.notes || '');
    setSubtasks(project.subtasks || []);
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = db.clients.find((c: Client) => c.id === clientId);
    if (!client) return;

    const yearYY = new Date().getFullYear().toString().slice(-2);
    const seq = (customCode || getNextGlobalProjectSeq(db.projects)).toString().padStart(6, '0');
    const baseCode = `${client.code.padStart(3, '0')}-${seq}-${yearYY}`;
    const finalCode = usePrefix && codePrefix ? `${codePrefix}-${baseCode}` : baseCode;

    if (db.projects.some((p: Project) => p.code === finalCode && p.id !== editingProject?.id)) {
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
      revision,
      startDate,
      dueDate: deliveryDate, // keeping legacy structure mapping
      deliveryDate,
      photoUrl,
      notes,
      subtasks,
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
      await syncProject(projectData);

      let newProjects;
      if (editingProject) {
        newProjects = db.projects.map((p: Project) => p.id === editingProject.id ? projectData : p);
        
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
          for (const log of diffLogs) {
             await logAction(currentUser.workspaceId, currentUser, LogModule.PROJECTS, LogAction.UPDATE, `${currentUser.username} ${log}`, projectData.code);
          }
        } else {
           await logAction(currentUser.workspaceId, currentUser, LogModule.PROJECTS, LogAction.UPDATE, `${currentUser.username} atualizou o projeto ${projectData.code}`, projectData.code);
        }
      } else {
        newProjects = [...db.projects, projectData];
        await logAction(currentUser.workspaceId, currentUser, LogModule.PROJECTS, LogAction.CREATE, `${currentUser.username} criou o projeto ${projectData.code}`, projectData.code);
      }

      setDb({ ...db, projects: newProjects });
      setShowModal(false);
      resetForm();
    } catch (err: any) {
      alert("Erro ao salvar no Supabase: " + (err.message || "Erro desconhecido"));
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
    const folderName = `${previewCode} - ${name}`;
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
      await dirHandle.getDirectoryHandle(safeFolderName, { create: true });
      alert(`Pasta "${safeFolderName}" criada com sucesso!`);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        alert("Erro ao criar pasta: " + error.message);
      }
    }
  };

  const handleDeleteProject = async () => {
    if (!editingProject) return;
    if (currentUser.role !== UserRole.ADMIN) {
      alert("Apenas administradores podem excluir projetos.");
      return;
    }
    if (confirm(`Tem certeza que deseja EXCLUIR DEFINITIVAMENTE o projeto "${editingProject.name}"?\nEsta ação não pode ser desfeita.`)) {
      try {
        await deleteProject(editingProject.id);
        await logAction(currentUser.workspaceId, currentUser, LogModule.PROJECTS, LogAction.DELETE, `${currentUser.username} excluiu o projeto ${editingProject.code}`, editingProject.code);
        setDb({
          ...db,
          projects: db.projects.filter(p => p.id !== editingProject.id)
        });
        setShowModal(false);
        resetForm();
      } catch (err: any) {
        alert("Erro ao excluir no Supabase: " + (err.message || "Erro desconhecido"));
      }
    }
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

  const handleAddSubTask = () => {
    setSubtasks([...subtasks, {
      id: crypto.randomUUID(),
      name: '',
      status: ProjectStatus.QUEUE,
      startDate: startDate || '',
      deliveryDate: deliveryDate || ''
    }]);
  };

  const handleUpdateSubTask = (id: string, field: keyof ProjectSubTask, value: any) => {
    setSubtasks(current => current.map(st => {
      if (st.id !== id) return st;
      const updated = { ...st, [field]: value };

      // Validação de Datas
      if (field === 'startDate' && startDate && value < startDate) updated.startDate = startDate;
      if (field === 'deliveryDate' && deliveryDate && value > deliveryDate) updated.deliveryDate = deliveryDate;
      if (field === 'startDate' && updated.deliveryDate && value > updated.deliveryDate) updated.startDate = updated.deliveryDate;

      // Data Warehouse Tracking for Subtasks
      if (field === 'status' && st.status !== ProjectStatus.DONE && value === ProjectStatus.DONE) {
         updated.actualEndDate = new Date().toISOString().split('T')[0];
         updated.conclusionResponsibleId = currentUser.id;
         updated.deadlineAtConclusion = updated.deliveryDate;
      }
      if (field === 'status' && st.status === ProjectStatus.QUEUE && value !== ProjectStatus.QUEUE) {
         updated.actualStartDate = new Date().toISOString().split('T')[0];
      }

      return updated;
    }));
  };

  const handleRemoveSubTask = (id: string) => {
    setSubtasks(subtasks.filter(st => st.id !== id));
  };

  const filteredProjects = useMemo(() => {
    return db.projects.filter((p: Project) => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.code.includes(search);
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
      const matchesClient = clientFilter === 'ALL' || p.clientId === clientFilter;
      const matchesAssignee = assigneeFilter === 'ALL' || p.assigneeId === assigneeFilter;
      return matchesSearch && matchesStatus && matchesClient && matchesAssignee;
    }).sort((a: Project, b: Project) => b.createdAt - a.createdAt);
  }, [db.projects, search, statusFilter, clientFilter, assigneeFilter]);

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
    const client = db.clients.find((c: Client) => c.id === clientId);
    if (!client) return "---";
    const baseSeq = customCode || getNextGlobalProjectSeq(db.projects);
    const seq = baseSeq.toString().padStart(6, '0');
    const yearYY = new Date().getFullYear().toString().slice(-2);
    const baseCode = `${client.code.padStart(3, '0')}-${seq}-${yearYY}`;
    return usePrefix && codePrefix ? `${codePrefix}-${baseCode}` : baseCode;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight transition-colors">Gestão de Projetos</h1>
        {currentUser.role !== UserRole.VIEWER && (
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-500/20 flex items-center font-bold text-sm"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
            Criar Projeto
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-[#1e293b] p-6 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 items-center transition-colors">
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
          {[...db.clients]
            .sort((a, b) => parseInt(a.code) - parseInt(b.code))
            .map((c: Client) => <option key={c.id} value={c.id}>{c.code.padStart(3, '0')} - {c.name}</option>)}
        </select>
        <select
          className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-bold cursor-pointer transition-colors"
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
        >
          <option value="ALL">Responsável: Todos</option>
          {db.users.filter(u => u.isActive).map(u => (
            <option key={u.id} value={u.id}>{u.username.split(' ')[0]}</option>
          ))}
        </select>
      </div>

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
                const client = db.clients.find((c: Client) => c.id === project.clientId);
                const assignee = db.users.find((u: InternalUser) => u.id === project.assigneeId);
                const workingDays = calculateWorkingDays(project.startDate || '', project.deliveryDate || '');
                const dateStyle = getDeliveryDateStyle(project.deliveryDate || '', project.status);

                return (
                  <tr key={project.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors group relative border-l-4 border-transparent">
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

      {/* MODAL: Cadastro/Edição de Projeto */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-[#0f172a] rounded-[40px] shadow-2xl w-full max-w-2xl h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-white/5 transition-all duration-500">
            <div className="px-8 py-6 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-white/5 flex items-center justify-between transition-colors">
              <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight transition-colors">
                {currentUser.role === UserRole.VIEWER ? 'Visualizar Detalhes' : (editingProject ? 'Editar Detalhes' : 'Novo Projeto')}
              </h3>
              <button onClick={() => setShowModal(false)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300 dark:hover:bg-white/20 transition-all active:scale-95">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8 dark:bg-[#0f172a] transition-colors">
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
                    disabled={currentUser.role === UserRole.VIEWER}
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
                    disabled={currentUser.role === UserRole.VIEWER}
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
                      disabled={currentUser.role === UserRole.VIEWER}
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
                      {[...db.clients]
                        .filter((c: any) => c.status === 'ACTIVE')
                        .sort((a, b) => parseInt(a.code) - parseInt(b.code))
                        .map((c: Client) => <option key={c.id} value={c.id}>{c.code.padStart(3, '0')} - {c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Responsável *</label>
                    <select required value={assigneeId} disabled={currentUser.role === UserRole.VIEWER} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition-colors disabled:opacity-60" onChange={(e) => setAssigneeId(e.target.value)}>
                      <option value="">Selecione um usuário...</option>
                      {db.users.filter((u: any) => u.isActive).map((u: InternalUser) => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Nome do Projeto *</label>
                    <input type="text" required value={name} disabled={currentUser.role === UserRole.VIEWER} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition-colors disabled:opacity-60" placeholder="Ex: Reforma Pavimento Superior" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1 transition-colors">Revisão</label>
                      <input type="text" value={revision} disabled={currentUser.role === UserRole.VIEWER} onChange={(e) => setRevision(e.target.value)} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 outline-none font-medium transition-colors disabled:opacity-60" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1 transition-colors">Status</label>
                      <select value={status} disabled={currentUser.role === UserRole.VIEWER} onChange={(e: any) => setStatus(e.target.value)} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 outline-none font-medium cursor-pointer transition-colors disabled:opacity-60">
                        {Object.values(ProjectStatus).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1 transition-colors">Data Início</label>
                      <input type="date" value={startDate} disabled={currentUser.role === UserRole.VIEWER} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition-colors disabled:opacity-60" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1 transition-colors">Data Entrega</label>
                      <input type="date" value={deliveryDate} disabled={currentUser.role === UserRole.VIEWER} onChange={(e) => setDeliveryDate(e.target.value)} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition-colors disabled:opacity-60" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1 transition-colors">Imagem do Projeto</label>
                    <div className="relative h-56 w-full rounded-2xl bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 border-dashed overflow-hidden flex flex-col items-center justify-center group transition-all hover:border-indigo-500/50">
                      {photoUrl ? (
                        <div className="relative w-full h-full">
                          <img src={photoUrl} className="absolute inset-0 w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-slate-900/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center space-y-3 p-4">
                            {currentUser.role !== UserRole.VIEWER && (
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

              {/* ATIVIDADES */}
              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800/50 transition-colors">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] flex items-center transition-colors">
                    <svg className="w-4 h-4 mr-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                    Atividades do Projeto
                  </h4>
                  {currentUser.role !== UserRole.VIEWER && editingProject && (
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
                      const isActiveForCurrentUser = activeWorkContext?.activity.id === activity.id && activeWorkContext.execution.internalUserId === currentUser.id;
                      const execution = getOpenExecution(activity.id)
                        || (isActiveForCurrentUser ? activeWorkContext.execution : undefined)
                        || activityExecutions.find(item => item.projectActivityId === activity.id && item.internalUserId === currentUser.id);
                      const isClosed = activity.status === ProjectStatus.DONE || activity.status === ProjectStatus.CANCELED;
                      const isPaused = activity.status === ProjectStatus.PAUSED || execution?.status === ActivityExecutionStatus.PAUSED;
                      const isActionLoading = activityActionId === activity.id;
                      const hasOperationalTime = activityExecutions.some(item => item.projectActivityId === activity.id)
                        || overtimeEntries.some(entry => entry.projectActivityId === activity.id);
                      const activityOvertimeMs = getActivityOvertimeMs(activity.id);
                      return (
                        <div key={activity.id} className="min-w-0 bg-slate-50 dark:bg-slate-900/80 p-4 sm:p-5 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-indigo-500/30 transition-all group/task">
                          <div className="flex min-w-0 flex-col gap-4">
                            <div className="flex min-w-0 items-start gap-3">
                              <div className="flex flex-col items-center space-y-0.5 mr-2">
                                <button
                                  type="button"
                                  onClick={() => handleReorderProjectActivity(index, 'up')}
                                  disabled={index === 0}
                                  className={`p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition ${index === 0 ? 'opacity-20 cursor-not-allowed' : 'text-slate-500 hover:text-indigo-600'}`}
                                  title="Subir prioridade"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 15l7-7 7 7" /></svg>
                                </button>
                                <span className="text-[9px] font-black text-slate-400">{activity.orderIndex}</span>
                                <button
                                  type="button"
                                  onClick={() => handleReorderProjectActivity(index, 'down')}
                                  disabled={index === projectActivities.length - 1}
                                  className={`p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition ${index === projectActivities.length - 1 ? 'opacity-20 cursor-not-allowed' : 'text-slate-500 hover:text-indigo-600'}`}
                                  title="Descer prioridade"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                                </button>
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <span className="min-w-0 break-words font-bold text-sm text-slate-900 dark:text-slate-100">{activity.name}</span>
                                  {actType?.category && (
                                    <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-800 text-[9px] font-black text-slate-500 dark:text-slate-400 rounded-md uppercase tracking-wider">
                                      {actType.category}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                                  <span>Responsável: <strong className="text-slate-700 dark:text-slate-300">{assignee ? assignee.username : 'Não atribuído'}</strong></span>
                                  {activity.estimatedDurationHours !== undefined && (
                                    <span>Estimado: <strong className="text-slate-700 dark:text-slate-300">{activity.estimatedDurationHours}h</strong></span>
                                  )}
                                  {activityOvertimeMs !== null && activityOvertimeMs > 0 && (
                                    <span>Horas extras: <strong className="text-slate-700 dark:text-slate-300">{formatElapsedTime(activityOvertimeMs)}</strong></span>
                                  )}
                                  {(activity.startDate || activity.deliveryDate) && (
                                    <span>Prazo: <strong className="text-slate-700 dark:text-slate-300">{formatDate(activity.startDate)} até {formatDate(activity.deliveryDate)}</strong></span>
                                  )}
                                </div>
                                {activity.notes && (
                                  <p className="mt-1.5 break-words text-[10px] italic text-slate-400" title={activity.notes}>
                                    Obs: {activity.notes}
                                  </p>
                                )}
                                {isActiveForCurrentUser && activeWorkContext && (
                                  <div className="mt-3 flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 sm:inline-flex">
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                    </span>
                                    <span className="text-[9px] font-black uppercase tracking-widest">Tempo contabilizado</span>
                                    <span className="whitespace-nowrap font-mono text-[11px] font-bold">{formatElapsedTime(getAccountedOperationalMs(activity.id))}</span>
                                  </div>
                                )}
                                {!isActiveForCurrentUser && hasOperationalTime && (
                                  activity.status === ProjectStatus.IN_PROGRESS
                                  || isPaused
                                  || activity.status === ProjectStatus.DONE
                                ) && (
                                  <div className="mt-3 flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 rounded-lg bg-slate-200/60 dark:bg-slate-800/70 border border-slate-300/60 dark:border-slate-700 text-slate-600 dark:text-slate-300 sm:inline-flex">
                                    <span className="text-[9px] font-black uppercase tracking-widest">Tempo contabilizado</span>
                                    <span className="whitespace-nowrap font-mono text-[11px] font-bold">{formatElapsedTime(getAccountedOperationalMs(activity.id))}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3 dark:border-slate-800">
                              {currentUser.role === UserRole.ADMIN && (
                                <button
                                  type="button"
                                  onClick={() => openOvertimeModal(activity)}
                                  className="px-3 py-1.5 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-[9px] font-black uppercase tracking-widest rounded-lg border border-cyan-500/20 hover:bg-cyan-500 hover:text-white transition"
                                >
                                  Horas extras
                                </button>
                              )}
                              {!isClosed && (
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  {isActiveForCurrentUser ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handlePauseActivity(activity, execution)}
                                        disabled={isActionLoading}
                                        className="px-3 py-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-black uppercase tracking-widest rounded-lg border border-amber-500/20 hover:bg-amber-500 hover:text-white transition disabled:opacity-50"
                                      >
                                        Pausar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleCompleteActivity(activity, execution)}
                                        disabled={isActionLoading}
                                        className="px-3 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-widest rounded-lg border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition disabled:opacity-50"
                                      >
                                        Concluir
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleStartOrResumeActivity(activity)}
                                        disabled={isActionLoading}
                                        className="px-3 py-1.5 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-lg shadow-indigo-500/15 hover:bg-indigo-700 transition disabled:opacity-50"
                                      >
                                        {isActionLoading ? 'Aguarde...' : (isPaused || execution ? 'Retomar' : 'Iniciar')}
                                      </button>
                                      {isPaused && execution && (
                                        <button
                                          type="button"
                                          onClick={() => handleCompleteActivity(activity, execution)}
                                          disabled={isActionLoading}
                                          className="px-3 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-widest rounded-lg border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition disabled:opacity-50"
                                        >
                                          Concluir
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}

                              <span className={`inline-block px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                                activity.status === ProjectStatus.DONE ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                                activity.status === ProjectStatus.IN_PROGRESS ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                                activity.status === ProjectStatus.PAUSED ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20' :
                                activity.status === ProjectStatus.CANCELED ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' :
                                'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700/50'
                              }`}>
                                {activity.status}
                              </span>

                              {currentUser.role !== UserRole.VIEWER && (
                                <div className="flex items-center space-x-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingActivity(activity);
                                      setActTypeId(activity.activityTypeId || '');
                                      setActAssigneeId(activity.assigneeId || '');
                                      setActStatus(activity.status);
                                      setActEstimatedDuration(activity.estimatedDurationHours !== undefined ? activity.estimatedDurationHours.toString() : '');
                                      setActStartDate(activity.startDate || '');
                                      setActDeliveryDate(activity.deliveryDate || '');
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* HISTÓRICO DE SUBTAREFAS - MODELO LEGADO ANTERIOR */}
              {subtasks.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800/50 transition-colors">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-[10px] font-black text-rose-500/80 dark:text-rose-400/60 uppercase tracking-[0.2em] flex items-center transition-colors">
                      <svg className="w-4 h-4 mr-2 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                      Histórico de Subtarefas — Modelo Anterior
                    </h4>
                    <span className="px-2 py-0.5 bg-rose-500/10 text-rose-500 text-[8px] font-black rounded uppercase tracking-wider border border-rose-500/20">Somente Leitura</span>
                  </div>

                  <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar transition-colors">
                    {subtasks.map((st) => (
                      <div key={st.id} className="bg-slate-50 dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/50 opacity-80">
                        <div className="flex flex-col space-y-4">
                          <div className="flex items-center space-x-3">
                            <input
                              type="text"
                              value={st.name}
                              disabled={true}
                              className="flex-1 bg-transparent border-none text-sm font-bold text-slate-500 dark:text-slate-400 focus:ring-0 p-0"
                            />
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                            <div className="col-span-1 md:col-span-1">
                              <label className="block text-[8px] font-black text-slate-400 dark:text-slate-600 uppercase mb-1.5 ml-0.5">Responsável</label>
                              <select
                                value={st.assigneeId || ''}
                                disabled={true}
                                className="w-full bg-white dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-700/30 rounded-lg py-1.5 px-2 text-[10px] text-slate-500 font-bold outline-none"
                              >
                                <option value="">Sem Resp.</option>
                                {db.users.map(u => (
                                  <option key={u.id} value={u.id}>{u.username}</option>
                                ))}
                              </select>
                            </div>

                            <div className="col-span-1 md:col-span-1">
                              <label className="block text-[8px] font-black text-slate-400 dark:text-slate-600 uppercase mb-1.5 ml-0.5">Status</label>
                              <select
                                value={st.status}
                                disabled={true}
                                className="w-full bg-white dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-700/30 rounded-lg py-1.5 px-2 text-[10px] font-black uppercase tracking-tighter outline-none"
                              >
                                {Object.values(ProjectStatus).map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>

                            <div className="col-span-1 md:col-span-1">
                              <label className="block text-[8px] font-black text-slate-400 dark:text-slate-600 uppercase mb-1.5 ml-0.5">Início</label>
                              <input
                                type="date"
                                value={st.startDate}
                                disabled={true}
                                className="w-full bg-white dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-700/30 rounded-lg py-1.5 px-2 text-[10px] text-slate-500 outline-none"
                              />
                            </div>

                            <div className="col-span-1 md:col-span-1">
                              <label className="block text-[8px] font-black text-slate-400 dark:text-slate-600 uppercase mb-1.5 ml-0.5">Entrega</label>
                              <input
                                type="date"
                                value={st.deliveryDate}
                                disabled={true}
                                className="w-full bg-white dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-700/30 rounded-lg py-1.5 px-2 text-[10px] text-slate-500 outline-none"
                              />
                            </div>
                          </div>

                          {st.notes && (
                            <p className="text-[10px] text-slate-400 italic">Obs: {st.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1 transition-colors">Anotações do Projeto</label>
                <textarea
                  value={notes}
                  disabled={currentUser.role === UserRole.VIEWER}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium min-h-[100px] resize-none transition-colors disabled:opacity-60"
                  placeholder="Observações técnicas, contatos adicionais ou notas de andamento..."
                />
              </div>

              <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex space-x-4 transition-colors bg-white dark:bg-[#0f172a] sticky bottom-0 z-10">
                {editingProject && currentUser.role === UserRole.ADMIN && (
                  <button
                    type="button"
                    onClick={handleDeleteProject}
                    className="py-4 px-6 bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center hover:bg-rose-200 dark:hover:bg-rose-500/20 transition-all active:scale-[0.98]"
                    title="Excluir Projeto"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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
                {currentUser.role !== UserRole.VIEWER && (
                  <button
                    type="submit"
                    className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all active:scale-[0.98]"
                  >
                    {editingProject ? 'Salvar Alterações' : 'Criar Projeto'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Activity Modal */}
      {showActivityModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[120] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-[#0f172a] rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-white/5 transition-all duration-500">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/30 flex justify-between items-center transition-colors">
              <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-sm transition-colors">
                {editingActivity ? 'Editar Atividade' : 'Adicionar Atividade'}
              </h3>
              <button type="button" onClick={() => setShowActivityModal(false)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300 dark:hover:bg-white/20 transition-all active:scale-95">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSaveProjectActivity} className="p-8 space-y-5">
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Duração Prevista (Horas)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ex: 2.5"
                    value={actEstimatedDuration}
                    onChange={(e) => setActEstimatedDuration(e.target.value)}
                    className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Status</label>
                  <select
                    value={actStatus}
                    onChange={(e) => setActStatus(e.target.value as ProjectStatus)}
                    className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition-colors"
                  >
                    {Object.values(ProjectStatus).map(activityStatus => (
                      <option key={activityStatus} value={activityStatus}>{activityStatus}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Início Planejado</label>
                  <input
                    type="date"
                    value={actStartDate}
                    onChange={(e) => setActStartDate(e.target.value)}
                    className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Conclusão Planejada</label>
                  <input
                    type="date"
                    value={actDeliveryDate}
                    onChange={(e) => setActDeliveryDate(e.target.value)}
                    className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Observações</label>
                <textarea
                  value={actNotes}
                  onChange={(e) => setActNotes(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium min-h-[80px] resize-none transition-colors"
                  placeholder="Instruções adicionais para esta atividade..."
                />
              </div>

              <div className="pt-4 flex space-x-3">
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

      {showOvertimeModal && overtimeActivity && currentUser.role === UserRole.ADMIN && (
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
    </div>
  );
};
