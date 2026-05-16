import React, { useState, useEffect, useMemo } from 'react';
import { AppDB, fetchLogs } from '../storage';
import { SystemLog, LogModule, LogAction } from '../types';

interface LogsProps {
  db: AppDB;
  theme: 'dark' | 'light';
}

export const Logs: React.FC<LogsProps> = ({ db, theme }) => {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterModule, setFilterModule] = useState<string>('ALL');
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [filterUser, setFilterUser] = useState<string>('ALL');

  useEffect(() => {
    const loadLogs = async () => {
      if (db.company) {
        setIsLoading(true);
        const data = await fetchLogs(db.company.id);
        setLogs(data);
        setIsLoading(false);
      }
    };
    loadLogs();
  }, [db.company]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchSearch = log.details.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (log.itemId && log.itemId.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchModule = filterModule === 'ALL' || log.module === filterModule;
      const matchAction = filterAction === 'ALL' || log.action === filterAction;
      const matchUser = filterUser === 'ALL' || log.userId === filterUser;

      return matchSearch && matchModule && matchAction && matchUser;
    });
  }, [logs, searchTerm, filterModule, filterAction, filterUser]);

  const uniqueUsers = useMemo(() => {
    const users = new Map();
    logs.forEach(l => {
      if (!users.has(l.userId)) {
        users.set(l.userId, l.userName);
      }
    });
    return Array.from(users.entries());
  }, [logs]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Logs do Sistema</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Histórico de auditoria de ações no workspace (armazenamento de 30 dias)</p>
        </div>
      </div>

      <div className="bg-white dark:bg-[#1e293b] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Pesquisar detalhes ou item..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
          />
        </div>
        <select
          value={filterModule}
          onChange={(e) => setFilterModule(e.target.value)}
          className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
        >
          <option value="ALL">Todos os Módulos</option>
          {Object.values(LogModule).map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
        >
          <option value="ALL">Todas as Ações</option>
          {Object.values(LogAction).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
        >
          <option value="ALL">Todos os Usuários</option>
          {uniqueUsers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-[10px] uppercase tracking-widest text-slate-500 font-black border-b border-slate-200 dark:border-slate-800">
                <th className="p-4 whitespace-nowrap">Data / Hora</th>
                <th className="p-4">Usuário</th>
                <th className="p-4">Módulo</th>
                <th className="p-4">Ação</th>
                <th className="p-4">Item</th>
                <th className="p-4">Descrição</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100 dark:divide-slate-800/50">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">Carregando logs...</td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">Nenhum log encontrado.</td>
                </tr>
              ) : (
                filteredLogs.map(log => {
                  const date = new Date(log.createdAt);
                  
                  // Formatar data localmente para evitar importar date-fns se não estiver instalado
                  const dataFormatada = date.toLocaleDateString('pt-BR');
                  const horaFormatada = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="p-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {dataFormatada}
                        </div>
                        <div className="text-xs text-slate-500">
                          {horaFormatada}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{log.userName}</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{log.userRole}</div>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {log.module}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-black tracking-wider uppercase border ${
                          log.action === LogAction.CREATE ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' :
                          log.action === LogAction.DELETE ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/20' :
                          log.action === LogAction.UPDATE ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20' :
                          log.action === LogAction.LOGIN || log.action === LogAction.LOGOUT ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20' :
                          'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {log.itemId || '-'}
                      </td>
                      <td className="p-4 text-slate-700 dark:text-slate-300">
                        {log.details}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
