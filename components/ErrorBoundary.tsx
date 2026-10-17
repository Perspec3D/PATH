import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  moduleName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary capturou uma falha de renderização:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetState = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleClearSessionAndRestart = () => {
    try {
      localStorage.removeItem('PATH_USER_SESSION');
    } catch {
      // Ignora falhas de localStorage
    }
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      const { fallbackTitle, moduleName } = this.props;
      const errorMessage = this.state.error?.message || 'Erro de execução inesperado';
      // Sanitizar mensagem para evitar expor tokens ou dados sensíveis
      const sanitizedMessage = errorMessage.replace(/(bearer\s+[a-zA-Z0-9_\-\.]+)/gi, '[REDACTED_TOKEN]');

      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#0f172a] text-slate-100 p-6">
          <div className="relative w-full max-w-xl">
            {/* Glow decorativo de fundo */}
            <div className="absolute -top-20 -left-20 w-60 h-60 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -right-20 w-60 h-60 bg-rose-600/15 rounded-full blur-3xl pointer-events-none" />

            <div className="bg-[#1e293b] rounded-[36px] shadow-2xl border border-slate-700/80 p-8 sm:p-10 relative z-10 backdrop-blur-xl">
              {/* Ícone de alerta */}
              <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-rose-500/20 text-rose-500 shadow-lg shadow-rose-500/10">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              <div className="text-center mb-6">
                <span className="px-3 py-1 bg-rose-500/15 border border-rose-500/30 rounded-full text-[9px] font-black uppercase text-rose-400 tracking-widest inline-block">
                  {moduleName ? `Falha em ${moduleName}` : 'Recuperação do Sistema'}
                </span>
                <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white mt-3">
                  {fallbackTitle || 'Ocorreu uma falha na renderização'}
                </h1>
                <p className="text-slate-400 text-xs sm:text-sm mt-2 leading-relaxed font-medium">
                  Identificamos uma inconsistência temporária durante o carregamento dos componentes. Seus dados cadastrados estão preservados e seguros.
                </p>
              </div>

              {/* Botões de Ação */}
              <div className="space-y-3 mb-6">
                <button
                  onClick={this.handleReload}
                  className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] rounded-2xl font-black text-xs uppercase tracking-widest text-white shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Recarregar Aplicação</span>
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={this.handleResetState}
                    className="py-3 px-4 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] rounded-xl font-bold text-[10px] uppercase tracking-wider text-slate-300 hover:text-white border border-slate-700/60 transition-all"
                  >
                    Tentar Novamente
                  </button>

                  <button
                    onClick={this.handleClearSessionAndRestart}
                    className="py-3 px-4 bg-slate-800/60 hover:bg-slate-700/60 active:scale-[0.98] rounded-xl font-bold text-[10px] uppercase tracking-wider text-slate-400 hover:text-slate-200 border border-slate-700/40 transition-all"
                  >
                    Trocar Usuário
                  </button>
                </div>
              </div>

              {/* Detalhes Técnicos Colapsáveis */}
              <div className="pt-4 border-t border-slate-700/60">
                <button
                  type="button"
                  onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
                  className="w-full flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <span>Detalhes Técnicos</span>
                  <span className={`transform transition-transform ${this.state.showDetails ? 'rotate-180' : ''}`}>▾</span>
                </button>

                {this.state.showDetails && (
                  <div className="mt-3 p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-[10px] font-mono text-slate-400 overflow-x-auto space-y-2">
                    <p className="text-rose-400 font-bold break-all">{sanitizedMessage}</p>
                    {this.state.errorInfo?.componentStack && (
                      <pre className="text-[9px] text-slate-500 max-h-32 overflow-y-auto whitespace-pre-wrap">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
