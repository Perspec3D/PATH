import React, { useMemo } from 'react';
import { AppDB, UserRole, ProjectStatus } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, AreaChart, Area } from 'recharts';

interface TeamProps {
  db: AppDB;
  theme: 'dark' | 'light';
}

export const Team: React.FC<TeamProps> = ({ db, theme }) => {
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
      const userSubtasks = db.projects.flatMap(p => p.subtasks || []).filter(st => st.assigneeId === user.id);

      const activeProjects = userProjects.filter(p => p.status !== ProjectStatus.DONE && p.status !== ProjectStatus.CANCELED);
      const activeSubtasks = userSubtasks.filter(st => st.status !== ProjectStatus.DONE && st.status !== ProjectStatus.CANCELED);
      const totalLoad = activeProjects.length + activeSubtasks.length;

      let delayedCount = 0;
      activeProjects.forEach(p => {
        if (p.deliveryDate || p.dueDate) {
          const dlDate = new Date(p.deliveryDate || p.dueDate!);
          dlDate.setHours(0, 0, 0, 0);
          if (dlDate < today) delayedCount++;
        }
      });
      activeSubtasks.forEach(st => {
        if (st.deliveryDate) {
          const dlDate = new Date(st.deliveryDate);
          dlDate.setHours(0, 0, 0, 0);
          if (dlDate < today) delayedCount++;
        }
      });

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

      let score = 100 - (delayIndex * 1.5) + Math.min(completedCount * 3, 20);
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
        delayedCount,
        delayIndex,
        avgCycleTime,
        score: Math.round(score),
        completedCount,
        riskLevel,
        workloadRisk
      }
    }).sort((a, b) => b.score - a.score);
  }, [db.users, db.projects]);

  const teamAverageScore = teamMetrics.length > 0 ? Math.round(teamMetrics.reduce((acc, curr) => acc + curr.score, 0) / teamMetrics.length) : 0;
  const totalTeamLoad = teamMetrics.reduce((acc, curr) => acc + curr.totalLoad, 0);
  const totalTeamDelays = teamMetrics.reduce((acc, curr) => acc + curr.delayedCount, 0);
  const avgTeamCycleTime = teamMetrics.length > 0 ? Math.round(teamMetrics.reduce((acc, curr) => acc + curr.avgCycleTime, 0) / teamMetrics.filter(m => m.avgCycleTime > 0).length || 1) : 0;

  const chartData = teamMetrics.map(u => ({
    name: u.firstName,
    carga: u.totalLoad,
    atrasos: u.delayedCount,
    score: u.score
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1e293b]/95 backdrop-blur-md p-4 border border-slate-700 rounded-xl shadow-2xl">
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full mb-10 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Performance da Equipe</h1>
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest mt-1">Visão Exclusiva de Administração</p>
        </div>
      </div>

      {/* Global KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between group hover:border-indigo-500/50 transition-all cursor-default">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest group-hover:text-indigo-400 transition-colors">Score de Eficiência Médio</h3>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{teamAverageScore}</span>
            <span className="text-xs font-bold text-slate-500">/ 100</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between group hover:border-amber-500/50 transition-all cursor-default">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest group-hover:text-amber-400 transition-colors">Carga Total Ativa</h3>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{totalTeamLoad}</span>
            <span className="text-xs font-bold text-slate-500">tarefas</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between group hover:border-emerald-500/50 transition-all cursor-default">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest group-hover:text-emerald-400 transition-colors">Ciclo Médio de Entrega</h3>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{avgTeamCycleTime}</span>
            <span className="text-xs font-bold text-slate-500">dias úteis</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between group hover:border-rose-500/50 transition-all cursor-default">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest group-hover:text-rose-400 transition-colors">Atrasos Críticos</h3>
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{totalTeamDelays}</span>
            <span className="text-xs font-bold text-slate-500">vencidos</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Distribuição e Carga */}
        <div className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">Volume Individual & Balanceamento</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="name" stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: theme === 'dark' ? '#334155' : '#f1f5f9' }} />
                <Bar dataKey="carga" name="Carga Total" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="atrasos" name="Atrasos" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico de Eficiência Comparada */}
        <div className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">Medição de Eficiência (Score)</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="name" stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="score" name="Score" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tabela de Ranking de Performance */}
      <div className="bg-white dark:bg-[#1e293b] rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Ranking Oficial da Equipe</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 dark:bg-[#2a374a] text-[10px] uppercase font-black tracking-widest text-slate-500">
              <tr>
                <th className="px-6 py-4">Status / Rank</th>
                <th className="px-6 py-4">Colaborador</th>
                <th className="px-6 py-4">Score</th>
                <th className="px-6 py-4 text-center">Carga (%)</th>
                <th className="px-6 py-4 text-center">Índice de Atrasos</th>
                <th className="px-6 py-4 text-center">Ciclo Médio</th>
                <th className="px-6 py-4 text-right">Risco / Alerta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
              {teamMetrics.map((user, idx) => (
                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 border-l-4" style={{ borderColor: idx === 0 ? '#fbbf24' : idx === 1 ? '#94a3b8' : idx === 2 ? '#b45309' : 'transparent' }}>
                    <div className="flex items-center space-x-2">
                      <span className="font-black text-lg text-slate-400">#{idx + 1}</span>
                      {idx === 0 && <span className="text-amber-400 text-xl" title="Top Performance">🏆</span>}
                      {idx === 1 && <span className="text-slate-400 text-xl" title="2º Lugar">🥈</span>}
                      {idx === 2 && <span className="text-amber-700 text-xl" title="3º Lugar">🥉</span>}
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
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <span className={`font-black text-lg ${user.score >= 80 ? 'text-emerald-500' : user.score >= 50 ? 'text-amber-500' : 'text-rose-500'}`}>
                        {user.score}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{user.totalLoad} ATIVAS</span>
                      <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mt-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${user.workloadRisk === 'SOBRECARGA' ? 'bg-rose-500' : 'bg-indigo-500'}`}
                          style={{ width: `${Math.min((user.totalLoad / 15) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${user.delayIndex > 25 ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                      {Math.round(user.delayIndex)}% ({user.delayedCount} itens)
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {user.avgCycleTime > 0 ? `${user.avgCycleTime} dias úteis` : '---'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex flex-col items-end space-y-1">
                      {user.riskLevel === 'CRÍTICO' && (
                        <span className="text-[10px] text-rose-500 font-black uppercase flex items-center">
                          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                          Risco Crítico de Prazo
                        </span>
                      )}
                      {user.workloadRisk === 'SOBRECARGA' && (
                        <span className="text-[10px] text-amber-500 font-black uppercase flex items-center">
                          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                          Sobrecarga Capacidade
                        </span>
                      )}
                      {user.riskLevel === 'BAIXO' && user.workloadRisk === 'NORMAL' && (
                        <span className="text-[10px] text-emerald-500 font-black uppercase flex items-center">
                          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          Estável e Saudável
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {teamMetrics.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm font-bold text-slate-500">
                    Nenhuma métrica estrutural de equipe encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
