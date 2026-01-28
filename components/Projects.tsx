
import React, { useState, useMemo, useRef } from 'react';
import { Project, ProjectStatus, Client, InternalUser } from '../types';
import { getNextGlobalProjectSeq, syncProject, AppDB } from '../storage';

interface ProjectsProps {
  db: AppDB;
  setDb: (db: AppDB) => void;
  currentUser: InternalUser;
}

export const Projects: React.FC<ProjectsProps> = ({ db, setDb, currentUser }) => {
  const [showModal, setShowModal] = useState(false);
  const [showImageZoom, setShowImageZoom] = useState<string | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [clientFilter, setClientFilter] = useState<string>('ALL');
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [status, setStatus] = useState<ProjectStatus>(ProjectStatus.QUEUE);
  const [revision, setRevision] = useState('Rev.00');
  const [startDate, setStartDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setName('');
    setClientId('');
    setAssigneeId('');
    setStatus(ProjectStatus.QUEUE);
    setRevision('Rev.00');
    setStartDate('');
    setDeliveryDate('');
    setPhotoUrl('');
    setNotes('');
    setEditingProject(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '---';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const calculateWorkingDays = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return '---';
    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endStr.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return '---';
    if (start > end) return '0 dias';
    let count = 0;
    const curDate = new Date(start.getTime());
    while (curDate <= end) {
      const dayOfWeek = curDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
      curDate.setDate(curDate.getDate() + 1);
    }
    return `${count} ${count === 1 ? 'dia' : 'dias'}`;
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Imagem muito grande! Máximo 2MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => setPhotoUrl(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Deseja realmente remover a imagem deste projeto?")) {
      setPhotoUrl('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
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
    setPhotoUrl(project.photoUrl || '');
    setNotes(project.notes || '');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      alert("Selecione um cliente");
      return;
    }
    const client = db.clients.find((c: Client) => c.id === clientId);
    if (!client) return;

    let finalCode = editingProject?.code || "";
    if (!editingProject) {
      const seq = getNextGlobalProjectSeq(db.projects);
      const yearYY = new Date().getFullYear().toString().slice(-2);
      finalCode = `${client.code}-${seq.toString().padStart(3, '0')}-${yearYY}`;
    }

    const projectData: Project = {
      id: editingProject?.id || crypto.randomUUID(),
      workspaceId: currentUser.workspaceId,
      clientId,
      assigneeId,
      code: finalCode,
      name,
      status,
      revision,
      startDate,
      dueDate: deliveryDate,
      deliveryDate,
      photoUrl,
      notes,
      createdAt: editingProject?.createdAt || Date.now(),
    };

    try {
      await syncProject(projectData);

      let newProjects;
      if (editingProject) {
        newProjects = db.projects.map((p: Project) => p.id === editingProject.id ? projectData : p);
      } else {
        newProjects = [...db.projects, projectData];
      }

      setDb({ ...db, projects: newProjects });
      setShowModal(false);
      resetForm();
    } catch (err: any) {
      alert("Erro ao salvar no Supabase: " + (err.message || "Erro desconhecido"));
    }
  };

  const getDeliveryDateStyle = (dateStr: string, currentStatus: ProjectStatus) => {
    if (!dateStr || currentStatus === ProjectStatus.DONE || currentStatus === ProjectStatus.CANCELED) return 'text-slate-500 font-medium';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = dateStr.split('-').map(Number);
    const delivery = new Date(y, m - 1, d);
    delivery.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((delivery.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'text-rose-500 font-black';
    if (diffDays === 1) return 'text-orange-500 font-black';
    if (diffDays === 2) return 'text-amber-400 font-black';

    return 'text-slate-500 font-black';
  };

  const filteredProjects = useMemo(() => {
    return db.projects.filter((p: Project) => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.code.includes(search);
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
      const matchesClient = clientFilter === 'ALL' || p.clientId === clientFilter;
      return matchesSearch && matchesStatus && matchesClient;
    }).sort((a: Project, b: Project) => b.createdAt - a.createdAt);
  }, [db.projects, search, statusFilter, clientFilter]);

  const getStatusStyle = (s: ProjectStatus) => {
    switch (s) {
      case ProjectStatus.DONE: return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case ProjectStatus.IN_PROGRESS: return 'bg-blue-600/10 text-blue-400 border border-blue-500/20';
      case ProjectStatus.PAUSED: return 'bg-purple-600/10 text-purple-400 border border-purple-500/20';
      case ProjectStatus.QUEUE: return 'bg-slate-700/10 text-slate-400 border border-slate-700/30';
      case ProjectStatus.CANCELED: return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
      default: return 'bg-slate-700/10 text-slate-400 border border-slate-700/30';
    }
  };

  const getPreviewCode = () => {
    const client = db.clients.find((c: Client) => c.id === clientId);
    if (!client) return "---";
    const seq = getNextGlobalProjectSeq(db.projects);
    const yearYY = new Date().getFullYear().toString().slice(-2);
    return `${client.code}-${seq.toString().padStart(3, '0')}-${yearYY}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-white tracking-tight">Gestão de Projetos</h1>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-500/20 flex items-center font-bold text-sm"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
          Criar Projeto
        </button>
      </div>

      <div className="bg-[#1e293b] p-6 rounded-2xl shadow-xl border border-slate-800 flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[250px]">
          <input
            type="text"
            placeholder="Pesquisar projetos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm text-white"
          />
          <svg className="w-5 h-5 absolute left-4 top-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
        <select
          className="bg-slate-900/50 border border-slate-700 text-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-bold cursor-pointer"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">Status: Todos</option>
          {Object.values(ProjectStatus).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          className="bg-slate-900/50 border border-slate-700 text-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-bold cursor-pointer"
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
        >
          <option value="ALL">Cliente: Todos</option>
          {db.clients.map((c: Client) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="bg-[#1e293b] rounded-2xl shadow-xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#2a374a] border-b border-slate-800">
                <th className="w-2 px-0 py-4"></th>
                <th className="px-2.5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-12">Mini</th>
                <th className="px-2.5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[450px]">Nome do Projeto</th>
                <th className="px-2.5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-32 text-center">Código</th>
                <th className="px-2.5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-40">Cliente</th>
                <th className="px-2.5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-36">Status</th>
                <th className="px-2.5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-32">Responsável</th>
                <th className="px-2.5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-32">Prazo</th>
                <th className="px-2.5 py-4 text-right w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredProjects.map((project: Project) => {
                const client = db.clients.find((c: Client) => c.id === project.clientId);
                const assignee = db.users.find((u: InternalUser) => u.id === project.assigneeId);
                const workingDays = calculateWorkingDays(project.startDate || '', project.deliveryDate || '');
                const dateStyle = getDeliveryDateStyle(project.deliveryDate || '', project.status);

                return (
                  <tr key={project.id} className="hover:bg-slate-700/20 transition-colors group relative border-l-4 border-transparent">
                    <td className="w-2 p-0">
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${project.status === ProjectStatus.DONE ? 'bg-emerald-500' : project.status === ProjectStatus.IN_PROGRESS ? 'bg-blue-500' : project.status === ProjectStatus.PAUSED ? 'bg-purple-500' : project.status === ProjectStatus.CANCELED ? 'bg-orange-500' : 'bg-slate-600'}`}></div>
                    </td>
                    <td className="px-2.5 py-4 text-center">
                      <div className="flex justify-center">
                        <div
                          className="cursor-pointer transition-transform hover:scale-110 active:scale-95"
                          onClick={() => project.photoUrl && setShowImageZoom(project.photoUrl)}
                        >
                          {project.photoUrl ? (
                            <img src={project.photoUrl} className="w-8 h-8 rounded-lg object-cover ring-1 ring-slate-700 shadow-lg mx-auto" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-600 border border-slate-700/50 mx-auto">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-2.5 py-4">
                      <button onClick={() => openEdit(project)} className="font-bold text-slate-100 hover:text-indigo-400 transition-colors text-left outline-none whitespace-normal break-words leading-tight block w-full">
                        {project.name}
                      </button>
                    </td>
                    <td className="px-2.5 py-4 text-center">
                      <div className="flex flex-col whitespace-nowrap">
                        <span className="font-mono text-[10px] text-indigo-400 tracking-tighter uppercase font-black">{project.code}</span>
                        <span className="text-[8px] text-slate-600 font-black uppercase tracking-widest">{project.revision}</span>
                      </div>
                    </td>
                    <td className="px-2.5 py-4">
                      <button
                        onClick={() => client && setViewingClient(client)}
                        className="text-[11px] text-slate-400 font-medium hover:text-indigo-400 transition-colors outline-none text-left truncate max-w-[150px] block"
                      >
                        {client?.name || '---'}
                      </button>
                    </td>
                    <td className="px-2.5 py-4 text-center">
                      <span className={`inline-block px-2 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest min-w-[110px] text-center shadow-sm ${getStatusStyle(project.status)}`}>
                        {project.status}
                      </span>
                    </td>
                    <td className="px-2.5 py-4">
                      {assignee ? (
                        <div className="flex items-center space-x-1.5">
                          <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[8px] font-black text-indigo-400 uppercase">
                            {assignee.username.charAt(0)}
                          </div>
                          <span className="text-[11px] text-slate-300 font-bold truncate max-w-[100px]">{assignee.username}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-600 italic">---</span>
                      )}
                    </td>
                    <td className="px-2.5 py-4 text-center">
                      <div className="flex flex-col items-center space-y-0.5">
                        <div className="flex items-center text-[9px] font-bold text-slate-500 whitespace-nowrap">
                          <span className="text-emerald-500 mr-1.5 font-black">→</span>
                          {formatDate(project.startDate)}
                        </div>
                        <div className={`text-[11px] font-black flex items-center whitespace-nowrap ${dateStyle}`}>
                          {formatDate(project.deliveryDate)}
                          <span className="text-rose-500 ml-1.5 font-black">→</span>
                        </div>
                        <div className="text-[8px] font-black text-slate-600 bg-slate-800/60 px-2 py-0.5 rounded-full border border-slate-700/50 uppercase tracking-tighter mt-0.5">
                          {workingDays.split(' ')[0]}d úteis
                        </div>
                      </div>
                    </td>
                    <td className="px-2.5 py-4 text-right">
                      <button onClick={() => openEdit(project)} className="p-1.5 text-slate-500 hover:text-white transition-colors bg-slate-800/40 hover:bg-slate-800 rounded-lg">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredProjects.length === 0 && <div className="py-24 text-center text-slate-600 font-black uppercase tracking-[0.2em] text-xs">Nenhum projeto encontrado</div>}
        </div>
      </div>

      {/* MODAL: Cadastro/Edição de Projeto */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#1e293b] rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200 border border-slate-700 my-8">
            <div className="px-8 py-6 border-b border-slate-800 flex items-center justify-between bg-slate-800/30">
              <h3 className="font-black text-white uppercase tracking-widest text-sm">{editingProject ? 'Editar Detalhes' : 'Novo Projeto'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={handleSave} className="p-8 space-y-6">
              {/* Conteúdo do Formulário */}
              <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50 flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Código Informativo (Auto)</p>
                    <p className="text-sm font-mono text-indigo-400 font-bold">{editingProject ? editingProject.code : getPreviewCode()}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-5">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Cliente *</label>
                    <select required value={clientId} disabled={!!editingProject} className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium" onChange={(e) => setClientId(e.target.value)}>
                      <option value="">Selecione o Cliente...</option>
                      {db.clients.filter((c: any) => c.status === 'ACTIVE').map((c: Client) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Responsável *</label>
                    <select required value={assigneeId} className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium" onChange={(e) => setAssigneeId(e.target.value)}>
                      <option value="">Selecione um usuário...</option>
                      {db.users.filter((u: any) => u.isActive).map((u: InternalUser) => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Nome do Projeto *</label>
                    <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium" placeholder="Ex: Reforma Pavimento Superior" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Revisão</label>
                      <input type="text" value={revision} onChange={(e) => setRevision(e.target.value)} className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 outline-none font-medium" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Status</label>
                      <select value={status} onChange={(e: any) => setStatus(e.target.value)} className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 outline-none font-medium cursor-pointer">
                        {Object.values(ProjectStatus).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Data Início</label>
                      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Data Entrega</label>
                      <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Imagem do Projeto</label>
                    <div className="relative h-56 w-full rounded-2xl bg-slate-900 border-2 border-slate-700 border-dashed overflow-hidden flex flex-col items-center justify-center group transition-all hover:border-indigo-500/50">
                      {photoUrl ? (
                        <div className="relative w-full h-full">
                          <img src={photoUrl} className="absolute inset-0 w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-slate-900/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center space-y-3 p-4">
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full py-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-lg hover:bg-indigo-700 transition">Alterar Foto</button>
                            <button type="button" onClick={removePhoto} className="w-full py-2 bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-lg hover:bg-rose-700 transition">Remover Imagem</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center pointer-events-none text-center px-4">
                          <svg className="w-10 h-10 text-slate-700 mb-2 group-hover:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest text-center">Clique para Carregar Foto</span>
                        </div>
                      )}
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className={`absolute inset-0 cursor-pointer ${photoUrl ? 'hidden' : 'opacity-0'}`} />
                    </div>
                    <p className="text-[9px] font-bold text-slate-500 text-center uppercase tracking-widest leading-relaxed mt-2">
                      Formatos: JPG, PNG | Máximo 2MB
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Anotações do Projeto</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium min-h-[100px] resize-none"
                  placeholder="Observações técnicas, contatos adicionais ou notas de andamento..."
                />
              </div>

              <div className="pt-8 border-t border-slate-800 flex space-x-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-4 bg-slate-800 text-slate-500 rounded-2xl text-xs font-black uppercase tracking-widest hover:text-slate-100 transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:bg-indigo-700 transition-all active:scale-[0.98]">Salvar Projeto</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImageZoom && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100] flex items-center justify-center p-8" onClick={() => setShowImageZoom(null)}>
          <div className="relative max-w-full max-h-full">
            <img src={showImageZoom} className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain animate-in zoom-in duration-300" />
          </div>
        </div>
      )}

      {viewingClient && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[100] flex items-center justify-center p-4 transition-all animate-in fade-in duration-300">
          <div className="bg-[#1e293b] rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-700 animate-in zoom-in duration-300">
            <div className="px-8 py-6 border-b border-slate-800 flex items-center justify-between bg-indigo-600 shadow-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
                <div>
                  <h3 className="font-black uppercase tracking-[0.2em] text-xs text-indigo-100 opacity-80 mb-0.5">Ficha do Cliente</h3>
                  <p className="text-white font-black text-lg leading-tight uppercase tracking-tight">{viewingClient.name}</p>
                </div>
              </div>
              <button
                onClick={() => setViewingClient(null)}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-all active:scale-95"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                {/* Coluna 1: Identificação e Contato */}
                <div className="space-y-6">
                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-900 border border-slate-700 rounded-xl">
                      <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Código do Cliente</p>
                      <p className="text-white font-bold font-mono text-sm tracking-widest">{viewingClient.code}</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-900 border border-slate-700 rounded-xl">
                      <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">E-mail</p>
                      <p className="text-white font-bold text-sm truncate">{viewingClient.email || 'Não informado'}</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-900 border border-slate-700 rounded-xl">
                      <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Telefone</p>
                      <p className="text-white font-bold text-sm">{viewingClient.phone || 'Não informado'}</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-900 border border-slate-700 rounded-xl">
                      <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{viewingClient.type === 'PF' ? 'CPF' : 'CNPJ'}</p>
                      <p className="text-white font-bold text-sm tracking-wide">{viewingClient.cpfCnpj || 'Não informado'}</p>
                    </div>
                  </div>
                </div>

                {/* Coluna 2: Localização */}
                <div className="space-y-6">
                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-900 border border-slate-700 rounded-xl">
                      <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">CEP</p>
                      <p className="text-white font-bold text-sm tracking-widest">{viewingClient.zipCode || 'Não informado'}</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-900 border border-slate-700 rounded-xl">
                      <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Endereço</p>
                      <p className="text-white font-bold text-sm leading-tight">{viewingClient.address ? `${viewingClient.address}, nº ${viewingClient.number || 'S/N'}` : 'Não informado'}</p>
                      {viewingClient.neighborhood && <p className="text-slate-400 text-[11px] font-medium mt-0.5">{viewingClient.neighborhood}</p>}
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-900 border border-slate-700 rounded-xl">
                      <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-10V4m-5 10h.01M19 7h.01M19 11h.01M19 15h.01M7 7h.01M7 11h.01M7 15h.01M7 19h.01M17 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Cidade / UF</p>
                      <p className="text-white font-bold text-sm uppercase">{viewingClient.city && viewingClient.state ? `${viewingClient.city} - ${viewingClient.state}` : 'Não informado'}</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-900 border border-slate-700 rounded-xl">
                      <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Status Cadastral</p>
                      <div className="mt-1 flex items-center space-x-2">
                        <span className={`w-2 h-2 rounded-full ${viewingClient.status === 'ACTIVE' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></span>
                        <span className={`text-[11px] font-black uppercase tracking-[0.1em] ${viewingClient.status === 'ACTIVE' ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {viewingClient.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-slate-800 flex space-x-4">
                <button
                  onClick={() => setViewingClient(null)}
                  className="flex-1 py-4 bg-slate-800 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:bg-slate-700 hover:text-white transition-all active:scale-[0.98]"
                >
                  Fechar Ficha
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
