import React, { useState, useMemo } from 'react';
import { AppDB, UserRole, ProjectStatus, Project, Subtask } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, AreaChart, Area, Legend } from 'recharts';

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
  scoreDetails?: { totalLoad: number, delayedCount: number, delayIndex: number, completedCount: number, baseScore: number, finalScore: number };
}

export const Team: React.FC<TeamProps> = ({ db, theme }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const teamMetrics = useMemo(() => {
    const users = db.users.filter(u => u.isActive);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

    return users.map(user => {
      const userProjects = db.projects.filter(p => p.assigneeId === user.id);
      const userSubtasks = db.projects.flatMap(p => {
        const sts = p.subtasks || [];
        // Inject project id to reference parent if needed
        return sts.map(st => ({ ...st, parentProjectId: p.id, parentProjectName: p.name }));
      }).filter(st => st.assigneeId === user.id);

      const activeProjects = userProjects.filter(p => p.status !== ProjectStatus.DONE && p.status !== ProjectStatus.CANCELED);
      const activeSubtasks = userSubtasks.filter(st => st.status !== ProjectStatus.DONE && st.status !== ProjectStatus.CANCELED);
      const totalLoad = activeProjects.length + activeSubtasks.length;

      const delayedProjects: Project[] = [];
      const delayedSubtasks: any[] = [];

      activeProjects.forEach(p => {
        if (p.deliveryDate || p.dueDate) {
          const dlDate = new Date(p.deliveryDate || p.dueDate!);
          dlDate.setHours(0, 0, 0, 0);
          if (dlDate < today) delayedProjects.push(p);
        }
      });
      activeSubtasks.forEach(st => {
        if (st.deliveryDate) {
          const dlDate = new Date(st.deliveryDate);
          dlDate.setHours(0, 0, 0, 0);
          if (dlDate < today) delayedSubtasks.push(st);
        }
      });

      const delayedCount = delayedProjects.length + delayedSubtasks.length;
      const delayIndex = totalLoad > 0 ? (delayedCount / totalLoad) * 100 : 0;

      const completedProjects = userProjects.filter(p => p.status === ProjectStatus.DONE && p.startDate && p.deliveryDate);
      const completedSubtasks = userSubtasks.filter(st => st.status === ProjectStatus.DONE && st.startDate && st.deliveryDate);

      let totalDays = 0;
      let completedCount = 0;

      completedProjects.forEach(p => {
        totalDays += calcWorkingDays(p.startDate!, p.deliveryDate!);
        completedCount++;
      });
      completedSubtasks.forEach(st => {
        totalDays += calcWorkingDays(st.startDate!, st.deliveryDate!);
        completedCount++;
      });

      const avgCycleTime = completedCount > 0 ? Math.round(totalDays / completedCount) : 0;

      const baseScore = 100 - (delayIndex * 1.5);
      const bonus = Math.min(completedCount * 3, 20);
      let score = baseScore + bonus;
      
      if (score < 0) score = 0;
      if (score > 100) score = 100;
      if (totalLoad === 0 && completedCount === 0) score = 0;

      let riskLevel = 'BAIXO';
      if (delayIndex > 50) riskLevel = 'CRÍTICO';
      else if (delayIndex > 25) riskLevel = 'MÉDIO';

      let workloadRisk = 'NORMAL';
      if (totalLoad > 15) workloadRisk = 'SOBRECARGA';

      return {
        id: user.id,
        name: user.username,
        firstName: user.username.split(' ')[0],
        role: user.role,
        totalLoad,
        activeProjects,
        activeSubtasks,
        delayedCount,
        delayedProjects,
        delayedSubtasks,
        delayIndex,
        completedProjects,
        completedSubtasks,
        avgCycleTime,
        baseScore,
        score: Math.round(score),
        completedCount,
        riskLevel,
        workloadRisk
      }
    }).sort((a, b) => b.score - a.score);
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
      const userProjects = db.projects.filter(p => p.assigneeId === u.id && p.status === ProjectStatus.DONE && p.deliveryDate);
      const userSubtasks = db.projects.flatMap(p => p.subtasks || []).filter(st => st.assigneeId === u.id && st.status === ProjectStatus.DONE && st.deliveryDate);
      
      const allCompleted = [...userProjects, ...userSubtasks];
      allCompleted.forEach(item => {
        if (!item.deliveryDate) return;
        const d = new Date(item.deliveryDate);
        const mStr = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase();
        if (dataMap[mStr]) {
          dataMap[mStr][firstName] = (dataMap[mStr][firstName] || 0) + 1;
        }
      });
    });

    return months.map(m => dataMap[m]);
  }, [db.users, db.projects]);

  const activeUserNames = useMemo(() => db.users.filter(u => u.isActive).map(u => u.username.split(' ')[0]), [db.users]);
  const userColors = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#3b82f6', '#14b8a6'];

  const teamAverageScore = teamMetrics.length > 0 ? Math.round(teamMetrics.reduce((acc, curr) => acc + curr.score, 0) / teamMetrics.length) : 0;
  const totalTeamLoad = teamMetrics.reduce((acc, curr) => acc + curr.totalLoad, 0);
  const totalTeamDelays = teamMetrics.reduce((acc, curr) => acc + curr.delayedCount, 0);
  const avgTeamCycleTime = teamMetrics.length > 0 ? Math.round(teamMetrics.reduce((acc, curr) => acc + curr.avgCycleTime, 0) / teamMetrics.filter(m => m.avgCycleTime > 0).length || 1) : 0;

  const chartData = teamMetrics.map(u => ({
    name: u.firstName,
    carga: u.totalLoad,
    atrasos: u.delayedCount,
    projetosAtivos: u.activeProjects.length,
    subtarefasAtivas: u.activeSubtasks.length,
    score: u.score
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

  const handleOpenModal = (
    title: string, 
    projects: Project[], 
    subtasks: any[], 
    subtitle?: string,
    scoreDetails?: ModalData['scoreDetails']
  ) => {
    const pItems = projects.map(p => ({
      id: p.id,
      name: p.name,
      type: 'Projeto' as const,
      status: p.status,
      dateStr: p.deliveryDate || p.dueDate || 'Sem Data Definida'
    }));
    
    const sItems = subtasks.map(st => ({
      id: st.id,
      name: `${st.name} (Ref: ${st.parentProjectName})`,
      type: 'Sub-tarefa' as const,
      status: st.status,
      dateStr: st.deliveryDate || 'Sem Data Definida'
    }));

    setModalData({
      title,
      subtitle,
      items: [...pItems, ...sItems].sort((a, b) => new Date(a.dateStr).getTime() - new Date(b.dateStr).getTime()),
      scoreDetails
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full mb-10 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center">
            Performance da Equipe
            <InfoIcon tooltip="Este é o seu centro de comando. Todos os dados aqui são métricas avançadas focadas em ritmo de entrega, separação exata entre macro (projetos) e micro (sub-tarefas), e ranking analítico." />
          </h1>
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest mt-1">Visão Exclusiva de Administração</p>
        </div>
      </div>

      {/* Global KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div 
          onClick={() => {
            const allDelayedP = teamMetrics.flatMap(u => u.delayedProjects);
            const allDelayedS = teamMetrics.flatMap(u => u.delayedSubtasks);
            handleOpenModal("Raio-X: Score de Eficiência", allDelayedP, allDelayedS, "Abaixo estão todos os itens da empresa que configuram os atrasos, abatendo o Score da equipe. Clique no próprio Score individual na tabela para ver a matemática específica deste cálculo.");
          }}
          className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between group hover:border-indigo-500/50 transition-all cursor-pointer relative">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest group-hover:text-indigo-400 transition-colors flex items-center">
              Score de Eficiência Médio
              <InfoIcon tooltip="Medidor mestre (0 a 100). Calculado por usuário: 100 base, abatido por 1.5x o % de Atrasos, e bonificado por Conclusões. A equipe mostra a média aritmética. Clique para ver as pendências globais que puxam o Score para baixo." />
            </h3>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{teamAverageScore}</span>
            <span className="text-xs font-bold text-slate-500">/ 100</span>
          </div>
        </div>

        <div 
          onClick={() => {
            const allActiveP = teamMetrics.flatMap(u => u.activeProjects);
            const allActiveS = teamMetrics.flatMap(u => u.activeSubtasks);
            handleOpenModal("Fonte de Dados: Carga Total", allActiveP, allActiveS, "Todos os Projetos e Sub-tarefas atualmente rodando na operação da empresa.");
          }}
          className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between group hover:border-amber-500/50 transition-all cursor-pointer">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest group-hover:text-amber-400 transition-colors flex items-center">
              Carga Ativa Global
              <InfoIcon tooltip="Somatória total bruta mostrando tudo que não está Concluído ou Cancelado na base inteira." />
            </h3>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            </div>
          </div>
          <div className="flex flex-col space-y-1">
            <div className="flex items-baseline space-x-2">
              <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{totalTeamLoad}</span>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Itens Totais</span>
            </div>
            <div className="text-[10px] font-bold text-amber-500 flex space-x-2">
              <span>{teamMetrics.reduce((a,c) => a+c.activeProjects.length, 0)} Projetos</span>
              <span className="text-slate-500">•</span>
              <span>{teamMetrics.reduce((a,c) => a+c.activeSubtasks.length, 0)} Tarefas</span>
            </div>
          </div>
        </div>

        <div 
          onClick={() => {
            const allC_P = teamMetrics.flatMap(u => u.completedProjects);
            const allC_S = teamMetrics.flatMap(u => u.completedSubtasks);
            handleOpenModal("Entregas de Retrospectiva Crítica", allC_P, allC_S, "Estes são os itens utilizados para compor as matemáticas de Ciclo Médio da base inteira.");
          }}
          className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between group hover:border-emerald-500/50 transition-all cursor-pointer">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest group-hover:text-emerald-400 transition-colors flex items-center">
              Ciclo Médio de Entrega
              <InfoIcon tooltip="Média calculada APENAS em dias úteis funcionais. Registra o tempo do start da Data de Início até a Data de Entrega efetiva." />
            </h3>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
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
            const allDelayedP = teamMetrics.flatMap(u => u.delayedProjects);
            const allDelayedS = teamMetrics.flatMap(u => u.delayedSubtasks);
            handleOpenModal("Fonte de Dados: Atrasos Críticos", allDelayedP, allDelayedS, "Projetos e sub-tarefas ativas cujo prazo está no passado.");
          }}
          className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between group hover:border-rose-500/50 transition-all cursor-pointer">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest group-hover:text-rose-400 transition-colors flex items-center">
              Atrasos Absolutos (Time)
              <InfoIcon tooltip="Mostra quantas obrigações operacionais estouraram a meta temporal. Clique e abra a lista para enxergar exatamente quais são esses ofensores." />
            </h3>
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
          </div>
          <div className="flex flex-col space-y-1">
            <div className="flex items-baseline space-x-2">
              <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{totalTeamDelays}</span>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Itens Vencidos</span>
            </div>
            <div className="text-[10px] font-bold text-rose-500 flex space-x-2">
              <span>{teamMetrics.reduce((a,c) => a+c.delayedProjects.length, 0)} Projetos</span>
              <span className="text-slate-500">•</span>
              <span>{teamMetrics.reduce((a,c) => a+c.delayedSubtasks.length, 0)} Tarefas</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico Macro vs Micro */}
        <div className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center">
            Distribuição de Peso: Projetos (Macro) vs Tarefas (Micro)
            <InfoIcon tooltip="Essencial para o manager avaliar a hierarquia de recursos. Quem está guiando projetos inteiros vs quem está absorvendo micro-obrigações táticas." />
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="name" stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: theme === 'dark' ? '#334155' : '#f1f5f9' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                <Bar dataKey="projetosAtivos" name="Projetos Oficiais" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="subtarefasAtivas" name="Sub-Tarefas" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico de Distribuição e Carga */}
        <div className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center">
            Absorção Geral & Taxa de Atrasos
            <InfoIcon tooltip="A Carga Total engloba o peso absoluto (projetos e subtarefas juntos). Atrasos (em rosa) indicam qual proporção da barra explodiu o deadline." />
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="name" stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: theme === 'dark' ? '#334155' : '#f1f5f9' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                <Bar dataKey="carga" name="Carga Total (Bruta)" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="atrasos" name="Volumes Atrasados" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico de Histórico Semestral */}
        <div className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 lg:col-span-2">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center">
            Lineage e Histórico de Conclusões Semestral
            <InfoIcon tooltip="Linhas cronológicas. Baseado nos itens consolidados (Projetos e Sub-tarefas status = DONE) mês a mês, provando a tração entregue por cada Dev/Account." />
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="name" stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                {activeUserNames.map((name, i) => (
                  <Line key={name} type="monotone" dataKey={name} stroke={userColors[i % userColors.length]} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Tabela de Ranking de Performance */}
      <div className="bg-white dark:bg-[#1e293b] rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden relative">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center">
          <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center">
            Ranking Oficial da Equipe e Espelhamento de Dados
            <InfoIcon tooltip="O placar central de operação. Todo texto em evidência (Score, Atrasos etc.) é interagível; clique neles para observar os dados em bruto que configuraram essa nota ou carga." />
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 dark:bg-[#2a374a] text-[10px] uppercase font-black tracking-widest text-slate-500">
              <tr>
                <th className="px-6 py-4">Ranking</th>
                <th className="px-6 py-4">Colaborador</th>
                <th className="px-6 py-4">Score Interativo</th>
                <th className="px-6 py-4 text-center">Carga & Separação</th>
                <th className="px-6 py-4 text-center">Auditoria de Atrasos</th>
                <th className="px-6 py-4 text-center">Ciclo Médio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
              {teamMetrics.map((user, idx) => (
                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 border-l-4" style={{ borderColor: idx === 0 ? '#fbbf24' : idx === 1 ? '#94a3b8' : idx === 2 ? '#b45309' : 'transparent' }}>
                    <div className="flex items-center space-x-2">
                      <span className="font-black text-lg text-slate-400">#{idx + 1}</span>
                      {idx === 0 && <span className="text-amber-400 text-xl" title="Líder Supremo">👑</span>}
                      {idx === 1 && <span className="text-slate-400 text-xl" title="2º Colocado">🥈</span>}
                      {idx === 2 && <span className="text-amber-700 text-xl" title="3º Colocado">🥉</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300">
                        {user.firstName.charAt(0).toUpperCase()}
                      </div>
                      <div className="font-bold text-sm text-slate-900 dark:text-slate-200">{user.name}</div>
                    </div>
                  </td>
                  
                  {/* Score Field - Interativo */}
                  <td className="px-6 py-4">
                    <div 
                      onClick={() => handleOpenModal(`Auditoria do Score de ${user.firstName}`, [], [], `Este painel prova que a nota de ${user.score} tem fundamento matemático fechado.`, {
                        totalLoad: user.totalLoad, delayedCount: user.delayedCount, delayIndex: user.delayIndex, completedCount: user.completedCount, baseScore: user.baseScore, finalScore: user.score
                      })}
                      className="inline-flex items-center space-x-2 cursor-pointer group px-3 py-1.5 -ml-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <span className={`font-black text-xl ${user.score >= 80 ? 'text-emerald-500' : user.score >= 50 ? 'text-amber-500' : 'text-rose-500'}`}>
                        {user.score}
                      </span>
                      <svg className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    </div>
                  </td>

                  {/* Carga e Separação Projetos/Sub-tarefas */}
                  <td className="px-6 py-4">
                    <div 
                      className="flex flex-col items-center cursor-pointer group px-2 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                      onClick={() => handleOpenModal(`Carga Ativa Isolada - ${user.firstName}`, user.activeProjects, user.activeSubtasks, `Esta lista consolida tudo o que formata as ${user.totalLoad} incumbências de ${user.firstName}.`)}
                    >
                      <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 group-hover:underline decoration-indigo-300 underline-offset-4">
                        {user.totalLoad} VOLUMES
                      </span>
                      <div className="flex gap-2 text-[10px] font-bold text-slate-500 uppercase mt-1">
                        <span className="text-sky-600 dark:text-sky-400">{user.activeProjects.length} PROJ</span>
                        <span>•</span>
                        <span className="text-indigo-500">{user.activeSubtasks.length} SUB</span>
                      </div>
                    </div>
                  </td>

                  {/* Atrasos Field - Interativo */}
                  <td className="px-6 py-4 text-center">
                    <button 
                      onClick={() => handleOpenModal(`Infrações / Atrasos - ${user.firstName}`, user.delayedProjects, user.delayedSubtasks, `Detalhe das ${user.delayedCount} violações atuantes que rebaixam a performance deste usuário.`)}
                      className={`inline-flex flex-col items-center justify-center px-4 py-1.5 rounded-xl border transition-all hover:scale-105 active:scale-95 ${user.delayIndex > 25 ? 'bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/20' : 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20'}`}
                    >
                      <span className={`text-[10px] font-black uppercase tracking-widest ${user.delayIndex > 25 ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {Math.round(user.delayIndex)}% do Peso
                      </span>
                      <span className={`text-xs font-bold ${user.delayIndex > 25 ? 'text-rose-400' : 'text-emerald-400'} mt-0.5`}>
                        {user.delayedProjects.length} Proj / {user.delayedSubtasks.length} Sub
                      </span>
                    </button>
                  </td>

                  {/* Ciclo Médio */}
                  <td className="px-6 py-4 text-center">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300 inline-block px-3 py-1 bg-slate-100 dark:bg-[#1e293b] rounded-full border border-slate-200 dark:border-slate-700">
                      {user.avgCycleTime > 0 ? `${user.avgCycleTime} D.Ú.` : '---'}
                    </span>
                  </td>

                </tr>
              ))}
              {teamMetrics.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm font-bold text-slate-500">
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
              
              {modalData.scoreDetails ? (
                /* Detalhamento Matemático do Score */
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div>
                      <h4 className="font-black text-slate-900 dark:text-white mb-1">A Máquina de Pontuação</h4>
                      <p className="text-xs font-semibold text-slate-500">Você começa com 100 Pontos. Eles sofrem erosão atrelado a gravidade dos atrasos e depois é fortificado pelo volume de concluídos (até o limite original).</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Constante Inicial</span>
                      <span className="text-2xl font-black text-slate-300 dark:text-slate-600">100.0</span>
                    </div>

                    <div className="p-4 bg-rose-50 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-500/20 rounded-2xl flex flex-col items-center relative">
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase">Punição</span>
                      <span className="text-[10px] font-black uppercase text-rose-500 tracking-widest mb-1 mt-1">1.5x Multiplicador</span>
                      <span className="text-xs text-rose-400/80 font-bold mb-1">({Math.round(modalData.scoreDetails.delayIndex)}% de Atrasos do Foco)</span>
                      <span className="text-2xl font-black text-rose-500">-{(modalData.scoreDetails.delayIndex * 1.5).toFixed(1)}</span>
                    </div>

                    <div className="p-4 bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl flex flex-col items-center relative">
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase">Bônus de Entrega</span>
                      <span className="text-[10px] font-black uppercase text-emerald-500 tracking-widest mb-1 mt-1">+3 pts por concluído</span>
                      <span className="text-xs text-emerald-400/80 font-bold mb-1">({modalData.scoreDetails.completedCount} Unidades Oficiais Totais)</span>
                      <span className="text-2xl font-black text-emerald-500">+{Math.min(modalData.scoreDetails.completedCount * 3, 20)} <span className="text-xs">(max 20)</span></span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl border border-indigo-200 dark:border-indigo-500/30">
                    <span className="font-black text-indigo-900 dark:text-indigo-400 uppercase tracking-widest">Resultado Final do Colaborador</span>
                    <span className="text-5xl font-black text-indigo-600 dark:text-indigo-400">{modalData.scoreDetails.finalScore}</span>
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
