import React, { useState, useMemo } from 'react';
import { UserRole, ProjectStatus, Project } from '../types';
import { AppDB } from '../storage';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend } from 'recharts';

interface TeamProps {
  db: AppDB;
  theme: 'dark' | 'light';
}

const InfoIcon = ({ tooltip }: { tooltip: string }) => (
  <div className="relative group ml-2 inline-flex items-center justify-center">
    <svg className="w-4 h-4 text-slate-400 hover:text-indigo-400 cursor-help transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-[11px] text-slate-200 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[100] text-center font-medium border border-slate-700 pointer-events-none">
      {tooltip}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
    </div>
  </div>
);

type ModalData = {
  title: string;
  subtitle?: string;
  items: { 
    id: string; 
    name: string; 
    type: 'Projeto' | 'Sub-tarefa'; 
    status: ProjectStatus; 
    dateStr: string;
  }[];
  auditDetails?: { 
    totalLoad: number, 
    completedCount: number, 
    openCount: number,
    completionRate: number,
    avgCycleTime: number, 
    teamParticipation: number,
  };
}

export const Team: React.FC<TeamProps> = ({ db, theme }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const teamMetrics = useMemo(() => {
    const users = db.users.filter(u => u.isActive);

    const calcWorkingDays = (startStr: string, endStr: string) => {
      const start = new Date(startStr);
      const end = new Date(endStr);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
      if (start > end) return 0;
      let count = 0;
      const curDate = new Date(start.getTime());
      while (curDate <= end) {
        const dayOfWeek = curDate.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
        curDate.setDate(curDate.getDate() + 1);
      }
      return count;
    };

    // First pass to get total team completion for "Participation" percentage
    let totalTeamCompleted = 0;
    db.projects.forEach(p => {
      if (p.status === ProjectStatus.DONE) totalTeamCompleted++;
      if (p.subtasks) p.subtasks.forEach(st => {
        if (st.status === ProjectStatus.DONE) totalTeamCompleted++;
      });
    });

    return users.map(user => {
      const userProjects = db.projects.filter(p => p.assigneeId === user.id);
      const userSubtasks = db.projects.flatMap(p => {
        const sts = p.subtasks || [];
        return sts.map(st => ({ ...st, parentProjectId: p.id, parentProjectName: p.name }));
      }).filter(st => st.assigneeId === user.id);

      const activeProjects = userProjects.filter(p => p.status !== ProjectStatus.DONE && p.status !== ProjectStatus.CANCELED);
      const activeSubtasks = userSubtasks.filter(st => st.status !== ProjectStatus.DONE && st.status !== ProjectStatus.CANCELED);
      const openCount = activeProjects.length + activeSubtasks.length;

      const completedProjects = userProjects.filter(p => p.status === ProjectStatus.DONE);
      const completedSubtasks = userSubtasks.filter(st => st.status === ProjectStatus.DONE);
      const completedCount = completedProjects.length + completedSubtasks.length;

      const totalResponsibility = openCount + completedCount;

      const completionRate = totalResponsibility > 0 ? Math.round((completedCount / totalResponsibility) * 100) : 0;
      const teamParticipation = totalTeamCompleted > 0 ? Math.round((completedCount / totalTeamCompleted) * 100) : 0;

      let totalDays = 0;
      let validCycleItems = 0;

      completedProjects.forEach(p => {
        const eDate = p.actualEndDate || p.deliveryDate;
        if (p.startDate && eDate) {
          totalDays += calcWorkingDays(p.startDate, eDate);
          validCycleItems++;
        }
      });
      completedSubtasks.forEach(st => {
        // subtasks custom legacy types usually won't have actualEndDate natively mapped unless added by new routine, fallback deliveryDate
        const eDate = (st as any).actualEndDate || st.deliveryDate;
        if (st.startDate && eDate) {
          totalDays += calcWorkingDays(st.startDate, eDate);
          validCycleItems++;
        }
      });

      const avgCycleTime = validCycleItems > 0 ? Math.round(totalDays / validCycleItems) : 0;

      return {
        id: user.id,
        name: user.username,
        firstName: user.username.split(' ')[0],
        role: user.role,
        totalResponsibility,
        openCount,
        completedCount,
        completionRate,
        teamParticipation,
        activeProjects,
        activeSubtasks,
        completedProjects,
        completedSubtasks,
        avgCycleTime,
      }
    }).sort((a, b) => b.completionRate - a.completionRate);
  }, [db.users, db.projects]);

  const historyData = useMemo(() => {
    const months: string[] = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push(d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase());
    }

    const dataMap: Record<string, any> = {};
    months.forEach(m => dataMap[m] = { name: m });

    const users = db.users.filter(u => u.isActive);
    
    users.forEach(u => {
      const firstName = u.username.split(' ')[0];
      const userProjects = db.projects.filter(p => p.assigneeId === u.id && p.status === ProjectStatus.DONE);
      const userSubtasks = db.projects.flatMap(p => p.subtasks || []).filter(st => st.assigneeId === u.id && st.status === ProjectStatus.DONE);
      
      userProjects.forEach(item => {
        const eDate = item.actualEndDate || item.deliveryDate;
        if (!eDate) return;
        const d = new Date(eDate);
        const mStr = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase();
        if (dataMap[mStr]) {
          dataMap[mStr][`${firstName}_Proj`] = (dataMap[mStr][`${firstName}_Proj`] || 0) + 1;
        }
      });

      userSubtasks.forEach(item => {
        const eDate = (item as any).actualEndDate || item.deliveryDate;
        if (!eDate) return;
        const d = new Date(eDate);
        const mStr = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase();
        if (dataMap[mStr]) {
          dataMap[mStr][`${firstName}_Sub`] = (dataMap[mStr][`${firstName}_Sub`] || 0) + 1;
        }
      });
    });

    return months.map(m => dataMap[m]);
  }, [db.users, db.projects]);

  const activeUserNames = useMemo(() => db.users.filter(u => u.isActive).map(u => u.username.split(' ')[0]), [db.users]);
  const userColors = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#3b82f6', '#14b8a6'];

  const teamAverageRate = teamMetrics.length > 0 ? Math.round(teamMetrics.reduce((acc, curr) => acc + curr.completionRate, 0) / teamMetrics.length) : 0;
  const totalTeamResponsibility = teamMetrics.reduce((acc, curr) => acc + curr.totalResponsibility, 0);
  const totalTeamCompleted = teamMetrics.reduce((acc, curr) => acc + curr.completedCount, 0);
  const avgTeamCycleTime = teamMetrics.length > 0 ? Math.round(teamMetrics.reduce((acc, curr) => acc + curr.avgCycleTime, 0) / teamMetrics.filter(m => m.avgCycleTime > 0).length || 1) : 0;

  const chartData = teamMetrics.map(u => ({
    name: u.firstName,
    responsabilidade: u.totalResponsibility,
    concluidos: u.completedCount,
    emAberto: u.openCount,
    txConclusao: u.completionRate
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1e293b]/95 backdrop-blur-md p-4 border border-slate-700 rounded-xl shadow-2xl z-50">
          <p className="text-white font-black mb-2 uppercase tracking-wide">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center space-x-2 text-sm font-bold">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></span>
              <span className="text-slate-300">{entry.name}:</span>
              <span className="text-white">{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const CustomHistoryTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const userMap: Record<string, { proj: number, sub: number, color: string }> = {};
      payload.forEach((entry: any) => {
         const parts = entry.dataKey.split('_');
         if (parts.length !== 2) return;
         const [uName, type] = parts;
         if (!userMap[uName]) userMap[uName] = { proj: 0, sub: 0, color: entry.color };
         if (type === 'Proj') userMap[uName].proj = entry.value;
         if (type === 'Sub') userMap[uName].sub = entry.value;
      });

      return (
        <div className="bg-[#1e293b]/95 backdrop-blur-md p-4 border border-slate-700 rounded-xl shadow-2xl z-50 min-w-[200px]">
          <p className="text-white font-black mb-3 uppercase tracking-wide border-b border-slate-700 pb-2">{label}</p>
          <div className="space-y-3">
            {Object.keys(userMap).map(uName => {
               const data = userMap[uName];
               const total = data.proj + data.sub;
               if (total === 0) return null;
               return (
                 <div key={uName} className="flex flex-col">
                   <div className="flex items-center space-x-2 text-sm font-bold mb-1">
                     <span className="w-3 h-3 rounded-full" style={{ backgroundColor: data.color }}></span>
                     <span className="text-slate-300">{uName}:</span>
                     <span className="text-white">{total} Entregas totais</span>
                   </div>
                   <div className="flex space-x-3 text-[10px] font-bold text-slate-500 ml-5 uppercase">
                     <span className="text-sky-400">{data.proj} Projetos</span>
                     <span>•</span>
                     <span className="text-indigo-400">{data.sub} Sub-tarefas</span>
                   </div>
                 </div>
               )
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  const handleOpenModal = (
    title: string, 
    projects: Project[], 
    subtasks: any[], 
    subtitle?: string,
    auditDetails?: ModalData['auditDetails']
  ) => {
    const pItems = projects.map(p => ({
      id: p.id,
      name: p.name,
      type: 'Projeto' as const,
      status: p.status,
      dateStr: p.actualEndDate || p.deliveryDate || p.dueDate || 'Sem Data Definida'
    }));
    
    const sItems = subtasks.map(st => ({
      id: st.id,
      name: `${st.name} (Ref: ${st.parentProjectName})`,
      type: 'Sub-tarefa' as const,
      status: st.status,
      dateStr: st.actualEndDate || st.deliveryDate || 'Sem Data Definida'
    }));

    setModalData({
      title,
      subtitle,
      items: [...pItems, ...sItems].sort((a, b) => new Date(b.dateStr).getTime() - new Date(a.dateStr).getTime()),
      auditDetails
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full mb-10 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center">
            Eficiência da Equipe
            <InfoIcon tooltip="Métricas puramente operacionais baseadas em dados históricos documentados. Sem pontuações gamificadas, mensurando apenas carga sob responsabilidade, taxa de conclusão real e ciclo médio comprovável." />
          </h1>
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest mt-1">Análise Gerencial Oficial</p>
        </div>
      </div>

      {/* Global KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between group hover:border-indigo-500/50 transition-all cursor-default">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center">
              Taxa de Conclusão Média
              <InfoIcon tooltip="Percentual médio de efetividade do quadro inteiro da empresa (Concluídos sobre Responsabilidade Oficial)." />
            </h3>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{teamAverageRate}%</span>
          </div>
        </div>

        <div 
          onClick={() => {
            const allAssignedP = teamMetrics.flatMap(u => [...u.activeProjects, ...u.completedProjects]);
            const allAssignedS = teamMetrics.flatMap(u => [...u.activeSubtasks, ...u.completedSubtasks]);
            handleOpenModal("Volume Oficial Sob Responsabilidade", allAssignedP, allAssignedS, "Todos os Projetos e Sub-tarefas (Ativos ou Concluídos) alocados para recursos da empresa.", undefined);
          }}
          className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between group hover:border-amber-500/50 transition-all cursor-pointer">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest group-hover:text-amber-400 transition-colors flex items-center">
              Demanda de Equipe (Total)
              <InfoIcon tooltip="Somatória bruta que representa o tamanho histórico da operação designada." />
            </h3>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            </div>
          </div>
          <div className="flex flex-col space-y-1">
            <div className="flex items-baseline space-x-2">
              <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{totalTeamResponsibility}</span>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Itens Tratados</span>
            </div>
            <div className="text-[10px] font-bold text-amber-500 flex space-x-2">
              <span>{Math.round((totalTeamCompleted/totalTeamResponsibility)*100)}% Completados globalmente</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between group hover:border-emerald-500/50 transition-all cursor-default">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center">
              Ciclo Médio Estrutural
              <InfoIcon tooltip="Tempo médio gasto do início ao fim de uma atividade em dias úteis." />
            </h3>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{avgTeamCycleTime}</span>
            <span className="text-xs font-bold text-slate-500">dias úteis</span>
          </div>
        </div>

        <div 
          onClick={() => {
            const allActiveP = teamMetrics.flatMap(u => u.activeProjects);
            const allActiveS = teamMetrics.flatMap(u => u.activeSubtasks);
            handleOpenModal("Backlog Ativo (Em Aberto)", allActiveP, allActiveS, "Projetos e sub-tarefas ativas e sob responsabilidade do time que ainda não foram marcadas como concluídas.", undefined);
          }}
          className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between group hover:border-sky-500/50 transition-all cursor-pointer">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest group-hover:text-sky-400 transition-colors flex items-center">
              Total Em Aberto
              <InfoIcon tooltip="Carga ativa atual do sistema. Trabalhos aguardando execução ou em andamento." />
            </h3>
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-500 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
            </div>
          </div>
          <div className="flex flex-col space-y-1">
            <div className="flex items-baseline space-x-2">
              <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{teamMetrics.reduce((a,c) => a+c.openCount, 0)}</span>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Abertos</span>
            </div>
            <div className="text-[10px] font-bold text-sky-500 flex space-x-2">
              <span>{teamMetrics.reduce((a,c) => a+c.activeProjects.length, 0)} Projetos</span>
              <span className="text-slate-500">•</span>
              <span>{teamMetrics.reduce((a,c) => a+c.activeSubtasks.length, 0)} Tarefas</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico Macro vs Micro Carga Aberta */}
        <div className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center">
            Esforço Atual de Carga (Projetos vs Tarefas)
            <InfoIcon tooltip="Avaliação imediata do volume pendente de cada operador." />
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="name" stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: theme === 'dark' ? '#334155' : '#f1f5f9' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                <Bar dataKey="emAberto" name="Total Em Aberto" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico de Eficiência Concluídos vs Responsabilidade */}
        <div className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center">
            Tração Produtiva (Responsabilidade x Entregues)
            <InfoIcon tooltip="Mostra numericamente o volume do montante que cada um obteve sob seu chapéu versus o que formalizou entrega (DONE)." />
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="name" stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: theme === 'dark' ? '#334155' : '#f1f5f9' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                <Bar dataKey="responsabilidade" name="Carga Absoluta Atribuída" fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="concluidos" name="Volumes Entregues" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico de Histórico Semestral */}
        <div className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 lg:col-span-2">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center">
            Lineage e Histórico de Conclusões Semestral
            <InfoIcon tooltip="Linhas cronológicas mostrando a aderência de conclusões passadas." />
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="name" stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomHistoryTooltip />} />
                
                <Legend 
                  content={(props) => {
                     const { payload } = props;
                     const userEntries = payload?.filter(p => p.dataKey?.toString().endsWith('_Proj')) || [];
                     return (
                       <div className="flex flex-wrap justify-center gap-4 mt-2">
                         {userEntries.map((entry: any, index: number) => {
                           const userName = entry.dataKey.replace('_Proj', '');
                           return (
                             <div key={`legend-${userName}`} className="flex items-center text-[10px] font-bold text-slate-500">
                               <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: entry.color }}></span>
                               <span className="uppercase">{userName} <span className="text-sky-500">(Proj)</span> / <span className="text-indigo-400 opacity-60">(Sub)</span></span>
                             </div>
                           );
                         })}
                       </div>
                     );
                  }}
                />

                {activeUserNames.map((name, i) => {
                  const color = userColors[i % userColors.length];
                  return (
                    <React.Fragment key={name}>
                      <Line 
                        dataKey={`${name}_Proj`} 
                        name={`${name} (Projetos)`} 
                        type="monotone" 
                        stroke={color} 
                        strokeWidth={3} 
                        dot={{ r: 4 }} 
                        activeDot={{ r: 6 }} 
                      />
                      <Line 
                        dataKey={`${name}_Sub`} 
                        name={`${name} (Tarefas)`} 
                        type="monotone" 
                        stroke={color} 
                        strokeOpacity={0.4} 
                        strokeWidth={2} 
                        dot={{ r: 3, fillOpacity: 0.4 }} 
                        activeDot={{ r: 5 }} 
                      />
                    </React.Fragment>
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tabela Operacional de Responsabilidades */}
      <div className="bg-white dark:bg-[#1e293b] rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden relative">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center">
          <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center">
            Desempenho Profissional e Volumes de Conclusão (Eficiência Operacional)
            <InfoIcon tooltip="Valores rígidos indicando o status factual sem manipulação artificial. A Taxa de Conclusão dita a métrica de efetividade." />
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 dark:bg-[#2a374a] text-[10px] uppercase font-black tracking-widest text-slate-500">
              <tr>
                <th className="px-6 py-4">Colaborador</th>
                <th className="px-6 py-4">Total Atribuído</th>
                <th className="px-6 py-4">Carga Atual (Aberta)</th>
                <th className="px-6 py-4 text-center">Volume Concluído</th>
                <th className="px-6 py-4 text-center">Índice de Conclusão Operacional</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
              {teamMetrics.map((user, idx) => (
                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300">
                        {user.firstName.charAt(0).toUpperCase()}
                      </div>
                      <div className="font-bold text-sm text-slate-900 dark:text-slate-200">{user.name}</div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4">
                    <div className="flex items-center font-bold text-slate-600 dark:text-slate-400">
                      <span>{user.totalResponsibility} <span className="text-[10px] uppercase tracking-widest">Registros</span></span>
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <div className="flex items-center font-bold text-amber-600 dark:text-amber-500">
                      <span>{user.openCount} <span className="text-[10px] uppercase tracking-widest">Pendentes</span></span>
                    </div>
                  </td>

                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center font-bold text-emerald-600 dark:text-emerald-500">
                      <span>{user.completedCount} <span className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400">({user.teamParticipation}% do Time)</span></span>
                    </div>
                  </td>

                  {/* Operacional Index Field - Interativo */}
                  <td className="px-6 py-4 text-center">
                    <div 
                      onClick={() => handleOpenModal(`Auditoria Operacional: ${user.firstName}`, user.completedProjects, user.completedSubtasks, 
                      `Relatório analítico comprovando a tração operacional (taxa real de entrega sobre a base atribuída).`, 
                      {
                        totalLoad: user.totalResponsibility, 
                        openCount: user.openCount, 
                        completedCount: user.completedCount,
                        completionRate: user.completionRate,
                        avgCycleTime: user.avgCycleTime,
                        teamParticipation: user.teamParticipation
                      })}
                      className="inline-flex items-center space-x-2 cursor-pointer group px-4 py-2 bg-slate-100 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-xl hover:border-indigo-500/50 transition-colors"
                    >
                      <span className="font-black text-xl text-indigo-500 dark:text-indigo-400">
                        {user.completionRate}%
                      </span>
                      <svg className="w-4 h-4 text-slate-400 opacity-50 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    </div>
                  </td>

                </tr>
              ))}
              {teamMetrics.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm font-bold text-slate-500">
                    Nenhuma métrica estrutural de equipe encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalData && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setModalData(null)}></div>
          <div className="bg-white dark:bg-[#1e293b] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200">
            
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-[#202c40]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z" /></svg>
                </div>
                <div>
                  <h3 className="font-black text-slate-900 dark:text-white text-lg tracking-tight leading-none">{modalData.title}</h3>
                  {modalData.subtitle && <p className="text-[10px] uppercase font-bold text-slate-500 mt-1">{modalData.subtitle}</p>}
                </div>
              </div>
              <button onClick={() => setModalData(null)} className="text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 p-2 rounded-xl transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 max-h-[60vh] overflow-y-auto">
              
              {modalData.auditDetails ? (
                /* Detalhamento Executivo */
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="p-4 bg-slate-50 dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-700">
                      <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">Total Sob Responsabilidade</p>
                      <p className="text-2xl font-black text-slate-900 dark:text-slate-200">{modalData.auditDetails.totalLoad}</p>
                    </div>
                    
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-500/5 rounded-xl border border-emerald-200 dark:border-emerald-500/20">
                      <p className="text-[10px] uppercase font-black tracking-widest text-emerald-600 dark:text-emerald-500 mb-1">Total Concluído</p>
                      <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{modalData.auditDetails.completedCount}</p>
                    </div>
                    
                    <div className="p-4 bg-amber-50 dark:bg-amber-500/5 rounded-xl border border-amber-200 dark:border-amber-500/20">
                      <p className="text-[10px] uppercase font-black tracking-widest text-amber-600 dark:text-amber-500 mb-1">Total Em Aberto</p>
                      <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{modalData.auditDetails.openCount}</p>
                    </div>

                    <div className="p-4 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl border border-indigo-200 dark:border-indigo-500/30">
                      <p className="text-[10px] uppercase font-black tracking-widest text-indigo-600 dark:text-indigo-400 mb-1">Taxa de Conclusão (Eficiência)</p>
                      <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{modalData.auditDetails.completionRate}%</p>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-700">
                      <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">Participação na Equipe</p>
                      <p className="text-2xl font-black text-slate-900 dark:text-slate-200">{modalData.auditDetails.teamParticipation}%</p>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-700">
                      <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">Ciclo Médio Real *</p>
                      <p className="text-2xl font-black text-slate-900 dark:text-slate-200">{modalData.auditDetails.avgCycleTime} <span className="text-[10px]">Dias</span></p>
                    </div>
                  </div>

                  <div className="p-3 bg-rose-50 dark:bg-rose-500/5 rounded-lg border border-rose-200 dark:border-rose-500/20 text-xs font-medium text-rose-600 dark:text-rose-400">
                    <span className="font-bold">* Nota sobre Transparência Histórica:</span> O ciclo médio é exibido sob os dados atuais disponíveis (Data de Cadastro original). O sistema Data Warehouse foi ativado e as próximas entregas proverão precisão matemática incontestável sobre inícios, fins e estouros reais.
                  </div>
                </div>
              ) : (
                /* Tabela de Dissecção de Dados */
                <div className="space-y-4">
                  {modalData.items.length === 0 ? (
                    <div className="text-center py-10">
                      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <p className="text-sm font-bold text-slate-500">O quadro está limpo. Não há matrizes que engatilhem essa condição nesta amostra.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {modalData.items.map((item, i) => (
                        <div key={item.id + i} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-slate-700/50 hover:border-indigo-500/30 transition-colors">
                          <div className="flex items-start md:items-center gap-4 mb-2 md:mb-0">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase ${item.type === 'Projeto' ? 'bg-sky-500/10 text-sky-500' : 'bg-indigo-500/10 text-indigo-500'}`}>
                              {item.type}
                            </span>
                            <div>
                              <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{item.name}</p>
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1 block">Status Atual: {item.status}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 bg-white dark:bg-slate-900/50 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            <span className="text-xs font-black text-slate-600 dark:text-slate-300">
                              {item.dateStr.includes('-') && !item.dateStr.includes('Sem Data') 
                                ? new Date(item.dateStr).toLocaleDateString('pt-BR') 
                                : item.dateStr}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1e293b] flex justify-end">
              <button 
                onClick={() => setModalData(null)}
                className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-indigo-500/25"
              >
                Concluir Auditoria
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
