
import React, { useState, useEffect, useMemo } from 'react';
import { Company, InternalUser, LicenseStatus, UserRole } from './types';
import { getDB, saveDB, addAuditLog } from './storage';
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
  const [db, setDb] = useState(getDB());
  const [companySession, setCompanySession] = useState<Company | null>(null);
  const [userSession, setUserSession] = useState<InternalUser | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    saveDB(db);
  }, [db]);

  useEffect(() => {
    // 1. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        const company: Company = {
          id: session.user.id,
          name: session.user.user_metadata.company_name || 'PERSPEC PATH',
          email: session.user.email || '',
          passwordHash: '',
          licenseStatus: LicenseStatus.TRIAL,
          trialStart: Date.now(),
        };
        setCompanySession(company);

        setDb(prev => {
          const newState = { ...prev };
          if (!newState.company) newState.company = company;
          if (newState.users.length === 0) {
            newState.users = [{
              id: 'admin-' + session.user.id,
              username: 'admin',
              passwordHash: 'admin',
              role: UserRole.ADMIN,
              isActive: true,
              mustChangePassword: true
            }];
          }
          return newState;
        });
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
          licenseStatus: LicenseStatus.TRIAL,
          trialStart: Date.now(),
        };
        setCompanySession(company);
        setDb(prev => ({
          ...prev,
          company: prev.company || company
        }));
      }
      setIsLoading(false);
    });

    const savedUser = localStorage.getItem('PATH_USER_SESSION');
    if (savedUser) setUserSession(JSON.parse(savedUser));

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const isExpired = useMemo(() => {
    if (!db.company) return false;
    if (db.company.licenseStatus === LicenseStatus.EXPIRED) return true;
    if (db.company.licenseStatus === LicenseStatus.TRIAL) {
      const daysPassed = (Date.now() - db.company.trialStart) / (1000 * 60 * 60 * 24);
      return daysPassed > 14;
    }
    return false;
  }, [db.company]);

  const handleCompanyLogin = (company: Company) => {
    setCompanySession(company);
  };

  const handleUserLogin = (user: InternalUser) => {
    setUserSession(user);
    localStorage.setItem('PATH_USER_SESSION', JSON.stringify(user));
    addAuditLog(user.id, user.username, 'LOGIN', 'AUTH', undefined, { timestamp: Date.now() });
  };

  const handleLogout = async () => {
    if (userSession) {
      addAuditLog(userSession.id, userSession.username, 'LOGOUT', 'AUTH', undefined, { timestamp: Date.now() });
    }
    await supabase.auth.signOut();
    setUserSession(null);
    setCompanySession(null);
    localStorage.removeItem('PATH_USER_SESSION');
  };

  const switchUser = () => {
    if (userSession) {
      addAuditLog(userSession.id, userSession.username, 'LOGOUT', 'AUTH', undefined, { timestamp: Date.now() });
    }
    setUserSession(null);
    localStorage.removeItem('PATH_USER_SESSION');
  };

  if (isLoading) return <div className="h-screen flex items-center justify-center text-slate-500 font-black uppercase text-xs tracking-widest">Carregando PERSPEC PATH...</div>;

  if (!companySession) {
    return <CompanyLogin db={db} setDb={setDb} onLogin={handleCompanyLogin} />;
  }

  if (isExpired) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900 text-white p-6 text-center">
        <div>
          <h1 className="text-4xl font-bold mb-4">Licença Expirada</h1>
          <p className="text-slate-400 mb-8 max-w-md mx-auto">
            O seu período de teste ou licença do PERSPEC PATH expirou. Entre em contato com o suporte para reativar seu acesso.
          </p>
          <button
            onClick={handleLogout}
            className="px-6 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition"
          >
            Sair do Workspace
          </button>
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