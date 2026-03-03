
import React, { useState, useMemo, useRef } from 'react';
import { Project, ProjectStatus, Client, InternalUser, ProjectSubTask, UserRole } from '../types';
import { getNextGlobalProjectSeq, syncProject, AppDB } from '../storage';

interface ProjectsProps {
  db: AppDB;
  setDb: (db: AppDB) => void;
  currentUser: InternalUser;
  theme: 'dark' | 'light';
}

export const Projects: React.FC<ProjectsProps> = ({ db, setDb, currentUser, theme }) => {
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
  const [customCode, setCustomCode] = useState('');
  const [subtasks, setSubtasks] = useState<ProjectSubTask[]>([]);
  const [usePrefix, setUsePrefix] = useState(false);
  const [codePrefix, setCodePrefix] = useState('');

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
    setCustomCode('');
    setSubtasks([]);
    setUsePrefix(false);
    setCodePrefix('');
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
    setSubtasks(project.subtasks || []);
    // Extrai a sequência central se seguir o padrão [PREFIXO-][CLI]-[SEQ]-[YY]
    const parts = project.code.split('-');
    if (parts.length >= 3) {
      // As últimas 3 partes são sempre CLI-SEQ-YY
      const cliCode = parts[parts.length - 3];
      const seq = parts[parts.length - 2];
      const year = parts[parts.length - 1];

      const prefixParts = parts.slice(0, parts.length - 3);
      if (prefixParts.length > 0) {
        setUsePrefix(true);
        setCodePrefix(prefixParts.join('-'));
      } else {
        setUsePrefix(false);
        setCodePrefix('');
      }
      setCustomCode(seq);
    } else {
      setUsePrefix(false);
      setCodePrefix('');
      setCustomCode(project.code);
    }
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = db.clients.find((c: Client) => c.id === clientId);
    if (!client) return;

    const yearYY = new Date().getFullYear().toString().slice(-2);
    const seq = (customCode || getNextGlobalProjectSeq(db.projects)).toString().padStart(6, '0');
    const baseCode = `${client.code.padStart(3, '0')}-${seq}-${yearYY}`;
    const finalCode = usePrefix && codePrefix ? `${codePrefix}-${baseCode}` : baseCode;

    if (db.projects.some((p: Project) => p.code === finalCode && p.id !== editingProject?.id)) {
      alert("Este código de projeto já está em uso.");
      return;
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
      subtasks,
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

  const handleAddSubTask = () => {
    setSubtasks([...subtasks, {
      id: crypto.randomUUID(),
      name: '',
      status: ProjectStatus.QUEUE,
      startDate: startDate || '',
      deliveryDate: deliveryDate || ''
    }]);
  };

  const handleUpdateSubTask = (id: string, field: keyof ProjectSubTask, value: any) => {
    setSubtasks(current => current.map(st => {
      if (st.id !== id) return st;
      const updated = { ...st, [field]: value };

      // Validação de Datas
      if (field === 'startDate' && startDate && value < startDate) updated.startDate = startDate;
      if (field === 'deliveryDate' && deliveryDate && value > deliveryDate) updated.deliveryDate = deliveryDate;
      if (field === 'startDate' && updated.deliveryDate && value > updated.deliveryDate) updated.startDate = updated.deliveryDate;

      return updated;
    }));
  };

  const handleRemoveSubTask = (id: string) => {
    setSubtasks(subtasks.filter(st => st.id !== id));
  };

  const filteredProjects = useMemo(() => {
    return db.projects.filter((p: Project) => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.code.includes(search);
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
      const matchesClient = clientFilter === 'ALL' || p.clientId === clientFilter;
      return matchesSearch && matchesStatus && matchesClient;
    }).sort((a: Project, b: Project) => b.createdAt - a.createdAt);
  }, [db.projects, search, statusFilter, clientFilter]);

  const getStatusColor = (s: ProjectStatus) => {
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
    const baseSeq = customCode || getNextGlobalProjectSeq(db.projects);
    const seq = baseSeq.toString().padStart(6, '0');
    const yearYY = new Date().getFullYear().toString().slice(-2);
    const baseCode = `${client.code.padStart(3, '0')}-${seq}-${yearYY}`;
    return usePrefix && codePrefix ? `${codePrefix}-${baseCode}` : baseCode;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight transition-colors">Gestão de Projetos</h1>
        {currentUser.role !== UserRole.VIEWER && (
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-500/20 flex items-center font-bold text-sm"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
            Criar Projeto
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-[#1e293b] p-6 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 items-center transition-colors">
        <div className="relative flex-1 min-w-[250px]">
          <input
            type="text"
            placeholder="Pesquisar projetos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm text-slate-900 dark:text-white"
          />
          <svg className="w-5 h-5 absolute left-4 top-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
        <select
          className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-bold cursor-pointer transition-colors"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">Status: Todos</option>
          {Object.values(ProjectStatus).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-bold cursor-pointer transition-colors"
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
        >
          <option value="ALL">Cliente: Todos</option>
          {[...db.clients]
            .sort((a, b) => parseInt(a.code) - parseInt(b.code))
            .map((c: Client) => <option key={c.id} value={c.id}>{c.code.padStart(3, '0')} - {c.name}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 dark:bg-[#2a374a] border-b border-slate-200 dark:border-slate-800 transition-colors">
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
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 transition-colors">
              {filteredProjects.map((project: Project) => {
                const client = db.clients.find((c: Client) => c.id === project.clientId);
                const assignee = db.users.find((u: InternalUser) => u.id === project.assigneeId);
                const workingDays = calculateWorkingDays(project.startDate || '', project.deliveryDate || '');
                const dateStyle = getDeliveryDateStyle(project.deliveryDate || '', project.status);

                return (
                  <tr key={project.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors group relative border-l-4 border-transparent">
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
                            <img src={project.photoUrl} className="w-8 h-8 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700 shadow-lg mx-auto transition-colors" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-300 dark:text-slate-600 border border-slate-100 dark:border-slate-700/50 mx-auto transition-colors">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-2.5 py-4">
                      <button onClick={() => openEdit(project)} className="font-bold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left outline-none whitespace-normal break-words leading-tight block w-full">
                        {project.name}
                      </button>
                    </td>
                    <td className="px-2.5 py-4 text-center">
                      <div className="flex flex-col whitespace-nowrap">
                        <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 tracking-tighter uppercase font-black transition-colors">
                          {project.code}
                        </span>
                        <span className="text-[8px] text-slate-400 dark:text-slate-600 font-black uppercase tracking-widest transition-colors">{project.revision}</span>
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
                      <span className={`inline-block px-2 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest min-w-[110px] text-center shadow-sm ${getStatusColor(project.status)}`}>
                        {project.status}
                      </span>
                    </td>
                    <td className="px-2.5 py-4">
                      {assignee ? (
                        <div className="flex items-center space-x-1.5">
                          <div className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[8px] font-black text-indigo-600 dark:text-indigo-400 uppercase transition-colors">
                            {assignee.username.charAt(0)}
                          </div>
                          <span className="text-[11px] text-slate-600 dark:text-slate-300 font-bold truncate max-w-[100px] transition-colors">{assignee.username}</span>
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
                        <div className="text-[8px] font-black text-slate-500 dark:text-slate-600 bg-slate-100 dark:bg-slate-800/60 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700/50 uppercase tracking-tighter mt-0.5 transition-colors">
                          {workingDays.split(' ')[0]}d úteis
                        </div>
                      </div>
                    </td>
                    <td className="px-2.5 py-4 text-right">
                      <button onClick={() => openEdit(project)} className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors bg-slate-100 dark:bg-slate-800/40 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg">
                        {currentUser.role === UserRole.VIEWER ? (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        )}
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-[#0f172a] rounded-[40px] shadow-2xl w-full max-w-2xl h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-white/5 transition-all duration-500">
            <div className="px-8 py-6 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-white/5 flex items-center justify-between transition-colors">
              <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight transition-colors">
                {currentUser.role === UserRole.VIEWER ? 'Visualizar Detalhes' : (editingProject ? 'Editar Detalhes' : 'Novo Projeto')}
              </h3>
              <button onClick={() => setShowModal(false)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300 dark:hover:bg-white/20 transition-all active:scale-95">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8 dark:bg-[#0f172a] transition-colors">
              {/* Conteúdo do Formulário */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-2">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50 flex items-center space-x-3 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-600/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-1">Código do Projeto</p>
                    <p className="text-sm font-mono text-indigo-600 dark:text-indigo-400 font-bold transition-colors">{getPreviewCode()}</p>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50 transition-colors">
                  <label className="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1 transition-colors">Identificador de Projeto</label>
                  <input
                    type="text"
                    value={customCode}
                    disabled={currentUser.role === UserRole.VIEWER}
                    onChange={(e) => setCustomCode(e.target.value)}
                    className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono transition-colors disabled:opacity-60"
                    placeholder="Ex: 000042"
                  />
                </div>
              </div>

              {/* PREFIX SETUP */}
              <div className="bg-slate-50 dark:bg-slate-900/40 p-5 rounded-[24px] border border-slate-100 dark:border-white/5 space-y-4">
                <label className={`flex items-center space-x-3 cursor-pointer group ${currentUser.role === UserRole.VIEWER ? 'pointer-events-none opacity-60' : ''}`}>
                  <div className={`w-10 h-6 rounded-full transition-all relative ${usePrefix ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${usePrefix ? 'left-5' : 'left-1'}`} />
                  </div>
                  <input
                    type="checkbox"
                    checked={usePrefix}
                    disabled={currentUser.role === UserRole.VIEWER}
                    onChange={(e) => setUsePrefix(e.target.checked)}
                    className="hidden"
                  />
                  <span className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest group-hover:text-indigo-500 transition-colors">Adicionar Prefixo no Código</span>
                </label>

                {usePrefix && (
                  <div className="animate-in slide-in-from-top-2 duration-300">
                    <input
                      type="text"
                      value={codePrefix}
                      disabled={currentUser.role === UserRole.VIEWER}
                      onChange={(e) => setCodePrefix(e.target.value)}
                      placeholder="Ex: Estudo, Protótipo, Interno..."
                      className="w-full px-5 py-3 bg-white dark:bg-slate-900 border border-indigo-500/30 dark:border-indigo-500/20 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all shadow-lg shadow-indigo-500/5 disabled:opacity-60"
                    />
                    <p className="text-[9px] font-bold text-indigo-500/60 uppercase tracking-wider mt-2 ml-1">O prefixo aparecerá antes do código do cliente</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-5">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Cliente *</label>
                    <select required value={clientId} disabled={!!editingProject || currentUser.role === UserRole.VIEWER} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition-colors disabled:opacity-60" onChange={(e) => setClientId(e.target.value)}>
                      <option value="">Selecione o Cliente...</option>
                      {[...db.clients]
                        .filter((c: any) => c.status === 'ACTIVE')
                        .sort((a, b) => parseInt(a.code) - parseInt(b.code))
                        .map((c: Client) => <option key={c.id} value={c.id}>{c.code.padStart(3, '0')} - {c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Responsável *</label>
                    <select required value={assigneeId} disabled={currentUser.role === UserRole.VIEWER} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition-colors disabled:opacity-60" onChange={(e) => setAssigneeId(e.target.value)}>
                      <option value="">Selecione um usuário...</option>
                      {db.users.filter((u: any) => u.isActive).map((u: InternalUser) => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">Nome do Projeto *</label>
                    <input type="text" required value={name} disabled={currentUser.role === UserRole.VIEWER} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition-colors disabled:opacity-60" placeholder="Ex: Reforma Pavimento Superior" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1 transition-colors">Revisão</label>
                      <input type="text" value={revision} disabled={currentUser.role === UserRole.VIEWER} onChange={(e) => setRevision(e.target.value)} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 outline-none font-medium transition-colors disabled:opacity-60" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1 transition-colors">Status</label>
                      <select value={status} disabled={currentUser.role === UserRole.VIEWER} onChange={(e: any) => setStatus(e.target.value)} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 outline-none font-medium cursor-pointer transition-colors disabled:opacity-60">
                        {Object.values(ProjectStatus).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1 transition-colors">Data Início</label>
                      <input type="date" value={startDate} disabled={currentUser.role === UserRole.VIEWER} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition-colors disabled:opacity-60" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1 transition-colors">Data Entrega</label>
                      <input type="date" value={deliveryDate} disabled={currentUser.role === UserRole.VIEWER} onChange={(e) => setDeliveryDate(e.target.value)} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition-colors disabled:opacity-60" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1 transition-colors">Imagem do Projeto</label>
                    <div className="relative h-56 w-full rounded-2xl bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 border-dashed overflow-hidden flex flex-col items-center justify-center group transition-all hover:border-indigo-500/50">
                      {photoUrl ? (
                        <div className="relative w-full h-full">
                          <img src={photoUrl} className="absolute inset-0 w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-slate-900/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center space-y-3 p-4">
                            {currentUser.role !== UserRole.VIEWER && (
                              <>
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full py-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-lg hover:bg-indigo-700 transition">Alterar Foto</button>
                                <button type="button" onClick={removePhoto} className="w-full py-2 bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-lg hover:bg-rose-700 transition">Remover Imagem</button>
                              </>
                            )}
                            {currentUser.role === UserRole.VIEWER && (
                              <span className="text-[10px] font-black text-white uppercase tracking-widest">Somente Leitura</span>
                            )}
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

              {/* SUB-TAREFAS */}
              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800/50 transition-colors">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] flex items-center transition-colors">
                    <svg className="w-4 h-4 mr-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                    Sub-tarefas do Projeto
                  </h4>
                  {currentUser.role !== UserRole.VIEWER && (
                    <button
                      type="button"
                      onClick={handleAddSubTask}
                      className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest rounded-lg border border-indigo-100 dark:border-indigo-500/20 hover:bg-indigo-600 hover:text-white transition-all flex items-center"
                    >
                      <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                      Nova Tarefa
                    </button>
                  )}
                </div>

                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar transition-colors">
                  {subtasks.length === 0 ? (
                    <div className="py-8 text-center bg-slate-50 dark:bg-slate-900/30 rounded-2xl border-2 border-dashed border-slate-100 dark:border-slate-800/50 transition-colors">
                      <p className="text-[10px] text-slate-400 dark:text-slate-600 font-bold uppercase tracking-widest leading-loose">Nenhuma sub-tarefa<br />cadastrada</p>
                    </div>
                  ) : (
                    subtasks.map((st) => (
                      <div key={st.id} className="bg-slate-50 dark:bg-slate-900/80 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-indigo-500/30 transition-all group/task">
                        <div className="flex flex-col space-y-4">
                          <div className="flex items-center space-x-3">
                            <input
                              type="text"
                              value={st.name}
                              disabled={currentUser.role === UserRole.VIEWER}
                              onChange={(e) => handleUpdateSubTask(st.id, 'name', e.target.value)}
                              placeholder="Nome da sub-tarefa..."
                              className="flex-1 bg-transparent border-none text-sm font-bold text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-700 focus:ring-0 p-0 transition-colors disabled:opacity-60"
                            />
                            {currentUser.role !== UserRole.VIEWER && (
                              <button
                                type="button"
                                onClick={() => handleRemoveSubTask(st.id)}
                                className="opacity-0 group-hover/task:opacity-100 p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                            <div className="col-span-1 md:col-span-1">
                              <label className="block text-[8px] font-black text-slate-400 dark:text-slate-600 uppercase mb-1.5 ml-0.5 transition-colors">Responsável</label>
                              <select
                                value={st.assigneeId || ''}
                                disabled={currentUser.role === UserRole.VIEWER}
                                onChange={(e) => handleUpdateSubTask(st.id, 'assigneeId', e.target.value)}
                                className="w-full bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-lg py-1.5 px-2 text-[10px] text-slate-900 dark:text-slate-300 font-bold outline-none focus:ring-1 focus:ring-indigo-500/50 transition-colors disabled:opacity-60"
                              >
                                <option value="">Sem Resp.</option>
                                {db.users.filter(u => u.isActive).map(u => (
                                  <option key={u.id} value={u.id}>{u.username.split(' ')[0]}</option>
                                ))}
                              </select>
                            </div>

                            <div className="col-span-1 md:col-span-1">
                              <label className="block text-[8px] font-black text-slate-400 dark:text-slate-600 uppercase mb-1.5 ml-0.5 transition-colors">Status</label>
                              <select
                                value={st.status}
                                disabled={currentUser.role === UserRole.VIEWER}
                                onChange={(e: any) => handleUpdateSubTask(st.id, 'status', e.target.value)}
                                className={`w-full bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-lg py-1.5 px-2 text-[10px] font-black uppercase tracking-tighter outline-none focus:ring-1 focus:ring-indigo-500/50 transition-colors disabled:opacity-60 ${getStatusColor(st.status).split(' ')[1]}`}
                              >
                                {Object.values(ProjectStatus).map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>

                            <div className="col-span-1 md:col-span-1">
                              <label className="block text-[8px] font-black text-slate-400 dark:text-slate-600 uppercase mb-1.5 ml-0.5 transition-colors">Início</label>
                              <input
                                type="date"
                                value={st.startDate}
                                min={startDate}
                                max={st.deliveryDate || deliveryDate}
                                disabled={currentUser.role === UserRole.VIEWER}
                                onChange={(e) => handleUpdateSubTask(st.id, 'startDate', e.target.value)}
                                className="w-full bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-lg py-1.5 px-2 text-[10px] text-slate-900 dark:text-slate-300 font-medium outline-none transition-colors disabled:opacity-60"
                              />
                            </div>

                            <div className="col-span-1 md:col-span-1">
                              <label className="block text-[8px] font-black text-slate-400 dark:text-slate-600 uppercase mb-1.5 ml-0.5 transition-colors">Entrega</label>
                              <input
                                type="date"
                                value={st.deliveryDate}
                                min={st.startDate || startDate}
                                max={deliveryDate}
                                disabled={currentUser.role === UserRole.VIEWER}
                                onChange={(e) => handleUpdateSubTask(st.id, 'deliveryDate', e.target.value)}
                                className="w-full bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-lg py-1.5 px-2 text-[10px] text-slate-900 dark:text-slate-300 font-medium outline-none transition-colors disabled:opacity-60"
                              />
                            </div>
                          </div>

                          <input
                            type="text"
                            value={st.notes || ''}
                            disabled={currentUser.role === UserRole.VIEWER}
                            onChange={(e) => handleUpdateSubTask(st.id, 'notes', e.target.value)}
                            placeholder="Notas da sub-tarefa..."
                            className="w-full bg-white dark:bg-slate-800/30 border border-slate-100 dark:border-white/5 rounded-xl py-2 px-3 text-[10px] text-slate-500 dark:text-indigo-300/60 placeholder:text-slate-300 dark:placeholder:text-indigo-300/20 outline-none transition-colors disabled:opacity-60"
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1 transition-colors">Anotações do Projeto</label>
                <textarea
                  value={notes}
                  disabled={currentUser.role === UserRole.VIEWER}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none font-medium min-h-[100px] resize-none transition-colors disabled:opacity-60"
                  placeholder="Observações técnicas, contatos adicionais ou notas de andamento..."
                />
              </div>

              <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex space-x-4 transition-colors bg-white dark:bg-[#0f172a] sticky bottom-0 z-10">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-200 dark:hover:bg-slate-700 dark:hover:text-white transition-all active:scale-[0.98]"
                >
                  {currentUser.role === UserRole.VIEWER ? 'Fechar' : 'Cancelar'}
                </button>
                {currentUser.role !== UserRole.VIEWER && (
                  <button
                    type="submit"
                    className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all active:scale-[0.98]"
                  >
                    {editingProject ? 'Salvar Alterações' : 'Criar Projeto'}
                  </button>
                )}
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-[#0f172a] rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-white/5 transition-all duration-500">
            {/* Header */}
            <div className="px-8 py-6 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-white/5 flex items-center justify-between transition-colors">
              <div className="flex items-center space-x-4">
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl text-indigo-600 dark:text-indigo-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight transition-colors">{viewingClient.name}</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mt-1 transition-colors">Ficha de Identificação</p>
                </div>
              </div>
              <button
                onClick={() => setViewingClient(null)}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300 dark:hover:bg-white/20 transition-all active:scale-95"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-8 space-y-8 dark:bg-[#0f172a] transition-colors">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Coluna 1: Identificação e Contato */}
                <div className="space-y-6">
                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors">
                      <svg className="w-4 h-4 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Código do Cliente</p>
                      <p className="text-slate-900 dark:text-white font-bold font-mono text-sm tracking-widest transition-colors">#{viewingClient.code.padStart(3, '0')}</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors">
                      <svg className="w-4 h-4 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">E-mail</p>
                      <p className="text-slate-900 dark:text-white font-bold text-sm truncate transition-colors">{viewingClient.email || 'Não informado'}</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors">
                      <svg className="w-4 h-4 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Telefone</p>
                      <p className="text-slate-900 dark:text-white font-bold text-sm transition-colors">{viewingClient.phone || 'Não informado'}</p>
                    </div>
                  </div>
                </div>

                {/* Coluna 2: Localização */}
                <div className="space-y-6">
                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors">
                      <svg className="w-4 h-4 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Cidade / UF</p>
                      <p className="text-slate-900 dark:text-white font-bold text-sm transition-colors">{viewingClient.city && viewingClient.state ? `${viewingClient.city} - ${viewingClient.state}` : 'Não informado'}</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors">
                      <svg className="w-4 h-4 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Endereço Residencial/Comercial</p>
                      <p className="text-slate-900 dark:text-white font-bold text-sm leading-tight transition-colors">{viewingClient.address ? `${viewingClient.address}, nº ${viewingClient.number || 'S/N'}` : 'Não informado'}</p>
                      {viewingClient.neighborhood && <p className="text-slate-400 text-[11px] font-medium mt-0.5">{viewingClient.neighborhood}</p>}
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors">
                      <svg className="w-4 h-4 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Status Ativo</p>
                      <div className="mt-1 flex items-center space-x-2">
                        <span className={`w-2 h-2 rounded-full ${viewingClient.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
                        <span className={`text-[11px] font-black uppercase tracking-[0.1em] ${viewingClient.status === 'ACTIVE' ? 'text-emerald-500' : 'text-slate-400'}`}>
                          {viewingClient.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex transition-colors">
                <button
                  onClick={() => setViewingClient(null)}
                  className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-200 dark:hover:bg-slate-700 dark:hover:text-white transition-all active:scale-[0.98]"
                >
                  Fechar Painel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
