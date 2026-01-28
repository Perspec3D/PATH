
import React, { useState } from 'react';
import { InternalUser, UserRole, LicenseStatus } from '../types';
import { syncUser, syncCompany, AppDB, supabase } from '../storage';

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
  const [isProcessingSubscription, setIsProcessingSubscription] = useState(false);
  const [showSeatModal, setShowSeatModal] = useState(false);
  const [targetSeatCount, setTargetSeatCount] = useState(db.company?.userLimit || 1);

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

  const handleActivateSubscription = async (userCount: number) => {
    setIsProcessingSubscription(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-subscription', {
        body: {
          companyId: db.company?.id,
          companyEmail: db.company?.email,
          userCount
        }
      });
      if (error) throw error;
      if (data?.init_point) {
        window.location.href = data.init_point;
      } else {
        throw new Error("Link de checkout não gerado");
      }
    } catch (err: any) {
      alert("Erro ao iniciar checkout: " + (err.message || "Erro desconhecido"));
    } finally {
      setIsProcessingSubscription(false);
      setShowSeatModal(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm("Tem certeza que deseja cancelar a assinatura? O acesso permanecerá ativo até o fim do período já pago.")) return;

    setIsProcessingSubscription(true);
    try {
      const { data, error } = await supabase.functions.invoke('cancel-subscription', {
        body: {
          subscriptionId: db.company?.subscriptionId
        }
      });
      if (error) throw error;

      // Update local state conditionally or wait for webhook
      alert("Assinatura cancelada com sucesso. O acesso será mantido até o término da vigência.");
      // Opcional: atualização otimista
      const updatedCompany = { ...db.company!, licenseStatus: LicenseStatus.CANCELLED };
      setDb({ ...db, company: updatedCompany });

    } catch (err: any) {
      alert("Erro ao cancelar: " + (err.message || "Erro desconhecido"));
    } finally {
      setIsProcessingSubscription(false);
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

      {/* Billing Section */}
      <section className="bg-[#1e293b] rounded-3xl shadow-xl border border-slate-800 overflow-hidden relative">
        <div className="px-8 py-6 border-b border-slate-800 bg-slate-800/30 flex justify-between items-center">
          <h2 className="font-black text-xs text-slate-400 uppercase tracking-widest">Plano e Faturamento</h2>
          {db.company?.licenseStatus === LicenseStatus.TRIAL && (
            <span className="text-[10px] font-black bg-amber-500/20 text-amber-500 px-3 py-1 rounded-full uppercase tracking-widest animate-pulse">
              Período de Teste
            </span>
          )}
        </div>
        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <p className="text-sm text-slate-300 font-medium mb-2">
                Modelo de Assinatura: <span className="text-indigo-400 font-black uppercase">Per Seat (Por Usuário)</span>
              </p>
              <p className="text-xs text-slate-500 leading-relaxed mb-6">
                Sua assinatura é calculada com base no número de usuários ativos.
                Valor atual: <span className="text-white font-bold">R$ 29,90 / usuário</span>.
              </p>
              <div className="flex space-x-4">
                <button
                  onClick={() => {
                    setTargetSeatCount(db.company?.userLimit || 1);
                    setShowSeatModal(true);
                  }}
                  disabled={isProcessingSubscription}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                >
                  {isProcessingSubscription ? 'Processando...' : 'Adicionar Usuários'}
                </button>
                {db.company?.licenseStatus === LicenseStatus.TRIAL && (
                  <button
                    onClick={() => handleActivateSubscription(db.users.length > 1 ? db.users.length : 1)}
                    disabled={isProcessingSubscription}
                    className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                  >
                    {isProcessingSubscription ? 'Processando...' : 'Ativar Assinatura'}
                  </button>
                )}
              </div>
            </div>
            <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800/50 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Usuários Contratados</span>
                <span className="text-sm font-black text-white">{db.company?.userLimit || 0}</span>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-800/50">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Investimento Mensal</span>
                <span className="text-sm font-black text-emerald-500">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((db.company?.userLimit || 0) * 29.9)}
                </span>
              </div>

              {db.company?.licenseStatus === LicenseStatus.TRIAL && (
                <div className="flex justify-between items-center pt-2 border-t border-slate-800/50">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Trial Restante</span>
                  <span className="text-sm font-black text-amber-500">
                    {(() => {
                      const daysPassed = (Date.now() - (db.company?.trialStart || Date.now())) / (1000 * 60 * 60 * 24);
                      const remaining = Math.max(0, Math.ceil(7 - daysPassed));
                      return `${remaining} ${remaining === 1 ? 'dia' : 'dias'}`;
                    })()}
                  </span>
                </div>
              )}

              {db.company?.licenseStatus === LicenseStatus.ACTIVE && (
                <div className="pt-4 border-t border-slate-800/50 text-center">
                  <button
                    onClick={handleCancelSubscription}
                    className="text-[10px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-400 transition"
                  >
                    Cancelar Assinatura
                  </button>
                  <p className="text-[9px] text-slate-600 mt-2">
                    O cancelamento interrompe a renovação automática. Seu acesso continua até o fim do ciclo pago.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Users Section */}
      <section className="bg-[#1e293b] rounded-3xl shadow-xl border border-slate-800 overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/30">
          <h2 className="font-black text-xs text-slate-400 uppercase tracking-widest">Usuários Internos</h2>
          <div className="flex items-center space-x-4">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              Uso: {db.users.length} / {db.company?.userLimit || 1}
            </span>
            <button
              onClick={() => {
                if (db.users.length >= (db.company?.userLimit || 1)) {
                  alert(`Limite de usuários atingido (${db.company?.userLimit}). Aumente seu plano na seção de Faturamento.`);
                  return;
                }
                resetUserForm();
                setShowUserModal(true);
              }}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${db.users.length >= (db.company?.userLimit || 1) ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
            >
              Novo Usuário
            </button>
          </div>
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

      {showSeatModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-[#1e293b] rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border border-slate-700">
            <div className="p-8 text-center border-b border-slate-800 bg-slate-800/30">
              <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2">Quantos usuários?</h3>
              <p className="text-slate-400 text-sm">Selecione o número total de licenças que deseja contratar.</p>
            </div>

            <div className="p-10 space-y-8">
              <div className="flex items-center justify-center space-x-6">
                <button
                  onClick={() => setTargetSeatCount(Math.max(1, targetSeatCount - 1))}
                  className="w-12 h-12 rounded-2xl bg-slate-800 text-white hover:bg-slate-700 flex items-center justify-center transition"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" /></svg>
                </button>

                <div className="text-center">
                  <span className="text-5xl font-black text-white tracking-tighter">{targetSeatCount}</span>
                  <span className="block text-xs font-black uppercase tracking-widest text-slate-500 mt-1">Usuários</span>
                </div>

                <button
                  onClick={() => setTargetSeatCount(targetSeatCount + 1)}
                  className="w-12 h-12 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700 flex items-center justify-center transition shadow-lg shadow-indigo-500/20"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                </button>
              </div>

              <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800 text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Resumo do Investimento</p>
                <div className="flex items-center justify-center space-x-2">
                  <span className="text-3xl font-black text-emerald-400">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(targetSeatCount * 29.90)}
                  </span>
                  <span className="text-xs font-bold text-slate-500">/mês</span>
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowSeatModal(false)}
                  className="flex-1 py-4 bg-slate-800 text-slate-400 rounded-2xl text-xs font-black uppercase tracking-widest hover:text-white transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleActivateSubscription(targetSeatCount)}
                  disabled={isProcessingSubscription}
                  className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:bg-emerald-700 transition flex items-center justify-center space-x-2 disabled:opacity-70"
                >
                  {isProcessingSubscription ? (
                    <span>Gerando Checkout...</span>
                  ) : (
                    <>
                      <span>Confirmar e Pagar</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
