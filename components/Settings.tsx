
import React, { useState } from 'react';
import { InternalUser, UserRole, LicenseStatus } from '../types';
import { syncUser, syncCompany, AppDB } from '../storage';

interface SettingsProps {
  db: AppDB;
  setDb: (db: AppDB) => void;
  currentUser: InternalUser;
}

export const Settings: React.FC<SettingsProps> = ({ db, setDb, currentUser }) => {
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<InternalUser | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.USER);
  const [isActive, setIsActive] = useState(true);

  const [companyName, setCompanyName] = useState(db.company?.name || '');

  const resetUserForm = () => {
    setUsername('');
    setPassword('');
    setRole(UserRole.USER);
    setIsActive(true);
    setEditingUser(null);
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const newCompany = { ...db.company, name: companyName };
    try {
      await syncCompany(newCompany);
      setDb({ ...db, company: newCompany });
      alert('Configurações da empresa salvas!');
    } catch (err: any) {
      alert("Erro ao salvar no Supabase: " + (err.message || "Erro desconhecido"));
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || (!editingUser && !password)) {
      alert('Preencha os campos obrigatórios');
      return;
    }

    const userData: InternalUser = {
      id: editingUser?.id || crypto.randomUUID(),
      workspaceId: currentUser.workspaceId,
      username,
      passwordHash: password || editingUser?.passwordHash || '',
      role,
      isActive,
      mustChangePassword: editingUser ? editingUser.mustChangePassword : true
    };

    try {
      await syncUser(userData);

      let newUsers;
      if (editingUser) {
        newUsers = db.users.map((u: InternalUser) => u.id === editingUser.id ? userData : u);
      } else {
        if (db.users.some((u: any) => u.username === username)) {
          alert('Username já existe');
          return;
        }
        newUsers = [...db.users, userData];
      }

      setDb({ ...db, users: newUsers });
      setShowUserModal(false);
      resetUserForm();
    } catch (err: any) {
      alert("Erro ao salvar no Supabase: " + (err.message || "Erro desconhecido"));
    }
  };

  const toggleUserStatus = async (user: InternalUser) => {
    if (user.id === currentUser.id) {
      alert('Você não pode desativar seu próprio usuário');
      return;
    }
    const updatedUser = { ...user, isActive: !user.isActive };
    try {
      await syncUser(updatedUser);
      const newUsers = db.users.map((u: InternalUser) =>
        u.id === user.id ? updatedUser : u
      );
      setDb({ ...db, users: newUsers });
    } catch (err: any) {
      alert("Erro ao atualizar status: " + err.message);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl animate-in fade-in duration-500">
      <h1 className="text-2xl font-black text-white tracking-tight">Configurações do Sistema</h1>

      {/* Company Section */}
      <section className="bg-[#1e293b] rounded-3xl shadow-xl border border-slate-800 overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-800 bg-slate-800/30">
          <h2 className="font-black text-xs text-slate-400 uppercase tracking-widest">Workspace / Empresa</h2>
        </div>
        <form onSubmit={handleSaveCompany} className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Nome Fantasia</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Licença Atual</label>
              <div className="flex items-center space-x-3 px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-indigo-400 font-bold">
                <div className={`w-2 h-2 rounded-full ${db.company.licenseStatus === LicenseStatus.ACTIVE ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500'}`}></div>
                <span className="uppercase tracking-widest">{db.company.licenseStatus}</span>
              </div>
            </div>
          </div>
          <button type="submit" className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition shadow-lg shadow-indigo-500/20">
            Salvar Alterações
          </button>
        </form>
      </section>

      {/* Users Section */}
      <section className="bg-[#1e293b] rounded-3xl shadow-xl border border-slate-800 overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/30">
          <h2 className="font-black text-xs text-slate-400 uppercase tracking-widest">Usuários Internos</h2>
          <button
            onClick={() => { resetUserForm(); setShowUserModal(true); }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition"
          >
            Novo Usuário
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-900/30 text-[9px] uppercase tracking-widest text-slate-600 font-black border-b border-slate-800">
                <th className="px-8 py-4">Username</th>
                <th className="px-8 py-4">Função</th>
                <th className="px-8 py-4">Status</th>
                <th className="px-8 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {db.users.map((user: InternalUser) => (
                <tr key={user.id} className="text-sm hover:bg-slate-800/30 transition-colors">
                  <td className="px-8 py-5 font-bold text-slate-100">{user.username}</td>
                  <td className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">{user.role}</td>
                  <td className="px-8 py-5">
                    <span className={`inline-block w-2 h-2 rounded-full ${user.isActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-slate-700'}`}></span>
                  </td>
                  <td className="px-8 py-5 text-right space-x-4">
                    <button
                      onClick={() => { setEditingUser(user); setUsername(user.username); setRole(user.role); setIsActive(user.isActive); setShowUserModal(true); }}
                      className="text-[10px] text-indigo-400 font-black uppercase tracking-widest hover:text-indigo-300 transition"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => toggleUserStatus(user)}
                      className={`text-[10px] font-black uppercase tracking-widest transition ${user.isActive ? 'text-rose-500 hover:text-rose-400' : 'text-emerald-500 hover:text-emerald-400'}`}
                    >
                      {user.isActive ? 'Desativar' : 'Reativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showUserModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#1e293b] rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden border border-slate-700">
            <div className="px-8 py-6 border-b border-slate-800 bg-slate-800/30 flex justify-between items-center">
              <h3 className="font-black text-white uppercase tracking-widest text-sm">{editingUser ? 'Configurar Usuário' : 'Novo Perfil'}</h3>
              <button onClick={() => setShowUserModal(false)} className="text-slate-500 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSaveUser} className="p-8 space-y-5">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Username *</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="ex: joao.eng"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{editingUser ? 'Nova Senha (ou vazio)' : 'Senha de Acesso *'}</label>
                <input
                  type="password"
                  required={!editingUser}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Nível de Permissão</label>
                <select
                  value={role}
                  onChange={(e: any) => setRole(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value={UserRole.USER}>Usuário Padrão</option>
                  <option value={UserRole.ADMIN}>Administrador (Master)</option>
                </select>
              </div>
              <div className="pt-6 flex space-x-3">
                <button type="button" onClick={() => setShowUserModal(false)} className="flex-1 py-3 bg-slate-800 text-slate-500 rounded-xl text-xs font-black uppercase tracking-widest hover:text-white transition">Cancelar</button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:bg-indigo-700 transition">Salvar Usuário</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
