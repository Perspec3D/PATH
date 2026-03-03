
import React, { useState, useEffect } from 'react';
import { InternalUser, UserRole } from '../types';
import { AppDB } from '../storage';
import { exportProjectsToExcel, exportClientsToExcel, exportDashboardToPDF } from '../utils/exportUtils';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  setCurrentPage: (page: any) => void;
  user: InternalUser;
  onLogout: () => void;
  onSwitchUser: () => void;
  companyName: string;
  logoUrl?: string;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  db: AppDB;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  currentPage,
  setCurrentPage,
  user,
  onLogout,
  onSwitchUser,
  companyName,
  logoUrl,
  theme,
  setTheme,
  db
}) => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [legalView, setLegalView] = useState<'about' | 'terms' | 'privacy'>('about');

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Erro ao entrar em tela cheia: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const navItems = [
    {
      id: 'dashboard', label: 'Dashboard', icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
      )
    },
    {
      id: 'clients', label: 'Clientes', icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
      )
    },
    {
      id: 'projects', label: 'Projetos', icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
      )
    },
    {
      id: 'timeline', label: 'Cronograma', icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
      )
    },
  ];

  if (user.role === UserRole.ADMIN) {
    navItems.push(
      {
        id: 'settings', label: 'Configurações', icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        )
      }
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 transition-colors duration-500">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-[#1e293b] border-r border-slate-200 dark:border-slate-800 flex flex-col hidden md:flex shrink-0 transition-colors duration-500">
        <div className="p-6 flex items-center space-x-3">
          <img src="/PATH_logo.png" className="w-8 h-8 object-contain" alt="Logo PERSPEC PATH" />
          <span className="text-xl font-black tracking-tighter">
            <span className="text-slate-300">PERSPEC</span> <span className="text-[#ccff00]">PATH</span>
          </span>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto mt-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${currentPage === item.id
                ? 'bg-indigo-600/10 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 dark:border-indigo-500/30 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
            >
              <div className={`${currentPage === item.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`}>
                {item.icon}
              </div>
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 transition-colors duration-500">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center font-bold text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-600 shadow-sm transition-colors">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-slate-900 dark:text-slate-100 transition-colors">{user.username}</p>
              <p className="text-[10px] text-slate-500 truncate uppercase tracking-widest font-bold">{user.role}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <button
              onClick={() => setShowAboutModal(true)}
              className="w-full text-left text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 py-1.5 px-2 rounded-md transition hover:bg-slate-200/50 dark:hover:bg-slate-700/50 flex items-center mb-1 group"
            >
              <svg className="w-3.5 h-3.5 mr-2 text-slate-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Sobre o Sistema
            </button>
            <button
              onClick={onSwitchUser}
              className="w-full text-left text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white py-1.5 px-2 rounded-md transition hover:bg-slate-200/50 dark:hover:bg-slate-700/50 flex items-center"
            >
              <svg className="w-3.5 h-3.5 mr-2 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              Trocar usuário
            </button>
            <button
              onClick={onLogout}
              className="w-full text-left text-xs text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 py-1.5 px-2 rounded-md transition hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center"
            >
              <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-[#0f172a] overflow-hidden transition-colors duration-500">
        <header className="h-16 bg-white dark:bg-[#1e293b] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 shrink-0 transition-colors duration-500">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight transition-colors">{companyName}</h2>
            <div className="flex items-center bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl border border-slate-200 dark:border-slate-700 space-x-1">
              <button
                onClick={() => setTheme('light')}
                className={`p-2 rounded-lg transition-all ${theme === 'light' ? 'bg-white text-amber-500 shadow-sm ring-1 ring-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                title="Modo Claro"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" /></svg>
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`p-2 rounded-lg transition-all ${theme === 'dark' ? 'bg-slate-800 text-indigo-400 shadow-lg ring-1 ring-slate-700' : 'text-slate-500 hover:text-slate-300'}`}
                title="Modo Escuro"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
              </button>
            </div>
            <button
              onClick={toggleFullScreen}
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center group"
              title={isFullScreen ? "Sair da Tela Cheia" : "Tela Cheia"}
            >
              <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isFullScreen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 9L4 4m0 0l5 0m-5 0l0 5m11 11l5 5m0 0l-5 0m5 0l0-5m0-11l-5 5m5-5l-5 0m5 0l0 5m-11 11l-5-5m5 5l-5 0m5 0l0-5" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                )}
              </svg>
            </button>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700"></div>
            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{currentPage}</span>
            <div className="flex items-center space-x-2 ml-4">
              {(currentPage === 'projects' || currentPage === 'clients') && (
                <button
                  onClick={() => currentPage === 'projects'
                    ? exportProjectsToExcel(db.projects, db.clients, db.users)
                    : exportClientsToExcel(db.clients)
                  }
                  className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition border border-slate-200 dark:border-slate-700 flex items-center space-x-2 group active:scale-95 shadow-sm"
                  title={`Exportar ${currentPage === 'projects' ? 'Projetos' : 'Clientes'} para Excel (XLSX)`}
                >
                  <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  <span className="text-[10px] font-black uppercase tracking-widest">Excel</span>
                </button>
              )}
              {currentPage === 'dashboard' && (
                <button
                  onClick={() => exportDashboardToPDF('dashboard-content')}
                  className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition border border-slate-200 dark:border-slate-700 flex items-center space-x-2 group active:scale-95 shadow-sm"
                  title="Exportar Dashboard para PDF"
                >
                  <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <line x1="10" y1="9" x2="8" y2="9"></line>
                  </svg>
                  <span className="text-[10px] font-black uppercase tracking-widest">PDF</span>
                </button>
              )}
            </div>
          </div>

          {/* Logo do Cliente / Workspace */}
          {logoUrl && (
            <div className="flex items-center">
              <img
                src={logoUrl}
                alt="Logo da Empresa"
                className="max-h-10 max-w-[150px] object-contain"
              />
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>

      {/* About Modal */}
      {showAboutModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-[#0f172a] rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700 relative max-h-[90vh] flex flex-col transition-colors">
            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-indigo-500/10 to-transparent pointer-events-none"></div>

            <div className="p-8 text-center relative z-10 flex-shrink-0">
              <div className="flex justify-between items-center mb-6">
                {legalView !== 'about' && (
                  <button onClick={() => setLegalView('about')} className="text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition flex items-center space-x-2 text-[10px] font-black uppercase tracking-widest">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                    <span>Voltar</span>
                  </button>
                )}
                <div className="flex-1"></div>
                <button onClick={() => { setShowAboutModal(false); setLegalView('about'); }} className="text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition">
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

                  <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-1 transition-colors">
                    PERSPEC <span className="text-indigo-600 dark:text-[#ccff00]">PATH</span>
                  </h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-8 transition-colors">Soluções em Engenharia & Gestão</p>

                  <div className="space-y-4 text-left bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800/50 mb-6 transition-colors">
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/50 transition-colors">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest transition-colors">Suporte WhatsApp</span>
                      <a href="https://wa.me/5514998892017" target="_blank" rel="noreferrer" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 transition-colors">(14) 9 9889-2017</a>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/50 transition-colors">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest transition-colors">E-mail</span>
                      <a href="mailto:perspec03d@gmail.com" className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 transition-colors">perspec03d@gmail.com</a>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/50 transition-colors">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest transition-colors">Website</span>
                      <a href="https://www.perspec3d.com" target="_blank" rel="noreferrer" className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 transition-colors">www.perspec3d.com</a>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/50 transition-colors">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest transition-colors">Versão</span>
                      <span className="text-xs font-bold text-slate-700 dark:text-white transition-colors">v2.1.0</span>
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
                <div className="text-left overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 max-h-[50vh] transition-colors">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight mb-4 transition-colors">Termos de Uso</h3>
                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-4 leading-relaxed font-medium transition-colors">
                    <p>Ao utilizar o <span className="text-indigo-600 dark:text-indigo-400 font-bold transition-colors">PERSPEC PATH</span>, você concorda com:</p>
                    <p><span className="text-white font-bold">1. Licenciamento:</span> O software é fornecido como serviço (SaaS). A licença é pessoal, intransferível e revogável em caso de violação técnica.</p>
                    <p><span className="text-white font-bold">2. Responsabilidade:</span> O Usuário Administrador é o único responsável pela precisão e legalidade dos dados inseridos. O sistema é uma ferramenta de apoio à gestão.</p>
                    <p><span className="text-white font-bold">3. Uso de Dados:</span> O PERSPEC PATH processa informações operacionais para gerar dashboards e cronogramas. Não garantimos resultados jurídicos baseados nessas automações.</p>
                    <p><span className="text-white font-bold">4. Propriedade:</span> Todos os direitos de design, algoritmos e interface pertencem à Perspec3D Engenharia Ltda.</p>
                  </div>
                </div>
              )}

              {legalView === 'privacy' && (
                <div className="text-left overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 max-h-[50vh] transition-colors">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight mb-4 transition-colors">Política de Privacidade</h3>
                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-4 leading-relaxed font-medium transition-colors">
                    <p>Em conformidade com a <span className="text-emerald-600 dark:text-emerald-400 font-bold transition-colors">LGPD (Lei 13.709/18)</span>:</p>
                    <p><span className="text-slate-900 dark:text-white font-bold transition-colors">1. Coleta:</span> Coletamos apenas dados essenciais para o funcionamento do workspace (E-mail, Nome da Empresa e Dados de Projetos).</p>
                    <p><span className="text-slate-900 dark:text-white font-bold transition-colors">2. Segurança:</span> Utilizamos infraestrutura de nuvem certificada com criptografia de ponta e isolamento de banco de dados (RLS).</p>
                    <p><span className="text-slate-900 dark:text-white font-bold underline transition-colors">3. Compartilhamento:</span> Seus dados <span className="text-slate-900 dark:text-white font-bold underline transition-colors">nunca</span> são vendidos. O compartilhamento ocorre apenas com processadores de pagamento (Mercado Pago) para fins de faturamento.</p>
                    <p><span className="text-slate-900 dark:text-white font-bold transition-colors">4. Direitos:</span> Você pode exportar ou solicitar a exclusão de todos os seus dados a qualquer momento através do suporte oficial.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};