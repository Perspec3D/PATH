
import React, { useMemo, useState, useRef } from 'react';
import { Project, ProjectStatus, Client, InternalUser } from '../types';
import { syncProject, AppDB } from '../storage';

interface GanttProps {
  db: AppDB;
  setDb: (db: AppDB) => void;
  currentUser: InternalUser;
}

export const Gantt: React.FC<GanttProps> = ({ db, setDb, currentUser }) => {
  const allProjects = db.projects || [];
  const allClients = db.clients || [];
  const allUsers = db.users || [];

  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Form State for local Edit Modal (Consultancy Base)
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [status, setStatus] = useState<ProjectStatus>(ProjectStatus.QUEUE);
  const [revision, setRevision] = useState('');
  const [startDate, setStartDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');

  const openEdit = (project: Project) => {
    setEditingProject(project);
    setName(project.name);
    setClientId(project.clientId);
    setAssigneeId(project.assigneeId || '');
    setStatus(project.status);
    setRevision(project.revision);
    setStartDate(project.startDate || '');
    setDeliveryDate(project.deliveryDate || '');
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
      status,
      revision,
      startDate,
      deliveryDate,
      dueDate: deliveryDate
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

  // Filtragem operacional (Projetos em andamento ou ativos)
  const activeProjects = useMemo(() => {
    return allProjects.filter((p: Project) =>
      [ProjectStatus.QUEUE, ProjectStatus.IN_PROGRESS, ProjectStatus.PAUSED].includes(p.status)
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

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case ProjectStatus.IN_PROGRESS: return 'bg-indigo-600';
      case ProjectStatus.PAUSED: return 'bg-purple-500';
      case ProjectStatus.QUEUE: return 'bg-slate-500';
      default: return 'bg-slate-700';
    }
  };

  const dayWidth = 64;
  const todayStr = new Date().toDateString();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Cronograma de Fluxo</h1>
          <p className="text-slate-500 text-sm font-medium">Controle temporal de projetos operacionais</p>
        </div>
      </div>

      <div className="bg-[#1e293b] rounded-[32px] shadow-2xl border border-slate-700 overflow-hidden flex flex-col md:flex-row h-[calc(100vh-220px)] min-h-[500px]">
        {/* Sidebar Projetos: Clicável para abrir cadastro */}
        <div className="w-full md:w-80 border-r border-slate-700/80 overflow-y-auto shrink-0 bg-[#1e293b] z-20 shadow-2xl">
          <div className="h-16 flex items-center px-6 border-b border-slate-700/80 bg-slate-800/50 sticky top-0 z-10">
            <span className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400">Projetos Ativos</span>
          </div>
          <div className="divide-y divide-slate-700/80">
            {activeProjects.map((project: Project) => {
              const client = allClients.find((c: Client) => c.id === project.clientId);
              return (
                <div key={project.id} className="h-20 px-6 flex flex-col justify-center border-l-4 border-transparent hover:bg-slate-800/60 transition-all cursor-pointer group" onClick={() => openEdit(project)}>
                  <span className="text-[9px] font-mono font-black text-indigo-400/40 uppercase tracking-tighter mb-0.5 block">{project.code}</span>
                  <h4 className="text-xs font-black text-slate-100 truncate group-hover:text-indigo-400 leading-tight whitespace-normal">{project.name}</h4>
                  <p className="text-[9px] text-slate-500 font-bold truncate mt-1 italic">{client?.name || 'Cliente s/ Ref.'}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Timeline Area */}
        <div className="flex-1 overflow-x-auto overflow-y-auto bg-slate-900/10 relative">
          <div style={{ width: `${timelineDates.length * dayWidth}px` }} className="h-full relative flex flex-col min-w-full">

            {/* HOJE Highlight Overlay: Atravessa todo o gráfico e cabeçalho */}
            <div className="absolute inset-0 flex pointer-events-none z-40">
              {timelineDates.map((date, i) => (
                <div
                  key={i}
                  style={{ width: `${dayWidth}px` }}
                  className={`h-full border-r border-slate-700/80 shrink-0 ${date.toDateString() === todayStr ? 'bg-orange-500/10 border-l-2 border-orange-500/40' : ''}`}
                ></div>
              ))}
            </div>

            {/* Header Dates */}
            <div className="h-16 border-b border-slate-700/80 flex sticky top-0 bg-[#1e293b] z-30">
              {timelineDates.map((date, idx) => {
                const isToday = date.toDateString() === todayStr;
                return (
                  <div key={idx} style={{ width: `${dayWidth}px` }} className={`shrink-0 flex flex-col items-center justify-center border-r border-slate-700/80 ${isToday ? 'bg-orange-500/20' : ''}`}>
                    <span className={`text-[10px] font-black ${isToday ? 'text-orange-400 scale-110' : 'text-slate-200'}`}>
                      {date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </span>
                    <span className={`text-[8px] font-black uppercase tracking-tighter mt-1 ${isToday ? 'text-orange-500' : 'text-slate-500'}`}>
                      {date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Rows */}
            <div className="flex-1 divide-y divide-slate-700/80">
              {activeProjects.map((project: Project) => {
                const start = project.startDate ? new Date(project.startDate + 'T12:00:00') : null;
                const end = project.deliveryDate ? new Date(project.deliveryDate + 'T12:00:00') : null;
                let offset = 0; let width = 0;
                if (start && end) {
                  const diffStart = Math.floor((start.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
                  const diffDuration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                  offset = diffStart * dayWidth; width = diffDuration * dayWidth;
                }

                return (
                  <div key={project.id} className="h-20 relative flex items-center group/row hover:z-[90]">
                    {/* Barra de Status Minimalista (Sem texto) */}
                    {width > 0 && (
                      <div
                        style={{ left: `${offset}px`, width: `${width}px` }}
                        className={`absolute h-7 rounded-full shadow-lg border-b-2 transition-all duration-300 hover:brightness-125 z-10 cursor-pointer ${getStatusColor(project.status)} border-white/5`}
                        onClick={() => openEdit(project)}
                      >
                        {/* TOOLTIP: z-[100] garante sobreposição total inclusive ao cabeçalho */}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 p-4 bg-slate-900 border border-slate-700 rounded-2xl opacity-0 group-hover/row:opacity-100 transition-all transform translate-y-2 group-hover/row:translate-y-0 z-[100] pointer-events-none shadow-[0_20px_50px_rgba(0,0,0,0.6)] min-w-[240px] ring-1 ring-white/10">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{project.code}</p>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${getStatusColor(project.status)} text-white`}>{project.status}</span>
                          </div>
                          <p className="text-xs font-bold text-white mb-3 leading-tight whitespace-normal">{project.name}</p>
                          <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-3">
                            <div>
                              <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Início</p>
                              <p className="text-[10px] font-bold text-slate-300">{start?.toLocaleDateString('pt-BR')}</p>
                            </div>
                            <div>
                              <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Entrega</p>
                              <p className="text-[10px] font-bold text-slate-300">{end?.toLocaleDateString('pt-BR')}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal (Portal para cadastro via cronograma) */}
      {editingProject && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-[#1e293b] rounded-[32px] shadow-2xl w-full max-w-2xl border border-slate-700 p-8 animate-in zoom-in duration-200">
            <h3 className="text-white font-black uppercase mb-6 text-sm tracking-widest">Consultar / Alterar Cadastro</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Nome do Projeto</label>
                <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Início</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Entrega</label>
                  <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Status</label>
                  <select value={status} onChange={(e: any) => setStatus(e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none">
                    {Object.values(ProjectStatus).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Revisão</label>
                  <input type="text" value={revision} onChange={e => setRevision(e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none" />
                </div>
              </div>
              <div className="flex space-x-3 pt-6 border-t border-slate-800">
                <button type="button" onClick={() => setEditingProject(null)} className="flex-1 bg-slate-800 p-4 rounded-2xl font-black uppercase text-xs tracking-widest text-slate-500 hover:text-white transition">Cancelar</button>
                <button type="submit" className="flex-1 bg-indigo-600 p-4 rounded-2xl font-black uppercase text-xs tracking-widest text-white shadow-xl shadow-indigo-500/20 active:scale-95 transition-all">Salvar Projeto</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
