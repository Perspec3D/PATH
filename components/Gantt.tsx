
import React, { useMemo, useState, useRef, useEffect } from 'react';
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Cronograma de Fluxo</h1>
          <p className="text-slate-500 text-sm font-medium">Controle temporal de projetos operacionais</p>
        </div>
      </div>

      <div className="bg-[#1e293b] rounded-[40px] shadow-2xl border border-slate-700 p-3 overflow-hidden relative">
        <div className="overflow-auto max-h-[calc(100vh-240px)] rounded-[24px] scrollbar-thin scrollbar-thumb-slate-700/50 scrollbar-track-transparent">
          <div style={{ minWidth: `${320 + timelineDates.length * dayWidth}px` }} className="flex flex-col pb-64">
            {/* HEADER FIXO (TOP E LEFT) */}
            <div className="flex sticky top-0 z-50 bg-[#1e293b]">
              {/* Canto superior esquerdo fixo */}
              <div className="w-80 border-r border-b border-slate-700/80 px-6 h-16 flex items-center shrink-0 sticky left-0 z-[60] bg-slate-800/80 backdrop-blur-md">
                <span className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400">Projetos Ativos</span>
              </div>

              {/* Cabeçalho de Datas fixo no Topo */}
              <div className="flex border-b border-slate-700/80 bg-slate-800/50 flex-1 h-16 relative">
                {/* Hoje Highlight no Header */}
                <div className="absolute inset-0 flex pointer-events-none z-10">
                  {timelineDates.map((date, i) => (
                    <div key={i} style={{ width: `${dayWidth}px` }} className={`h-full shrink-0 ${date.toDateString() === todayStr ? 'bg-orange-500/10 border-x border-orange-500/40' : ''}`}></div>
                  ))}
                </div>
                <div className="flex items-stretch relative z-20">
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
              </div>
            </div>

            {/* CONTEÚDO */}
            <div className="flex flex-col divide-y divide-slate-700/80 relative">
              {activeProjects.map((project: Project) => {
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
                    <div className="flex group/row hover:bg-slate-800/30 transition-colors relative hover:z-[60]">
                      {/* Sidebar Projeto: FIXO NA ESQUERDA */}
                      <div className="w-80 px-6 h-20 flex items-center border-r border-slate-700/80 shrink-0 sticky left-0 z-40 bg-[#1e293b]/95 backdrop-blur-sm group hover:bg-slate-800 transition-all border-l-4 border-transparent">
                        {hasSubtasks ? (
                          <button
                            onClick={() => toggleExpand(project.id)}
                            className={`w-6 h-6 flex items-center justify-center rounded-lg border border-slate-700 mr-3 transition-colors ${isExpanded ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white hover:border-slate-500'}`}
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
                          <span className="text-[9px] font-mono font-black text-indigo-400/40 uppercase tracking-tighter mb-0.5 block">{project.code}</span>
                          <h4 className="text-xs font-black text-slate-100 truncate group-hover:text-indigo-400 leading-tight whitespace-normal">{project.name}</h4>
                          <p className="text-[9px] text-slate-500 font-bold truncate mt-1 italic">{client?.name || 'Cliente s/ Ref.'}</p>
                        </div>
                      </div>

                      {/* Timeline Row */}
                      <div className="flex-1 h-20 relative bg-slate-900/10 overflow-visible">
                        <div className="absolute inset-0 flex pointer-events-none z-10">
                          {timelineDates.map((date, i) => (
                            <div key={i} style={{ width: `${dayWidth}px` }} className={`h-full border-r border-slate-700/80 shrink-0 ${date.toDateString() === todayStr ? 'bg-orange-500/10 border-x border-orange-500/30' : ''}`}></div>
                          ))}
                        </div>

                        {width > 0 && (
                          <div
                            style={{ left: `${offset}px`, width: `${width}px` }}
                            className={`absolute top-1/2 -translate-y-1/2 h-7 rounded-full shadow-lg border-b-2 transition-all duration-300 hover:brightness-125 z-20 cursor-pointer ${getStatusColor(project.status)} border-white/5`}
                            onClick={() => openEdit(project)}
                          >
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 p-4 bg-slate-900 border border-slate-700 rounded-2xl opacity-0 group-hover/row:opacity-100 transition-all transform translate-y-2 group-hover/row:translate-y-0 z-[100] pointer-events-none shadow-[0_20px_50px_rgba(0,0,0,0.6)] min-w-[240px] ring-1 ring-white/10">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{project.code}</p>
                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${getStatusColor(project.status)} text-white`}>{project.status}</span>
                              </div>
                              <p className="text-xs font-bold text-white mb-3 leading-tight whitespace-normal">{project.name}</p>
                              <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-3">
                                <div><p className="text-[8px] font-black text-slate-500 uppercase mb-1">Início</p><p className="text-[10px] font-bold text-slate-300">{start?.toLocaleDateString('pt-BR')}</p></div>
                                <div><p className="text-[8px] font-black text-slate-500 uppercase mb-1">Entrega</p><p className="text-[10px] font-bold text-slate-300">{end?.toLocaleDateString('pt-BR')}</p></div>
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
                        <div key={st.id} className="flex group/sub hover:bg-slate-800/20 transition-colors relative hover:z-[55] bg-slate-900/20">
                          {/* Sidebar Sub-tarefa */}
                          <div className="w-80 pl-16 pr-6 h-12 flex flex-col justify-center border-r border-slate-700/80 shrink-0 sticky left-0 z-40 bg-[#1e293b]/95 backdrop-blur-sm border-l-4 border-indigo-500/20">
                            <h5 className="text-[11px] font-bold text-slate-400 truncate leading-tight">{st.name}</h5>
                            <p className="text-[8px] text-slate-600 font-black uppercase tracking-widest mt-0.5">
                              {allUsers.find(u => u.id === st.assigneeId)?.username.split(' ')[0] || 'S/ RESP.'}
                            </p>
                          </div>

                          {/* Timeline Sub-tarefa */}
                          <div className="flex-1 h-12 relative bg-slate-900/5 overflow-visible">
                            <div className="absolute inset-0 flex pointer-events-none z-10">
                              {timelineDates.map((date, i) => (
                                <div key={i} style={{ width: `${dayWidth}px` }} className={`h-full border-r border-slate-700/40 shrink-0 ${date.toDateString() === todayStr ? 'bg-orange-500/5' : ''}`}></div>
                              ))}
                            </div>

                            {stWidth > 0 && (
                              <div
                                style={{ left: `${stOffset}px`, width: `${stWidth}px` }}
                                className={`absolute top-1/2 -translate-y-1/2 h-2.5 rounded-full shadow-sm transition-all duration-300 hover:brightness-125 z-20 ${getStatusColor(st.status)} opacity-60 hover:opacity-100 animate-in fade-in duration-500`}
                              >
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-3 bg-slate-900 border border-slate-700 rounded-xl opacity-0 group-hover/sub:opacity-100 transition-all transform translate-y-1 group-hover/sub:translate-y-0 z-[100] pointer-events-none shadow-2xl min-w-[180px] ring-1 ring-white/5">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">SUB-TAREFA</p>
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
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal (Portal para cadastro via cronograma) */}
      {
        editingProject && (
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
        )
      }
    </div >
  );
};
