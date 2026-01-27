
import React from 'react';
import { AuditLog } from '../types';

interface AuditLogsProps {
  logs: AuditLog[];
}

export const AuditLogs: React.FC<AuditLogsProps> = ({ logs }) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-white tracking-tight">Logs de Auditoria</h1>
        <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Rastreamento Total</div>
      </div>

      <div className="bg-[#1e293b] rounded-3xl shadow-xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-800/30 text-[9px] uppercase tracking-widest text-slate-600 font-black border-b border-slate-800">
                <th className="px-8 py-4">Data/Hora</th>
                <th className="px-8 py-4">Usuário</th>
                <th className="px-8 py-4">Ação</th>
                <th className="px-8 py-4">Entidade</th>
                <th className="px-8 py-4">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {logs.map((log: AuditLog) => {
                const details = JSON.parse(log.details);
                return (
                  <tr key={log.id} className="text-sm hover:bg-slate-800/30 transition-colors">
                    <td className="px-8 py-5 text-slate-400 whitespace-nowrap font-medium">
                      {new Date(log.timestamp).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-8 py-5 font-bold text-slate-100">{log.username}</td>
                    <td className="px-8 py-5">
                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                        log.action === 'CREATE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        log.action === 'UPDATE' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                        log.action === 'DELETE' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : 
                        'bg-slate-700/30 text-slate-400 border-slate-700/50'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">{log.entity}</td>
                    <td className="px-8 py-5">
                      <div className="max-w-xs truncate text-[10px] text-slate-500 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl font-mono">
                        {Object.entries(details).map(([k, v]) => `${k}:${v}`).join(' | ')}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-16 text-center text-slate-600 font-bold uppercase tracking-widest text-xs italic">Nenhum evento registrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
