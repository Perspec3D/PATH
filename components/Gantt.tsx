
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Project, ProjectStatus, Client, InternalUser, UserRole, TeamTask, TaskType } from '../types';
import { syncProject, AppDB, syncTeamTask, deleteTeamTask } from '../storage';

interface GanttProps {
  db: AppDB;
  setDb: (db: AppDB) => void;
  currentUser: InternalUser;
  theme: 'dark' | 'light';
}

export const Gantt: React.FC<GanttProps> = ({ db, setDb, currentUser, theme }) => {
  const allProjects = db.projects || [];
  const allClients = db.clients || [];
  const allUsers = db.users || [];

  const [viewMode, setViewMode] = useState<'selector' | 'flow' | 'assignments'>('selector');
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
  const [subtasks, setSubtasks] = useState<any[]>([]); // Para edição no modal

  const [editingTeamTask, setEditingTeamTask] = useState<TeamTask | null>(null);
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
    setSubtasks(project.subtasks || []);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
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
      dueDate: deliveryDate,
      subtasks // Persistir as sub-tarefas editadas
    };

    try {
      await syncProject(projectData);
      const newProjects = db.projects.map((p: Project) => p.id === editingProject.id ? projectData : p);
      setDb({ ...db, projects: newProjects });
      setEditingProject(null);
    } catch (err: any) {
      alert("Erro ao salvar no Supabase: " + (err.message || "Erro desconhecido"));
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
    // --- CÁLCULOS DINÂMICOS PARA O SELETOR ---
    const todayStrYMD = (() => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    })();

    const delayedProjectsCount = activeProjects.filter(
      p => p.deliveryDate && p.deliveryDate < todayStrYMD && p.status !== ProjectStatus.DONE
    ).length;

    const healthPercentage = activeProjects.length === 0
      ? 100
      : Math.max(0, Math.min(100, Math.round(((activeProjects.length - delayedProjectsCount) / activeProjects.length) * 100)));

    // Meses para a mini linha do tempo
    const previewMonths = (() => {
      const months = [];
      const today = new Date();
      for (let i = 0; i < 5; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
        months.push({
          label: d.toLocaleDateString('pt-BR', { month: 'short' }).substring(0, 3).toUpperCase(),
          year: d.getFullYear()
        });
      }
      return months;
    })();

    // Projetos para a mini linha do tempo
    const previewProjects = (() => {
      const list = activeProjects.slice(0, 4);
      const fallbacks = [
        { id: 'mock-p1', code: 'PROJETO 070-001-26', name: 'Projeto 070-001-26', startOffset: 15, width: 35, barColor: 'from-violet-600 to-indigo-500' },
        { id: 'mock-p2', code: 'PROJETO 030-004-26', name: 'Projeto 030-004-26', startOffset: 25, width: 50, barColor: 'from-violet-600/80 to-indigo-500/80 repeating-stripes' },
        { id: 'mock-p3', code: 'PROJETO 120-002-26', name: 'Projeto 120-002-26', startOffset: 5, width: 25, barColor: 'from-cyan-500 to-blue-500' },
        { id: 'mock-p4', code: 'PROJETO 080-003-26', name: 'Projeto 080-003-26', startOffset: 40, width: 45, barColor: 'from-teal-500 to-emerald-400' }
      ];

      if (list.length === 0) {
        return fallbacks;
      }

      const today = new Date();
      const windowStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
      const windowEnd = new Date(today.getFullYear(), today.getMonth() + 5, 0).getTime();
      const windowDuration = windowEnd - windowStart;

      const colors = [
        'from-violet-600 to-indigo-500',
        'from-cyan-500 to-blue-500',
        'from-teal-500 to-emerald-400',
        'from-fuchsia-600 to-pink-500'
      ];

      const mapped = list.map((p, idx) => {
        const pStart = p.startDate ? new Date(p.startDate + 'T12:00:00').getTime() : windowStart;
        const pEnd = p.deliveryDate ? new Date(p.deliveryDate + 'T12:00:00').getTime() : windowEnd;

        const startClamped = Math.max(windowStart, Math.min(windowEnd, pStart));
        const endClamped = Math.max(windowStart, Math.min(windowEnd, pEnd));

        const startOffsetPercent = ((startClamped - windowStart) / windowDuration) * 100;
        const endOffsetPercent = ((endClamped - windowStart) / windowDuration) * 100;
        const widthPercent = Math.max(8, endOffsetPercent - startOffsetPercent);

        return {
          id: p.id,
          code: p.code,
          name: p.name,
          startOffset: startOffsetPercent,
          width: widthPercent,
          barColor: colors[idx % colors.length]
        };
      });

      const finalProjects = [...mapped];
      for (let i = finalProjects.length; i < 4; i++) {
        finalProjects.push(fallbacks[i % fallbacks.length]);
      }

      return finalProjects.slice(0, 4);
    })();

    // Carga de equipe
    const teamWorkload = (() => {
      const activeUsers = allUsers.filter(u => u.isActive);
      const usersLoad = activeUsers.map(user => {
        const userTasksCount = activeProjects.filter(p => p.assigneeId === user.id).length;
        const userSubtasksCount = activeProjects.flatMap(p => (p.subtasks || []).filter(st => st.assigneeId === user.id)).length;
        const totalAssignments = userTasksCount + userSubtasksCount;

        let percentage = 0;
        let status: 'OK' | 'ALTO' | 'SOBRECARREGADO' = 'OK';
        let barColor = 'from-cyan-500 to-blue-500';
        let textColor = 'text-cyan-400';

        if (totalAssignments === 0) {
          percentage = 0;
          status = 'OK';
          barColor = 'from-slate-700 to-slate-600';
          textColor = 'text-slate-400';
        } else if (totalAssignments === 1) {
          percentage = 60;
          status = 'OK';
          barColor = 'from-emerald-500 to-teal-400';
          textColor = 'text-emerald-400';
        } else if (totalAssignments === 2) {
          percentage = 78;
          status = 'OK';
          barColor = 'from-emerald-500 to-teal-400';
          textColor = 'text-emerald-400';
        } else if (totalAssignments === 3) {
          percentage = 95;
          status = 'ALTO';
          barColor = 'from-amber-500 to-orange-400';
          textColor = 'text-amber-400';
        } else {
          percentage = 102;
          status = 'SOBRECARREGADO';
          barColor = 'from-rose-600 to-red-500';
          textColor = 'text-rose-500';
        }

        return {
          id: user.id,
          username: user.username,
          initial: user.username.charAt(0).toUpperCase(),
          percentage,
          status,
          barColor,
          textColor,
          totalAssignments
        };
      });

      usersLoad.sort((a, b) => b.percentage - a.percentage);

      const fallbackUsers = [
        { id: 'mock-1', username: 'Airon', initial: 'A', percentage: 85, status: 'OK' as const, barColor: 'from-cyan-500 to-blue-500', textColor: 'text-cyan-400', totalAssignments: 2 },
        { id: 'mock-2', username: 'Eduardo', initial: 'E', percentage: 102, status: 'SOBRECARREGADO' as const, barColor: 'from-rose-600 to-red-500', textColor: 'text-rose-500', totalAssignments: 4 },
        { id: 'mock-3', username: 'Jaqueline', initial: 'J', percentage: 78, status: 'OK' as const, barColor: 'from-emerald-500 to-teal-400', textColor: 'text-emerald-400', totalAssignments: 1 },
        { id: 'mock-4', username: 'Rafael', initial: 'R', percentage: 95, status: 'ALTO' as const, barColor: 'from-amber-500 to-orange-400', textColor: 'text-amber-400', totalAssignments: 3 },
        { id: 'mock-5', username: 'Lucas', initial: 'L', percentage: 60, status: 'OK' as const, barColor: 'from-emerald-500 to-teal-400', textColor: 'text-emerald-400', totalAssignments: 1 }
      ];

      const finalUsers = [...usersLoad];
      for (let i = finalUsers.length; i < 5; i++) {
        finalUsers.push(fallbackUsers[i % fallbackUsers.length]);
      }

      return finalUsers.slice(0, 5);
    })();

    const teamStats = (() => {
      const overloadedCount = teamWorkload.filter(u => u.status === 'SOBRECARREGADO').length;
      const highLoadCount = teamWorkload.filter(u => u.status === 'ALTO').length;
      const conflicts = overloadedCount + highLoadCount;
      const avgCapacity = Math.round(teamWorkload.reduce((sum, u) => sum + u.percentage, 0) / teamWorkload.length);
      return {
        overloadedCount,
        conflicts,
        avgCapacity
      };
    })();

    return (
      <div className="-m-8 p-8 min-h-[calc(100vh-4rem)] bg-[#081120] text-slate-100 flex flex-col items-center justify-between relative overflow-hidden transition-all duration-500 hud-grid">
        {/* ESTILOS INLINE PARA ANIMAÇÕES E EFEITOS HUD */}
        <style dangerouslySetInnerHTML={{__html: `
          .hud-grid {
            background-size: 40px 40px;
            background-image: 
              linear-gradient(to right, rgba(99, 102, 241, 0.03) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(99, 102, 241, 0.03) 1px, transparent 1px);
          }
          .repeating-stripes {
            background-image: repeating-linear-gradient(
              45deg,
              transparent,
              transparent 10px,
              rgba(255, 255, 255, 0.15) 10px,
              rgba(255, 255, 255, 0.15) 20px
            );
          }
          @keyframes barGrow {
            from { width: 0; }
          }
          .animate-bar-grow {
            animation: barGrow 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
          .glow-purple {
            box-shadow: 0 0 25px rgba(139, 92, 246, 0.15);
          }
          .glow-purple:hover {
            box-shadow: 0 0 35px rgba(139, 92, 246, 0.35);
          }
          .glow-green {
            box-shadow: 0 0 25px rgba(16, 185, 129, 0.15);
          }
          .glow-green:hover {
            box-shadow: 0 0 35px rgba(16, 185, 129, 0.35);
          }
        `}} />

        {/* BACKGROUND GLOWING ORBS */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-indigo-600/10 rounded-full blur-[120px] animate-pulse pointer-events-none" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-emerald-600/10 rounded-full blur-[120px] animate-pulse pointer-events-none delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/[0.03] rounded-full blur-[150px] pointer-events-none" />

        {/* CABEÇALHO FUTURISTA HUD */}
        <div className="text-center relative z-10 w-full max-w-2xl mt-4 mb-10 animate-in fade-in slide-in-from-top-10 duration-1000">
          <div className="relative inline-block px-12 py-5 border border-blue-500/20 bg-[#0b1426]/80 backdrop-blur-md rounded-2xl shadow-[0_0_40px_rgba(59,130,246,0.1)]">
            {/* Cantos chanfrados HUD */}
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-400 -translate-x-[1px] -translate-y-[1px]" />
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-400 translate-x-[1px] -translate-y-[1px]" />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-400 -translate-x-[1px] translate-y-[1px]" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-400 translate-x-[1px] translate-y-[1px]" />
            
            {/* Linhas brilhantes superior/inferior */}
            <div className="absolute top-0 left-12 right-12 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
            <div className="absolute bottom-0 left-12 right-12 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
            
            {/* Detalhes de nós laterais */}
            <div className="absolute -left-[4px] top-1/2 -translate-y-1/2 w-[7px] h-6 bg-cyan-500 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.7)]" />
            <div className="absolute -right-[4px] top-1/2 -translate-y-1/2 w-[7px] h-6 bg-cyan-500 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.7)]" />

            <span className="text-[10px] font-black tracking-[0.4em] text-cyan-400/80 uppercase block mb-1.5 animate-pulse">PERSPECPATH OPERATIONAL</span>
            
            <h1 className="text-4xl font-extrabold text-white tracking-[0.18em] uppercase mb-1 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
              CENTRAL DE <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.2)]">CRONOGRAMAS</span>
            </h1>
          </div>

          <p className="text-slate-400 dark:text-slate-400 font-medium text-xs tracking-[0.22em] uppercase mt-4 transition-colors">
            “Monitoramento operacional inteligente da equipe e projetos”
          </p>
        </div>

        {/* CARDS PRINCIPAIS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 w-full max-w-6xl relative z-10 my-4 flex-1">
          {/* CARD: FLUXO GERAL */}
          <div
            onClick={() => setViewMode('flow')}
            className="group cursor-pointer relative transition-all duration-300 transform hover:scale-[1.01] flex"
          >
            {/* Glow de fundo */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent rounded-[32px] opacity-60 group-hover:opacity-100 transition-opacity duration-500 blur-xl" />
            
            <div className="relative flex flex-col justify-between w-full bg-[#0a1122]/70 backdrop-blur-xl border border-indigo-500/25 rounded-[32px] p-8 hover:border-indigo-400/60 transition-all duration-500 glow-purple">
              {/* Moldura HUD interna */}
              <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-indigo-500/20 rounded-tr-[32px] pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b border-l border-indigo-500/20 rounded-bl-[32px] pointer-events-none" />

              <div>
                {/* Header Card */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/30 group-hover:bg-indigo-500/20 group-hover:scale-105 transition-all duration-500">
                      {/* Icone HUD de Fluxo */}
                      <svg className="w-7 h-7 text-indigo-400 drop-shadow-[0_0_6px_rgba(129,140,248,0.5)]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white uppercase tracking-wider transition-colors">
                        Fluxo <span className="text-indigo-400">Geral</span>
                      </h3>
                      <div className="h-[2px] w-8 bg-indigo-500/60 rounded-full mt-1" />
                    </div>
                  </div>
                  <span className="px-3.5 py-1 bg-indigo-500/10 border border-indigo-500/30 rounded-full text-[8px] font-black text-indigo-400 uppercase tracking-widest group-hover:bg-indigo-500/20 transition-all">
                    Visão Estratégica
                  </span>
                </div>

                <p className="text-slate-400 text-sm font-medium leading-relaxed mb-6">
                  Acompanhe o pulso operacional através da visão clássica de projetos e suas etapas críticas.
                </p>

                {/* PREVIEW DA LINHA DO TEMPO */}
                <div className="bg-[#050a14]/60 border border-indigo-500/10 rounded-2xl p-4 mb-6 relative">
                  <span className="text-[8px] font-black text-indigo-400/80 uppercase tracking-widest block mb-3">Linha do Tempo Geral</span>
                  
                  {/* Grid de Meses */}
                  <div className="grid grid-cols-5 gap-1 border-b border-indigo-500/10 pb-1.5 mb-2.5 text-center">
                    {previewMonths.map((m, idx) => (
                      <span key={idx} className="text-[8px] font-bold text-slate-500">
                        {m.label}
                      </span>
                    ))}
                  </div>

                  {/* Linhas de Projetos */}
                  <div className="space-y-2.5 relative min-h-[90px]">
                    {/* Linhas verticais pontilhadas da grid */}
                    <div className="absolute inset-0 grid grid-cols-5 gap-1 pointer-events-none">
                      <div className="border-r border-indigo-500/[0.03] h-full" />
                      <div className="border-r border-indigo-500/[0.03] h-full" />
                      <div className="border-r border-indigo-500/[0.03] h-full" />
                      <div className="border-r border-indigo-500/[0.03] h-full" />
                      <div className="h-full" />
                    </div>

                    {previewProjects.map((p, idx) => (
                      <div key={idx} className="flex flex-col relative z-10">
                        <div className="flex justify-between items-center text-[7px] text-slate-500 font-mono mb-0.5">
                          <span className="truncate max-w-[120px]">{p.name}</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-950/80 rounded-full overflow-hidden relative border border-indigo-500/[0.05]">
                          <div
                            style={{ left: `${p.startOffset}%`, width: `${p.width}%` }}
                            className={`absolute h-full rounded-full bg-gradient-to-r ${p.barColor} animate-bar-grow`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* KPIs & Rodapé Card */}
              <div>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="bg-indigo-950/20 border border-indigo-500/10 rounded-2xl p-2.5 flex items-center space-x-2.5">
                    <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center border border-indigo-500/20 text-indigo-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A9 9 0 0112 3v8.25m0 12.75V12a9 9 0 008.83-9.4m-17.66 0A9.001 9.001 0 0112 3v8.25m0 12.75a9 9 0 009-9M12 21.75a9.001 9.001 0 01-9-9" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-lg font-extrabold text-white leading-tight">{activeProjects.length}</p>
                      <p className="text-[7px] font-black text-indigo-300/60 uppercase tracking-widest">Ativos</p>
                    </div>
                  </div>
                  
                  <div className="bg-rose-950/20 border border-rose-500/10 rounded-2xl p-2.5 flex items-center space-x-2.5">
                    <div className="w-8 h-8 bg-rose-500/10 rounded-lg flex items-center justify-center border border-rose-500/20 text-rose-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-lg font-extrabold text-white leading-tight">{delayedProjectsCount}</p>
                      <p className="text-[7px] font-black text-rose-300/60 uppercase tracking-widest">Atrasados</p>
                    </div>
                  </div>

                  <div className="bg-emerald-950/20 border border-emerald-500/10 rounded-2xl p-2.5 flex items-center space-x-2.5">
                    <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/20 text-emerald-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-lg font-extrabold text-white leading-tight">{healthPercentage}%</p>
                      <p className="text-[7px] font-black text-emerald-300/60 uppercase tracking-widest">Saúde Ops</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-indigo-500/10 pt-5">
                  <span className="px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[9px] font-black text-indigo-400 uppercase tracking-widest group-hover:bg-indigo-500/20 transition-all">
                    Alta Performance
                  </span>
                  <div className="flex items-center text-white font-extrabold text-xs uppercase tracking-widest group-hover:text-indigo-400 transition-colors">
                    Explorar Visão 
                    <svg className="w-4 h-4 ml-2 transform group-hover:translate-x-1.5 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CARD: TIME & CARGA */}
          <div
            onClick={() => setViewMode('assignments')}
            className="group cursor-pointer relative transition-all duration-300 transform hover:scale-[1.01] flex"
          >
            {/* Glow de fundo */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent rounded-[32px] opacity-60 group-hover:opacity-100 transition-opacity duration-500 blur-xl" />
            
            <div className="relative flex flex-col justify-between w-full bg-[#0a1122]/70 backdrop-blur-xl border border-emerald-500/25 rounded-[32px] p-8 hover:border-emerald-400/60 transition-all duration-500 glow-green">
              {/* Moldura HUD interna */}
              <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-emerald-500/20 rounded-tr-[32px] pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b border-l border-emerald-500/20 rounded-bl-[32px] pointer-events-none" />

              <div>
                {/* Header Card */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/30 group-hover:bg-emerald-500/20 group-hover:scale-105 transition-all duration-500">
                      {/* Icone HUD de Carga */}
                      <svg className="w-7 h-7 text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.5)]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white uppercase tracking-wider transition-colors">
                        Time <span className="text-emerald-400">& Carga</span>
                      </h3>
                      <div className="h-[2px] w-8 bg-emerald-500/60 rounded-full mt-1" />
                    </div>
                  </div>
                  <span className="px-3.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-[8px] font-black text-emerald-400 uppercase tracking-widest group-hover:bg-emerald-500/20 transition-all">
                    Visão Analítica
                  </span>
                </div>

                <p className="text-slate-400 text-sm font-medium leading-relaxed mb-6">
                  Visualize a distribuição de tarefas por profissional e identifique gargalos de produtividade em tempo real.
                </p>

                {/* PREVIEW DE DISTRIBUIÇÃO DA EQUIPE */}
                <div className="bg-[#050a14]/60 border border-emerald-500/10 rounded-2xl p-4 mb-6 relative">
                  <span className="text-[8px] font-black text-emerald-400/80 uppercase tracking-widest block mb-3">Distribuição da Equipe</span>

                  {/* Linhas de Usuários */}
                  <div className="space-y-2.5">
                    {teamWorkload.map((u, idx) => (
                      <div key={idx} className="flex items-center justify-between space-x-3">
                        <div className="flex items-center space-x-2 w-[80px]">
                          <div className="w-5 h-5 rounded-full bg-slate-900 border border-emerald-500/25 flex items-center justify-center text-[8px] font-bold text-slate-300">
                            {u.initial}
                          </div>
                          <span className="text-[9px] font-semibold text-slate-300 truncate">{u.username}</span>
                        </div>
                        
                        {/* Barra */}
                        <div className="flex-1 h-2 bg-slate-950/80 rounded-full overflow-hidden border border-emerald-500/[0.05]">
                          <div
                            style={{ width: `${Math.min(100, u.percentage)}%` }}
                            className={`h-full rounded-full bg-gradient-to-r ${u.barColor} animate-bar-grow`}
                          />
                        </div>
                        
                        {/* Valor e Badge */}
                        <div className="flex items-center justify-end space-x-2 w-[70px]">
                          <span className="text-[9px] font-bold text-slate-200">{u.percentage}%</span>
                          <span className={`text-[6px] font-black uppercase tracking-wider py-0.5 px-1 bg-slate-950/80 rounded border border-white/5 ${u.textColor}`}>
                            {u.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* KPIs & Rodapé Card */}
              <div>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="bg-amber-950/20 border border-amber-500/10 rounded-2xl p-2.5 flex items-center space-x-2.5">
                    <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center border border-amber-500/20 text-amber-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-lg font-extrabold text-white leading-tight">{teamStats.conflicts}</p>
                      <p className="text-[7px] font-black text-amber-300/60 uppercase tracking-widest">Conflitos</p>
                    </div>
                  </div>

                  <div className="bg-teal-950/20 border border-teal-500/10 rounded-2xl p-2.5 flex items-center space-x-2.5">
                    <div className="w-8 h-8 bg-teal-500/10 rounded-lg flex items-center justify-center border border-teal-500/20 text-teal-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-lg font-extrabold text-white leading-tight">{teamStats.avgCapacity}%</p>
                      <p className="text-[7px] font-black text-teal-300/60 uppercase tracking-widest">Capacidade</p>
                    </div>
                  </div>

                  <div className="bg-rose-950/20 border border-rose-500/10 rounded-2xl p-2.5 flex items-center space-x-2.5">
                    <div className="w-8 h-8 bg-rose-500/10 rounded-lg flex items-center justify-center border border-rose-500/20 text-rose-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.386 11.386 0 0110.089 21c-2.24 0-4.303-.647-6.04-1.758V19.13c0-1.113.285-2.16.786-3.07M15 19.128v-.109m-5.4-3.55a5.004 5.004 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-lg font-extrabold text-white leading-tight">{teamStats.overloadedCount}</p>
                      <p className="text-[7px] font-black text-rose-300/60 uppercase tracking-widest">Sobrecargas</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-emerald-500/10 pt-5">
                  <span className="px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[9px] font-black text-emerald-400 uppercase tracking-widest group-hover:bg-emerald-500/20 transition-all">
                    Visão Analítica
                  </span>
                  <div className="flex items-center text-white font-extrabold text-xs uppercase tracking-widest group-hover:text-emerald-400 transition-colors">
                    Explorar Visão 
                    <svg className="w-4 h-4 ml-2 transform group-hover:translate-x-1.5 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BARRA INFORMATIVA HUD NO RODAPÉ */}
        <div className="w-full max-w-6xl mt-8 mb-4 bg-[#0a1122]/60 border border-blue-500/10 rounded-2xl p-4 relative overflow-hidden shadow-2xl z-10">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/25 to-transparent" />
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex items-start space-x-3.5">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                </svg>
              </div>
              <div>
                <h4 className="text-[10px] font-black text-slate-200 uppercase tracking-widest">Dados em Tempo Real</h4>
                <p className="text-[9px] text-slate-400 font-medium leading-relaxed mt-0.5">Informações sempre atualizadas para decisões assertivas.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3.5">
              <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                </svg>
              </div>
              <div>
                <h4 className="text-[10px] font-black text-slate-200 uppercase tracking-widest">Gestão Inteligente</h4>
                <p className="text-[9px] text-slate-400 font-medium leading-relaxed mt-0.5">Automação e análise para máxima eficiência do fluxo.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3.5">
              <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.61 6.51m5.98 7.86a14.98 14.98 0 01-6.16 12.12m6.16-12.12c-1.12-1.12-2.56-1.74-4.05-1.74-1.49 0-2.93.62-4.05 1.74M9.61 6.51a14.98 14.98 0 00-6.16 12.12A14.98 14.98 0 0015.59 14.37M9.61 6.51c-1.12 1.12-1.74 2.56-1.74 4.05 0 1.49.62 2.93 1.74 4.05" />
                </svg>
              </div>
              <div>
                <h4 className="text-[10px] font-black text-slate-200 uppercase tracking-widest">Foco no que Importa</h4>
                <p className="text-[9px] text-slate-400 font-medium leading-relaxed mt-0.5">Visibilidade clara do que impulsiona seus resultados.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <div>
                <h4 className="text-[10px] font-black text-slate-200 uppercase tracking-widest">Segurança Total</h4>
                <p className="text-[9px] text-slate-400 font-medium leading-relaxed mt-0.5">Seus dados protegidos com padrões de excelência.</p>
              </div>
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
                  const hasSubtasks = project.subtasks && project.subtasks.length > 0;

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
                          {hasSubtasks ? (
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
                            <div className="w-9" /> // Espaço vazio para alinhar se não tiver subtasks
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
                            <div
                              style={{ left: `${offset}px`, width: `${width}px` }}
                              className={`absolute top-1/2 -translate-y-1/2 h-7 rounded-full shadow-lg border-b-2 transition-all duration-300 hover:brightness-110 dark:hover:brightness-125 z-20 cursor-pointer ${getStatusColor(project.status)} border-white/5 flex items-center px-3`}
                              onClick={() => openEdit(project)}
                            >
                              <div className={`w-2 h-2 rounded-full mr-2 shrink-0 shadow-sm ${getProjectMarkerColor(project.id)}`} />
                              <span className="text-[9px] font-black text-white/90 truncate uppercase tracking-tighter">
                                {project.name}
                              </span>
                              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl opacity-0 group-hover/row:opacity-100 transition-all transform translate-y-2 group-hover/row:translate-y-0 z-[100] pointer-events-none shadow-xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)] min-w-[240px] ring-1 ring-slate-200 dark:ring-white/10">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">{project.code}</p>
                                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${getStatusColor(project.status)} text-white`}>{project.status}</span>
                                </div>
                                <p className="text-xs font-bold text-slate-900 dark:text-white mb-3 leading-tight whitespace-normal">{project.name}</p>
                                <div className="grid grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-800 pt-3">
                                  <div><p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase mb-1">Início</p><p className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{start?.toLocaleDateString('pt-BR')}</p></div>
                                  <div><p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase mb-1">Entrega</p><p className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{end?.toLocaleDateString('pt-BR')}</p></div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* RENDERIZAÇÃO DAS SUB-TAREFAS SE EXPANDIDO */}
                      {isExpanded && project.subtasks?.map((st) => {
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
                            {/* Sidebar Sub-tarefa */}
                            <div className="w-80 pl-16 pr-6 h-12 flex flex-col justify-center border-r border-slate-100 dark:border-slate-700/80 shrink-0 sticky left-0 z-40 bg-white/95 dark:bg-[#1e293b]/95 backdrop-blur-sm border-l-4 border-indigo-500/10 transition-colors">
                              <h5 className="text-[11px] font-bold text-slate-600 dark:text-slate-400 truncate leading-tight transition-colors">{st.name}</h5>
                              <p className="text-[8px] text-slate-400 dark:text-slate-600 font-black uppercase tracking-widest mt-0.5 transition-colors">
                                {allUsers.find(u => u.id === st.assigneeId)?.username.split(' ')[0] || 'S/ RESP.'}
                              </p>
                            </div>

                            {/* Timeline Sub-tarefa */}
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
                                <div
                                  style={{ left: `${stOffset}px`, width: `${stWidth}px` }}
                                  className={`absolute top-1/2 -translate-y-1/2 h-4 rounded-full shadow-sm transition-all duration-300 hover:brightness-125 z-20 ${getStatusColor(st.status)} opacity-80 hover:opacity-100 flex items-center px-2`}
                                >
                                  <div className={`w-1.5 h-1.5 rounded-full mr-1.5 shrink-0 ${getProjectMarkerColor(project.id)}`} />
                                  <span className="text-[7px] font-black text-white/90 truncate uppercase tracking-tighter">
                                    {st.name}
                                  </span>
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-3 bg-slate-900 border border-slate-700 rounded-xl opacity-0 group-hover/sub:opacity-100 transition-all transform translate-y-1 group-hover/sub:translate-y-0 z-[100] pointer-events-none shadow-2xl min-w-[180px] ring-1 ring-white/5">
                                    <div className="flex items-center justify-between mb-1.5">
                                      <div className="flex flex-col">
                                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">SUB-TAREFA</p>
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
                                  </div>
                                </div>
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
                  const userTasks = activeProjects.filter(p => p.assigneeId === user.id).map(p => ({ ...p, type: 'project' }));
                  const userSubtasks = activeProjects.flatMap(p =>
                    (p.subtasks || [])
                      .filter(st => st.assigneeId === user.id)
                      .map(st => ({ ...st, type: 'subtask', parentProject: p }))
                  );
                  const userActivities = (db.tasks || [])
                    .filter(t => t.assigneeId === user.id || (t.invitedUsers && t.invitedUsers.includes(user.id)))
                    .map(t => ({
                      ...t,
                      type: 'activity',
                      activityType: t.type,
                      deliveryDate: t.endDate,
                      name: t.title,
                      status: 'ACTIVITY'
                    }));
                  const allAssignments = [...userTasks, ...userSubtasks, ...userActivities];
                  const projectsAndSubtasks = [...userTasks, ...userSubtasks];
                  const distinctProjectsCount = new Set(projectsAndSubtasks.map(a => a.type === 'project' ? a.id : a.parentProject?.id)).size;
                  const activitiesCount = userActivities.length;

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

                  // Detectar conflitos por dia (Apenas entre PROJETOS DISTINTOS)
                  const conflictMap = new Map();
                  timelineDates.forEach(date => {
                    const distinctRootProjectIds = new Set();

                    allAssignments.forEach((t: any) => {
                      if (t.type === 'activity') return; // Ignorar atividades para conflitos
                      if (t.status === ProjectStatus.DONE || t.status === ProjectStatus.CANCELED) return;

                      const s = new Date(t.startDate + 'T12:00:00');
                      const e = new Date(t.deliveryDate + 'T12:00:00');
                      if (date >= s && date <= e) {
                        const rootId = t.type === 'subtask' ? t.parentProject.id : t.id;
                        distinctRootProjectIds.add(rootId);
                      }
                    });

                    if (distinctRootProjectIds.size > 1) {
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
                            {activitiesCount > 0 && (
                              <p className="text-[9px] text-indigo-500/60 font-black uppercase tracking-widest flex items-center">
                                <span className="w-1 h-1 rounded-full bg-indigo-500 mr-1.5" />
                                {activitiesCount} {activitiesCount === 1 ? 'Atividade' : 'Atividades'}
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
                          const isSubtask = task.type === 'subtask';
                          const barHeight = isSubtask ? 'h-5' : 'h-8';
                          const topPos = 16 + (task.laneIndex * 42) + (isSubtask ? 6 : 0);
                          return (
                            <div
                              key={task.id}
                              style={{ left: `${offset}px`, width: `${width}px`, top: `${topPos}px` }}
                              className={`absolute ${barHeight} rounded-full shadow-lg border-b-2 transition-all duration-300 hover:brightness-125 z-20 hover:z-50 cursor-pointer ${getStatusColor(task.status)} border-white/5 opacity-80 hover:opacity-100 flex items-center px-3 group/task active:scale-95`}
                              onClick={() => {
                                if (task.type === 'project') openEdit(task);
                                else if (task.type === 'subtask') openEdit(task.parentProject);
                                else if (task.type === 'activity') openEditTeamTask(task);
                              }}
                            >
                               <div className={`w-2 h-2 rounded-full mr-2 shrink-0 shadow-sm ${getProjectMarkerColor(task.type === 'project' ? task.id : task.type === 'subtask' ? task.parentProject.id : task.id)}`} />
                              <span className="text-[8px] font-black text-white/90 truncate uppercase tracking-tighter flex items-center gap-1.5">
                                {task.type === 'activity' && (
                                  <span className="px-1 py-0.2 bg-white/20 text-white rounded-[4px] text-[7px] font-black uppercase tracking-wider shrink-0 border border-white/10">
                                    TAREFA
                                  </span>
                                )}
                                <span className="truncate">
                                  {task.type === 'subtask' 
                                    ? `[ST] ${task.name}` 
                                    : task.type === 'activity'
                                      ? (task.startTime ? `${task.startTime} - ${task.name}` : task.name)
                                      : task.name}
                                </span>
                              </span>

                              {/* TOOLTIP ATRIBUIÇÃO */}
                              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 p-4 bg-slate-900 border border-slate-700 rounded-2xl opacity-0 group-hover/task:opacity-100 transition-all transform translate-y-2 group-hover/task:translate-y-0 z-[100] pointer-events-none shadow-[0_20px_50px_rgba(0,0,0,0.6)] min-w-[220px] ring-1 ring-white/10">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex flex-col">
                                    <p className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.2em]">
                                      {task.type === 'project' ? 'PROJETO PAI' : task.type === 'subtask' ? 'SUB-TAREFA' : 'TAREFA / BLOQUEIO'}
                                    </p>
                                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-0.5">
                                      {task.type === 'project' ? (task as any).code : task.type === 'subtask' ? (task as any).parentProject?.code : (task as any).activityType || task.type}
                                    </p>
                                  </div>
                                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${getStatusColor(task.status)} text-white`}>{task.status === 'ACTIVITY' ? 'AVULSA' : task.status}</span>
                                </div>
                                <p className="text-xs font-bold text-white mb-1 leading-tight whitespace-normal">{task.name}</p>
                                {task.type === 'subtask' && <p className="text-[9px] text-slate-500 font-black uppercase mb-3 truncate">Ref: {task.parentProject?.name}</p>}
                                {task.type === 'activity' && (
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
                                    {task.type === 'activity' && task.startTime && (
                                      <p className="text-[10px] font-bold text-indigo-400 mt-0.5">{task.startTime}</p>
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Entrega</p>
                                    <p className="text-[10px] font-bold text-slate-300">{end?.toLocaleDateString('pt-BR')}</p>
                                    {task.type === 'activity' && task.endTime && (
                                      <p className="text-[10px] font-bold text-indigo-400 mt-0.5">{task.endTime}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
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
                    <input type="date" value={startDate} disabled={currentUser.role === UserRole.VIEWER} onChange={e => setStartDate(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none transition-colors disabled:opacity-60" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 block transition-colors">Entrega</label>
                    <input type="date" value={deliveryDate} disabled={currentUser.role === UserRole.VIEWER} onChange={e => setDeliveryDate(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none transition-colors disabled:opacity-60" />
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
                    <input type="text" value={revision} disabled={currentUser.role === UserRole.VIEWER} onChange={e => setRevision(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none transition-colors disabled:opacity-60" />
                  </div>
                </div>

                {/* EDIÇÃO DE SUB-TAREFAS */}
                {subtasks.length > 0 && (
                  <div className="pt-6 border-t border-slate-100 dark:border-slate-800 transition-colors">
                    <h4 className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-4 transition-colors">Cronograma de Sub-tarefas</h4>
                    <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar transition-colors">
                      {subtasks.map((st, idx) => (
                        <div key={st.id} className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50 p-4 rounded-2xl transition-colors">
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-bold text-slate-900 dark:text-white uppercase truncate flex-1 mr-4 transition-colors">{st.name}</span>
                            <div className="flex items-center space-x-3">
                              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest hidden md:block">Status Etapa</label>
                              <select
                                value={st.status}
                                disabled={currentUser.role === UserRole.VIEWER}
                                onChange={e => {
                                  const newSts = [...subtasks];
                                  newSts[idx] = { ...st, status: e.target.value as ProjectStatus };
                                  setSubtasks(newSts);
                                }}
                                className={`px-2 py-1 rounded-[6px] text-[8px] font-black uppercase text-white outline-none cursor-pointer transition-all hover:brightness-110 shadow-sm ${getStatusColor(st.status)} border border-white/10 disabled:opacity-60`}
                              >
                                {Object.values(ProjectStatus).map(s => <option key={s} value={s} className="bg-slate-900 dark:bg-slate-900 border-none">{s}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <label className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Início ST</label>
                              <input
                                type="date"
                                min={startDate}
                                max={deliveryDate}
                                value={st.startDate || ''}
                                disabled={currentUser.role === UserRole.VIEWER}
                                onChange={e => {
                                  const newSts = [...subtasks];
                                  newSts[idx] = { ...st, startDate: e.target.value };
                                  setSubtasks(newSts);
                                }}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-[10px] text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition-colors disabled:opacity-60"
                              />
                            </div>
                            <div>
                              <label className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Entrega ST</label>
                              <input
                                type="date"
                                min={st.startDate || startDate}
                                max={deliveryDate}
                                value={st.deliveryDate || ''}
                                disabled={currentUser.role === UserRole.VIEWER}
                                onChange={e => {
                                  const newSts = [...subtasks];
                                  newSts[idx] = { ...st, deliveryDate: e.target.value };
                                  setSubtasks(newSts);
                                }}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-[10px] text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition-colors disabled:opacity-60"
                              />
                            </div>
                            <div>
                              <label className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Responsável ST</label>
                              <select
                                value={st.assigneeId || ''}
                                disabled={currentUser.role === UserRole.VIEWER}
                                onChange={e => {
                                  const newSts = [...subtasks];
                                  newSts[idx] = { ...st, assigneeId: e.target.value };
                                  setSubtasks(newSts);
                                }}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-[10px] text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition-colors disabled:opacity-60"
                              >
                                <option value="">Sem responsável</option>
                                {allUsers.map(u => (
                                  <option key={u.id} value={u.id}>{u.username}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
    const parentId = task.type === 'project' ? task.id : task.type === 'subtask' ? task.parentProject.id : 'activities';
    if (!acc[parentId]) {
      acc[parentId] = {
        project: task.type === 'project' ? task : task.type === 'subtask' ? task.parentProject : { id: 'activities', name: 'Tarefas / Bloqueios Avulsos', code: 'ATIVIDADES', status: 'ACTIVITY' },
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
