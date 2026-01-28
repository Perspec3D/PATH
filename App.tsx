
import React, { useState, useEffect, useMemo } from 'react';
import { Company, InternalUser, LicenseStatus, UserRole } from './types';
import { AppDB, fetchAllData, syncUser } from './storage';
import { supabase } from './lib/supabase';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Clients } from './components/Clients';
import { Projects } from './components/Projects';
import { Gantt } from './components/Gantt';
import { Settings } from './components/Settings';
import { CompanyLogin } from './components/Auth';
import { InternalUserLogin } from './components/Who';

type Page = 'dashboard' | 'clients' | 'projects' | 'timeline' | 'settings';

const App: React.FC = () => {
  const [db, setDb] = useState<AppDB>({
    company: null,
    users: [],
    clients: [],
    projects: [],
  });
  const [companySession, setCompanySession] = useState<Company | null>(null);
  const [userSession, setUserSession] = useState<InternalUser | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [isLoading, setIsLoading] = useState(true);

  const [isEmailConfirmed, setIsEmailConfirmed] = useState(true);
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Sync with Supabase on Login
  useEffect(() => {
    if (companySession) {
      const loadData = async () => {
        setIsLoading(true);
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
  }, [companySession]);

  useEffect(() => {
    // 1. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setIsEmailConfirmed(!!session.user.email_confirmed_at);
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

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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

  const handleUserLogin = (user: InternalUser) => {
    setUserSession(user);
    localStorage.setItem('PATH_USER_SESSION', JSON.stringify(user));
  };

  const handleLogout = async () => {
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
            <div className="w-20 h-20 bg-rose-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-rose-500/20">
              <svg className="w-10 h-10 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m0 0v2m0-2h2m-2 0H10m11 3a9 9 0 11-18 0 9 9 0 0118 0z" />
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
                  ? 'Sua assinatura foi cancelada e o período de acesso vigente chegou ao fim.'
                  : 'O seu período de teste de 07 dias do PERSPEC PATH chegou ao fim. Mantenha o controle total dos seus projetos assinando nosso plano.')}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
              <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800 text-left hover:border-indigo-500/50 transition-colors group">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 group-hover:text-indigo-400">Plano Premium</h3>
                <div className="flex items-baseline space-x-1 mb-4">
                  <span className="text-2xl font-black text-white">R$ 99</span>
                  <span className="text-xs text-slate-500 font-bold">/mês</span>
                </div>
                <ul className="text-[10px] text-slate-400 space-y-2 uppercase font-black tracking-wider">
                  <li className="flex items-center space-x-2">
                    <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                    <span>Projetos Ilimitados</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                    <span>Dashboard Avançado</span>
                  </li>
                </ul>
              </div>

              <div className="bg-emerald-600 rounded-3xl p-1 flex flex-col shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer h-24" onClick={() => alert('Checkout Stripe em desenvolvimento')}>
                <div className="flex-1 flex flex-col items-center justify-center text-white">
                  <span className="text-lg font-black uppercase tracking-tight">Assinar Agora</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="text-xs font-black text-slate-500 uppercase tracking-widest hover:text-white transition"
            >
              Sair do Workspace
            </button>
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
  if (activeUser && !activeUser.isActive) {
    setUserSession(null);
    localStorage.removeItem('PATH_USER_SESSION');
    return null;
  }

  return (
    <Layout
      currentPage={currentPage}
      setCurrentPage={setCurrentPage}
      user={userSession}
      onLogout={handleLogout}
      onSwitchUser={switchUser}
      companyName={db.company?.name || 'PERSPEC PATH'}
    >
      {currentPage === 'dashboard' && <Dashboard db={db} />}
      {currentPage === 'clients' && <Clients db={db} setDb={setDb} currentUser={userSession} />}
      {currentPage === 'projects' && <Projects db={db} setDb={setDb} currentUser={userSession} />}
      {currentPage === 'timeline' && <Gantt db={db} setDb={setDb} currentUser={userSession} />}
      {currentPage === 'settings' && userSession.role === UserRole.ADMIN && (
        <Settings db={db} setDb={setDb} currentUser={userSession} />
      )}
    </Layout>
  );
};

export default App;