
import React, { useState, useEffect, useMemo } from 'react';
import { Company, InternalUser, LicenseStatus, UserRole, LogModule, LogAction, TeamTask } from './types';
import { AppDB, fetchAllData, syncUser, logAction, syncTeamTask } from './storage';
import { supabase } from './lib/supabase';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Clients } from './components/Clients';
import { Projects } from './components/Projects';
import { Gantt } from './components/Gantt';
import { Settings } from './components/Settings';
import { Team } from './components/Team';
import { CompanyLogin } from './components/Auth';
import { InternalUserLogin } from './components/Who';
import { Reports } from './components/Reports';
import { Tasks } from './components/Tasks';
import { Logs } from './components/Logs';

type Page = 'dashboard' | 'clients' | 'projects' | 'tasks' | 'timeline' | 'team' | 'reports' | 'logs' | 'settings';

const App: React.FC = () => {
  const [db, setDb] = useState<AppDB>({
    company: null,
    users: [],
    clients: [],
    projects: [],
    tasks: [],
  });
  const [companySession, setCompanySession] = useState<Company | null>(null);
  const [userSession, setUserSession] = useState<InternalUser | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [currentAlert, setCurrentAlert] = useState<TeamTask | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('PATH_THEME');
    return (saved as 'dark' | 'light') || 'dark';
  });

  const [isEmailConfirmed, setIsEmailConfirmed] = useState(true);
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [selectedLicenseCount, setSelectedLicenseCount] = useState(1);

  // Initialize selectedLicenseCount based on active users when data is loaded
  useEffect(() => {
    if (db.users.length > 0) {
      const activeCount = db.users.filter(u => u.isActive).length;
      setSelectedLicenseCount(Math.max(1, activeCount));
    }
  }, [db.users]);

  // Sync with Supabase on Login
  useEffect(() => {
    if (companySession) {
      const loadData = async () => {
        // Silent Loading: Only show full screen loading if we don't have company data yet
        if (!db.company) {
          setIsLoading(true);
        }
        try {
          const { data: { user } } = await supabase.auth.getUser();
          setIsEmailConfirmed(!!user?.email_confirmed_at);

          const remoteData = await fetchAllData(companySession.id);
          let finalUsers = remoteData.users || [];
          // ... (rest of the useEffect logic remains same, but I'll apply it in a single contiguous block if possible or multiple chunks)

          if (finalUsers.length === 0) {
            const adminUser: InternalUser = {
              id: companySession.id,
              workspaceId: companySession.id,
              username: 'admin',
              passwordHash: 'admin',
              role: UserRole.ADMIN,
              isActive: true,
              mustChangePassword: true
            };

            // Wait for sync to avoid FK errors in projects
            await syncUser(adminUser);
            finalUsers = [adminUser];
          }

          const mergedCompany = remoteData.company || companySession;
          if (mergedCompany && mergedCompany.licenseStatus === LicenseStatus.TRIAL) {
            mergedCompany.userLimit = 5; // Força 5 usuários no trial
          }
          setDb({
            ...remoteData,
            users: finalUsers,
            company: mergedCompany,
            clients: remoteData.clients || [],
            projects: remoteData.projects || [],
            tasks: remoteData.tasks || [],
          });
          if (mergedCompany && JSON.stringify(mergedCompany) !== JSON.stringify(companySession)) {
            setCompanySession(mergedCompany);
          }
        } catch (err) {
          console.error("Erro ao carregar dados do Supabase:", err);
        } finally {
          setIsLoading(false);
        }
      };
      loadData();
    }
  }, [companySession?.id]);

  useEffect(() => {
    // 1. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setIsEmailConfirmed(!!session.user.email_confirmed_at);

        // Guard: Avoid unnecessary state updates if it's the same user
        if (companySession?.id === session.user.id) {
          return;
        }

        const company: Company = {
          id: session.user.id,
          name: session.user.user_metadata.company_name || 'PERSPEC PATH',
          email: session.user.email || '',
          passwordHash: '',
          licenseStatus: LicenseStatus.TRIAL, // Placeholder inicial
          trialStart: Date.now(),             // Placeholder inicial
          userLimit: 5,                       // Limite padrão do Trial
        };
        setCompanySession(company);

        setDb(prev => ({ ...prev, company }));
      } else {
        setCompanySession(null);
        setUserSession(null);
      }
      setIsLoading(false);
    });

    // 2. Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setIsEmailConfirmed(!!session.user.email_confirmed_at);

        // Guard: Avoid unnecessary state updates if it's the same user
        if (companySession?.id === session.user.id) {
          setIsLoading(false);
          return;
        }

        const company: Company = {
          id: session.user.id,
          name: session.user.user_metadata.company_name || 'PERSPEC PATH',
          email: session.user.email || '',
          passwordHash: '',
          licenseStatus: LicenseStatus.TRIAL, // Placeholder inicial
          trialStart: Date.now(),             // Placeholder inicial
          userLimit: 5,                       // Limite padrão do Trial
        };
        setCompanySession(company);
        setDb(prev => ({ ...prev, company }));
      }
      setIsLoading(false);
    });

    const savedUserStr = localStorage.getItem('PATH_USER_SESSION');
    if (savedUserStr) {
      try {
        const savedUser = JSON.parse(savedUserStr);
        // Simple UUID regex check
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(savedUser.workspaceId)) {
          setUserSession(savedUser);
        } else {
          localStorage.removeItem('PATH_USER_SESSION');
        }
      } catch (e) {
        localStorage.removeItem('PATH_USER_SESSION');
      }
    }

    // 3. Handle external auth errors (like expired links)
    const hash = window.location.hash;
    if (hash.includes('error=')) {
      const params = new URLSearchParams(hash.replace('#', ''));
      const errorMsg = params.get('error_description') || params.get('error') || 'Erro na autenticação';
      alert(`Erro: ${errorMsg.replace(/\+/g, ' ')}`);
      // Clear the hash to avoid repeat alerts
      window.history.replaceState(null, '', window.location.pathname);
    }

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('PATH_THEME', theme);
  }, [theme]);

  useEffect(() => {
    if (!userSession || !db.tasks || db.tasks.length === 0) return;

    const checkAlerts = () => {
      const now = Date.now();
      const isAdmin = userSession.role === UserRole.ADMIN;
      const adminGeneralAlerts = localStorage.getItem('PATH_ADMIN_GENERAL_ALERTS') === 'true';

      const triggeredTasks = db.tasks.filter(t => {
        if (!t.reminder || t.reminder === 'none') return false;

        const isRecipient = t.assigneeId === userSession.id || 
                            (t.invitedUsers && t.invitedUsers.includes(userSession.id)) || 
                            (isAdmin && adminGeneralAlerts);
        if (!isRecipient) return false;

        const userState = t.reminderState?.[userSession.id];
        let isDismissed = false;
        let snoozeUntil: number | undefined = undefined;

        if (userState) {
          isDismissed = userState.dismissed;
          snoozeUntil = userState.snoozeUntil;
        } else if (t.assigneeId === userSession.id) {
          isDismissed = !!t.reminderDismissed;
          snoozeUntil = t.snoozeUntil;
        }

        if (isDismissed) return false;

        if (!t.startTime) return false;
        const taskDateTime = new Date(`${t.startDate}T${t.startTime}:00`);
        if (isNaN(taskDateTime.getTime())) return false;

        let offsetMinutes = 0;
        if (t.reminder === '5m') offsetMinutes = 5;
        else if (t.reminder === '10m') offsetMinutes = 10;
        else if (t.reminder === '15m') offsetMinutes = 15;
        else if (t.reminder === '30m') offsetMinutes = 30;
        else if (t.reminder === '1h') offsetMinutes = 60;

        const scheduledTime = taskDateTime.getTime() - offsetMinutes * 60 * 1000;

        if (snoozeUntil) {
          return now >= snoozeUntil;
        } else {
          return now >= scheduledTime;
        }
      });

      if (triggeredTasks.length > 0) {
        const nextAlert = triggeredTasks.find(t => !currentAlert || currentAlert.id !== t.id);
        if (nextAlert && (!currentAlert || currentAlert.id !== nextAlert.id)) {
          setCurrentAlert(nextAlert);
        }
      }
    };

    checkAlerts();
    const interval = setInterval(checkAlerts, 10000);
    return () => clearInterval(interval);
  }, [db.tasks, userSession, currentAlert]);

  const handleDismissAlert = async (task: TeamTask) => {
    if (!userSession) return;
    const updatedReminderState = {
      ...(task.reminderState || {}),
      [userSession.id]: {
        dismissed: true,
        snoozeUntil: undefined
      }
    };
    const updatedTask: TeamTask = {
      ...task,
      reminderState: updatedReminderState
    };
    if (task.assigneeId === userSession.id) {
      updatedTask.reminderDismissed = true;
      updatedTask.snoozeUntil = undefined;
    }
    try {
      setDb(prev => ({
        ...prev,
        tasks: prev.tasks.map(t => t.id === task.id ? updatedTask : t)
      }));
      setCurrentAlert(null);
      await syncTeamTask(updatedTask);
      await logAction(
        db.company?.id || task.workspaceId,
        userSession!,
        LogModule.TASKS,
        LogAction.UPDATE,
        `${userSession?.username} confirmou o alerta da tarefa "${task.title}"`,
        task.title
      );
    } catch (err: any) {
      console.error("Erro ao dispensar alerta:", err);
    }
  };

  const handleSnoozeAlert = async (task: TeamTask) => {
    if (!userSession) return;
    const snoozeTime = Date.now() + 5 * 60 * 1000; // 5 minutes
    const updatedReminderState = {
      ...(task.reminderState || {}),
      [userSession.id]: {
        dismissed: false,
        snoozeUntil: snoozeTime
      }
    };
    const updatedTask: TeamTask = {
      ...task,
      reminderState: updatedReminderState
    };
    if (task.assigneeId === userSession.id) {
      updatedTask.reminderDismissed = false;
      updatedTask.snoozeUntil = snoozeTime;
    }
    try {
      setDb(prev => ({
        ...prev,
        tasks: prev.tasks.map(t => t.id === task.id ? updatedTask : t)
      }));
      setCurrentAlert(null);
      await syncTeamTask(updatedTask);
      await logAction(
        db.company?.id || task.workspaceId,
        userSession!,
        LogModule.TASKS,
        LogAction.UPDATE,
        `${userSession?.username} adiou o alerta da tarefa "${task.title}" em 5 minutos`,
        task.title
      );
    } catch (err: any) {
      console.error("Erro ao adiar alerta:", err);
    }
  };

  const isOverLimit = useMemo(() => {
    if (!db.company) return false;
    const activeUserCount = db.users.filter(u => u.isActive).length;
    const limit = db.company.userLimit || 1;
    return activeUserCount > limit;
  }, [db.company, db.users]);

  const isExpired = useMemo(() => {
    if (!db.company) return false;

    // Status EXPIRED: Bloqueio imediato (exceto Admin se limite=1 [mantido abaixo])
    if (db.company.licenseStatus === LicenseStatus.EXPIRED) return true;

    // Status SUSPENDED: Bloqueio por falta de pagamento
    if (db.company.licenseStatus === LicenseStatus.SUSPENDED) return true;

    // Status CANCELLED: Bloqueio se passar da data fim (Grace Period)
    if (db.company.licenseStatus === LicenseStatus.CANCELLED) {
      const endDate = db.company.subscriptionEnd || Date.now();
      return Date.now() > endDate;
    }

    // Status TRIAL: Bloqueio após 7 dias
    if (db.company.licenseStatus === LicenseStatus.TRIAL) {
      const daysPassed = (Date.now() - db.company.trialStart) / (1000 * 60 * 60 * 24);
      return daysPassed > 7;
    }

    return false;
  }, [db.company]);

  const handleCompanyLogin = (company: Company) => {
    setCompanySession(company);
  };

  const handleUserLogin = async (user: InternalUser) => {
    setUserSession(user);
    localStorage.setItem('PATH_USER_SESSION', JSON.stringify(user));
    if (db.company) {
      await logAction(db.company.id, user, LogModule.AUTH, LogAction.LOGIN, `${user.username} realizou login no sistema.`);
    }
  };

  const handleLogout = async () => {
    if (userSession && db.company) {
      await logAction(db.company.id, userSession, LogModule.AUTH, LogAction.LOGOUT, `${userSession.username} saiu do sistema.`);
    }
    await supabase.auth.signOut();
    setUserSession(null);
    setCompanySession(null);
    localStorage.removeItem('PATH_USER_SESSION');
  };

  const handleResendConfirmation = async () => {
    if (!companySession?.email) return;
    setIsResending(true);
    setResendStatus('idle');
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: companySession.email,
      });
      if (error) throw error;
      setResendStatus('success');
    } catch (err) {
      console.error("Erro ao reenviar:", err);
      setResendStatus('error');
    } finally {
      setIsResending(false);
    }
  };

  const switchUser = () => {
    setUserSession(null);
    localStorage.removeItem('PATH_USER_SESSION');
  };

  if (isLoading) return <div className="h-screen flex items-center justify-center text-slate-500 font-black uppercase text-xs tracking-widest">Carregando PERSPEC PATH...</div>;

  if (!companySession) {
    return <CompanyLogin db={db} setDb={setDb} onLogin={handleCompanyLogin} />;
  }

  // Trava de Confirmação de E-mail
  if (!isEmailConfirmed) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0f172a] text-white p-6 text-center">
        <div className="bg-[#1e293b] p-10 rounded-[40px] border border-slate-700 max-w-md shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500"></div>

          <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-indigo-500/20">
            <svg className="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          <h2 className="text-2xl font-black uppercase mb-4 tracking-tighter">Confirme seu E-mail</h2>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed font-medium">
            Enviamos um link de confirmação para <span className="text-white font-bold">{companySession.email}</span>.
            Por favor, verifique sua caixa de entrada (e spam) para liberar o acesso ao seu Workspace.
          </p>

          <div className="space-y-4">
            <button
              onClick={handleResendConfirmation}
              disabled={isResending || resendStatus === 'success'}
              className={`w-full py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${resendStatus === 'success'
                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-500/20'
                }`}
            >
              {isResending ? 'Enviando...' : (resendStatus === 'success' ? 'E-mail Enviado!' : 'Reenviar E-mail de Confirmação')}
            </button>

            {resendStatus === 'error' && (
              <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest">Erro ao reenviar. Tente novamente em instantes.</p>
            )}

            <button
              onClick={handleLogout}
              className="w-full py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition"
            >
              Sair e usar outro e-mail
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isExpired) {
    const handleSyncOnExpired = async () => {
      if (!db.company?.id) return;
      setIsLoading(true);
      try {
        if (db.company.subscriptionId) {
          await supabase.functions.invoke('verify-subscription', {
            body: { companyId: db.company.id, subscriptionId: db.company.subscriptionId }
          });
        }
        const data = await fetchAllData(db.company.id, true);
        setDb(prev => ({ ...prev, ...data }));
        if (data.company) setCompanySession(data.company);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };

    const handleCheckoutOnExpired = async () => {
      if (!db.company) return;
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('create-subscription', {
          body: {
            userCount: selectedLicenseCount,
            companyEmail: db.company.email,
            companyId: db.company.id,
            backUrl: window.location.href
          }
        });
        if (error) throw error;
        if (data?.init_point) window.location.href = data.init_point;
      } catch (err: any) {
        alert("Erro ao iniciar checkout: " + (err.message || "Erro desconhecido"));
      } finally {
        setIsLoading(false);
      }
    };

    // Regra: Somente Admin acessa se o limite for 1 (plano individual)
    const currentLimit = companySession?.userLimit || 1;
    if (userSession && currentLimit === 1 && userSession.role !== UserRole.ADMIN) {
      return (
        <div className="h-screen flex items-center justify-center bg-[#0f172a] text-white p-6 text-center">
          <div className="bg-[#1e293b] p-10 rounded-[40px] border border-slate-700 max-w-md shadow-2xl">
            <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-amber-500/20">
              <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h2 className="text-xl font-black uppercase mb-4 tracking-tight">Acesso Restrito</h2>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              Sua assinatura atual permite apenas o acesso do <span className="text-white font-bold">Administrador</span>.
              Entre em contato com o gestor do seu workspace para expandir o plano.
            </p>
            <button onClick={handleLogout} className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition">Sair</button>
          </div>
        </div>
      );
    }

    return (
      <div className="h-screen flex items-center justify-center bg-[#0f172a] text-white p-6 overflow-hidden">
        <div className="relative w-full max-w-2xl">
          {/* Background Decorations */}
          <div className="absolute -top-24 -left-24 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-emerald-600/20 rounded-full blur-3xl animate-pulse"></div>

          <div className="bg-[#1e293b] rounded-[40px] shadow-2xl border border-slate-700 p-12 text-center relative z-10 backdrop-blur-xl">
            <div className="w-20 h-20 bg-rose-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-rose-500/20 relative group">
              <div className="absolute inset-0 bg-rose-500/20 blur-xl rounded-full group-hover:blur-2xl transition-all"></div>
              <svg className="w-10 h-10 text-rose-500 relative z-10 filter drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h1 className="text-3xl font-black mb-4 tracking-tight uppercase">
              {db.company?.licenseStatus === LicenseStatus.SUSPENDED ? 'Acesso Suspenso' :
                (db.company?.licenseStatus === LicenseStatus.CANCELLED ? 'Assinatura Encerrada' : 'Licença Expirada')}
            </h1>
            <p className="text-slate-400 mb-10 max-w-md mx-auto text-sm leading-relaxed font-medium">
              {db.company?.licenseStatus === LicenseStatus.SUSPENDED
                ? 'Identificamos uma pendência no seu pagamento. Regularize sua assinatura para retomar o acesso imediato.'
                : (db.company?.licenseStatus === LicenseStatus.CANCELLED
                  ? `Sua assinatura foi cancelada e seu período de acesso encerrou em ${db.company.subscriptionEnd ? new Date(db.company.subscriptionEnd).toLocaleDateString('pt-BR') : ''}.`
                  : 'O seu período de teste do PERSPEC PATH chegou ao fim. Mantenha o controle total dos seus projetos e ative sua assinatura mensal agora mesmo.')}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
              <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800 text-left hover:border-indigo-500/50 transition-colors group flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 group-hover:text-indigo-400">Plano Profissional</h3>
                  <div className="flex items-baseline space-x-1 mb-4">
                    <span className="text-2xl font-black text-white">R$ {(selectedLicenseCount * 29.9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="text-xs text-slate-500 font-bold">/mês ({selectedLicenseCount} {selectedLicenseCount === 1 ? 'user' : 'users'})</span>
                  </div>
                </div>

                <div className="flex items-center space-x-4 bg-slate-800/50 p-3 rounded-2xl border border-white/5">
                  <button
                    onClick={() => setSelectedLicenseCount(prev => Math.max(1, prev - 1))}
                    className="w-10 h-10 bg-slate-700 hover:bg-slate-600 rounded-xl flex items-center justify-center text-white transition-all active:scale-90"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M20 12H4" /></svg>
                  </button>
                  <div className="flex-1 text-center">
                    <span className="text-xl font-black text-white">{selectedLicenseCount}</span>
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">Quantidade</p>
                  </div>
                  <button
                    onClick={() => setSelectedLicenseCount(prev => prev + 1)}
                    className="w-10 h-10 bg-indigo-600 hover:bg-indigo-500 rounded-xl flex items-center justify-center text-white transition-all active:scale-90 shadow-lg shadow-indigo-500/20"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  </button>
                </div>
              </div>

              <div
                className="bg-emerald-600 rounded-3xl p-1 flex flex-col shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer h-full min-h-[120px]"
                onClick={handleCheckoutOnExpired}
              >
                <div className="flex-1 flex flex-col items-center justify-center text-white p-6">
                  <span className="text-lg font-black uppercase tracking-tight">Ativar Agora</span>
                  <span className="text-[10px] font-bold opacity-70">Checkout Mercado Pago</span>
                  <div className="mt-4 pt-4 border-t border-white/10 w-full text-center">
                    <span className="text-md font-black">R$ {(selectedLicenseCount * 29.9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <p className="text-[8px] font-bold uppercase opacity-50 tracking-widest">Valor Final Mensal</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col space-y-6">
              <button
                onClick={handleSyncOnExpired}
                className="text-[10px] font-black text-indigo-400 uppercase tracking-widest hover:text-indigo-300 transition flex items-center justify-center space-x-2"
              >
                <svg className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                <span>Já realizei o pagamento? Sincronizar Status</span>
              </button>

              <button
                onClick={handleLogout}
                className="text-xs font-black text-slate-500 uppercase tracking-widest hover:text-white transition"
              >
                Sair do Workspace
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check Over Limit Logic (Regardless of License Status)
  if (userSession && isOverLimit && userSession.role !== UserRole.ADMIN) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0f172a] text-white p-6 text-center">
        <div className="bg-[#1e293b] p-10 rounded-[40px] border border-slate-700 max-w-md shadow-2xl">
          <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-rose-500/20">
            <svg className="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <h2 className="text-xl font-black uppercase mb-4 tracking-tight text-rose-500">Limite Excedido</h2>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">
            O número de usuários ativos excede o limite do plano contratado ({db.company?.userLimit}).
            <br /><br />
            O acesso está temporariamente restrito ao Administrador para regularização.
          </p>
          <button onClick={handleLogout} className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition">Sair</button>
        </div>
      </div>
    );
  }

  if (!userSession) {
    return <InternalUserLogin users={db.users} onLogin={handleUserLogin} onExit={handleLogout} />;
  }

  const activeUser = db.users.find(u => u.id === userSession.id);

  if (userSession && db.company && userSession.workspaceId !== db.company.id) {
    setUserSession(null);
    localStorage.removeItem('PATH_USER_SESSION');
    return null;
  }

  if (activeUser && !activeUser.isActive) {
    setUserSession(null);
    localStorage.removeItem('PATH_USER_SESSION');
    return null;
  }

  if (!activeUser && !isLoading && db.users.length > 0) {
    setUserSession(null);
    localStorage.removeItem('PATH_USER_SESSION');
    return null;
  }

  return (
    <>
      <Layout
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        user={userSession}
        onLogout={handleLogout}
        onSwitchUser={switchUser}
        companyName={db.company?.name || 'PERSPEC PATH'}
        logoUrl={db.company?.logoUrl}
        theme={theme}
        setTheme={setTheme}
        db={db}
      >
        {currentPage === 'dashboard' && <Dashboard db={db} theme={theme} />}
        {currentPage === 'clients' && <Clients db={db} setDb={setDb} currentUser={userSession} theme={theme} />}
        {currentPage === 'projects' && <Projects db={db} setDb={setDb} currentUser={userSession} theme={theme} />}
        {currentPage === 'tasks' && <Tasks db={db} setDb={setDb} currentUser={userSession} theme={theme} />}
        {currentPage === 'timeline' && <Gantt db={db} setDb={setDb} currentUser={userSession} theme={theme} />}
        {currentPage === 'team' && userSession.role === UserRole.ADMIN && <Team db={db} theme={theme} />}
        {currentPage === 'reports' && userSession.role === UserRole.ADMIN && <Reports db={db} theme={theme} />}
        {currentPage === 'settings' && userSession.role === UserRole.ADMIN && (
          <Settings db={db} setDb={setDb} currentUser={userSession} theme={theme} />
        )}
        {currentPage === 'logs' && userSession.role === UserRole.ADMIN && <Logs db={db} theme={theme} />}
      </Layout>

      {currentAlert && (
        <TaskAlertModal
          task={currentAlert}
          users={db.users}
          theme={theme}
          onDismiss={() => handleDismissAlert(currentAlert)}
          onSnooze={() => handleSnoozeAlert(currentAlert)}
        />
      )}
    </>
  );
};

const TaskAlertModal: React.FC<{
  task: TeamTask;
  users: InternalUser[];
  theme: 'dark' | 'light';
  onDismiss: () => void;
  onSnooze: () => void;
}> = ({ task, users, theme, onDismiss, onSnooze }) => {
  const assignee = users.find(u => u.id === task.assigneeId);
  const formattedDate = new Date(task.startDate + 'T12:00:00').toLocaleDateString('pt-BR');

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[999] flex items-center justify-center p-4 animate-in fade-in duration-300">
      {/* Background alarm glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <div className="w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] animate-pulse pointer-events-none" />
      </div>

      <div className="bg-white dark:bg-[#1e293b] rounded-[36px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] dark:shadow-[0_30px_70px_-10px_rgba(0,0,0,0.8)] w-full max-w-md border border-slate-200 dark:border-slate-700 p-8 transform transition-all relative z-10 animate-in zoom-in-95 duration-200">
        
        {/* Animated Alarm Icon / Badge */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-3xl bg-amber-500/15 dark:bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center text-amber-500 relative group animate-bounce">
            <svg className="w-8 h-8 filter drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        <div className="text-center mb-6">
          <span className="px-3 py-1 bg-amber-100 dark:bg-amber-500/20 border border-amber-200 dark:border-amber-500/30 rounded-full text-[9px] font-black uppercase text-amber-700 dark:text-amber-400 tracking-widest">
            Alerta de Lembrete
          </span>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight mt-3 mb-1">
            {task.title}
          </h2>
          <span className="inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            {task.type}
          </span>
        </div>

        {/* Task Details */}
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800/80 p-5 space-y-4 mb-8 text-left animate-in slide-in-from-bottom-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-black text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Responsável</span>
            <div className="flex items-center space-x-2">
              <div className="w-5 h-5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-[10px] uppercase">
                {assignee ? assignee.username.charAt(0) : '?'}
              </div>
              <span className="font-bold text-slate-700 dark:text-slate-300">{assignee ? assignee.username : 'Desconhecido'}</span>
            </div>
          </div>

          {task.invitedUsers && task.invitedUsers.length > 0 && (
            <div className="flex justify-between items-start text-xs pt-3 border-t border-slate-100 dark:border-slate-800/50">
              <span className="font-black text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Convidados</span>
              <div className="flex flex-wrap gap-1.5 max-w-[70%] justify-end">
                {users
                  .filter(u => task.invitedUsers?.includes(u.id))
                  .map(u => (
                    <span key={u.id} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md font-bold text-[10px]">
                      {u.username}
                    </span>
                  ))}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center text-xs pt-3 border-t border-slate-100 dark:border-slate-800/50">
            <span className="font-black text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Data</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">{formattedDate}</span>
          </div>

          <div className="flex justify-between items-center text-xs pt-3 border-t border-slate-100 dark:border-slate-800/50">
            <span className="font-black text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Horário</span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400">
              {task.startTime || '00:00'}{task.endTime ? ` - ${task.endTime}` : ''}
            </span>
          </div>

          {task.description && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800/50">
              <span className="font-black text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1.5">Descrição / Obs.</span>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium break-words whitespace-pre-wrap">
                {task.description}
              </p>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex flex-col space-y-3">
          <button
            onClick={onDismiss}
            className="w-full bg-indigo-600 hover:bg-indigo-700 p-4 rounded-2xl font-black uppercase text-xs tracking-widest text-white shadow-xl shadow-indigo-500/20 active:scale-95 transition-all"
          >
            Entendi
          </button>
          <button
            onClick={onSnooze}
            className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 p-4 rounded-2xl font-black uppercase text-xs tracking-widest text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
          >
            Lembrar novamente em 5 minutos
          </button>
        </div>

      </div>
    </div>
  );
};

export default App;