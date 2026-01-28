
import React, { useState } from 'react';
import { Company, LicenseStatus, UserRole } from '../types';
import { supabase } from '../lib/supabase';
import { AppDB } from '../storage';

interface CompanyLoginProps {
  db: AppDB;
  setDb: (db: AppDB) => void;
  onLogin: (company: Company) => void;
}

export const CompanyLogin: React.FC<CompanyLoginProps> = ({ db, setDb, onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');
  const [isSignup, setIsSignup] = useState(!db.company);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isSignup) {
      if (!email || !password || !companyName) {
        setError('Preencha todos os campos');
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            company_name: companyName,
          },
          emailRedirectTo: window.location.origin,
        }
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data.user) {
        const newCompany: Company = {
          id: data.user.id,
          name: companyName,
          email,
          passwordHash: '', // Not used anymore
          licenseStatus: LicenseStatus.TRIAL,
          trialStart: Date.now(),
          userLimit: 5,
        };

        const adminUser = {
          id: data.user.id, // Using the auth user ID directly as it's a valid UUID
          username: 'admin',
          passwordHash: 'admin',
          role: UserRole.ADMIN,
          isActive: true,
          mustChangePassword: true
        };

        setDb({
          ...db,
          company: newCompany,
          users: [adminUser]
        });
        onLogin(newCompany);
      }
    } else {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError('E-mail ou senha incorretos ou erro de conexão');
        return;
      }

      if (data.user) {
        // We might need to fetch company data from a table later, 
        // for now assuming it's in the DB state or re-hydrated from session metadata
        const company: Company = db.company || {
          id: data.user.id,
          name: data.user.user_metadata.company_name || 'PERSPEC PATH',
          email,
          passwordHash: '',
          licenseStatus: LicenseStatus.TRIAL,
          trialStart: Date.now(),
          userLimit: 5,
        };
        onLogin(company);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] p-6">
      <div className="w-full max-w-md bg-[#1e293b] rounded-[32px] shadow-2xl overflow-hidden p-10 border border-slate-800">
        <div className="text-center mb-10">
          <img
            src="/PATH_logo.png"
            className="inline-block w-24 h-24 object-contain mb-6 drop-shadow-[0_0_15px_rgba(204,255,0,0.1)]"
            alt="Logo PERSPEC PATH"
          />
          <h1 className="text-3xl font-black tracking-tighter mb-2">
            {isSignup ? (
              <span className="text-white">Comece no <span className="text-slate-300">PERSPEC</span> <span className="text-[#ccff00]">PATH</span></span>
            ) : (
              <span className="text-white">Acessar Workspace</span>
            )}
          </h1>
          <p className="text-slate-500 text-sm font-medium">
            {isSignup ? 'O controle total dos seus projetos começa aqui.' : 'Entre com suas credenciais de empresa'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-bold rounded-xl flex items-center">
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {isSignup && (
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Nome da Empresa</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-5 py-3.5 bg-slate-900 border border-slate-700 rounded-2xl focus:ring-2 focus:ring-[#ccff00]/50 focus:border-[#ccff00]/50 outline-none transition text-white text-sm"
                placeholder="Ex: Studio PERSPEC PATH"
              />
            </div>
          )}
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">E-mail Corporativo</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-5 py-3.5 bg-slate-900 border border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-white text-sm"
              placeholder="seu@workspace.com"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Senha Master</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-5 py-3.5 bg-slate-900 border border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-white text-sm"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-500/20 transition-all active:scale-[0.98] mt-4"
          >
            {isSignup ? 'Criar Workspace' : 'Entrar Agora'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsSignup(!isSignup);
              setError('');
            }}
            className="text-indigo-400 hover:text-indigo-300 text-xs font-bold transition-colors"
          >
            {isSignup ? 'Já tem um Workspace? Faça login' : 'Não tem um Workspace? Criar novo'}
          </button>
        </div>

        <div className="mt-10 text-center space-y-4">
          <button
            type="button"
            onClick={() => {
              if (confirm('Isso irá limpar os dados locais do aplicativo. Deseja continuar?')) {
                localStorage.clear();
                window.location.reload();
              }
            }}
            className="text-[10px] text-slate-600 hover:text-rose-500 font-bold uppercase tracking-widest transition"
          >
            Limpar tudo e recomeçar
          </button>
          <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
            PERSPEC PATH &copy; 2024 &bull; Gestão Profissional
          </p>
        </div>
      </div>
    </div>
  );
};