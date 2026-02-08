import React, { useMemo, useState } from 'react';
import { ProjectStatus, Project, InternalUser, Client } from '../types';
import { AppDB } from '../storage';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts';
import { Info, CheckCircle2, TrendingUp, Users, Clock, AlertTriangle, Calendar, Trophy, Medal } from 'lucide-react';

interface DashboardProps {
  db: AppDB;
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
        className="p-1 rounded-full hover:bg-slate-700/50 transition-colors text-slate-500 hover:text-indigo-400"
      >
        <Info size={14} />
      </button>
      {isOpen && (
        <div className={`absolute ${position === 'top' ? 'bottom-full mb-2 slide-in-from-bottom-2' : 'top-full mt-2 slide-in-from-top-2'} left-1/2 -translate-x-1/2 p-4 bg-[#0f172a] border border-slate-700 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] z-[100] w-72 pointer-events-none animate-in fade-in duration-200 ring-1 ring-white/10`}>
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 border-b border-slate-800 pb-2">{title}</p>
          <p className="text-[11px] text-slate-300 font-medium leading-relaxed mb-3">{content}</p>
          {calculation && (
            <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-tighter mb-1">Base de Cálculo:</p>
              <p className="text-[10px] text-indigo-300/80 font-mono italic">{calculation}</p>
            </div>
          )}
          <div className={`absolute ${position === 'top' ? 'top-full border-t-[#0f172a]' : 'bottom-full border-b-[#0f172a]'} left-1/2 -translate-x-1/2 border-8 border-transparent`}></div>
        </div>
      )}
    </div>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({ db }) => {
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

  // 3. Eficiência por Usuário (Concluídos)
  const userEfficiencyData = useMemo(() => {
    const data: Record<string, number> = {};
    users.forEach(u => data[u.username] = 0);
    projects.filter(p => p.status === ProjectStatus.DONE).forEach(p => {
      if (p.assigneeId) {
        const user = users.find(u => u.id === p.assigneeId);
        if (user) data[user.username]++;
      }
    });
    return Object.entries(data).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
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

  // 5. Comparativo de Status por Usuário (Original melhorado)
  const userStatusMatrix = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {};
    activeProjects.forEach((p: Project) => {
      if (p.assigneeId) {
        const user = users.find((u: InternalUser) => u.id === p.assigneeId);
        const name = user ? user.username : 'Indefinido';
        if (!matrix[name]) matrix[name] = {
          [ProjectStatus.QUEUE]: 0,
          [ProjectStatus.IN_PROGRESS]: 0,
          [ProjectStatus.PAUSED]: 0
        };
        matrix[name][p.status] = (matrix[name][p.status] || 0) + 1;
      }
    });
    return Object.entries(matrix);
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

  const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f97316', '#10b981'];

  const getHealthColor = (h: number) => {
    if (h > 80) return 'text-emerald-500';
    if (h > 50) return 'text-amber-500';
    return 'text-rose-500';
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-12">
      {/* SEÇÃO 1: SAÚDE DO ESCRITÓRIO */}
      <div className="bg-[#1e293b] p-12 rounded-[48px] shadow-2xl border border-slate-800 relative group">
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none transition-opacity group-hover:opacity-10 scale-150">
          <TrendingUp className="w-48 h-48 text-indigo-500" />
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-12 relative z-10">
          <div className="flex flex-col items-start">
            <h3 className="text-[12px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4 px-2 flex items-center">
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

            <div className="h-12 w-full bg-slate-900/90 rounded-3xl overflow-hidden relative border-2 border-slate-700 shadow-[inset_0_4px_12px_rgba(0,0,0,0.6)] p-1.5">
              <div className="absolute inset-0 bg-gradient-to-r from-rose-900 via-amber-900 to-emerald-900 opacity-20"></div>
              <div
                className={`h-full rounded-2xl transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] relative shadow-[0_0_30px_rgba(0,0,0,0.7)] ${health > 80 ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : health > 50 ? 'bg-gradient-to-r from-amber-600 to-amber-400' : 'bg-gradient-to-r from-rose-700 to-rose-500'}`}
                style={{ width: `${health}%` }}
              >
                <div className="absolute top-0 right-0 bottom-0 w-3 bg-white/30 blur-[2px] animate-pulse"></div>
                <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent"></div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 pt-12 mt-12 border-t border-slate-800/80 relative z-10">
          <div className="text-center group/card">
            <p className="text-[11px] font-black text-slate-500 uppercase mb-3 tracking-[0.2em] transition-colors group-hover/card:text-indigo-400">Ciclo Médio</p>
            <p className="text-4xl font-black text-white">{avgExecutionTime} <span className="text-[14px] text-slate-600 font-bold uppercase tracking-tighter">dias</span></p>
          </div>
          <div className="text-center border-l border-slate-800/80 group/card">
            <p className="text-[11px] font-black text-slate-500 uppercase mb-3 tracking-[0.2em] transition-colors group-hover/card:text-rose-400">Prazos Expirados</p>
            <p className="text-4xl font-black text-rose-500">{overdueProjects.length}</p>
          </div>
          <div className="text-center border-l border-slate-800/80 group/card">
            <p className="text-[11px] font-black text-slate-500 uppercase mb-3 tracking-[0.2em] transition-colors group-hover/card:text-indigo-400">Em Aberto</p>
            <p className="text-4xl font-black text-indigo-400">{activeProjects.length}</p>
          </div>
          <div className="text-center border-l border-slate-800/80 group/card">
            <p className="text-[11px] font-black text-slate-500 uppercase mb-3 tracking-[0.2em] transition-colors group-hover/card:text-emerald-400">Concluídos</p>
            <p className="text-4xl font-black text-emerald-500">{projects.filter((p: any) => p.status === ProjectStatus.DONE).length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* TENDÊNCIA DE PRODUÇÃO - NOVO */}
        <div className="lg:col-span-2 bg-[#1e293b] rounded-[40px] shadow-2xl border border-slate-800 flex flex-col min-h-[400px]">
          <div className="px-10 py-8 border-b border-slate-800 bg-slate-800/20 flex items-center justify-between">
            <h3 className="font-black text-[12px] uppercase tracking-[0.25em] text-white flex items-center">
              Tendência de Fluxo
              <InfoTooltip
                title="Entradas vs Saídas"
                content="Analisa o fluxo de trabalho comparando novos registros com projetos finalizados ao longo do semestre."
                calculation="Projetos_Criados_Mes vs Projetos_Done_Mes"
              />
            </h3>
            <TrendingUp size={20} className="text-indigo-500" />
          </div>
          <div className="p-8 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTimeline} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorDone" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a374a" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 900 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }} />
                <Area type="monotone" dataKey="created" name="Criados" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorCreated)" />
                <Area type="monotone" dataKey="done" name="Concluídos" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorDone)" />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', textTransform: 'uppercase', fontWeight: 900 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CONCENTRAÇÃO DE CLIENTES - NOVO */}
        <div className="bg-[#1e293b] rounded-[40px] shadow-2xl border border-slate-800 flex flex-col min-h-[400px]">
          <div className="px-10 py-8 border-b border-slate-800 bg-slate-800/20 flex items-center justify-between">
            <h3 className="font-black text-[12px] uppercase tracking-[0.25em] text-white flex items-center">
              Concentração
              <InfoTooltip
                title="Volume por Cliente"
                content="Identifica a pulverização ou dependência de clientes específicos dentro do portfólio."
                calculation="Projetos_por_Cliente / Projetos_Totais * 100"
              />
            </h3>
            <PieChart size={20} className="text-indigo-500" />
          </div>
          <div className="p-4 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={clientConcentrationData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                  {clientConcentrationData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }} />
                <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* EFICIÊNCIA DO TIME - NOVO (BarChart Recharts) */}
        <div className="bg-[#1e293b] rounded-[40px] shadow-2xl border border-slate-800 min-h-[450px] flex flex-col">
          <div className="px-10 py-8 border-b border-slate-800 bg-slate-800/20 flex items-center justify-between">
            <h3 className="font-black text-[12px] uppercase tracking-[0.25em] text-white flex items-center">
              Eficiência Operacional
              <InfoTooltip
                title="Entregas por Usuário"
                content="Mede a capacidade de finalização de cada colaborador, focado exclusivamente em projetos com status CONCLUÍDO."
                calculation="Soma(Projetos_Concluidos_por_Usuario)"
              />
            </h3>
            <CheckCircle2 size={20} className="text-emerald-500" />
          </div>
          <div className="p-8 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={userEfficiencyData} layout="vertical" margin={{ left: 20, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a374a" horizontal={true} vertical={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }} width={80} />
                <RechartsTooltip cursor={{ fill: '#334155', opacity: 0.1 }} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }} />
                <Bar dataKey="value" name="Concluídos" fill="#10b981" radius={[0, 10, 10, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CARGA ATIVA POR USUÁRIO (Melhorado com Stacked Bar) */}
        <div className="bg-[#1e293b] rounded-[40px] shadow-2xl border border-slate-800 flex flex-col">
          <div className="px-10 py-8 border-b border-slate-800 bg-slate-800/20 flex items-center justify-between">
            <h3 className="font-black text-[12px] uppercase tracking-[0.25em] text-white flex items-center">
              Carga Ativa por Usuário
              <InfoTooltip
                title="Distribuição de Status"
                content="Visão em tempo real da alocação do time, separando o que está parado, o que está em produção e o que aguarda início."
                calculation="Agrupamento(Status) por Usuário"
              />
            </h3>
            <Users size={20} className="text-indigo-500" />
          </div>
          <div className="p-10 flex-1 overflow-y-auto max-h-[400px] custom-scrollbar">
            <div className="space-y-8">
              {userStatusMatrix.map(([name, statusData]) => {
                const total = statusData[ProjectStatus.QUEUE] + statusData[ProjectStatus.IN_PROGRESS] + statusData[ProjectStatus.PAUSED];
                return (
                  <div key={name} className="group">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest transition-colors group-hover:text-white">{name}</span>
                      <span className="text-[12px] font-black text-indigo-400">{total} ativos</span>
                    </div>
                    <div className="h-8 w-full flex rounded-2xl overflow-hidden border border-slate-900 shadow-[inset_0_4px_8px_rgba(0,0,0,0.5)] bg-slate-900/40 p-1">
                      <div className="bg-slate-700/60 h-full rounded-l-xl transition-all duration-700 hover:brightness-125 border-r border-white/5" style={{ width: `${(statusData[ProjectStatus.QUEUE] / total) * 100}%` }}></div>
                      <div className="bg-indigo-600 h-full transition-all duration-700 hover:brightness-125 shadow-[inset_0_0_15px_rgba(0,0,0,0.2)] border-r border-white/5" style={{ width: `${(statusData[ProjectStatus.IN_PROGRESS] / total) * 100}%` }}></div>
                      <div className="bg-purple-600 h-full rounded-r-xl transition-all duration-700 hover:brightness-125" style={{ width: `${(statusData[ProjectStatus.PAUSED] / total) * 100}%` }}></div>
                    </div>
                  </div>
                );
              })}
              {userStatusMatrix.length === 0 && (
                <div className="h-64 flex flex-col items-center justify-center text-slate-600 font-black uppercase text-[12px] tracking-widest italic opacity-40">Sem colaboradores ativos</div>
              )}
            </div>
            <div className="mt-12 flex justify-center space-x-8 bg-slate-900/60 p-4 rounded-3xl border border-slate-800/80">
              <div className="flex items-center"><div className="w-3 h-3 bg-slate-700 rounded-full mr-3 border border-white/10"></div><span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Fila</span></div>
              <div className="flex items-center"><div className="w-3 h-3 bg-indigo-600 rounded-full mr-3 shadow-[0_0_8px_rgba(79,70,229,0.4)]"></div><span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Andamento</span></div>
              <div className="flex items-center"><div className="w-3 h-3 bg-purple-600 rounded-full mr-3 shadow-[0_0_8px_rgba(147,51,234,0.4)]"></div><span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Pausado</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* RADAR DE ATRASOS */}
        <div className="bg-[#1e293b] rounded-[40px] shadow-2xl border border-slate-800">
          <div className="px-10 py-8 border-b border-slate-800 flex items-center justify-between bg-rose-500/10">
            <h3 className="font-black text-[12px] uppercase tracking-[0.2em] text-rose-500 flex items-center">
              <AlertTriangle size={16} className="mr-4 text-rose-500 animate-pulse" />
              Prazos Expirados
              <InfoTooltip
                title="Alertas de Atraso"
                content="Identifica projetos ativos que já ultrapassaram a data de entrega pactuada, exigindo atenção imediata."
                calculation="Filtro(Active_Projects onde Delivery_Date < Hoje)"
              />
            </h3>
            <span className="text-sm font-black text-rose-500 bg-rose-500/10 px-4 py-1.5 rounded-full ring-1 ring-rose-500/30">{overdueProjects.length}</span>
          </div>
          <div className="divide-y divide-slate-800/50 max-h-[450px] overflow-y-auto custom-scrollbar">
            {overdueProjects.length === 0 ? (
              <div className="p-20 text-center text-slate-700 font-black uppercase tracking-widest text-[11px] italic opacity-40">Operação em Dia</div>
            ) : overdueProjects.map((p: Project) => (
              <div key={p.id} className="p-8 hover:bg-rose-500/[0.05] transition-colors group">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] text-slate-500 font-mono font-black uppercase tracking-tighter">{p.code}</p>
                  <div className="text-right shrink-0 ml-6">
                    <span className="text-sm font-black text-rose-500">{p.deliveryDate?.split('-').reverse().slice(0, 2).join('/')}</span>
                    <p className="text-[9px] text-rose-600 uppercase font-black tracking-tighter mt-1.5 bg-rose-500/10 px-3 py-1 rounded-full ring-1 ring-rose-500/20">ATRASO</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* PRÓXIMAS ENTREGAS */}
        <div className="bg-[#1e293b] rounded-[40px] shadow-2xl border border-slate-800">
          <div className="px-10 py-8 border-b border-slate-800 flex items-center justify-between bg-emerald-500/10">
            <h3 className="font-black text-[12px] uppercase tracking-[0.2em] text-emerald-400 flex items-center">
              <Calendar size={16} className="mr-4 text-emerald-500" />
              Próximos 7 Dias
              <InfoTooltip
                title="Planejamento Semanal"
                content="Calendário de entregas previstas para a semana atual, para organização da carga de faturamento e revisão."
                calculation="Filtro(Projetos onde Delivery_Date está entre Hoje e +7 dias)"
              />
            </h3>
            <span className="text-sm font-black text-emerald-400 bg-emerald-500/10 px-4 py-1.5 rounded-full ring-1 ring-emerald-500/30">{upcomingProjects.length}</span>
          </div>
          <div className="divide-y divide-slate-800/50 max-h-[450px] overflow-y-auto custom-scrollbar">
            {upcomingProjects.length === 0 ? (
              <div className="p-20 text-center text-slate-700 font-black uppercase tracking-widest text-[11px] italic opacity-40">Sem Entregas Agendadas</div>
            ) : upcomingProjects.map((p: Project) => (
              <div key={p.id} className="p-8 hover:bg-emerald-500/[0.05] transition-colors group">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] text-slate-500 font-mono font-black uppercase tracking-tighter">{p.code}</p>
                  <div className="text-right shrink-0 ml-6">
                    <span className="text-sm font-black text-emerald-400">{p.deliveryDate?.split('-').reverse().slice(0, 2).join('/')}</span>
                    <p className="text-[9px] text-emerald-500/70 uppercase font-black tracking-tighter mt-1.5 bg-emerald-500/10 px-3 py-1 rounded-full">CHECK-OUT</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* NOVO: RANKING TOP 10 CLIENTES (TABELA) */}
      <div className="bg-[#1e293b] rounded-[40px] shadow-2xl border border-slate-800 flex flex-col">
        <div className="px-10 py-8 border-b border-slate-800 bg-slate-800/20 flex items-center justify-between">
          <h3 className="font-black text-[12px] uppercase tracking-[0.25em] text-white flex items-center">
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
                <tr className="border-b border-slate-800">
                  <th className="pb-6 text-[10px] font-black text-slate-500 uppercase tracking-widest px-4">Posição</th>
                  <th className="pb-6 text-[10px] font-black text-slate-500 uppercase tracking-widest">Cliente</th>
                  <th className="pb-6 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right px-4">Total Projetos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {rankingTopClients.map(([name, data], idx) => (
                  <tr key={name} className="group hover:bg-slate-800/20 transition-colors">
                    <td className="py-6 px-4">
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-black text-slate-500">#{String(idx + 1).padStart(2, '0')}</span>
                        {idx === 0 && <Trophy size={16} className="text-amber-400" />}
                        {idx === 1 && <Medal size={16} className="text-slate-300" />}
                        {idx === 2 && <Medal size={16} className="text-amber-700/80" />}
                      </div>
                    </td>
                    <td className="py-6">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-100 group-hover:text-indigo-400 transition-colors">{name}</span>
                        <span className="text-[10px] font-mono font-black text-slate-600 uppercase tracking-tighter">{data.code.padStart(3, '0')}</span>
                      </div>
                    </td>
                    <td className="py-6 px-4 text-right">
                      <span className="text-lg font-black text-indigo-400">{data.count}</span>
                    </td>
                  </tr>
                ))}
                {rankingTopClients.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-20 text-center text-slate-700 font-black uppercase tracking-widest text-[11px] italic opacity-40">Sem dados de clientes registrados</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
