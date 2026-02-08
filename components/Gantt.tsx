
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

  const [viewMode, setViewMode] = useState<'selector' | 'flow' | 'assignments'>('selector');
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Form State for local Edit Modal (Consultancy Base)
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [status, setStatus] = useState<ProjectStatus>(ProjectStatus.QUEUE);
  const [revision, setRevision] = useState('');
  const [startDate, setStartDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [subtasks, setSubtasks] = useState<any[]>([]); // Para edição no modal

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

  if (viewMode === 'selector') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-12 animate-in zoom-in duration-500">
        <div className="text-center">
          <h1 className="text-4xl font-black text-white tracking-widest uppercase mb-3">Central de Cronogramas</h1>
          <p className="text-slate-500 font-bold uppercase text-xs tracking-[0.3em]">Escolha a perspectiva ideal para sua gestão</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-5xl px-4">
          {/* CARD: FLUXO */}
          <div
            onClick={() => setViewMode('flow')}
            className="group cursor-pointer bg-slate-800/40 border border-slate-700/50 rounded-[40px] p-8 hover:bg-slate-800/60 hover:border-indigo-500/50 transition-all duration-500 hover:shadow-[0_20px_50px_rgba(79,70,229,0.1)] relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
              <svg className="w-24 h-24 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            </div>
            <div className="relative z-10">
              <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-indigo-500/20 transition-colors">
                <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
              </div>
              <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">Cronograma de Fluxo</h3>
              <p className="text-slate-400 text-sm font-medium leading-relaxed">Visão clássica focada em Projetos e Sub-tarefas. Ideal para acompanhar prazos de entrega e progresso operacional.</p>
              <div className="mt-8 flex items-center text-indigo-400 font-black text-[10px] uppercase tracking-widest opacity-0 group-hover:opacity-100 transform translate-x-[-10px] group-hover:translate-x-0 transition-all">
                Acessar Visão <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </div>
            </div>
          </div>

          {/* CARD: ATRIBUIÇÕES */}
          <div
            onClick={() => setViewMode('assignments')}
            className="group cursor-pointer bg-slate-800/40 border border-slate-700/50 rounded-[40px] p-8 hover:bg-emerald-800/40 hover:border-emerald-500/50 transition-all duration-500 hover:shadow-[0_20px_50px_rgba(16,185,129,0.1)] relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
              <svg className="w-24 h-24 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            </div>
            <div className="relative z-10">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-emerald-500/20 transition-colors">
                <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
              </div>
              <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">Cronograma de Atribuições</h3>
              <p className="text-slate-400 text-sm font-medium leading-relaxed">Visão de carga de equipe. Veja o que cada profissional está executando e identifique gargalos ou disponibilidade.</p>
              <div className="mt-8 flex items-center text-emerald-400 font-black text-[10px] uppercase tracking-widest opacity-0 group-hover:opacity-100 transform translate-x-[-10px] group-hover:translate-x-0 transition-all">
                Acessar Visão <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
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
            className="group mb-2 flex items-center text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-400 transition-colors"
          >
            <svg className="w-4 h-4 mr-1 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
            Voltar para Seleção
          </button>
          <h1 className="text-2xl font-black text-white tracking-tight">
            {viewMode === 'flow' ? 'Cronograma de Fluxo' : 'Cronograma de Atribuições'}
          </h1>
          <p className="text-slate-500 text-sm font-medium">
            {viewMode === 'flow' ? 'Controle temporal de projetos operacionais' : 'Gestão de carga e disponibilidade da equipe'}
          </p>
        </div>
      </div>

      <div className="bg-[#1e293b] rounded-[40px] shadow-2xl border border-slate-700 p-3 overflow-hidden relative">
        <div className="overflow-auto max-h-[calc(100vh-240px)] rounded-[24px] scrollbar-thin scrollbar-thumb-slate-700/50 scrollbar-track-transparent">
          <div style={{ minWidth: `${320 + timelineDates.length * dayWidth}px` }} className="flex flex-col pb-64">
            {/* HEADER FIXO (TOP E LEFT) */}
            <div className="flex sticky top-0 z-50 bg-[#1e293b]">
              {/* Canto superior esquerdo fixo */}
              <div className="w-80 border-r border-b border-slate-700/80 px-6 h-16 flex items-center shrink-0 sticky left-0 z-[60] bg-slate-800/80 backdrop-blur-md">
                <span className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  {viewMode === 'flow' ? 'Projetos Ativos' : 'Equipe / Atribuições'}
                </span>
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
                  const allAssignments = [...userTasks, ...userSubtasks];

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
                      const hasOverlap = assignedLanes[laneIndex].some(occ => start < occ.end);
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
                      const s = new Date(t.startDate + 'T12:00:00');
                      const e = new Date(t.deliveryDate + 'T12:00:00');
                      if (date >= s && date <= e) {
                        // Se for subtask, o root é o parent. Se for projeto, é o próprio ID.
                        const rootId = t.type === 'subtask' ? t.parentProject.id : t.id;
                        distinctRootProjectIds.add(rootId);
                      }
                    });

                    if (distinctRootProjectIds.size > 1) {
                      conflictMap.set(date.toDateString(), true);
                    }
                  });

                  const totalLanes = assignedLanes.length || 1;
                  const rowHeight = Math.max(112, totalLanes * 36 + 40); // Base height + 36px per lane + 40px padding

                  return (
                    <div className="flex group/user relative hover:bg-slate-800/20 transition-colors" key={user.id}>
                      {/* Sidebar Usuário */}
                      <div style={{ height: `${rowHeight}px` }} className="w-80 px-6 flex items-center border-r border-slate-700/80 shrink-0 sticky left-0 z-40 bg-[#1e293b]/95 backdrop-blur-sm transition-all border-l-4 border-emerald-500/20">
                        <div className="w-10 h-10 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-slate-400 font-black text-sm uppercase overflow-hidden mr-4">
                          {user.username.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-black text-slate-100 truncate group-hover:text-emerald-400 transition-colors uppercase tracking-tight">{user.username}</h4>
                          <p className="text-[9px] text-slate-500 font-bold mt-1 uppercase tracking-widest">{allAssignments.length} Tarefa(s) ativa(s)</p>
                          {totalLanes > 1 && (
                            <span className="inline-block mt-2 px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-500 text-[8px] font-black rounded-full uppercase tracking-tighter animate-pulse">
                              Conflito de Prazos
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Timeline Usuário */}
                      <div style={{ height: `${rowHeight}px` }} className="flex-1 relative bg-slate-900/10 overflow-visible">
                        {/* Background Grid & Conflict Highlight */}
                        <div className="absolute inset-0 flex pointer-events-none z-10">
                          {timelineDates.map((date, i) => {
                            const isConflict = conflictMap.has(date.toDateString());
                            const isToday = date.toDateString() === todayStr;
                            return (
                              <div key={i} style={{ width: `${dayWidth}px` }} className={`h-full border-r border-slate-700/80 shrink-0 transition-colors duration-500 ${isConflict ? 'bg-red-500/10' : ''} ${isToday ? 'bg-orange-500/10 shadow-[inset_0_0_20px_rgba(249,115,22,0.1)]' : ''}`}>
                                {isConflict && <div className="w-full h-1 bg-red-500/40 absolute top-0" />}
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
                          const topPos = 24 + (task.laneIndex * 36);

                          return (
                            <div
                              key={task.id}
                              style={{ left: `${offset}px`, width: `${width}px`, top: `${topPos}px` }}
                              className={`absolute h-7 rounded-full shadow-lg border-b-2 transition-all duration-300 hover:brightness-125 z-20 cursor-pointer ${getStatusColor(task.status)} border-white/5 opacity-80 hover:opacity-100 flex items-center px-3 group/task active:scale-95`}
                              onClick={() => {
                                if (task.type === 'project') openEdit(task);
                                else openEdit(task.parentProject);
                              }}
                            >
                              <span className="text-[8px] font-black text-white/90 truncate uppercase tracking-tighter">
                                {task.type === 'subtask' ? `[ST] ${task.name}` : task.name}
                              </span>

                              {/* TOOLTIP ATRIBUIÇÃO */}
                              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 p-4 bg-slate-900 border border-slate-700 rounded-2xl opacity-0 group-hover/task:opacity-100 transition-all transform translate-y-2 group-hover/task:translate-y-0 z-[100] pointer-events-none shadow-[0_20px_50px_rgba(0,0,0,0.6)] min-w-[220px] ring-1 ring-white/10">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.2em]">{task.type === 'project' ? 'PROJETO PAI' : 'SUB-TAREFA'}</p>
                                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${getStatusColor(task.status)} text-white`}>{task.status}</span>
                                </div>
                                <p className="text-xs font-bold text-white mb-1 leading-tight whitespace-normal">{task.name}</p>
                                {task.type === 'subtask' && <p className="text-[9px] text-slate-500 font-black uppercase mb-3 truncate">Ref: {task.parentProject?.name}</p>}
                                <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-3">
                                  <div><p className="text-[8px] font-black text-slate-500 uppercase mb-1">Início</p><p className="text-[10px] font-bold text-slate-300">{start?.toLocaleDateString('pt-BR')}</p></div>
                                  <div><p className="text-[8px] font-black text-slate-500 uppercase mb-1">Entrega</p><p className="text-[10px] font-bold text-slate-300">{end?.toLocaleDateString('pt-BR')}</p></div>
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
            <div className="bg-[#1e293b] rounded-[32px] shadow-2xl w-full max-w-2xl border border-slate-700 p-8 animate-in zoom-in duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">
              <h3 className="text-white font-black uppercase mb-6 text-sm tracking-widest">Consultar / Alterar Cadastro</h3>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Código</label>
                    <div className="w-full bg-slate-900/50 border border-slate-700/50 p-3 rounded-xl text-indigo-400 font-mono font-bold text-xs">
                      {editingProject.code}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Nome do Projeto</label>
                    <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
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

                {/* EDIÇÃO DE SUB-TAREFAS */}
                {subtasks.length > 0 && (
                  <div className="pt-6 border-t border-slate-800">
                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4">Cronograma de Sub-tarefas</h4>
                    <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                      {subtasks.map((st, idx) => (
                        <div key={st.id} className="bg-slate-900/50 border border-slate-700/50 p-4 rounded-2xl">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-bold text-white uppercase truncate flex-1 mr-4">{st.name}</span>
                            <span className={`px-2 py-0.5 rounded-[4px] text-[8px] font-black uppercase text-white ${getStatusColor(st.status)}`}>{st.status}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Início ST</label>
                              <input
                                type="date"
                                value={st.startDate || ''}
                                onChange={e => {
                                  const newSts = [...subtasks];
                                  newSts[idx] = { ...st, startDate: e.target.value };
                                  setSubtasks(newSts);
                                }}
                                className="w-full bg-slate-800 border border-slate-700 p-2 rounded-lg text-[10px] text-white outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Entrega ST</label>
                              <input
                                type="date"
                                value={st.deliveryDate || ''}
                                onChange={e => {
                                  const newSts = [...subtasks];
                                  newSts[idx] = { ...st, deliveryDate: e.target.value };
                                  setSubtasks(newSts);
                                }}
                                className="w-full bg-slate-800 border border-slate-700 p-2 rounded-lg text-[10px] text-white outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
