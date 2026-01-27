
import React, { useMemo } from 'react';
import { ProjectStatus, Project, InternalUser, Client } from '../types';
import { AppDB } from '../storage';

interface DashboardProps {
  db: AppDB;
}

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

  // 3. Performance por Usuário (Concluídos)
  const userPerformance = useMemo(() => {
    const data: Record<string, number> = {};
    projects.filter((p: Project) => p.status === ProjectStatus.DONE).forEach((p: Project) => {
      if (p.assigneeId) {
        const user = users.find((u: InternalUser) => u.id === p.assigneeId);
        const name = user ? user.username : 'Indefinido';
        data[name] = (data[name] || 0) + 1;
      }
    });
    return Object.entries(data).sort((a, b) => b[1] - a[1]);
  }, [projects, users]);

  // 4. Top 10 Clientes por Projetos
  const topClients = useMemo(() => {
    const data: Record<string, number> = {};
    projects.forEach((p: Project) => {
      const client = clients.find((c: Client) => c.id === p.clientId);
      const name = client ? client.name : 'Cliente Indefinido';
      data[name] = (data[name] || 0) + 1;
    });
    return Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [projects, clients]);

  // 5. Comparativo de Status por Usuário
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

  const getHealthColor = (h: number) => {
    if (h > 80) return 'text-emerald-500';
    if (h > 50) return 'text-amber-500';
    return 'text-rose-500';
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-12">
      {/* SEÇÃO 1: SAÚDE DO ESCRITÓRIO - REDESENHADA PARA IMPACTO MÁXIMO */}
      <div className="bg-[#1e293b] p-12 rounded-[48px] shadow-2xl border border-slate-800 overflow-hidden relative group">
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none transition-opacity group-hover:opacity-10 scale-150">
          <svg className="w-48 h-48 text-indigo-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" /></svg>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-12 relative z-10">
          <div className="flex flex-col items-start">
            <h3 className="text-[12px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4 px-2">Saúde Estratégica da Operação</h3>
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
              {/* Gradiente Real de Fundo */}
              <div className="absolute inset-0 bg-gradient-to-r from-rose-900 via-amber-900 to-emerald-900 opacity-20"></div>
              {/* Barra de Progresso Encorpada - AUMENTADA */}
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
            <p className="text-[11px] font-black text-slate-500 uppercase mb-3 tracking-[0.2em] transition-colors group-hover/card:text-indigo-400">Tempo Médio</p>
            <p className="text-4xl font-black text-white">{avgExecutionTime} <span className="text-[14px] text-slate-600 font-bold uppercase tracking-tighter">dias</span></p>
          </div>
          <div className="text-center border-l border-slate-800/80 group/card">
            <p className="text-[11px] font-black text-slate-500 uppercase mb-3 tracking-[0.2em] transition-colors group-hover/card:text-rose-400">Atraso Crítico</p>
            <p className="text-4xl font-black text-rose-500">{overdueProjects.length}</p>
          </div>
          <div className="text-center border-l border-slate-800/80 group/card">
            <p className="text-[11px] font-black text-slate-500 uppercase mb-3 tracking-[0.2em] transition-colors group-hover/card:text-indigo-400">Projetos Ativos</p>
            <p className="text-4xl font-black text-indigo-400">{activeProjects.length}</p>
          </div>
          <div className="text-center border-l border-slate-800/80 group/card">
            <p className="text-[11px] font-black text-slate-500 uppercase mb-3 tracking-[0.2em] transition-colors group-hover/card:text-emerald-400">Finalizados</p>
            <p className="text-4xl font-black text-emerald-500">{projects.filter((p: any) => p.status === ProjectStatus.DONE).length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* RANKING TOP 10 CLIENTES - REFINADO */}
        <div className="bg-[#1e293b] rounded-[40px] shadow-2xl border border-slate-800 overflow-hidden flex flex-col">
          <div className="px-10 py-8 border-b border-slate-800 bg-slate-800/20 flex items-center justify-between">
            <h3 className="font-black text-[12px] uppercase tracking-[0.25em] text-white">Top 10 Clientes em Volume</h3>
            <svg className="w-6 h-6 text-indigo-500 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
          </div>
          <div className="p-10 flex-1">
            {topClients.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-600 font-black uppercase text-[12px] tracking-widest italic opacity-40">Dados insuficientes</div>
            ) : (
              <div className="space-y-6">
                {topClients.map(([name, count], idx) => (
                  <div key={name} className="group/item">
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[75%] transition-colors group-hover/item:text-indigo-400">
                        <span className="text-slate-600 mr-2">{String(idx + 1).padStart(2, '0')}.</span>
                        {name}
                      </span>
                      <span className="text-[12px] font-black text-indigo-400 group-hover/item:scale-110 transition-transform">{count} <span className="text-[9px] uppercase tracking-tighter text-slate-500">Projetos</span></span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800 shadow-inner">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-700 via-indigo-500 to-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.3)] transition-all duration-1000 ease-out"
                        style={{ width: `${(count / topClients[0][1]) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CARGA DE TRABALHO POR STATUS */}
        <div className="bg-[#1e293b] rounded-[40px] shadow-2xl border border-slate-800 overflow-hidden">
          <div className="px-10 py-8 border-b border-slate-800 bg-slate-800/20 flex items-center justify-between">
            <h3 className="font-black text-[12px] uppercase tracking-[0.25em] text-white">Carga Ativa por Usuário</h3>
            <svg className="w-6 h-6 text-indigo-500 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          </div>
          <div className="p-10">
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
        <div className="bg-[#1e293b] rounded-[40px] shadow-2xl border border-slate-800 overflow-hidden">
          <div className="px-10 py-8 border-b border-slate-800 flex items-center justify-between bg-rose-500/10">
            <h3 className="font-black text-[12px] uppercase tracking-[0.2em] text-rose-500 flex items-center">
              <div className="w-3 h-3 bg-rose-500 rounded-full mr-4 animate-pulse shadow-[0_0_15px_rgba(244,63,94,0.6)]"></div>
              Prazos Expirados
            </h3>
            <span className="text-sm font-black text-rose-500 bg-rose-500/10 px-4 py-1.5 rounded-full ring-1 ring-rose-500/30">{overdueProjects.length}</span>
          </div>
          <div className="divide-y divide-slate-800/50 max-h-[450px] overflow-y-auto custom-scrollbar">
            {overdueProjects.length === 0 ? (
              <div className="p-20 text-center text-slate-700 font-black uppercase tracking-widest text-[11px] italic opacity-40">Operação em Dia</div>
            ) : overdueProjects.map((p: Project) => (
              <div key={p.id} className="p-8 hover:bg-rose-500/[0.05] transition-colors group">
                <div className="flex justify-between items-center">
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-100 truncate group-hover:text-rose-400 transition-colors mb-1">{p.name}</h4>
                    <p className="text-[10px] text-slate-500 font-mono font-black uppercase tracking-tighter">{p.code}</p>
                  </div>
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
        <div className="bg-[#1e293b] rounded-[40px] shadow-2xl border border-slate-800 overflow-hidden">
          <div className="px-10 py-8 border-b border-slate-800 flex items-center justify-between bg-emerald-500/10">
            <h3 className="font-black text-[12px] uppercase tracking-[0.2em] text-emerald-400 flex items-center">
              <div className="w-3 h-3 bg-emerald-500 rounded-full mr-4 shadow-[0_0_15px_rgba(16,185,129,0.6)]"></div>
              Próximos 7 Dias
            </h3>
            <span className="text-sm font-black text-emerald-400 bg-emerald-500/10 px-4 py-1.5 rounded-full ring-1 ring-emerald-500/30">{upcomingProjects.length}</span>
          </div>
          <div className="divide-y divide-slate-800/50 max-h-[450px] overflow-y-auto custom-scrollbar">
            {upcomingProjects.length === 0 ? (
              <div className="p-20 text-center text-slate-700 font-black uppercase tracking-widest text-[11px] italic opacity-40">Sem Entregas Agendadas</div>
            ) : upcomingProjects.map((p: Project) => (
              <div key={p.id} className="p-8 hover:bg-emerald-500/[0.05] transition-colors group">
                <div className="flex justify-between items-center">
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-100 truncate group-hover:text-emerald-400 transition-colors mb-1">{p.name}</h4>
                    <p className="text-[10px] text-slate-500 font-mono font-black uppercase tracking-tighter">{p.code}</p>
                  </div>
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
    </div>
  );
};
