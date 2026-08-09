import React, { useState, useEffect, useMemo } from 'react';
import { InternalUser, UserRole, LicenseStatus, LogModule, LogAction, ActivityType } from '../types';
import { syncUser, syncCompany, AppDB, supabase, logAction, fetchActivityTypes, syncActivityType, deleteOrDeactivateActivityType } from '../storage';
import { generateDiffLogs, formatBooleanForLog } from '../utils/logDiff';

interface SettingsProps {
  db: AppDB;
  setDb: (db: AppDB) => void;
  currentUser: InternalUser;
  theme: 'dark' | 'light';
}

export const Settings: React.FC<SettingsProps> = ({ db, setDb, currentUser, theme }) => {
  const [showUserModal, setShowUserModal] = useState(false);

  // States for Activities Management
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityType | null>(null);
  const [activityName, setActivityName] = useState('');
  const [activityDescription, setActivityDescription] = useState('');
  const [activityCategory, setActivityCategory] = useState('');
  const [activityIsActive, setActivityIsActive] = useState(true);
  const [activitySearch, setActivitySearch] = useState('');
  const [activityStatusFilter, setActivityStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
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
  const [logoUrl, setLogoUrl] = useState(db.company?.logoUrl || '');
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [workStartTime, setWorkStartTime] = useState(db.company?.workStartTime || '08:00');
  const [workEndTime, setWorkEndTime] = useState(db.company?.workEndTime || '18:00');
  const [lunchDurationMinutes, setLunchDurationMinutes] = useState(db.company?.lunchDurationMinutes || 60);
  const [workDays, setWorkDays] = useState<number[]>(db.company?.workDays || [1, 2, 3, 4, 5]);
  const [adminGeneralAlerts, setAdminGeneralAlerts] = useState<boolean>(() => {
    const saved = localStorage.getItem('PATH_ADMIN_GENERAL_ALERTS');
    return saved ? JSON.parse(saved) : false;
  });

  const handleToggleAdminAlerts = (checked: boolean) => {
    setAdminGeneralAlerts(checked);
    localStorage.setItem('PATH_ADMIN_GENERAL_ALERTS', JSON.stringify(checked));
  };

  // Load activities on mount or when workspace changes
  useEffect(() => {
    const loadActivities = async () => {
      setIsLoadingActivities(true);
      try {
        const data = await fetchActivityTypes(currentUser.workspaceId);
        setActivityTypes(data);
      } catch (err) {
        console.error("Erro ao carregar tipos de atividade:", err);
      } finally {
        setIsLoadingActivities(false);
      }
    };
    loadActivities();
  }, [currentUser.workspaceId]);

  const filteredActivityTypes = useMemo(() => {
    return activityTypes.filter(at => {
      const matchesSearch = at.name.toLowerCase().includes(activitySearch.toLowerCase()) || 
                            (at.category && at.category.toLowerCase().includes(activitySearch.toLowerCase()));
      const matchesStatus = activityStatusFilter === 'ALL' ||
                            (activityStatusFilter === 'ACTIVE' && at.isActive) ||
                            (activityStatusFilter === 'INACTIVE' && !at.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [activityTypes, activitySearch, activityStatusFilter]);

  const resetActivityForm = () => {
    setActivityName('');
    setActivityDescription('');
    setActivityCategory('');
    setActivityIsActive(true);
    setEditingActivity(null);
  };

  const handleSaveActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedName = activityName.trim();
    if (!cleanedName) return;
    
    const isDuplicate = activityTypes.some(at => 
      at.name.toLowerCase() === cleanedName.toLowerCase() && 
      at.id !== editingActivity?.id
    );
    if (isDuplicate) {
      alert("Já existe uma atividade com esse nome.");
      return;
    }

    const newOrder = editingActivity 
      ? editingActivity.displayOrder 
      : (activityTypes.length > 0 ? Math.max(...activityTypes.map(a => a.displayOrder)) + 1 : 0);

    const activityData: ActivityType = {
      id: editingActivity?.id || crypto.randomUUID(),
      workspaceId: currentUser.workspaceId,
      name: cleanedName,
      description: activityDescription.trim() || undefined,
      category: activityCategory.trim() || undefined,
      isActive: activityIsActive,
      displayOrder: newOrder,
      createdAt: editingActivity?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    try {
      await syncActivityType(activityData);
      
      await logAction(
        currentUser.workspaceId, 
        currentUser, 
        LogModule.SETTINGS, 
        editingActivity ? LogAction.UPDATE : LogAction.CREATE, 
        `${currentUser.username} ${editingActivity ? 'atualizou' : 'criou'} a atividade ${cleanedName}`, 
        cleanedName
      );

      if (editingActivity) {
        setActivityTypes(prev => prev.map(at => at.id === editingActivity.id ? activityData : at));
      } else {
        setActivityTypes(prev => [...prev, activityData]);
      }

      setShowActivityModal(false);
      resetActivityForm();
    } catch (err: any) {
      alert("Erro ao salvar atividade: " + err.message);
    }
  };

  const handleDeleteActivity = async (activity: ActivityType) => {
    if (confirm(`Tem certeza que deseja excluir a atividade "${activity.name}"?`)) {
      try {
        const res = await deleteOrDeactivateActivityType(activity.id);
        if (res.deleted) {
          alert(`Atividade "${activity.name}" excluída com sucesso.`);
          setActivityTypes(prev => prev.filter(at => at.id !== activity.id));
        } else {
          alert(`Esta atividade já foi utilizada em projetos e não pode ser excluída. Ela foi desativada.`);
          setActivityTypes(prev => prev.map(at => at.id === activity.id ? { ...at, isActive: false } : at));
        }
        await logAction(
          currentUser.workspaceId,
          currentUser,
          LogModule.SETTINGS,
          LogAction.DELETE,
          `${currentUser.username} tentou excluir/desativar a atividade ${activity.name}`,
          activity.name
        );
      } catch (err: any) {
        alert("Erro ao remover atividade: " + err.message);
      }
    }
  };

  const handleReorderActivity = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= filteredActivityTypes.length) return;

    const currentItem = filteredActivityTypes[index];
    const swapItem = filteredActivityTypes[newIndex];

    const tempOrder = currentItem.displayOrder;
    const updatedCurrent = { ...currentItem, displayOrder: swapItem.displayOrder, updatedAt: Date.now() };
    const updatedSwap = { ...swapItem, displayOrder: tempOrder, updatedAt: Date.now() };

    try {
      await syncActivityType(updatedCurrent);
      await syncActivityType(updatedSwap);

      setActivityTypes(prev => {
        const mapped = prev.map(at => {
          if (at.id === currentItem.id) return updatedCurrent;
          if (at.id === swapItem.id) return updatedSwap;
          return at;
        });
        return [...mapped].sort((a, b) => a.displayOrder - b.displayOrder);
      });
    } catch (err: any) {
      alert("Erro ao alterar ordem das atividades: " + err.message);
    }
  };

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
            trialStart: data.trial_start ? new Date(data.trial_start).getTime() : Date.now(),
            logoUrl: data.logo_url
          }
        });
        setLogoUrl(data.logo_url || '');
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
    const newCompany = { 
      ...db.company, 
      name: companyName, 
      logoUrl,
      workStartTime,
      workEndTime,
      lunchDurationMinutes,
      workDays
    };
    if (!newCompany.id) return;

    try {
      await syncCompany(newCompany as any);
      setDb({ ...db, company: newCompany as any });
      
      const diffLogs = generateDiffLogs(db.company, newCompany, {
        name: { label: 'Nome Fantasia' },
        workStartTime: { label: 'Início da Jornada' },
        workEndTime: { label: 'Fim da Jornada' },
        lunchDurationMinutes: { label: 'Duração do Intervalo' }
      }, 'a empresa');

      if (diffLogs.length > 0) {
        for (const log of diffLogs) {
           await logAction(currentUser.workspaceId, currentUser, LogModule.SETTINGS, LogAction.UPDATE, `${currentUser.username} ${log}`, 'COMPANY');
        }
      } else {
         await logAction(currentUser.workspaceId, currentUser, LogModule.SETTINGS, LogAction.UPDATE, `${currentUser.username} atualizou as configurações da empresa`, 'COMPANY');
      }

      alert('Configurações da empresa salvas!');
    } catch (err: any) {
      alert("Erro ao salvar no Supabase: " + (err.message || "Erro desconhecido"));
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !db.company?.id) return;

    // Limite de 2MB
    if (file.size > 2 * 1024 * 1024) {
      alert('O arquivo deve ter no máximo 2MB.');
      return;
    }

    setIsUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${db.company.id}/logo-${Date.now()}.${fileExt}`;

      // Upload para o bucket 'logos'
      const { data, error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, file, {
          upsert: true,
          contentType: file.type
        });

      if (uploadError) throw uploadError;

      // Pegar URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(fileName);

      setLogoUrl(publicUrl);

      // Auto-salvamento da URL no perfil
      const updatedCompany = { ...db.company, logoUrl: publicUrl };
      await syncCompany(updatedCompany as any);
      setDb({ ...db, company: updatedCompany as any });
      await logAction(currentUser.workspaceId, currentUser, LogModule.SETTINGS, LogAction.UPDATE, `${currentUser.username} atualizou o logotipo da empresa`, 'COMPANY_LOGO');

    } catch (err: any) {
      alert("Erro ao enviar logotipo: " + (err.message || "Erro desconhecido"));
    } finally {
      setIsUploadingLogo(false);
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
        
        const diffLogs = generateDiffLogs(editingUser, userData, {
          username: { label: 'Username' },
          role: { label: 'Permissão' },
          isActive: { label: 'Status', format: formatBooleanForLog }
        }, `o usuário ${userData.username}`);

        if (diffLogs.length > 0) {
          for (const log of diffLogs) {
             await logAction(currentUser.workspaceId, currentUser, LogModule.SETTINGS, LogAction.UPDATE, `${currentUser.username} ${log}`, userData.username);
          }
        } else {
           await logAction(currentUser.workspaceId, currentUser, LogModule.SETTINGS, LogAction.UPDATE, `${currentUser.username} atualizou o usuário ${userData.username}`, userData.username);
        }
      } else {
        if (db.users.some((u: any) => u.username === username)) {
          alert('Username já existe');
          return;
        }
        newUsers = [...db.users, userData];
        await logAction(currentUser.workspaceId, currentUser, LogModule.SETTINGS, LogAction.CREATE, `${currentUser.username} cadastrou o usuário ${userData.username}`, userData.username);
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
      await logAction(currentUser.workspaceId, currentUser, LogModule.SETTINGS, LogAction.UPDATE, `${currentUser.username} ${updatedUser.isActive ? 'ativou' : 'desativou'} o usuário ${user.username}`, user.username);
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

  return (
    <div className="space-y-8 max-w-4xl animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight transition-colors">Configurações do Sistema</h1>
      </div>

      {/* Company Section */}
      <section className="bg-white dark:bg-[#1e293b] rounded-3xl shadow-sm dark:shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
        <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 transition-colors">
          <h2 className="font-black text-xs text-slate-400 dark:text-slate-400 uppercase tracking-widest">Workspace / Empresa</h2>
        </div>
        <div className="p-8 space-y-8">
          {/* Logo Upload Section */}
          <div className="flex items-start space-x-8 pb-8 border-b border-slate-100 dark:border-slate-800 transition-colors">
            <div className="relative group">
              <div className="w-24 h-24 rounded-3xl bg-slate-100 dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden transition-all group-hover:border-indigo-500/50">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo Preview" className="w-full h-full object-contain p-2" />
                ) : (
                  <svg className="w-8 h-8 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                )}
                {isUploadingLogo && (
                  <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
              <label
                htmlFor="logo-upload"
                className="absolute -bottom-2 -right-2 w-8 h-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl flex items-center justify-center cursor-pointer shadow-lg shadow-indigo-500/20 transition-all active:scale-90"
                title="Carregar Logotipo"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                <input
                  id="logo-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                  disabled={isUploadingLogo}
                />
              </label>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight mb-1">Logotipo da Empresa</h3>
              <p className="text-xs text-slate-500 dark:text-slate-500 leading-relaxed mb-4">
                Carregue o logotipo oficial para personalização da interface.
                Recomendado: PNG ou SVG com fundo transparente. Máx 2MB.
              </p>
              {logoUrl && (
                <button
                  onClick={() => { setLogoUrl(''); handleSaveCompany({ preventDefault: () => { } } as any); }}
                  className="text-[10px] font-black uppercase text-rose-500 hover:text-rose-400 transition"
                >
                  Remover Logotipo
                </button>
              )}
            </div>
          </div>

          <form onSubmit={handleSaveCompany} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Nome Fantasia</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
                  autoComplete="organization"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Licença Atual</label>
                <div className="flex items-center space-x-3 px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-indigo-600 dark:text-indigo-400 font-bold transition-colors">
                  <div className={`w-2 h-2 rounded-full ${db.company.licenseStatus === LicenseStatus.ACTIVE ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500'}`}></div>
                  <span className="uppercase tracking-widest">{db.company.licenseStatus}</span>
                </div>
              </div>
            </div>
            <button type="submit" className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition shadow-lg shadow-indigo-500/20 active:scale-95">
              Salvar Alterações
            </button>
          </form>
        </div>
      </section>

      {/* Jornada de Trabalho Section */}
      <section className="bg-white dark:bg-[#1e293b] rounded-3xl shadow-sm dark:shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
        <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 transition-colors">
          <h2 className="font-black text-xs text-slate-400 dark:text-slate-400 uppercase tracking-widest">Jornada de Trabalho</h2>
        </div>
        <div className="p-8 space-y-6">
          <form onSubmit={handleSaveCompany} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Início da jornada</label>
                <input
                  type="text"
                  placeholder="Ex: 08:00"
                  value={workStartTime}
                  onChange={(e) => setWorkStartTime(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Fim da jornada</label>
                <input
                  type="text"
                  placeholder="Ex: 18:00"
                  value={workEndTime}
                  onChange={(e) => setWorkEndTime(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Intervalo (Minutos)</label>
                <input
                  type="number"
                  min="0"
                  value={lunchDurationMinutes}
                  onChange={(e) => setLunchDurationMinutes(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Dias de trabalho</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((dayName, idx) => {
                    const isSelected = workDays.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setWorkDays(workDays.filter(d => d !== idx));
                          } else {
                            setWorkDays([...workDays, idx].sort());
                          }
                        }}
                        className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {dayName}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <button type="submit" className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition shadow-lg shadow-indigo-500/20 active:scale-95">
              Salvar Jornada
            </button>
          </form>
        </div>
      </section>

      {/* Alertas e Agenda Section */}
      <section className="bg-white dark:bg-[#1e293b] rounded-3xl shadow-sm dark:shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
        <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 transition-colors">
          <h2 className="font-black text-xs text-slate-400 dark:text-slate-400 uppercase tracking-widest">Configurações de Agenda e Alertas</h2>
        </div>
        <div className="p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight mb-1">Visualizar Alertas Gerais (ADMIN)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pr-6">
                Permitir que usuários com perfil ADMINISTRADOR recebam pop-ups de alertas para todas as tarefas cadastradas na equipe, não apenas as que estão atribuídas diretamente a eles.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
              <input 
                type="checkbox" 
                checked={adminGeneralAlerts} 
                onChange={e => handleToggleAdminAlerts(e.target.checked)}
                className="sr-only peer" 
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
            </label>
          </div>
        </div>
      </section>

      {/* Billing Section */}
      <section className="bg-white dark:bg-[#1e293b] rounded-3xl shadow-sm dark:shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden relative transition-colors">
        <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex justify-between items-center transition-colors">
          <h2 className="font-black text-xs text-slate-400 dark:text-slate-400 uppercase tracking-widest">Plano e Faturamento</h2>
          {db.company?.licenseStatus === LicenseStatus.TRIAL && (
            <span className="text-[10px] font-black bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-500 px-3 py-1 rounded-full uppercase tracking-widest animate-pulse border border-amber-200 dark:border-amber-500/20">
              Período de Teste
            </span>
          )}
        </div>
        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-300 font-medium mb-2 transition-colors">
                Modelo de Assinatura: <span className="text-indigo-600 dark:text-indigo-400 font-black uppercase">Per Seat (Por Usuário)</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 leading-relaxed mb-6 transition-colors">
                Sua assinatura é calculada com base no número de usuários ativos.
                Valor atual: <span className="text-slate-900 dark:text-white font-bold transition-colors">R$ 29,90 / usuário</span>.
              </p>
              <div className="flex space-x-4">
                {db.company?.licenseStatus === LicenseStatus.TRIAL ? (
                  <button
                    onClick={() => {
                      setTargetSeatCount(Math.max(db.users.length, 1));
                      setShowSeatModal(true);
                    }}
                    disabled={isProcessingSubscription}
                    className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition shadow-lg shadow-emerald-500/20 disabled:opacity-50 active:scale-95"
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
                    className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition shadow-lg shadow-indigo-500/20 disabled:opacity-50 active:scale-95"
                  >
                    {isProcessingSubscription ? 'Processando...' : 'Alterar Assinatura'}
                  </button>
                )}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800/50 space-y-4 transition-colors">
              <div className="flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Usuários Contratados</span>
                  {isSyncing && (
                    <span className="text-[9px] text-indigo-600 dark:text-indigo-400 font-bold animate-pulse mt-1">Sincronizando...</span>
                  )}
                </div>
                <span className="text-sm font-black text-slate-900 dark:text-white transition-colors">{db.company?.licenseStatus === LicenseStatus.TRIAL ? 5 : (db.company?.userLimit || 0)}</span>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800/50 transition-colors">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Investimento Mensal</span>
                <span className="text-sm font-black text-emerald-600 dark:text-emerald-500 transition-colors">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((db.company?.userLimit || 0) * 29.9)}
                </span>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800/50 transition-colors">
                <button
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="w-full py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-400 hover:text-indigo-600 dark:hover:text-white border border-slate-200 dark:border-transparent rounded-xl text-[10px] font-black uppercase tracking-widest transition flex items-center justify-center space-x-2 shadow-sm dark:shadow-none"
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
                <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800/50 transition-colors">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Trial Restante</span>
                  <span className="text-sm font-black text-amber-600 dark:text-amber-500 transition-colors">
                    {(() => {
                      const daysPassed = (Date.now() - (db.company?.trialStart || Date.now())) / (1000 * 60 * 60 * 24);
                      const remaining = Math.max(0, Math.ceil(7 - daysPassed));
                      return `${remaining} ${remaining === 1 ? 'dia' : 'dias'}`;
                    })()}
                  </span>
                </div>
              )}

              {(db.company?.licenseStatus === LicenseStatus.ACTIVE || db.company?.licenseStatus === LicenseStatus.CANCELLED) && db.company?.subscriptionEnd && (
                <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800/50 transition-colors">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    {db.company.licenseStatus === LicenseStatus.ACTIVE ? 'Próxima Renovação' : 'Acesso Válido Até'}
                  </span>
                  <span className={`text-sm font-black transition-colors ${db.company.licenseStatus === LicenseStatus.ACTIVE ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {new Date(db.company.subscriptionEnd).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              )}

              {db.company?.licenseStatus === LicenseStatus.ACTIVE && (
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800/50 text-center transition-colors">
                  <button
                    onClick={handleCancelSubscription}
                    className="text-[10px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-400 transition"
                  >
                    Cancelar Assinatura
                  </button>
                  <p className="text-[9px] text-slate-500 dark:text-slate-600 mt-2 transition-colors">
                    O cancelamento interrompe a renovação automática. Seu acesso continua até o fim do ciclo pago.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Users Section */}
      <section className="bg-white dark:bg-[#1e293b] rounded-3xl shadow-sm dark:shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
        <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30 transition-colors">
          <h2 className="font-black text-xs text-slate-400 dark:text-slate-400 uppercase tracking-widest">Usuários Internos</h2>

          <div className="flex items-center space-x-4">
            {db.users.filter(u => u.isActive).length > (db.company?.userLimit || 1) && (
              <span className="text-[10px] font-black text-rose-600 dark:text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full uppercase tracking-widest animate-pulse border border-rose-200 dark:border-rose-500/20">
                Limite Excedido! Desative usuários.
              </span>
            )}
            <span className={`text-[9px] font-black uppercase tracking-widest transition-colors ${db.users.filter(u => u.isActive).length > (db.company?.userLimit || 1) ? 'text-rose-600 dark:text-rose-500' : 'text-slate-400 dark:text-slate-500'}`}>
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
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition active:scale-95 ${db.users.length >= (db.company?.licenseStatus === LicenseStatus.TRIAL ? 5 : (db.company?.userLimit || 1)) ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-500/10'}`}
            >
              Novo Usuário
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/30 text-[9px] uppercase tracking-widest text-slate-500 dark:text-slate-600 font-black border-b border-slate-100 dark:border-slate-800 transition-colors">
                <th className="px-8 py-4">Username</th>
                <th className="px-8 py-4">Função</th>
                <th className="px-8 py-4">Status</th>
                <th className="px-8 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 transition-colors">
              {db.users.map((user: InternalUser) => (
                <tr key={user.id} className="text-sm hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-8 py-5 font-bold text-slate-900 dark:text-slate-100 transition-colors">{user.username}</td>
                  <td className="px-8 py-5 text-[10px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest transition-colors">{user.role}</td>
                  <td className="px-8 py-5">
                    <span className={`inline-block w-2 h-2 rounded-full ${user.isActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-slate-300 dark:bg-slate-700 transition-colors'}`}></span>
                  </td>
                  <td className="px-8 py-5 text-right space-x-4">
                    <button
                      onClick={() => { setEditingUser(user); setUsername(user.username); setRole(user.role); setIsActive(user.isActive); setShowUserModal(true); }}
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 font-black uppercase tracking-widest hover:text-indigo-700 dark:hover:text-indigo-300 transition"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1e293b] rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700 transition-colors duration-500">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex justify-between items-center transition-colors">
              <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-sm transition-colors">{editingUser ? 'Configurar Usuário' : 'Novo Perfil'}</h3>
              <button onClick={() => setShowUserModal(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-white transition-colors">
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
                  className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
                  placeholder="ex: joao.eng"
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{editingUser ? 'Nova Senha (ou vazio)' : 'Senha de Acesso *'}</label>
                <input
                  type="password"
                  required={!editingUser}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Nível de Permissão</label>
                <select
                  value={role}
                  onChange={(e: any) => setRole(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
                >
                  <option value={UserRole.USER}>Usuário Padrão</option>
                  <option value={UserRole.ADMIN}>Administrador (Master)</option>
                </select>
              </div>
              <div className="pt-6 flex space-x-3">
                <button type="button" onClick={() => setShowUserModal(false)} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl text-xs font-black uppercase tracking-widest hover:text-slate-700 dark:hover:text-white transition active:scale-95">Cancelar</button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:bg-indigo-700 transition active:scale-95">Salvar Usuário</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSeatModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-[#1e293b] rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700 transition-colors duration-500">
            <div className="p-8 text-center border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 transition-colors">
              <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2 transition-colors">Quantos usuários?</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm transition-colors">Selecione o número total de licenças que deseja contratar.</p>
            </div>

            <div className="p-10 space-y-8">
              <div className="flex items-center justify-center space-x-6">
                <button
                  onClick={() => setTargetSeatCount(Math.max(1, targetSeatCount - 1))}
                  className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition active:scale-90"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" /></svg>
                </button>

                <div className="text-center">
                  <span className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter transition-colors">{targetSeatCount}</span>
                  <span className="block text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-1 transition-colors">Usuários</span>
                </div>

                <button
                  onClick={() => setTargetSeatCount(targetSeatCount + 1)}
                  className="w-12 h-12 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700 flex items-center justify-center transition shadow-lg shadow-indigo-500/20 active:scale-90"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                </button>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 text-center transition-colors">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 transition-colors">Resumo do Investimento</p>
                <div className="flex items-center justify-center space-x-2">
                  <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 transition-colors">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(targetSeatCount * 29.90)}
                  </span>
                  <span className="text-xs font-bold text-slate-500 transition-colors">/mês</span>
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowSeatModal(false)}
                  className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl text-xs font-black uppercase tracking-widest hover:text-slate-700 dark:hover:text-white transition active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleActivateSubscription(targetSeatCount)}
                  disabled={isProcessingSubscription}
                  className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:bg-emerald-700 transition flex items-center justify-center space-x-2 disabled:opacity-70 active:scale-95"
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

      {/* Activities Section */}
      <section className="bg-white dark:bg-[#1e293b] rounded-3xl shadow-sm dark:shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
        <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50 dark:bg-slate-800/30 transition-colors">
          <div>
            <h2 className="font-black text-xs text-slate-400 dark:text-slate-400 uppercase tracking-widest">Atividades</h2>
            <p className="text-[10px] text-slate-500 mt-1 font-medium leading-relaxed">Gerencie o catálogo de tipos de atividades disponíveis na sua empresa.</p>
          </div>
          <button
            onClick={() => {
              resetActivityForm();
              setShowActivityModal(true);
            }}
            className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-500/10 active:scale-95 transition"
          >
            Nova Atividade
          </button>
        </div>

        {/* Filters and search */}
        <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/10 dark:bg-slate-900/10 flex flex-wrap gap-4 items-center transition-colors">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Pesquisar atividades..."
              value={activitySearch}
              onChange={(e) => setActivitySearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition text-xs text-slate-900 dark:text-white"
            />
            <svg className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <select
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl px-4 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-bold cursor-pointer transition-colors"
            value={activityStatusFilter}
            onChange={(e: any) => setActivityStatusFilter(e.target.value)}
          >
            <option value="ALL">Status: Todas</option>
            <option value="ACTIVE">Status: Ativas</option>
            <option value="INACTIVE">Status: Inativas</option>
          </select>
        </div>

        {/* List of activity types */}
        <div className="overflow-x-auto">
          {isLoadingActivities ? (
            <div className="py-12 text-center text-slate-400 text-xs font-bold uppercase tracking-widest animate-pulse">Carregando catálogo...</div>
          ) : filteredActivityTypes.length === 0 ? (
            <div className="py-16 text-center border-dashed border-2 border-slate-100 dark:border-slate-800 m-8 rounded-2xl">
              <p className="text-xs text-slate-400 dark:text-slate-600 font-black uppercase tracking-widest leading-loose">
                {activitySearch || activityStatusFilter !== 'ALL' 
                  ? 'Nenhuma atividade atende aos filtros' 
                  : 'Você ainda não cadastrou nenhuma atividade.'}
              </p>
              {!(activitySearch || activityStatusFilter !== 'ALL') && (
                <button
                  onClick={() => { resetActivityForm(); setShowActivityModal(true); }}
                  className="mt-4 px-4 py-2 bg-indigo-50 dark:bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest rounded-lg border border-indigo-100 dark:border-indigo-500/20 hover:bg-indigo-600 hover:text-white transition-all inline-flex items-center"
                >
                  Criar Primeira Atividade
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/30 text-[9px] uppercase tracking-widest text-slate-500 dark:text-slate-600 font-black border-b border-slate-100 dark:border-slate-800 transition-colors">
                  <th className="px-8 py-4 w-12 text-center">Posição</th>
                  <th className="px-8 py-4">Nome</th>
                  <th className="px-8 py-4">Categoria</th>
                  <th className="px-8 py-4">Descrição</th>
                  <th className="px-8 py-4 text-center">Status</th>
                  <th className="px-8 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 transition-colors">
                {filteredActivityTypes.map((activity, index) => (
                  <tr key={activity.id} className="text-sm hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-8 py-4 text-center">
                      <div className="flex flex-col items-center space-y-1">
                        <button
                          type="button"
                          onClick={() => handleReorderActivity(index, 'up')}
                          disabled={index === 0}
                          className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition ${index === 0 ? 'opacity-20 cursor-not-allowed' : 'text-slate-500 hover:text-indigo-600'}`}
                          title="Mover para cima"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 15l7-7 7 7" /></svg>
                        </button>
                        <span className="text-[10px] font-black text-slate-400">{activity.displayOrder}</span>
                        <button
                          type="button"
                          onClick={() => handleReorderActivity(index, 'down')}
                          disabled={index === filteredActivityTypes.length - 1}
                          className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition ${index === filteredActivityTypes.length - 1 ? 'opacity-20 cursor-not-allowed' : 'text-slate-500 hover:text-indigo-600'}`}
                          title="Mover para baixo"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                        </button>
                      </div>
                    </td>
                    <td className="px-8 py-4 font-bold text-slate-900 dark:text-slate-100 transition-colors">
                      {activity.name}
                    </td>
                    <td className="px-8 py-4">
                      {activity.category ? (
                        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-400 rounded-lg">
                          {activity.category}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Sem Categoria</span>
                      )}
                    </td>
                    <td className="px-8 py-4 text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate" title={activity.description}>
                      {activity.description || <span className="italic opacity-60">Sem descrição</span>}
                    </td>
                    <td className="px-8 py-4 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${activity.isActive ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700/50'}`}>
                        {activity.isActive ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-8 py-4 text-right space-x-4">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingActivity(activity);
                          setActivityName(activity.name);
                          setActivityDescription(activity.description || '');
                          setActivityCategory(activity.category || '');
                          setActivityIsActive(activity.isActive);
                          setShowActivityModal(true);
                        }}
                        className="text-[10px] text-indigo-600 dark:text-indigo-400 font-black uppercase tracking-widest hover:text-indigo-700 dark:hover:text-indigo-300 transition"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteActivity(activity)}
                        className="text-[10px] text-rose-500 hover:text-rose-400 font-black uppercase tracking-widest transition"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Activity Modal */}
      {showActivityModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1e293b] rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700 transition-colors duration-500">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex justify-between items-center transition-colors">
              <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-sm transition-colors">
                {editingActivity ? 'Configurar Atividade' : 'Nova Atividade'}
              </h3>
              <button onClick={() => setShowActivityModal(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSaveActivity} className="p-8 space-y-5">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Nome da Atividade *</label>
                <input
                  type="text"
                  required
                  value={activityName}
                  onChange={(e) => setActivityName(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
                  placeholder="ex: Projeto 3D"
                />
              </div>
              
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Categoria</label>
                <input
                  type="text"
                  value={activityCategory}
                  onChange={(e) => setActivityCategory(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
                  placeholder="ex: Desenvolvimento"
                  list="existing-categories"
                />
                <datalist id="existing-categories">
                  {Array.from(new Set(activityTypes.map(a => a.category).filter(Boolean))).map(cat => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Descrição</label>
                <textarea
                  value={activityDescription}
                  onChange={(e) => setActivityDescription(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-colors min-h-[80px] resize-none"
                  placeholder="Detalhes ou observações sobre o tipo de trabalho..."
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-tight mb-1">Status Ativo</h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Atividades inativas não aparecem como opções em novos projetos.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                  <input
                    type="checkbox"
                    checked={activityIsActive}
                    onChange={(e) => setActivityIsActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              <div className="pt-6 flex space-x-3">
                <button
                  type="button"
                  onClick={() => setShowActivityModal(false)}
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl text-xs font-black uppercase tracking-widest hover:text-slate-700 dark:hover:text-white transition active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:bg-indigo-700 transition active:scale-95"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
