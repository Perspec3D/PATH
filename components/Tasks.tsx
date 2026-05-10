import React, { useState } from 'react';
import { InternalUser, UserRole, TeamTask, TaskType } from '../types';
import { AppDB, syncTeamTask, deleteTeamTask } from '../storage';

interface TasksProps {
  db: AppDB;
  setDb: (db: AppDB) => void;
  currentUser: InternalUser;
  theme: 'dark' | 'light';
}

export const Tasks: React.FC<TasksProps> = ({ db, setDb, currentUser, theme }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TeamTask | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>(TaskType.REUNIAO);
  const [assigneeId, setAssigneeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');

  const activeUsers = db.users.filter(u => u.isActive);

  const openNewTaskModal = () => {
    setEditingTask(null);
    setTitle('');
    setType(TaskType.REUNIAO);
    setAssigneeId('');
    setStartDate('');
    setEndDate('');
    setDescription('');
    setIsModalOpen(true);
  };

  const openEditTaskModal = (task: TeamTask) => {
    setEditingTask(task);
    setTitle(task.title);
    setType(task.type);
    setAssigneeId(task.assigneeId);
    setStartDate(task.startDate);
    setEndDate(task.endDate);
    setDescription(task.description || '');
    setIsModalOpen(true);
  };

  const handleDelete = async (taskId: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta tarefa?')) {
      try {
        await deleteTeamTask(taskId);
        setDb({ ...db, tasks: db.tasks.filter(t => t.id !== taskId) });
      } catch (err: any) {
        alert("Erro ao excluir: " + (err.message || "Erro desconhecido"));
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !assigneeId || !startDate || !endDate) {
      alert("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      alert("A data final não pode ser menor que a data inicial.");
      return;
    }

    const taskData: TeamTask = {
      id: editingTask ? editingTask.id : crypto.randomUUID(),
      workspaceId: currentUser.workspaceId,
      title,
      type,
      assigneeId,
      startDate,
      endDate,
      description,
      createdAt: editingTask ? editingTask.createdAt : Date.now()
    };

    try {
      await syncTeamTask(taskData);
      if (editingTask) {
        setDb({ ...db, tasks: db.tasks.map(t => t.id === editingTask.id ? taskData : t) });
      } else {
        setDb({ ...db, tasks: [...db.tasks, taskData] });
      }
      setIsModalOpen(false);
    } catch (err: any) {
      alert("Erro ao salvar a tarefa: " + (err.message || "Erro desconhecido"));
    }
  };

  const getTaskTypeBadgeColor = (tType: TaskType) => {
    switch (tType) {
      case TaskType.REUNIAO: return 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border-blue-200 dark:border-blue-500/30';
      case TaskType.ESTUDO: return 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400 border-purple-200 dark:border-purple-500/30';
      case TaskType.FOLGA: return 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400 border-teal-200 dark:border-teal-500/30';
      case TaskType.FERIAS: return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30';
      case TaskType.TREINAMENTO: return 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 border-orange-200 dark:border-orange-500/30';
      case TaskType.OBSERVACAO: return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border-amber-200 dark:border-amber-500/30';
      case TaskType.OUTROS: return 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400 border-slate-200 dark:border-slate-500/30';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400 border-slate-200 dark:border-slate-500/30';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight transition-colors">Tarefas da Equipe</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium transition-colors">Gerencie atividades avulsas, bloqueios de agenda e compromissos</p>
        </div>
        {currentUser.role !== UserRole.VIEWER && (
          <button
            onClick={openNewTaskModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 transition-all active:scale-95 flex items-center justify-center shrink-0"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            Criar Tarefa
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-[#1e293b] rounded-[32px] shadow-sm dark:shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors duration-500">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 transition-colors">
                <th className="p-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Título / Tipo</th>
                <th className="p-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Responsável</th>
                <th className="p-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Período</th>
                <th className="p-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 transition-colors">
              {db.tasks.map(task => {
                const assignee = db.users.find(u => u.id === task.assigneeId);
                return (
                  <tr key={task.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors group">
                    <td className="p-5">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-900 dark:text-white mb-1 transition-colors">{task.title}</span>
                        <span className={`self-start px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${getTaskTypeBadgeColor(task.type)}`}>
                          {task.type}
                        </span>
                      </div>
                    </td>
                    <td className="p-5">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase transition-colors">
                          {assignee ? assignee.username.charAt(0) : '?'}
                        </div>
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 transition-colors">{assignee ? assignee.username : 'Desconhecido'}</span>
                      </div>
                    </td>
                    <td className="p-5">
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors">
                          <span className="w-10 text-[9px] font-black uppercase tracking-widest text-slate-400">De:</span>
                          {new Date(task.startDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </div>
                        <div className="flex items-center text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors">
                          <span className="w-10 text-[9px] font-black uppercase tracking-widest text-slate-400">Até:</span>
                          {new Date(task.endDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                    </td>
                    <td className="p-5 text-right">
                      {currentUser.role !== UserRole.VIEWER && (
                        <div className="flex justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditTaskModal(task)}
                            className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-500/30 rounded-xl transition-all shadow-sm"
                            title="Editar"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button
                            onClick={() => handleDelete(task.id)}
                            className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all shadow-sm"
                            title="Excluir"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {db.tasks.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                    Nenhuma tarefa cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1e293b] rounded-[32px] shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-700 p-8 transform transition-all max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                {editingTask ? 'Editar Tarefa' : 'Nova Tarefa'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 p-4 rounded-2xl mb-6 flex items-start space-x-3">
              <div className="shrink-0 mt-0.5 text-indigo-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-1">Aviso de Expiração Automática</p>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Esta tarefa será mantida no sistema por <strong>30 dias</strong> e depois será excluída automaticamente para não poluir o banco de dados.
                </p>
              </div>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Título da Tarefa *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  placeholder="Ex: Férias do Colaborador X"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Tipo *</label>
                  <select
                    required
                    value={type}
                    onChange={e => setType(e.target.value as TaskType)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  >
                    {Object.values(TaskType).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Responsável *</label>
                  <select
                    required
                    value={assigneeId}
                    onChange={e => setAssigneeId(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  >
                    <option value="">Selecione...</option>
                    {activeUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.username}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Data Início *</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Data Fim *</label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Descrição / Observação</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-colors resize-none h-24"
                  placeholder="Detalhes adicionais (opcional)..."
                />
              </div>

              <div className="flex space-x-3 pt-6 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 p-4 rounded-2xl font-black uppercase text-xs tracking-widest text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 p-4 rounded-2xl font-black uppercase text-xs tracking-widest text-white shadow-xl shadow-indigo-500/20 active:scale-95 transition-all"
                >
                  Salvar Tarefa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
