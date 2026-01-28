
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

  // Sync with Supabase on Login
  useEffect(() => {
    if (companySession) {
      const loadData = async () => {
        setIsLoading(true);
        try {
          const remoteData = await fetchAllData(companySession.id);
          let finalUsers = remoteData.users || [];

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
        const company: Company = {
          id: session.user.id,
          name: session.user.user_metadata.company_name || 'PERSPEC PATH',
          email: session.user.email || '',
          passwordHash: '',
          licenseStatus: LicenseStatus.TRIAL, // Placeholder inicial
          trialStart: Date.now(),             // Placeholder inicial
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
        const company: Company = {
          id: session.user.id,
          name: session.user.user_metadata.company_name || 'PERSPEC PATH',
          email: session.user.email || '',
          passwordHash: '',
          licenseStatus: LicenseStatus.TRIAL, // Placeholder inicial
          trialStart: Date.now(),             // Placeholder inicial
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

  const isExpired = useMemo(() => {
    if (!db.company) return false;
    if (db.company.licenseStatus === LicenseStatus.EXPIRED) return true;
    if (db.company.licenseStatus === LicenseStatus.TRIAL) {
      const daysPassed = (Date.now() - db.company.trialStart) / (1000 * 60 * 60 * 24);
      return daysPassed > 7; // Reduzido para 7 dias
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

  const switchUser = () => {
    setUserSession(null);
    localStorage.removeItem('PATH_USER_SESSION');
  };

  if (isLoading) return <div className="h-screen flex items-center justify-center text-slate-500 font-black uppercase text-xs tracking-widest">Carregando PERSPEC PATH...</div>;

  if (!companySession) {
    return <CompanyLogin db={db} setDb={setDb} onLogin={handleCompanyLogin} />;
  }

  if (isExpired) {
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

            <h1 className="text-3xl font-black mb-4 tracking-tight uppercase">Licença Expirada</h1>
            <p className="text-slate-400 mb-10 max-w-md mx-auto text-sm leading-relaxed font-medium">
              O seu período de teste de 07 dias do <span className="text-white font-bold">PERSPEC PATH</span> chegou ao fim.
              Mantenha o controle total dos seus projetos assinando nosso plano Premium.
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