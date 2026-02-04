
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [returnStatus, setReturnStatus] = useState<'success' | 'pending' | 'failure' | null>(null);

  // Check for payment return parameters
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const paymentId = params.get('payment_id') || params.get('preapproval_id');

    if (status && paymentId) {
      if (status === 'approved' || status === 'authorized') setReturnStatus('success');
      else if (status === 'pending' || status === 'in_process') setReturnStatus('pending');
      else setReturnStatus('failure');

      // Clear params from URL to prevent re-triggering
      window.history.replaceState({}, document.title, window.location.pathname);

      // Auto-trigger sync
      handleManualSync();
    }
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      // 1. Try to verify directly with MP via Edge Function if we have a subscriptionId
      if (db.company?.subscriptionId) {
        await supabase.functions.invoke('verify-subscription', {
          body: { companyId: db.company.id, subscriptionId: db.company.subscriptionId }
        });
      }

      // 2. Refresh the company profile from Supabase
      const { data, error } = await supabase.from('profiles').select('*').eq('id', db.company?.id).single();
      if (error) throw error;
      if (data) {
        setDb({
          ...db, company: {
            id: data.id,
            name: data.name,
            email: data.email,
            licenseStatus: data.license_status,
            userLimit: data.user_limit,
            subscriptionId: data.subscription_id,
            subscriptionEnd: data.subscription_end ? new Date(data.subscription_end).getTime() : undefined,
            trialStart: data.trial_start ? new Date(data.trial_start).getTime() : Date.now()
          }
        });
      }
    } catch (err: any) {
      console.error("Erro ao sincronizar:", err);
    } finally {
      setTimeout(() => setIsSyncing(false), 2000); // Visual buffer
    }
  };

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

  const handleActivateSubscription = async (count: number) => {
    setIsProcessingSubscription(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-subscription', {
        body: {
          userCount: count,
          companyEmail: db.company?.email, // Assuming company email is stored here or user email
          companyId: db.company?.id,
          backUrl: window.location.href
        }
      });
      if (error) throw error;
      if (data?.init_point) {
        window.location.href = data.init_point;
      } else {
        throw new Error("Link de checkout não gerado");
      }
    } catch (err: any) {
      let errorMessage = err.message || "Erro desconhecido";
      try {
        if (err.context && typeof err.context.json === 'function') {
          const body = await err.context.json();
          if (body && body.error) {
            errorMessage = body.error;
          }
        }
      } catch (e) {
        console.error("Erro ao ler resposta de erro", e);
      }
      alert("Erro ao iniciar checkout: " + errorMessage + (errorMessage.includes("MP_ACCESS_TOKEN not set") ? " (Configuração pendente no Supabase Secrets)" : ""));
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
      let errorMessage = err.message || "Erro desconhecido";
      // Tenta extrair a mensagem real da Edge Function
      try {
        if (err.context && typeof err.context.json === 'function') {
          const body = await err.context.json();
          if (body && body.error) {
            errorMessage = body.error;
          }
        }
      } catch (e) {
        console.error("Erro ao ler resposta de erro", e);
      }
      alert("Erro ao cancelar: " + errorMessage);
    } finally {
      setIsProcessingSubscription(false);
    }
  };

  const [showAboutModal, setShowAboutModal] = useState(false);
  const [legalView, setLegalView] = useState<'about' | 'terms' | 'privacy'>('about');

  return (
    <div className="space-y-8 max-w-4xl animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-black text-white tracking-tight">Configurações do Sistema</h1>
        <button
          onClick={() => setShowAboutModal(true)}
          className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-400 transition flex items-center space-x-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>Sobre</span>
        </button>
      </div>

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
                {db.company?.licenseStatus === LicenseStatus.TRIAL ? (
                  <button
                    onClick={() => {
                      setTargetSeatCount(Math.max(db.users.length, 1));
                      setShowSeatModal(true);
                    }}
                    disabled={isProcessingSubscription}
                    className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                  >
                    {isProcessingSubscription ? 'Processando...' : 'Ativar Assinatura'}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setTargetSeatCount(db.company?.userLimit || 1);
                      setShowSeatModal(true);
                    }}
                    disabled={isProcessingSubscription}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                  >
                    {isProcessingSubscription ? 'Processando...' : 'Alterar Assinatura'}
                  </button>
                )}
              </div>
            </div>
            <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800/50 space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Usuários Contratados</span>
                  {isSyncing && (
                    <span className="text-[9px] text-indigo-400 font-bold animate-pulse mt-1">Sincronizando...</span>
                  )}
                </div>
                <span className="text-sm font-black text-white">{db.company?.licenseStatus === LicenseStatus.TRIAL ? 5 : (db.company?.userLimit || 0)}</span>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-800/50">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Investimento Mensal</span>
                <span className="text-sm font-black text-emerald-500">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((db.company?.userLimit || 0) * 29.9)}
                </span>
              </div>

              <div className="pt-4 border-t border-slate-800/50">
                <button
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition flex items-center justify-center space-x-2"
                >
                  <svg className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  <span>{isSyncing ? 'Sincronizando...' : 'Atualizar Status'}</span>
                </button>
              </div>

              {returnStatus && (
                <div className={`p-4 rounded-xl text-xs font-bold flex items-center space-x-3 animate-in slide-in-from-top-2 duration-500 ${returnStatus === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                  returnStatus === 'pending' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                    'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                  }`}>
                  <div className={`w-2 h-2 rounded-full animate-pulse ${returnStatus === 'success' ? 'bg-emerald-500' :
                    returnStatus === 'pending' ? 'bg-amber-500' :
                      'bg-rose-500'
                    }`}></div>
                  <span>
                    {returnStatus === 'success' && 'Pagamento concluído! Sincronizando sua conta...'}
                    {returnStatus === 'pending' && 'Pagamento em análise. Em breve sua licença será atualizada.'}
                    {returnStatus === 'failure' && 'Ocorreu um problema com o pagamento. Tente novamente.'}
                  </span>
                  <button onClick={() => setReturnStatus(null)} className="ml-auto opacity-50 hover:opacity-100">✕</button>
                </div>
              )}

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
            {db.users.filter(u => u.isActive).length > (db.company?.userLimit || 1) && (
              <span className="text-[10px] font-black text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full uppercase tracking-widest animate-pulse">
                Limite Excedido! Desative usuários.
              </span>
            )}
            <span className={`text-[9px] font-black uppercase tracking-widest ${db.users.filter(u => u.isActive).length > (db.company?.userLimit || 1) ? 'text-rose-500' : 'text-slate-500'}`}>
              Uso: {db.users.filter(u => u.isActive).length} / {db.company?.userLimit || 1}
            </span>
            <button
              onClick={() => {
                const currentLimit = db.company?.licenseStatus === LicenseStatus.TRIAL ? 5 : (db.company?.userLimit || 1);

                if (db.users.length >= currentLimit) {
                  alert(`Limite de usuários atingido (${currentLimit}). Aumente seu plano na seção de Faturamento.`);
                  return;
                }
                resetUserForm();
                setShowUserModal(true);
              }}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${db.users.length >= (db.company?.licenseStatus === LicenseStatus.TRIAL ? 5 : (db.company?.userLimit || 1)) ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
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

      {/* About Modal */}
      {showAboutModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-[#0f172a] rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border border-slate-700 relative max-h-[90vh] flex flex-col">
            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-indigo-500/10 to-transparent pointer-events-none"></div>

            <div className="p-8 text-center relative z-10 flex-shrink-0">
              <div className="flex justify-between items-center mb-6">
                {legalView !== 'about' && (
                  <button onClick={() => setLegalView('about')} className="text-slate-500 hover:text-white transition flex items-center space-x-2 text-[10px] font-black uppercase tracking-widest">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                    <span>Voltar</span>
                  </button>
                )}
                <div className="flex-1"></div>
                <button onClick={() => { setShowAboutModal(false); setLegalView('about'); }} className="text-slate-500 hover:text-white transition">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {legalView === 'about' && (
                <>
                  <img
                    src="/PATH_logo.png"
                    className="w-20 h-20 object-contain mx-auto mb-6 drop-shadow-[0_0_15px_rgba(204,255,0,0.1)]"
                    alt="Logo PERSPEC PATH"
                  />

                  <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-1">
                    PERSPEC <span className="text-[#ccff00]">PATH</span>
                  </h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-8">Soluções em Engenharia & Gestão</p>

                  <div className="space-y-4 text-left bg-slate-900/50 p-6 rounded-2xl border border-slate-800/50 mb-6">
                    <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Suporte WhatsApp</span>
                      <a href="https://wa.me/5514998892017" target="_blank" rel="noreferrer" className="text-xs font-bold text-emerald-400 hover:text-emerald-300 transition">(14) 9 9889-2017</a>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">E-mail</span>
                      <a href="mailto:perspec03d@gmail.com" className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition">perspec03d@gmail.com</a>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Website</span>
                      <a href="https://www.perspec3d.com" target="_blank" rel="noreferrer" className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition">www.perspec3d.com</a>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Versão</span>
                      <span className="text-xs font-bold text-white">v1.2.6 (Beta)</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Copyright</span>
                      <span className="text-xs font-bold text-slate-400">© 2025 Perspec3D</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setLegalView('terms')} className="py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[9px] font-black uppercase tracking-widest transition">Termos de Uso</button>
                    <button onClick={() => setLegalView('privacy')} className="py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[9px] font-black uppercase tracking-widest transition">Privacidade</button>
                  </div>
                </>
              )}

              {legalView === 'terms' && (
                <div className="text-left overflow-y-auto pr-2 custom-scrollbar max-h-[50vh]">
                  <h3 className="text-lg font-black text-white uppercase tracking-tight mb-4">Termos de Uso</h3>
                  <div className="text-xs text-slate-400 space-y-4 leading-relaxed font-medium">
                    <p>Ao utilizar o <span className="text-indigo-400 font-bold">PERSPEC PATH</span>, você concorda com:</p>
                    <p><span className="text-white font-bold">1. Licenciamento:</span> O software é fornecido como serviço (SaaS). A licença é pessoal, intransferível e revogável em caso de violação técnica.</p>
                    <p><span className="text-white font-bold">2. Responsabilidade:</span> O Usuário Administrador é o único responsável pela precisão e legalidade dos dados inseridos. O sistema é uma ferramenta de apoio à gestão.</p>
                    <p><span className="text-white font-bold">3. Uso de Dados:</span> O PERSPEC PATH processa informações operacionais para gerar dashboards e cronogramas. Não garantimos resultados jurídicos baseados nessas automações.</p>
                    <p><span className="text-white font-bold">4. Propriedade:</span> Todos os direitos de design, algoritmos e interface pertencem à Perspec3D Engenharia Ltda.</p>
                  </div>
                </div>
              )}

              {legalView === 'privacy' && (
                <div className="text-left overflow-y-auto pr-2 custom-scrollbar max-h-[50vh]">
                  <h3 className="text-lg font-black text-white uppercase tracking-tight mb-4">Política de Privacidade</h3>
                  <div className="text-xs text-slate-400 space-y-4 leading-relaxed font-medium">
                    <p>Em conformidade com a <span className="text-emerald-400 font-bold">LGPD (Lei 13.709/18)</span>:</p>
                    <p><span className="text-white font-bold">1. Coleta:</span> Coletamos apenas dados essenciais para o funcionamento do workspace (E-mail, Nome da Empresa e Dados de Projetos).</p>
                    <p><span className="text-white font-bold">2. Segurança:</span> Utilizamos infraestrutura de nuvem certificada com criptografia de ponta e isolamento de banco de dados (RLS).</p>
                    <p><span className="text-white font-bold">3. Compartilhamento:</span> Seus dados <span className="text-white font-bold underline">nunca</span> são vendidos. O compartilhamento ocorre apenas com processadores de pagamento (Mercado Pago) para fins de faturamento.</p>
                    <p><span className="text-white font-bold">4. Direitos:</span> Você pode exportar ou solicitar a exclusão de todos os seus dados a qualquer momento através do suporte oficial.</p>
                  </div>
                </div>
              )}
            </div>
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
