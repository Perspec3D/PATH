
import React, { useState, useRef } from 'react';
import { InternalUser } from '../types';

interface InternalUserLoginProps {
  users: InternalUser[];
  onLogin: (user: InternalUser) => void;
  onExit: () => void;
}

export const InternalUserLogin: React.FC<InternalUserLoginProps> = ({ users, onLogin, onExit }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);

  const activeUsers = users.filter(u => u.isActive);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const user = activeUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (user && user.passwordHash === password) {
      onLogin(user);
    } else {
      setError('Usuário ou senha incorretos');
    }
  };

  const handleSelectUser = (name: string) => {
    setUsername(name);
    // Foca na senha após selecionar o usuário pelo avatar
    setTimeout(() => passwordRef.current?.focus(), 50);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-white mb-2 tracking-tighter">Quem está acessando?</h1>
          <p className="text-slate-500 font-medium">Escolha seu perfil ou digite as credenciais</p>
        </div>

        <div className="bg-[#1e293b] rounded-[32px] shadow-2xl overflow-hidden border border-slate-800 p-10">
          {error && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-bold rounded-2xl flex items-center animate-in fade-in zoom-in duration-200">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              {error}
            </div>
          )}

          {/* Atalhos Rápidos de Usuários */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {activeUsers.slice(0, 6).map(u => (
              <button
                key={u.id}
                type="button"
                onClick={() => handleSelectUser(u.username)}
                className={`flex flex-col items-center p-3 rounded-2xl transition-all border-2 ${username.toLowerCase() === u.username.toLowerCase()
                    ? 'border-indigo-500 bg-indigo-500/10 shadow-lg scale-105'
                    : 'border-transparent hover:bg-slate-800'
                  }`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl mb-2 transition-all ${username.toLowerCase() === u.username.toLowerCase() ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/40' : 'bg-slate-700 text-slate-400'
                  }`}>
                  {u.username.charAt(0).toUpperCase()}
                </div>
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest truncate w-full text-center">{u.username}</span>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Nome de Usuário</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-5 py-3.5 bg-slate-900 border border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-slate-100 text-sm font-medium placeholder-slate-600"
                placeholder="Ex: admin"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Senha Pessoal</label>
              <input
                ref={passwordRef}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-3.5 bg-slate-900 border border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-slate-100 text-sm font-medium placeholder-slate-600"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-500/20 transition-all transform active:scale-[0.98] mt-4"
            >
              Confirmar Identidade
            </button>
          </form>

          <button
            type="button"
            onClick={onExit}
            className="w-full mt-8 py-3 px-6 border border-slate-700 hover:border-rose-500/50 hover:bg-rose-500/10 text-slate-500 hover:text-rose-500 text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all flex items-center justify-center"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Sair do Workspace
          </button>
        </div>
      </div>
    </div>
  );
};
