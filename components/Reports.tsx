
import React, { useMemo, useState } from 'react';
import { ProjectStatus, Project, InternalUser, Client } from '../types';
import { AppDB } from '../storage';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts';
import { Calendar, Download, Filter, FileText, Users, CheckCircle2, TrendingUp, BarChart3, Clock } from 'lucide-react';

interface ReportsProps {
  db: AppDB;
  theme?: 'dark' | 'light';
}

export const Reports: React.FC<ReportsProps> = ({ db, theme = 'dark' }) => {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const filteredData = useMemo(() => {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');

    const filteredProjects = db.projects.filter(p => {
      const created = new Date(p.createdAt || Date.now());
      const delivery = p.deliveryDate ? new Date(p.deliveryDate + 'T12:00:00') : null;
      
      // Criado no período OU Concluído no período
      const isCreatedInRange = created >= start && created <= end;
      const isDoneInRange = p.status === ProjectStatus.DONE && delivery && delivery >= start && delivery <= end;
      
      return isCreatedInRange || isDoneInRange;
    });

    // 1. KPIs
    const createdInRange = filteredProjects.filter(p => {
      const d = new Date(p.createdAt || Date.now());
      return d >= start && d <= end;
    }).length;

    const doneInRange = filteredProjects.filter(p => {
      const d = p.deliveryDate ? new Date(p.deliveryDate + 'T12:00:00') : null;
      return p.status === ProjectStatus.DONE && d && d >= start && d <= end;
    }).length;

    const efficiency = createdInRange > 0 ? Math.round((doneInRange / createdInRange) * 100) : 0;

    // 2. Status Distribution
    const statusCounts: Record<string, number> = {};
    Object.values(ProjectStatus).forEach(s => { statusCounts[s] = 0; });
    filteredProjects.forEach(p => { statusCounts[p.status]++; });
    const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);

    // 3. Projects per Client
    const clientMap: Record<string, number> = {};
    filteredProjects.forEach(p => {
      const client = db.clients.find(c => c.id === p.clientId);
      const name = client?.name || 'Sem Cliente';
      clientMap[name] = (clientMap[name] || 0) + 1;
    });
    const clientData = Object.entries(clientMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // 4. Time Evolution (Created)
    const dailyMap: Record<string, number> = {};
    let cur = new Date(start);
    while (cur <= end) {
      dailyMap[cur.toISOString().split('T')[0]] = 0;
      cur.setDate(cur.getDate() + 1);
    }
    filteredProjects.forEach(p => {
      const d = new Date(p.createdAt || Date.now()).toISOString().split('T')[0];
      if (dailyMap[d] !== undefined) dailyMap[d]++;
    });
    const timelineData = Object.entries(dailyMap).map(([date, count]) => ({
      date: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      count
    }));

    // 5. User Performance Detalhado
    const userData = db.users.filter(u => u.isActive).map(u => {
      // 5.1 Projetos Liderados (Dono do Projeto)
      const projectsLed = filteredProjects.filter(p => p.assigneeId === u.id).length;
      
      // 5.2 Participação em Subtarefas (Em projetos que não é o dono)
      const subtaskParticipations = filteredProjects.filter(p => 
        p.assigneeId !== u.id && 
        p.subtasks?.some(st => st.assigneeId === u.id)
      ).length;

      // 5.3 Entregas de Projetos (Concluídos no período por este usuário como responsável)
      const projectsDone = filteredProjects.filter(p => 
        p.assigneeId === u.id && 
        p.status === ProjectStatus.DONE && 
        p.deliveryDate && new Date(p.deliveryDate + 'T12:00:00') >= start && new Date(p.deliveryDate + 'T12:00:00') <= end
      ).length;
      
      // 5.4 Entregas de Subtarefas (Concluídas no período por este usuário)
      let subtasksDone = 0;
      db.projects.forEach(p => {
        p.subtasks?.forEach(st => {
          if (st.assigneeId === u.id && st.status === ProjectStatus.DONE && st.deliveryDate) {
            const d = new Date(st.deliveryDate + 'T12:00:00');
            if (d >= start && d <= end) subtasksDone++;
          }
        });
      });

      return {
        id: u.id,
        name: u.username,
        projectsLed,
        subtaskParticipations,
        projectsDone,
        subtasksDone,
        totalDeliveries: projectsDone + subtasksDone
      };
    }).sort((a, b) => b.totalDeliveries - a.totalDeliveries);

    return {
      kpis: { createdInRange, doneInRange, efficiency },
      statusData,
      clientData,
      timelineData,
      userData
    };
  }, [db, startDate, endDate]);

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#64748b', '#ef4444'];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      {/* HEADER & FILTERS */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white dark:bg-[#1e293b] p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400 mb-2">
            <BarChart3 className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Relatórios Administrativos</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Análise de <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-emerald-500">Desempenho</span></h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Extraia insights operacionais baseados em períodos específicos.</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-3xl border border-slate-100 dark:border-slate-800">
          <div className="px-4 py-2 space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Início</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-700 dark:text-white outline-none border-none p-0 cursor-pointer" 
            />
          </div>
          <div className="w-px h-10 bg-slate-200 dark:bg-slate-800" />
          <div className="px-4 py-2 space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Fim</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-700 dark:text-white outline-none border-none p-0 cursor-pointer" 
            />
          </div>
          <button className="bg-indigo-600 hover:bg-indigo-500 p-3 rounded-2xl text-white shadow-lg shadow-indigo-500/20 active:scale-95 transition-all">
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-indigo-500/10 to-transparent p-8 rounded-[40px] border border-indigo-500/20 backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
            <FileText className="w-16 h-16 text-indigo-500" />
          </div>
          <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2">Projetos Criados</p>
          <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{filteredData.kpis.createdInRange}</h2>
          <div className="h-1 w-12 bg-indigo-500/40 rounded-full mt-4" />
        </div>

        <div className="bg-gradient-to-br from-emerald-500/10 to-transparent p-8 rounded-[40px] border border-emerald-500/20 backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
            <CheckCircle2 className="w-16 h-16 text-emerald-500" />
          </div>
          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">Entregas Realizadas</p>
          <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{filteredData.kpis.doneInRange}</h2>
          <div className="h-1 w-12 bg-emerald-500/40 rounded-full mt-4" />
        </div>

        <div className="bg-gradient-to-br from-amber-500/10 to-transparent p-8 rounded-[40px] border border-amber-500/20 backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
            <TrendingUp className="w-16 h-16 text-amber-500" />
          </div>
          <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2">Eficiência do Período</p>
          <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{filteredData.kpis.efficiency}%</h2>
          <div className="h-1 w-12 bg-amber-500/40 rounded-full mt-4" />
        </div>
      </div>

      {/* CHARTS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Status Distribution */}
        <div className="bg-white dark:bg-[#1e293b] p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm transition-colors h-[400px] flex flex-col">
          <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest mb-8 flex items-center">
            <CheckCircle2 className="w-4 h-4 mr-2 text-indigo-500" />
            Mix de Status no Período
          </h3>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={filteredData.statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {filteredData.statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '16px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Legend layout="vertical" align="right" verticalAlign="middle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Clients */}
        <div className="bg-white dark:bg-[#1e293b] p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm transition-colors h-[400px] flex flex-col">
          <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest mb-8 flex items-center">
            <Users className="w-4 h-4 mr-2 text-emerald-500" />
            Top 10 Clientes por Volume
          </h3>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredData.clientData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 9, fontWeight: 700 }} />
                <Tooltip 
                   cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }}
                   contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '16px', color: '#fff' }}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 10, 10, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* TEAM PRODUCTIVITY - NEW CHART */}
        <div className="md:col-span-2 bg-white dark:bg-[#1e293b] p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm transition-colors h-[400px] flex flex-col">
          <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest mb-8 flex items-center">
            <Users className="w-4 h-4 mr-2 text-indigo-500" />
            Produtividade da Equipe (PJ vs ST)
          </h3>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredData.userData}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 700 }} />
                <YAxis tick={{ fontSize: 9, fontWeight: 700 }} />
                <Tooltip 
                  cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }}
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '16px', color: '#fff' }}
                />
                <Legend iconType="circle" />
                <Bar dataKey="projectsDone" name="Projetos (PJ)" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
                <Bar dataKey="subtasksDone" name="Subtarefas (ST)" stackId="a" fill="#10b981" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Creation Trend */}
        <div className="md:col-span-2 bg-white dark:bg-[#1e293b] p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm transition-colors h-[300px] flex flex-col">
          <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest mb-8 flex items-center">
            <TrendingUp className="w-4 h-4 mr-2 text-amber-500" />
            Curva de Demanda (Projetos Criados)
          </h3>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredData.timelineData}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fontWeight: 700 }} />
                <YAxis tick={{ fontSize: 9, fontWeight: 700 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '16px', color: '#fff' }}
                />
                <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#1e293b] rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center">
                <Users className="w-4 h-4 mr-2 text-indigo-500" />
                Detalhamento por Colaborador
            </h3>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/30">
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Colaborador</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Liderança (PJ)</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Execução (ST)</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Entregas PJ</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Entregas ST</th>
                        <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Média Prod.</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredData.userData.map(user => (
                        <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                            <td className="px-8 py-5">
                                <div className="flex items-center space-x-3">
                                    <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 font-bold text-xs border border-indigo-500/20 uppercase">
                                        {user.name.charAt(0)}
                                    </div>
                                    <span className="text-sm font-bold text-slate-700 dark:text-white">{user.name}</span>
                                </div>
                            </td>
                            <td className="px-8 py-5 text-center">
                                <span className="text-xs font-black text-slate-400 dark:text-slate-500">{user.projectsLed}</span>
                            </td>
                            <td className="px-8 py-5 text-center">
                                <span className="text-xs font-black text-slate-400 dark:text-slate-500">{user.subtaskParticipations}</span>
                            </td>
                            <td className="px-8 py-5 text-center">
                                <span className="text-sm font-black text-indigo-500">{user.projectsDone}</span>
                            </td>
                            <td className="px-8 py-5 text-center">
                                <span className="text-sm font-black text-emerald-500">{user.subtasksDone}</span>
                            </td>
                            <td className="px-8 py-5 text-right">
                                <div className="flex items-center justify-end space-x-2">
                                    <span className="text-sm font-black text-slate-700 dark:text-white">{user.totalDeliveries}</span>
                                    <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-indigo-500 rounded-full" 
                                            style={{ width: `${Math.min(100, (user.totalDeliveries / 10) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};
