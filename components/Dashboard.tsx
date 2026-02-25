import React, { useMemo, useState } from 'react';
import { ProjectStatus, Project, InternalUser, Client } from '../types';
import { AppDB } from '../storage';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts';
import { Info, CheckCircle2, TrendingUp, Users, Clock, AlertTriangle, Calendar, Trophy, Medal, Eye, ArrowRight } from 'lucide-react';

interface DashboardProps {
  db: AppDB;
  theme?: 'dark' | 'light';
}

const InfoTooltip: React.FC<{ title: string; content: string; calculation?: string; position?: 'top' | 'bottom' }> = ({
  title, content, calculation, position = 'top'
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block ml-2 group/info">
      <button
        type="button"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
      >
        <Info size={14} />
      </button>
      {isOpen && (
        <div className={`absolute ${position === 'top' ? 'bottom-full mb-2 slide-in-from-bottom-2' : 'top-full mt-2 slide-in-from-top-2'} left-1/2 -translate-x-1/2 p-4 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.7)] z-[200] w-72 pointer-events-none animate-in fade-in duration-200 ring-1 ring-slate-200 dark:ring-white/10`}>
          <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-2 border-b border-slate-100 dark:border-slate-800 pb-2">{title}</p>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed mb-3">{content}</p>
          {calculation && (
            <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
              <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter mb-1">Base de Cálculo:</p>
              <p className="text-[10px] text-indigo-600 dark:text-indigo-300/80 font-mono italic">{calculation}</p>
            </div>
          )}
          <div className={`absolute ${position === 'top' ? 'top-full border-t-white dark:border-t-[#0f172a]' : 'bottom-full border-b-white dark:border-b-[#0f172a]'} left-1/2 -translate-x-1/2 border-8 border-transparent`}></div>
        </div>
      )}
    </div>
  );
};
const UserDetailModal: React.FC<{
  userId: string;
  userName: string;
  projects: Project[];
  clients: Client[];
  onClose: () => void;
}> = ({ userId, userName, projects, clients, onClose }) => {
  const titularProjects = projects.filter(p =>
    p.assigneeId === userId && [ProjectStatus.QUEUE, ProjectStatus.IN_PROGRESS, ProjectStatus.PAUSED].includes(p.status)
  );

  const userSubtasks = projects.flatMap(p =>
    (p.subtasks || [])
      .filter(st => st.assigneeId === userId && st.status !== ProjectStatus.DONE && st.status !== ProjectStatus.CANCELED)
      .map(st => ({ ...st, parentProjectName: p.name, parentProjectCode: p.code }))
  );

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'Cliente não encontrado';
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y.slice(-2)}`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-[#0f172a] rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-white/5 flex flex-col max-h-[85vh] transition-all">
        {/* Header */}
        <div className="px-8 py-6 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl text-indigo-600 dark:text-indigo-400">
              <Users size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">{userName}</h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mt-1">Detalhamento de Carga Ativa</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300 dark:hover:bg-white/20 transition-all active:scale-95"
          >
            <ArrowRight size={20} className="rotate-180" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-10">
          {/* Projetos Principais (Onde ele é o titular) */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-2">Responsável Principal ({titularProjects.length})</h4>
            <div className="grid gap-3">
              {titularProjects.map(p => (
                <div key={p.id} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 p-5 rounded-[32px] flex flex-col group hover:border-indigo-500/30 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{p.name}</span>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-[10px] font-mono font-black text-indigo-600/60 dark:text-indigo-400/50 uppercase">#{p.code}</span>
                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-md">REV.{p.revision || '00'}</span>
                      </div>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${p.status === ProjectStatus.IN_PROGRESS ? 'bg-indigo-500/10 text-indigo-500' :
                      p.status === ProjectStatus.QUEUE ? 'bg-slate-500/10 text-slate-500' :
                        'bg-purple-500/10 text-purple-500'
                      }`}>
                      {p.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200/50 dark:border-white/5">
                    <div className="flex items-center space-x-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/40"></div>
                      <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-tight truncate max-w-[200px]">{getClientName(p.clientId)}</span>
                    </div>
                    {p.deliveryDate && (
                      <div className="flex items-center space-x-1.5 text-slate-500">
                        <Calendar size={10} className="text-indigo-500/60" />
                        <span className="text-[9px] font-black uppercase tracking-tighter">{formatDate(p.deliveryDate)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {titularProjects.length === 0 && (
                <div className="text-center py-4 text-slate-300 dark:text-slate-700 italic text-[10px] font-black uppercase tracking-widest opacity-40">Nenhum projeto sob titularidade</div>
              )}
            </div>
          </div>

          {/* Subtarefas Designadas */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-2">Subtarefas em Execução ({userSubtasks.length})</h4>
            <div className="grid gap-3">
              {userSubtasks.map(st => (
                <div key={st.id} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 p-5 rounded-[32px] flex flex-col group hover:border-emerald-500/30 transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{st.name}</span>
                      {st.deliveryDate && (
                        <div className="flex items-center space-x-1.5 text-emerald-600/60 dark:text-emerald-400/40 mt-1">
                          <Calendar size={10} />
                          <span className="text-[9px] font-black uppercase tracking-tighter">Entrega: {formatDate(st.deliveryDate)}</span>
                        </div>
                      )}
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${st.status === ProjectStatus.IN_PROGRESS ? 'bg-emerald-500/10 text-emerald-500' :
                      st.status === ProjectStatus.QUEUE ? 'bg-slate-500/10 text-slate-500' :
                        'bg-purple-500/10 text-purple-500'
                      }`}>
                      {st.status}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 bg-white/40 dark:bg-white/5 p-2 rounded-xl border border-slate-200/50 dark:border-white/5">
                    <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Projeto:</span>
                    <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300 uppercase truncate">{st.parentProjectName}</span>
                    <span className="text-[9px] font-mono font-black text-indigo-500/40 dark:text-indigo-400/30">({st.parentProjectCode})</span>
                  </div>
                </div>
              ))}
              {userSubtasks.length === 0 && (
                <div className="text-center py-4 text-slate-300 dark:text-slate-700 italic text-[10px] font-black uppercase tracking-widest opacity-40">Nenhuma subtarefa designada</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({ db, theme = 'dark' }) => {
  const [selectedWeekOffset, setSelectedWeekOffset] = useState(0);
  const [viewingUser, setViewingUser] = useState<any>(null);
  const projects = db.projects || [];
  const users = db.users || [];
  const clients = db.clients || [];
  const now = new Date();
  const next7Days = new Date();
  next7Days.setDate(now.getDate() + 7);

  // 1. Métricas de Saúde
  const activeProjects = projects.filter((p: Project) =>
    [ProjectStatus.QUEUE, ProjectStatus.IN_PROGRESS, ProjectStatus.PAUSED].includes(p.status)
  );

  const overdueProjects = projects.filter((p: Project) => {
    if (!p.deliveryDate || p.status === ProjectStatus.DONE || p.status === ProjectStatus.CANCELED) return false;
    const [y, m, d] = p.deliveryDate.split('-').map(Number);
    return new Date(y, m - 1, d) < now;
  });

  const health = useMemo(() => {
    if (activeProjects.length === 0) return 100;
    const overdueWeight = overdueProjects.length / activeProjects.length;
    return Math.max(0, Math.min(100, Math.round((1 - overdueWeight) * 100)));
  }, [activeProjects, overdueProjects]);

  // 2. Projetos da Próxima Semana
  const upcomingProjects = projects.filter((p: Project) => {
    if (!p.deliveryDate || p.status === ProjectStatus.DONE || p.status === ProjectStatus.CANCELED) return false;
    const [y, m, d] = p.deliveryDate.split('-').map(Number);
    const due = new Date(y, m - 1, d);
    return due >= now && due <= next7Days;
  });

  // 3. Eficiência por Usuário (Acumulativa: Projetos + Sub-tarefas)
  const userEfficiencyData = useMemo(() => {
    const data: Record<string, {
      name: string;
      projectsDone: number;
      subtasksDone: number;
      totalAssigned: number;
      efficiency: number;
    }> = {};

    users.forEach(u => {
      data[u.id] = {
        name: u.username,
        projectsDone: 0,
        subtasksDone: 0,
        totalAssigned: 0,
        efficiency: 0
      };
    });

    projects.forEach(p => {
      // 1. Validar Projetos
      if (p.assigneeId && data[p.assigneeId]) {
        if (p.status !== ProjectStatus.CANCELED) {
          data[p.assigneeId].totalAssigned++;
          if (p.status === ProjectStatus.DONE) {
            data[p.assigneeId].projectsDone++;
          }
        }
      }

      // 2. Validar Sub-tarefas
      p.subtasks?.forEach(st => {
        if (st.assigneeId && data[st.assigneeId]) {
          if (st.status !== ProjectStatus.CANCELED) {
            data[st.assigneeId].totalAssigned++;
            if (st.status === ProjectStatus.DONE) {
              data[st.assigneeId].subtasksDone++;
            }
          }
        }
      });
    });

    return Object.values(data).map(d => {
      const totalDone = d.projectsDone + d.subtasksDone;
      return {
        ...d,
        totalDone,
        efficiency: d.totalAssigned > 0 ? Math.round((totalDone / d.totalAssigned) * 100) : 0
      };
    }).sort((a, b) => b.totalDone - a.totalDone);
  }, [projects, users]);

  // 4. Tendência Mensal (Criados vs Concluídos)
  const monthlyTimeline = useMemo(() => {
    const months: Record<string, { month: string; created: number; done: number }> = {};
    const last6Months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short' });
      months[key] = { month: label, created: 0, done: 0 };
      last6Months.push(key);
    }

    projects.forEach(p => {
      const date = new Date(p.createdAt || Date.now());
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (months[key]) months[key].created++;

      if (p.status === ProjectStatus.DONE) {
        // Para simplificar, assumimos que projetcs marcados como DONE foram concluidos no mes atual se nao houver data de conclusao real
        const doneDate = new Date(p.deliveryDate ? (p.deliveryDate + 'T12:00:00') : (p.createdAt || Date.now()));
        const doneKey = `${doneDate.getFullYear()}-${String(doneDate.getMonth() + 1).padStart(2, '0')}`;
        if (months[doneKey]) months[doneKey].done++;
      }
    });

    return last6Months.map(key => months[key]);
  }, [projects]);

  // 5. Matriz de Carga Estratégica (Acumulativa: Titularidade + Sub-tarefas)
  const userStatusMatrix = useMemo(() => {
    const matrix: Record<string, { id: string; name: string; mainProjects: number; subtasks: number; stats: Record<string, number> }> = {};

    users.forEach(u => {
      matrix[u.username] = {
        id: u.id,
        name: u.username,
        mainProjects: 0,
        subtasks: 0,
        stats: {
          [ProjectStatus.QUEUE]: 0,
          [ProjectStatus.IN_PROGRESS]: 0,
          [ProjectStatus.PAUSED]: 0
        }
      };
    });

    activeProjects.forEach((p: Project) => {
      // 1. Usuário é o Responsável Principal (Titular)
      if (p.assigneeId) {
        const user = users.find(u => u.id === p.assigneeId);
        if (user) {
          matrix[user.username].mainProjects++;
          matrix[user.username].stats[p.status]++;
        }
      }

      // 2. Sub-tarefas ativas
      p.subtasks?.forEach(st => {
        const isActiveST = st.status !== ProjectStatus.DONE && st.status !== ProjectStatus.CANCELED;
        if (st.assigneeId && isActiveST) {
          const user = users.find(u => u.id === st.assigneeId);
          if (user) {
            matrix[user.username].subtasks++;
            matrix[user.username].stats[st.status]++;
          }
        }
      });
    });

    return Object.entries(matrix).filter(([_, data]) => data.mainProjects > 0 || data.subtasks > 0);
  }, [activeProjects, users]);

  // 6. Média de Tempo de Execução (Dias)
  const avgExecutionTime = useMemo(() => {
    const completed = projects.filter((p: Project) => p.status === ProjectStatus.DONE && p.startDate && p.deliveryDate);
    if (completed.length === 0) return 0;
    const totalDays = completed.reduce((acc: number, p: Project) => {
      const start = new Date(p.startDate!);
      const end = new Date(p.deliveryDate!);
      return acc + (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    }, 0);
    return Math.round(totalDays / completed.length);
  }, [projects]);

  // 7. Ranking Top 10 Clientes (Completo para Tabela)
  const rankingTopClients = useMemo(() => {
    const data: Record<string, { count: number; code: string }> = {};
    projects.forEach(p => {
      const client = clients.find(c => c.id === p.clientId);
      if (client) {
        if (!data[client.name]) data[client.name] = { count: 0, code: client.code || 'CLI' };
        data[client.name].count++;
      }
    });
    return Object.entries(data)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);
  }, [projects, clients]);

  // 8. Concentração de Clientes (Pie Data)
  const clientConcentrationData = useMemo(() => {
    const data: Record<string, number> = {};
    projects.forEach(p => {
      const client = clients.find(c => c.id === p.clientId);
      const name = client ? client.name : 'Outros';
      data[name] = (data[name] || 0) + 1;
    });
    return Object.entries(data)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5); // Top 5 e Agrupar outros
  }, [projects, clients]);

  // 9. Dashboard 2.0: NOVAS MÉTRICAS ESTRATÉGICAS
  const dashboard2Logics = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);

    // Vazão (Throughput)
    const createdLast7 = projects.filter(p => new Date(p.createdAt || Date.now()) >= sevenDaysAgo).length;
    const doneLast7 = projects.filter(p => p.status === ProjectStatus.DONE && new Date(p.deliveryDate || Date.now()) >= sevenDaysAgo).length;
    const throughputFactor = createdLast7 > 0 ? (doneLast7 / createdLast7) : 1;

    // Risco de Inércia (Entrega em < 48h e ainda na Fila)
    const fortyEightHours = new Date();
    fortyEightHours.setHours(now.getHours() + 48);
    const inertiaRiskCount = activeProjects.filter(p => {
      if (p.status !== ProjectStatus.QUEUE || !p.deliveryDate) return false;
      return new Date(p.deliveryDate) <= fortyEightHours;
    }).length;

    // 4. Métrica de Carga Unificada (Projetos + Sub-tarefas)
    const userWorkloadSummary = users.map(u => {
      const projectsOnRadar = new Set<string>();
      let activeTasksCount = 0;

      activeProjects.forEach(p => {
        let isUserInvolved = false;
        if (p.assigneeId === u.id) {
          isUserInvolved = true;
          activeTasksCount++;
        }

        p.subtasks?.forEach(st => {
          if (st.assigneeId === u.id && st.status !== ProjectStatus.DONE && st.status !== ProjectStatus.CANCELED) {
            isUserInvolved = true;
            activeTasksCount++;
          }
        });

        if (isUserInvolved) {
          projectsOnRadar.add(p.id);
        }
      });

      return {
        userId: u.id,
        projectsCount: projectsOnRadar.size,
        tasksCount: activeTasksCount
      };
    });

    // Filtros de Risco Reais
    const fragmentedUsersCount = userWorkloadSummary.filter(w => w.projectsCount >= 4).length; // Muita troca de projeto
    const overloadedUsersCount = userWorkloadSummary.filter(w => w.tasksCount >= 6).length; // Muita tarefa total (Projetos + ST)

    // Conflitos de Escala (Sobreposição temporal de projetos diferentes para o mesmo usuário)
    let scaleConflictsCount = 0;
    users.forEach(u => {
      const uAssignments: any[] = [];
      projects.forEach(p => {
        if (p.assigneeId === u.id && p.startDate && p.deliveryDate && p.status !== ProjectStatus.DONE) {
          uAssignments.push({ id: p.id, start: new Date(p.startDate + 'T12:00:00'), end: new Date(p.deliveryDate + 'T12:00:00'), rootId: p.id });
        }
        p.subtasks?.forEach(st => {
          if (st.assigneeId === u.id && st.startDate && st.deliveryDate && st.status !== ProjectStatus.DONE) {
            uAssignments.push({ id: st.id, start: new Date(st.startDate + 'T12:00:00'), end: new Date(st.deliveryDate + 'T12:00:00'), rootId: p.id });
          }
        });
      });

      // Checar sobreposições entre PROJETOS DIFERENTES
      let hasConflict = false;
      for (let i = 0; i < uAssignments.length; i++) {
        for (let j = i + 1; j < uAssignments.length; j++) {
          const a = uAssignments[i];
          const b = uAssignments[j];
          if (a.rootId !== b.rootId) { // Só conflita se forem de projetos pais diferentes
            if (a.start <= b.end && b.start <= a.end) {
              hasConflict = true;
              break;
            }
          }
        }
        if (hasConflict) break;
      }
      if (hasConflict) scaleConflictsCount++;
    });

    // 10. Capacidade Operacional da Equipe (Semanal com Previsibilidade)
    const activeUsers_Capacity = users.filter(u => u.isActive);

    let teamCapacity;
    if (activeUsers_Capacity.length === 0) {
      teamCapacity = {
        percentage: 0,
        occupied: 0,
        total: 0,
        userDetails: [],
        weekRange: { start: '--/--', end: '--/--' }
      };
    } else {
      // Base de cálculo ajustada: se hoje é Sab(6) ou Dom(0), a semana 0 começa na próxima Segunda
      const baseDate = new Date(now);
      const currentDay = baseDate.getDay();

      // Ajuste para garantir que a S0 comece na segunda-feira atual ou na próxima (se fds)
      const startOfS0 = new Date(baseDate);
      const diffToMonday = currentDay === 0 ? 1 : (currentDay === 6 ? 2 : 1 - currentDay);
      startOfS0.setDate(baseDate.getDate() + diffToMonday);
      startOfS0.setHours(0, 0, 0, 0);

      // Range da semana selecionada (Offset 0 a 4)
      const startOfWeek = new Date(startOfS0);
      startOfWeek.setDate(startOfS0.getDate() + (selectedWeekOffset * 7));

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 4); // Sexta
      endOfWeek.setHours(23, 59, 59, 999);

      const totalAvailableDays = activeUsers_Capacity.length * 5;
      let totalOccupiedDays = 0;

      const userDetails = activeUsers_Capacity.map(u => {
        let userWorkDays = 0;

        const calculateDays = (startStr: string, endStr: string) => {
          const start = new Date(startStr + 'T00:00:00');
          const end = new Date(endStr + 'T23:59:59');
          const overlapStart = new Date(Math.max(start.getTime(), startOfWeek.getTime()));
          const overlapEnd = new Date(Math.min(end.getTime(), endOfWeek.getTime()));
          let days = 0;
          if (overlapStart <= overlapEnd) {
            const current = new Date(overlapStart);
            while (current <= overlapEnd) {
              const dow = current.getDay();
              if (dow !== 0 && dow !== 6) days++;
              current.setDate(current.getDate() + 1);
            }
          }
          return days;
        };

        projects.forEach(p => {
          // Atividade principal do projeto
          if (p.assigneeId === u.id && p.status !== ProjectStatus.DONE && p.status !== ProjectStatus.CANCELED && p.startDate && p.deliveryDate) {
            userWorkDays += calculateDays(p.startDate, p.deliveryDate);
          }
          // Subtarefas
          p.subtasks?.forEach(st => {
            if (st.assigneeId === u.id && st.status !== ProjectStatus.DONE && st.status !== ProjectStatus.CANCELED && st.startDate && st.deliveryDate) {
              userWorkDays += calculateDays(st.startDate, st.deliveryDate);
            }
          });
        });
        totalOccupiedDays += userWorkDays;
        return {
          id: u.id,
          name: u.username,
          occupied: userWorkDays,
          percentage: Math.round((userWorkDays / 5) * 100)
        };
      });

      teamCapacity = {
        percentage: Math.round((totalOccupiedDays / totalAvailableDays) * 100),
        occupied: totalOccupiedDays,
        total: totalAvailableDays,
        userDetails,
        weekRange: {
          start: startOfWeek.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          end: endOfWeek.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        }
      };
    }

    return {
      throughput: { created: createdLast7, done: doneLast7, factor: throughputFactor },
      inertia: inertiaRiskCount,
      fragmentation: fragmentedUsersCount,
      overloaded: overloadedUsersCount,
      conflicts: scaleConflictsCount,
      teamCapacity
    };
  }, [projects, activeProjects, users, selectedWeekOffset]);

  const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f97316', '#10b981'];

  const getHealthColor = (h: number) => {
    if (h > 80) return 'text-emerald-500';
    if (h > 50) return 'text-amber-500';
    return 'text-rose-500';
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-12 relative">
      {/* BACKGROUND DE ALTA TECNOLOGIA */}
      <div className="fixed inset-0 pointer-events-none opacity-20 dark:opacity-20 overflow-hidden z-[-1]">
        <div className="absolute inset-0 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px]"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-transparent to-slate-50 dark:from-[#0f172a] dark:via-transparent dark:to-[#0f172a]"></div>
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 3px, transparent 3px)' }}></div>
      </div>

      {/* SEÇÃO 1: SAÚDE DO ESCRITÓRIO */}
      <div className="bg-white dark:bg-[#1e293b]/40 backdrop-blur-3xl p-12 rounded-[56px] shadow-xl dark:shadow-[0_0_80px_rgba(0,0,0,0.4)] border border-slate-200 dark:border-white/5 relative group overflow-hidden transition-all duration-500">
        {/* AURA DE SAÚDE DINÂMICA */}
        <div className={`absolute -top-24 -right-24 w-96 h-96 blur-[120px] opacity-10 dark:opacity-20 transition-all duration-1000 ${health > 80 ? 'bg-emerald-500' : health > 50 ? 'bg-amber-500' : 'bg-rose-500'}`}></div>

        <div className="absolute top-0 right-0 p-12 opacity-[0.03] dark:opacity-5 pointer-events-none transition-opacity group-hover:opacity-10 scale-150">
          <TrendingUp className="w-48 h-48 text-indigo-500" />
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-12 relative z-10">
          <div className="flex flex-col items-start">
            <h3 className="text-[12px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-4 px-2 flex items-center transition-colors">
              Saúde Estratégica
              <InfoTooltip
                title="Saúde da Operação"
                content="Métrica de integridade que reflete a pontualidade das entregas ativas. Quanto maior a porcentagem, menos atrasos críticos existem no sistema."
                calculation="(Total_Ativos - Total_Atrasados) / Total_Ativos * 100"
                position="bottom"
              />
            </h3>
            <span className={`text-[10rem] leading-none font-black tracking-tighter transition-all duration-1000 drop-shadow-2xl ${getHealthColor(health)}`}>
              {health}%
            </span>
          </div>

          <div className="flex-1 lg:max-w-4xl w-full pt-10">
            <div className="flex justify-between mb-6 px-4">
              <span className="text-[11px] font-black text-rose-500 uppercase tracking-[0.2em]">Crítico</span>
              <span className="text-[11px] font-black text-amber-500 uppercase tracking-[0.2em]">Estável</span>
              <span className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.2em]">Excelente</span>
            </div>

            <div className="h-12 w-full bg-slate-100 dark:bg-slate-900/90 rounded-3xl overflow-hidden relative border-2 border-slate-200 dark:border-slate-700 shadow-inner dark:shadow-[inset_0_4px_12px_rgba(0,0,0,0.6)] p-1.5 transition-colors duration-500">
              <div className="absolute inset-0 bg-gradient-to-r from-rose-900 via-amber-900 to-emerald-900 opacity-5 dark:opacity-20"></div>
              <div
                className={`h-full rounded-2xl transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] relative shadow-lg dark:shadow-[0_0_30px_rgba(0,0,0,0.7)] ${health > 80 ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : health > 50 ? 'bg-gradient-to-r from-amber-600 to-amber-400' : 'bg-gradient-to-r from-rose-700 to-rose-500'}`}
                style={{ width: `${health}%` }}
              >
                <div className="absolute top-0 right-0 bottom-0 w-3 bg-white/30 blur-[2px] animate-pulse"></div>
                <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent"></div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 pt-12 mt-12 border-t border-slate-200 dark:border-slate-800/80 relative z-10 transition-colors duration-500">
          <div className="text-center group/card">
            <p className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase mb-3 tracking-[0.2em] transition-colors group-hover/card:text-indigo-600 dark:group-hover/card:text-indigo-400">Ciclo Médio</p>
            <p className="text-4xl font-black text-slate-900 dark:text-white transition-colors">{avgExecutionTime} <span className="text-[14px] text-slate-400 dark:text-slate-600 font-bold uppercase tracking-tighter">dias</span></p>
          </div>
          <div className="text-center border-l border-slate-200 dark:border-slate-800/80 group/card transition-colors">
            <p className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase mb-3 tracking-[0.2em] transition-colors group-hover/card:text-rose-600 dark:group-hover/card:text-rose-400">Prazos Expirados</p>
            <p className="text-4xl font-black text-rose-500">{overdueProjects.length}</p>
          </div>
          <div className="text-center border-l border-slate-200 dark:border-slate-800/80 group/card transition-colors">
            <p className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase mb-3 tracking-[0.2em] transition-colors group-hover/card:text-indigo-600 dark:group-hover/card:text-indigo-400">Em Aberto</p>
            <p className="text-4xl font-black text-indigo-600 dark:text-indigo-400 transition-colors">{activeProjects.length}</p>
          </div>
          <div className="text-center border-l border-slate-200 dark:border-slate-800/80 group/card transition-colors">
            <p className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase mb-3 tracking-[0.2em] transition-colors group-hover/card:text-emerald-600 dark:group-hover/card:text-emerald-400">Concluído</p>
            <p className="text-4xl font-black text-emerald-500">{projects.filter((p: any) => p.status === ProjectStatus.DONE).length}</p>
          </div>
        </div>
      </div>

      {/* SEÇÃO 2: INTELIGÊNCIA DE GESTÃO (DASHBOARD 2.0) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* VAZÃO OPERACIONAL */}
        <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl p-8 rounded-[40px] border border-slate-200 dark:border-white/5 relative group transition-all duration-300 shadow-sm dark:shadow-none">
          <div className="absolute inset-0 rounded-[40px] overflow-hidden pointer-events-none">
            <div className="absolute -bottom-4 -right-4 opacity-[0.03] dark:opacity-5 group-hover:opacity-10 transition-opacity">
              <TrendingUp size={100} />
            </div>
          </div>
          <div className="relative z-10">
            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center transition-colors">
              Vazão Operacional
              <InfoTooltip title="Efficiency Throughput" content="Saldo de projetos concluídos vs criados nos últimos 7 dias. Um saldo negativo indica que a carga de trabalho está crescendo mais rápido que as entregas." />
            </h4>
            <div className="flex items-end space-x-4">
              <span className={`text-5xl font-black transition-colors ${dashboard2Logics.throughput.factor >= 1 ? 'text-emerald-500' : 'text-amber-500'}`}>
                {Math.round(dashboard2Logics.throughput.factor * 100)}%
              </span>
              <div className="flex flex-col pb-1">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase transition-colors">{dashboard2Logics.throughput.done} entregas</span>
                <span className="text-[10px] font-black text-slate-300 dark:text-slate-400 uppercase transition-colors">vs {dashboard2Logics.throughput.created} novos</span>
              </div>
            </div>
          </div>
        </div>

        {/* RISCO DE INÉRCIA */}
        <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl p-8 rounded-[40px] border border-slate-200 dark:border-white/5 relative group text-center lg:text-left transition-all duration-300 shadow-sm dark:shadow-none">
          <div className="absolute inset-0 rounded-[40px] overflow-hidden pointer-events-none">
            <div className="absolute -bottom-2 -right-2 opacity-[0.03] dark:opacity-5 group-hover:opacity-10 transition-opacity">
              <Clock size={80} />
            </div>
          </div>
          <div className="relative z-10">
            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center justify-center lg:justify-start transition-colors">
              Risco de Inércia
              <InfoTooltip title="Inertia Alert" content="Projetos que têm entrega em menos de 48 horas e ainda permanecem no status 'Fila'. Exige mobilização imediata do time." />
            </h4>
            <div className="flex flex-col lg:flex-row items-center space-y-4 lg:space-y-0 lg:space-x-6">
              <span className={`text-5xl font-black transition-colors ${dashboard2Logics.inertia > 0 ? 'text-rose-500 animate-pulse' : 'text-slate-200 dark:text-slate-700'}`}>
                {dashboard2Logics.inertia}
              </span>
              <p className="text-[11px] font-bold text-slate-400 dark:text-slate-400 uppercase leading-tight transition-colors">
                {dashboard2Logics.inertia === 1 ? 'Projeto pendente' : 'Projetos pendentes'} <br />em fila crítica
              </p>
            </div>
          </div>
        </div>

        {/* ÍNDICE DE RISCOS DE ESCALA */}
        <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl p-8 rounded-[40px] border border-slate-200 dark:border-white/5 relative group transition-all duration-300 shadow-sm dark:shadow-none">
          <div className="absolute inset-0 rounded-[40px] overflow-hidden pointer-events-none">
            <div className="absolute -bottom-2 -right-2 opacity-[0.03] dark:opacity-5 group-hover:opacity-10 transition-opacity">
              <Users size={80} />
            </div>
          </div>
          <div className="relative z-10">
            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center transition-colors">
              Riscos de Escala
              <InfoTooltip title="Análise de Carga" content="Fragmentação: Profissionais com >3 projetos (dispersão). Sobrecarga: Profissionais com >5 tarefas ativas (excesso de volume). Conflito: Sobreposição temporal real entre projetos." />
            </h4>
            <div className="flex items-center justify-between">
              <div className="flex flex-col items-center">
                <span className={`text-3xl font-black transition-colors ${dashboard2Logics.fragmentation > 0 ? 'text-amber-500' : 'text-slate-200 dark:text-slate-800'}`}>
                  {dashboard2Logics.fragmentation}
                </span>
                <p className="text-[7px] font-black text-slate-400 dark:text-slate-500 uppercase mt-1 tracking-widest text-center transition-colors">Filtro</p>
              </div>
              <div className="flex flex-col items-center">
                <span className={`text-3xl font-black transition-colors ${dashboard2Logics.overloaded > 0 ? 'text-orange-500' : 'text-slate-200 dark:text-slate-800'}`}>
                  {dashboard2Logics.overloaded}
                </span>
                <p className="text-[7px] font-black text-slate-400 dark:text-slate-500 uppercase mt-1 tracking-widest text-center transition-colors">Carga</p>
              </div>
              <div className="flex flex-col items-center">
                <span className={`text-3xl font-black transition-colors ${dashboard2Logics.conflicts > 0 ? 'text-rose-500' : 'text-slate-200 dark:text-slate-800'}`}>
                  {dashboard2Logics.conflicts}
                </span>
                <p className="text-[7px] font-black text-slate-400 dark:text-slate-500 uppercase mt-1 tracking-widest text-center transition-colors">Conflito</p>
              </div>
            </div>
          </div>
        </div>

        {/* --- CARD EXPANDIDO: CAPACIDADE OPERACIONAL PREVISIVA --- */}
        <div className="lg:col-span-3 bg-white dark:bg-[#1e293b]/40 backdrop-blur-3xl p-10 rounded-[48px] border border-slate-200 dark:border-white/10 shadow-xl dark:shadow-2xl relative group overflow-hidden transition-all duration-500">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all duration-1000"></div>

          <div className="relative z-10">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-10">
              <div>
                <h3 className="text-[12px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.4em] mb-2 px-2 flex items-center transition-colors">
                  Capacidade Operacional da Equipe
                  <InfoTooltip
                    title="Saturação da Equipe"
                    content="Percentual de ocupação baseado em 5 dias úteis por usuário ativo. Soma o tempo de todos os projetos e subtarefas pendentes alocados na semana selecionada."
                    calculation="(Dias_Atribuídos_Semana / (Usuários_Ativos * 5)) * 100"
                  />
                </h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest px-2 transition-colors">Sincronizado com Ciclo Médio de {avgExecutionTime} dias</p>
              </div>

              {/* Seletor de Semanas */}
              <div className="flex bg-slate-100 dark:bg-slate-900/80 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700/50 shadow-inner transition-colors duration-500">
                {[0, 1, 2, 3, 4].map(w => (
                  <button
                    key={w}
                    onClick={() => setSelectedWeekOffset(w)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all flex flex-col items-center min-w-[64px] ${selectedWeekOffset === w
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                      }`}
                  >
                    <span>{w === 0 ? 'Atual' : `Sêman. ${w}`}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              {/* Resumo Global */}
              <div className="lg:col-span-5 flex items-center space-x-8 border-r border-slate-100 dark:border-slate-800/50 pr-8 transition-colors duration-500">
                <div className="relative">
                  <svg className="w-32 h-32 transform -rotate-90 drop-shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                    <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-100 dark:text-slate-800 transition-colors" />
                    <circle
                      cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="12" fill="transparent"
                      className={`transition-all duration-1000 ${dashboard2Logics.teamCapacity.percentage > 100 ? 'text-rose-500' :
                        dashboard2Logics.teamCapacity.percentage > 95 ? 'text-orange-500' :
                          dashboard2Logics.teamCapacity.percentage > 80 ? 'text-amber-500' :
                            'text-emerald-500'
                        }`}
                      strokeDasharray={351.8}
                      strokeDashoffset={351.8 - (351.8 * Math.min(100, dashboard2Logics.teamCapacity.percentage)) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black text-slate-900 dark:text-white transition-colors">{dashboard2Logics.teamCapacity.percentage}%</span>
                    <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter transition-colors">Global</span>
                  </div>
                </div>

                <div className="flex-1 space-y-4">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest transition-colors">Ocupação</span>
                    <span className="text-xl font-black text-slate-900 dark:text-white transition-colors">{dashboard2Logics.teamCapacity.occupied} <span className="text-[10px] text-slate-400 dark:text-slate-500">dias</span></span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest transition-colors">Disponível</span>
                    <span className="text-xl font-black text-slate-300 dark:text-slate-700 transition-colors">{dashboard2Logics.teamCapacity.total} <span className="text-[10px] opacity-40">dias</span></span>
                  </div>
                  <div className={`text-center py-2 px-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border shadow-sm transition-all ${dashboard2Logics.teamCapacity.percentage > 100 ? 'bg-rose-500/10 text-rose-500 border-rose-500/20 animate-pulse' :
                    dashboard2Logics.teamCapacity.percentage > 95 ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                      dashboard2Logics.teamCapacity.percentage > 80 ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                        'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    }`}>
                    {dashboard2Logics.teamCapacity.percentage > 100 ? 'Sobrecarga Crítica' :
                      dashboard2Logics.teamCapacity.percentage > 95 ? 'Limite de Segurança' :
                        dashboard2Logics.teamCapacity.percentage > 80 ? 'Atenção Necessária' :
                          'Fluxo Saudável'}
                  </div>
                </div>
              </div>

              {/* Detalhamento por Usuário */}
              <div className="lg:col-span-7">
                <div className="flex items-center justify-between mb-6">
                  <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest transition-colors">Análise Individual ({dashboard2Logics.teamCapacity.weekRange.start} - {dashboard2Logics.teamCapacity.weekRange.end})</p>
                  <p className="text-[9px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest transition-colors">Capacidade / Semana</p>
                </div>
                <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                  {dashboard2Logics.teamCapacity.userDetails.map((u: any) => (
                    <div key={u.id} className="group/user">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase truncate pr-4 transition-colors">{u.name}</span>
                        <span className={`text-[10px] font-black ${u.percentage > 100 ? 'text-rose-500' : u.percentage > 80 ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'
                          } transition-colors`}>{u.percentage}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden border border-slate-200 dark:border-white/5 transition-colors duration-500">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ${u.percentage > 100 ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.3)]' :
                            u.percentage > 80 ? 'bg-amber-500' :
                              'bg-slate-300 dark:bg-slate-700 group-hover/user:bg-indigo-500'
                            }`}
                          style={{ width: `${Math.min(100, u.percentage)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {dashboard2Logics.teamCapacity.userDetails.length === 0 && (
                    <div className="col-span-2 text-center py-4 text-slate-300 dark:text-slate-700 italic text-[10px] font-black uppercase tracking-widest opacity-40">Sem dados de alocação para este período</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>


      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* TENDÊNCIA DE PRODUÇÃO - NOVO */}
        <div className="lg:col-span-2 bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl rounded-[40px] shadow-sm dark:shadow-2xl border border-slate-200 dark:border-white/5 flex flex-col min-h-[400px] transition-all duration-500">
          <div className="px-10 py-8 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between rounded-t-[40px] transition-colors">
            <h3 className="font-black text-[12px] uppercase tracking-[0.25em] text-slate-900 dark:text-white flex items-center transition-colors">
              Tendência de Fluxo
              <InfoTooltip
                title="Entradas vs Saídas"
                content="Analisa o fluxo de trabalho comparando novos registros com projetos finalizados ao longo do semestre."
                calculation="Projetos_Criados_Mes vs Projetos_Done_Mes"
              />
            </h3>
            <TrendingUp size={20} className="text-indigo-600 dark:text-indigo-500" />
          </div>
          <div className="p-8 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTimeline} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={theme === 'dark' ? 0.3 : 0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorDone" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={theme === 'dark' ? 0.3 : 0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#2a374a' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: theme === 'dark' ? '#64748b' : '#94a3b8', fontSize: 10, fontWeight: 900 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: theme === 'dark' ? '#64748b' : '#94a3b8', fontSize: 10, fontWeight: 900 }} />
                <RechartsTooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff', border: `1px solid ${theme === 'dark' ? '#1e293b' : '#e2e8f0'}`, borderRadius: '12px', color: theme === 'dark' ? '#ffffff' : '#0f172a' }} />
                <Area type="monotone" dataKey="created" name="Criados" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorCreated)" />
                <Area type="monotone" dataKey="done" name="Concluídos" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorDone)" />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', textTransform: 'uppercase', fontWeight: 900, color: theme === 'dark' ? '#64748b' : '#94a3b8' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CONCENTRAÇÃO DE CLIENTES - NOVO */}
        <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl rounded-[40px] shadow-sm dark:shadow-2xl border border-slate-200 dark:border-white/5 flex flex-col min-h-[400px] transition-all duration-500">
          <div className="px-10 py-8 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between rounded-t-[40px] transition-colors">
            <h3 className="font-black text-[12px] uppercase tracking-[0.25em] text-slate-900 dark:text-white flex items-center transition-colors">
              Concentração
              <InfoTooltip
                title="Volume por Cliente"
                content="Identifica a pulverização ou dependência de clientes específicos dentro do portfólio."
                calculation="Projetos_por_Cliente / Projetos_Totais * 100"
              />
            </h3>
            <PieChart size={20} className="text-indigo-600 dark:text-indigo-500" />
          </div>
          <div className="p-4 flex-1 flex flex-col items-center justify-center min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={clientConcentrationData}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                  cx="50%"
                  cy="45%"
                >
                  {clientConcentrationData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff', border: `1px solid ${theme === 'dark' ? '#1e293b' : '#e2e8f0'}`, borderRadius: '12px', color: theme === 'dark' ? '#ffffff' : '#0f172a' }} />
                <Legend
                  layout="horizontal"
                  align="center"
                  verticalAlign="bottom"
                  iconType="circle"
                  wrapperStyle={{
                    fontSize: '9px',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    paddingTop: '20px',
                    color: theme === 'dark' ? '#64748b' : '#94a3b8'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* EFICIÊNCIA DO TIME - NOVO (BarChart Recharts) */}
        <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl rounded-[40px] shadow-sm dark:shadow-2xl border border-slate-200 dark:border-white/5 min-h-[450px] flex flex-col transition-all duration-500">
          <div className="px-10 py-8 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between rounded-t-[40px] transition-colors">
            <h3 className="font-black text-[12px] uppercase tracking-[0.25em] text-slate-900 dark:text-white flex items-center transition-colors">
              Eficiência Operacional
              <InfoTooltip
                title="Sincronia de Entregas"
                content="Mede a taxa de conclusão comparando tudo o que foi atribuído (Projetos + Subtarefas) com o que foi efetivamente entregue."
                calculation="(Projetos_Done + Subtarefas_Done) / Total_Atribuído * 100"
              />
            </h3>
            <CheckCircle2 size={20} className="text-emerald-500" />
          </div>
          <div className="p-8 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={userEfficiencyData} layout="vertical" margin={{ left: 40, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#2a374a' : '#e2e8f0'} horizontal={true} vertical={false} />
                <XAxis type="number" hide domain={[0, 'dataMax + 2']} />
                <YAxis
                  dataKey="name"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  tick={(props) => {
                    const { x, y, payload } = props;
                    const userData = userEfficiencyData.find(d => d.name === payload.value);
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <text x={-10} y={0} dy={4} textAnchor="end" fill={theme === 'dark' ? '#94a3b8' : '#64748b'} fontSize={10} fontWeight={900}>
                          {payload.value}
                        </text>
                        <text x={-10} y={12} dy={4} textAnchor="end" fill={theme === 'dark' ? '#6366f1' : '#4f46e5'} fontSize={9} fontWeight={900} opacity={0.6}>
                          {userData?.efficiency}% EFF
                        </text>
                      </g>
                    );
                  }}
                  width={100}
                />
                <RechartsTooltip
                  cursor={{ fill: theme === 'dark' ? '#334155' : '#f1f5f9', opacity: 0.1 }}
                  contentStyle={{ backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff', border: `1px solid ${theme === 'dark' ? '#1e293b' : '#e2e8f0'}`, borderRadius: '12px' }}
                  itemStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}
                  labelStyle={{ fontSize: '11px', fontWeight: 900, marginBottom: '8px', color: theme === 'dark' ? '#fff' : '#000' }}
                />
                <Bar dataKey="totalAssigned" name="Atribuído Total" fill={theme === 'dark' ? '#ffffff' : '#000000'} opacity={0.03} barSize={20} radius={[0, 10, 10, 0]} isAnimationActive={false} />
                <Bar dataKey="projectsDone" name="Projetos" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} barSize={20} />
                <Bar dataKey="subtasksDone" name="Subtarefas" stackId="a" fill="#10b981" opacity={0.4} radius={[0, 10, 10, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CARGA ATIVA POR USUÁRIO (Melhorado com Stacked Bar) */}
        <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl rounded-[40px] shadow-sm dark:shadow-2xl border border-slate-200 dark:border-white/5 flex flex-col transition-all duration-500">
          <div className="px-10 py-8 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between rounded-t-[40px] transition-colors">
            <h3 className="font-black text-[12px] uppercase tracking-[0.25em] text-slate-900 dark:text-white flex items-center transition-colors">
              Carga Ativa por Usuário
              <InfoTooltip
                title="Distribuição de Status"
                content="Visão em tempo real da alocação do time, separando o que está parado, o que está em produção e o que aguarda início."
                calculation="Agrupamento(Status) por Usuário"
              />
            </h3>
            <Users size={20} className="text-indigo-600 dark:text-indigo-500" />
          </div>
          <div className="p-10 flex-1 overflow-y-auto max-h-[400px] custom-scrollbar">
            <div className="space-y-10">
              {userStatusMatrix.map(([name, data]) => {
                const projectCount = data.mainProjects;
                const subtaskCount = data.subtasks;
                const totalItems = projectCount + subtaskCount;

                return (
                  <div key={name} className="group">
                    <div className="flex justify-between items-end mb-4">
                      <div className="flex flex-col">
                        <div className="flex items-center space-x-2 group-hover:translate-x-1 transition-transform">
                          <span className="text-[11px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-[0.2em] transition-colors group-hover:text-indigo-600 dark:group-hover:text-indigo-400 mb-0">{name}</span>
                          <button
                            onClick={() => setViewingUser(data)}
                            className="p-1 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-md hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          >
                            <Eye size={12} />
                          </button>
                        </div>
                        <div className="flex items-center space-x-3 mt-3">
                          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg border border-indigo-100 dark:border-indigo-500/20">
                            <span className="text-[11px] font-black text-indigo-700 dark:text-indigo-300">{projectCount}</span>
                            <span className="text-[8px] font-bold text-indigo-600 dark:text-indigo-400/70 uppercase tracking-widest">{projectCount === 1 ? 'Projeto' : 'Projetos'}</span>
                          </div>
                          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg border border-emerald-100 dark:border-emerald-500/20">
                            <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-300">{subtaskCount}</span>
                            <span className="text-[8px] font-bold text-emerald-600 dark:text-emerald-400/70 uppercase tracking-widest">{subtaskCount === 1 ? 'Subtarefa' : 'Subtarefas'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <span className="text-[14px] font-black text-slate-900 dark:text-white transition-colors leading-none">{totalItems}</span>
                        <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Total Ativo</span>
                      </div>
                    </div>
                    <div className="h-4 w-full flex rounded-xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-inner dark:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] bg-slate-50 dark:bg-slate-900/40 p-0.5 transition-colors duration-500">
                      <div className="bg-slate-300 dark:bg-slate-700/60 h-full rounded-l-lg transition-all duration-700 hover:brightness-110 dark:hover:brightness-125 border-r border-white/5" style={{ width: `${(data.stats[ProjectStatus.QUEUE] / totalItems) * 100}%` }}></div>
                      <div className="bg-indigo-600 h-full transition-all duration-700 hover:brightness-110 dark:hover:brightness-125 shadow-lg border-r border-white/5" style={{ width: `${(data.stats[ProjectStatus.IN_PROGRESS] / totalItems) * 100}%` }}></div>
                      <div className="bg-purple-600 h-full rounded-r-lg transition-all duration-700 hover:brightness-110 dark:hover:brightness-125" style={{ width: `${(data.stats[ProjectStatus.PAUSED] / totalItems) * 100}%` }}></div>
                    </div>
                  </div>
                );
              })}
              {userStatusMatrix.length === 0 && (
                <div className="h-64 flex flex-col items-center justify-center text-slate-400 font-black uppercase text-[12px] tracking-widest italic opacity-40">Sem colaboradores ativos</div>
              )}
            </div>
            <div className="mt-12 flex justify-center space-x-8 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-3xl border border-slate-200 dark:border-slate-800/80 transition-colors duration-500">
              <div className="flex items-center transition-colors"><div className="w-3 h-3 bg-slate-300 dark:bg-slate-700 rounded-full mr-3 border border-slate-200 dark:border-white/10"></div><span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Fila</span></div>
              <div className="flex items-center"><div className="w-3 h-3 bg-indigo-600 rounded-full mr-3 shadow-[0_0_8px_rgba(79,70,229,0.4)]"></div><span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Andamento</span></div>
              <div className="flex items-center"><div className="w-3 h-3 bg-purple-600 rounded-full mr-3 shadow-[0_0_8px_rgba(147,51,234,0.4)]"></div><span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Pausado</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* RADAR DE ATRASOS */}
        <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl rounded-[40px] shadow-sm dark:shadow-2xl border border-slate-200 dark:border-white/5 flex flex-col transition-all duration-500">
          <div className="px-10 py-8 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-rose-50 dark:bg-rose-500/10 rounded-t-[40px] transition-colors">
            <h3 className="font-black text-[12px] uppercase tracking-[0.2em] text-rose-600 dark:text-rose-500 flex items-center transition-colors">
              <AlertTriangle size={16} className="mr-4 text-rose-500 animate-pulse" />
              Prazos Expirados
              <InfoTooltip
                title="Alertas de Atraso"
                content="Identifica projetos ativos que já ultrapassaram a data de entrega pactuada, exigindo atenção imediata."
                calculation="Filtro(Active_Projects onde Delivery_Date < Hoje)"
              />
            </h3>
            <span className="text-sm font-black text-rose-600 dark:text-rose-500 bg-rose-100 dark:bg-rose-500/10 px-4 py-1.5 rounded-full ring-1 ring-rose-300 dark:ring-rose-500/30 transition-colors">{overdueProjects.length}</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/50 max-h-[450px] overflow-y-auto custom-scrollbar transition-colors">
            {overdueProjects.length === 0 ? (
              <div className="p-20 text-center text-slate-400 dark:text-slate-700 font-black uppercase tracking-widest text-[11px] italic opacity-40">Operação em Dia</div>
            ) : overdueProjects.map((p: Project) => (
              <div key={p.id} className="p-10 hover:bg-rose-50 dark:hover:bg-rose-500/[0.05] transition-colors group">
                <div className="flex justify-between items-center">
                  <div className="flex flex-col min-w-0 pr-4">
                    <h4 className="text-base font-black text-slate-900 dark:text-white truncate uppercase tracking-tighter group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">{p.name}</h4>
                    <p className="text-[12px] text-slate-400 dark:text-slate-500 font-mono font-black uppercase tracking-[0.1em] mt-2 transition-colors">{p.code}</p>
                  </div>
                  <div className="text-right shrink-0 pl-6">
                    <span className="text-xl font-black text-rose-600 dark:text-rose-500 drop-shadow-[0_0_10px_rgba(244,63,94,0.3)] transition-colors">{p.deliveryDate?.split('-').reverse().slice(0, 2).join('/')}</span>
                    <div className="mt-2 text-right">
                      <span className="inline-block text-[9px] text-rose-600 uppercase font-black tracking-widest bg-rose-100 dark:bg-rose-500/10 px-4 py-1.5 rounded-full ring-1 ring-rose-200 dark:ring-rose-500/20 transition-colors">ATRASO</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* PRÓXIMAS ENTREGAS */}
        <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl rounded-[40px] shadow-sm dark:shadow-2xl border border-slate-200 dark:border-white/5 flex flex-col transition-all duration-500">
          <div className="px-10 py-8 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-emerald-50 dark:bg-emerald-500/10 rounded-t-[40px] transition-colors">
            <h3 className="font-black text-[12px] uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 flex items-center transition-colors">
              <Calendar size={16} className="mr-4 text-emerald-500" />
              Próximos 7 Dias
              <InfoTooltip
                title="Planejamento Semanal"
                content="Calendário de entregas previstas para a semana atual, para organização da carga de faturamento e revisão."
                calculation="Filtro(Projetos onde Delivery_Date está entre Hoje e +7 dias)"
              />
            </h3>
            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 px-4 py-1.5 rounded-full ring-1 ring-emerald-300 dark:ring-emerald-500/30 transition-colors">{upcomingProjects.length}</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/50 max-h-[450px] overflow-y-auto custom-scrollbar transition-colors">
            {upcomingProjects.length === 0 ? (
              <div className="p-20 text-center text-slate-400 dark:text-slate-700 font-black uppercase tracking-widest text-[11px] italic opacity-40">Sem Entregas Agendadas</div>
            ) : upcomingProjects.map((p: Project) => (
              <div key={p.id} className="p-10 hover:bg-emerald-50 dark:hover:bg-emerald-500/[0.05] transition-colors group">
                <div className="flex justify-between items-center">
                  <div className="flex flex-col min-w-0 pr-4">
                    <h4 className="text-base font-black text-slate-900 dark:text-white truncate uppercase tracking-tighter group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{p.name}</h4>
                    <p className="text-[12px] text-slate-400 dark:text-slate-500 font-mono font-black uppercase tracking-[0.1em] mt-2 transition-colors">{p.code}</p>
                  </div>
                  <div className="text-right shrink-0 pl-6">
                    <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-colors">{p.deliveryDate?.split('-').reverse().slice(0, 2).join('/')}</span>
                    <div className="mt-2 text-right">
                      <span className="inline-block text-[9px] text-emerald-600 dark:text-emerald-500/70 uppercase font-black tracking-widest bg-emerald-100 dark:bg-emerald-500/10 px-4 py-1.5 rounded-full transition-colors">CHECK-OUT</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* NOVO: RANKING TOP 10 CLIENTES (TABELA) */}
      <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl rounded-[40px] shadow-sm dark:shadow-2xl border border-slate-200 dark:border-white/5 flex flex-col transition-all duration-500">
        <div className="px-10 py-8 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between rounded-t-[40px] transition-colors">
          <h3 className="font-black text-[12px] uppercase tracking-[0.25em] text-slate-900 dark:text-white flex items-center transition-colors">
            Ranking Estratégico de Clientes
            <InfoTooltip
              title="Top Clientes"
              content="Classificação dos 10 clientes com maior histórico de volume de projetos registrados no ecossistema."
              calculation="Contagem total de registros agrupados por Cliente_ID"
            />
          </h3>
          <Trophy size={20} className="text-amber-500" />
        </div>
        <div className="p-10">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 transition-colors">
                  <th className="pb-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-4 transition-colors">Posição</th>
                  <th className="pb-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest transition-colors">Cliente</th>
                  <th className="pb-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right px-4 transition-colors">Total Projetos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 transition-colors">
                {rankingTopClients.map(([name, data], idx) => (
                  <tr key={name} className="group hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="py-6 px-4">
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-black text-slate-400 dark:text-slate-500 transition-colors">#{String(idx + 1).padStart(2, '0')}</span>
                        {idx === 0 && <Trophy size={16} className="text-amber-400" />}
                        {idx === 1 && <Medal size={16} className="text-slate-300" />}
                        {idx === 2 && <Medal size={16} className="text-amber-700/80" />}
                      </div>
                    </td>
                    <td className="py-6">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{name}</span>
                        <span className="text-[10px] font-mono font-black text-slate-400 dark:text-slate-600 uppercase tracking-tighter transition-colors">{data.code.padStart(3, '0')}</span>
                      </div>
                    </td>
                    <td className="py-6 px-4 text-right">
                      <span className="text-lg font-black text-indigo-600 dark:text-indigo-400 transition-colors">{data.count}</span>
                    </td>
                  </tr>
                ))}
                {rankingTopClients.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-20 text-center text-slate-400 dark:text-slate-700 font-black uppercase tracking-widest text-[11px] italic opacity-40 transition-colors">Sem dados de clientes registrados</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {viewingUser && (
        <UserDetailModal
          userId={viewingUser.id}
          userName={viewingUser.name}
          projects={projects}
          clients={clients}
          onClose={() => setViewingUser(null)}
        />
      )}
    </div>
  );
};
