import React, { useEffect, useMemo, useState } from 'react';
import { AppDB, fetchProjectActivities } from '../storage';
import { ProjectActivity, InternalUser } from '../types';
import {
  calculateProfessionalDeliveryMetrics,
  calculateUnifiedKPIs,
  calculateWipOverview,
  formatKpiLeadTimeDays,
  formatKpiRateWithFraction,
  getTodayDateString,
  ProfessionalDeliveryMetrics,
  UnifiedDeliveryKPIs,
  WipOverview
} from '../utils/activityOperationalModel';
import { isCurrentProjectRevision } from '../utils/projectRevision';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Ban,
  Activity,
  Calendar,
  Sliders,
  X,
  User,
  Info
} from 'lucide-react';

interface TeamProps {
  db: AppDB;
  theme: 'dark' | 'light';
  initialSelectedUserId?: string;
  onClearInitialSelectedUserId?: () => void;
}

const currentMonthValue = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
};

export const Team: React.FC<TeamProps> = ({
  db,
  theme,
  initialSelectedUserId,
  onClearInitialSelectedUserId
}) => {
  const [activities, setActivities] = useState<ProjectActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthValue);
  const [selectedUserId, setSelectedUserId] = useState<string>(() => initialSelectedUserId || '');

  useEffect(() => {
    if (initialSelectedUserId) {
      setSelectedUserId(initialSelectedUserId);
      if (onClearInitialSelectedUserId) {
        onClearInitialSelectedUserId();
      }
    }
  }, [initialSelectedUserId]);
  const [isWipLimitModalOpen, setIsWipLimitModalOpen] = useState(false);

  const workspaceId = db.company?.id;

  // Local storage for advisory WIP limits per workspace
  const wipStorageKey = workspaceId ? `perspecpath_wip_limits_${workspaceId}` : '';
  const [userWipLimits, setUserWipLimits] = useState<Record<string, number>>(() => {
    if (!wipStorageKey) return {};
    try {
      const saved = localStorage.getItem(wipStorageKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Save limits to localStorage
  const handleSaveWipLimits = (newLimits: Record<string, number>) => {
    setUserWipLimits(newLimits);
    if (wipStorageKey) {
      try {
        localStorage.setItem(wipStorageKey, JSON.stringify(newLimits));
      } catch (err) {
        console.error('Erro ao salvar limites de WIP:', err);
      }
    }
    setIsWipLimitModalOpen(false);
  };

  // Fetch activities on load / workspace change
  useEffect(() => {
    if (!workspaceId) {
      setActivities([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchProjectActivities(workspaceId)
      .then(result => {
        if (!cancelled) setActivities(result);
      })
      .catch(loadError => {
        console.error('Erro ao carregar atividades da equipe:', loadError);
        if (!cancelled) setError('Não foi possível carregar as atividades da equipe.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const todayStr = useMemo(() => getTodayDateString(), []);

  // Filter out activities from inactive revisions to prevent duplication
  const currentProjectIds = useMemo(() => {
    return new Set(db.projects.filter(isCurrentProjectRevision).map(p => p.id));
  }, [db.projects]);

  const projectMap = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    for (const proj of db.projects) {
      map.set(proj.id, { code: proj.code, name: proj.name });
    }
    return map;
  }, [db.projects]);

  const activeUsers = useMemo(() => {
    return db.users.filter(user => user.isActive);
  }, [db.users]);

  // Unified period filter
  const periodFilter = useMemo(() => {
    return selectedMonth ? { monthStr: selectedMonth } : undefined;
  }, [selectedMonth]);

  // Overall Team KPIs
  const teamKPIs: UnifiedDeliveryKPIs = useMemo(() => {
    return calculateUnifiedKPIs(
      activities,
      [],
      periodFilter,
      todayStr,
      currentProjectIds
    );
  }, [activities, periodFilter, todayStr, currentProjectIds]);

  // Global WIP overview & limits alert
  const wipOverview: WipOverview = useMemo(() => {
    return calculateWipOverview(
      activities,
      userWipLimits,
      todayStr,
      currentProjectIds
    );
  }, [activities, userWipLimits, todayStr, currentProjectIds]);

  // Professional delivery metrics
  const professionalMetrics: ProfessionalDeliveryMetrics[] = useMemo(() => {
    const targetUsers = activeUsers.filter(
      u => !selectedUserId || u.id === selectedUserId
    );
    return calculateProfessionalDeliveryMetrics(
      activities,
      targetUsers,
      periodFilter,
      todayStr,
      userWipLimits,
      currentProjectIds
    );
  }, [activities, activeUsers, selectedUserId, periodFilter, todayStr, userWipLimits, currentProjectIds]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full mb-10 pb-10 animate-in fade-in duration-300">
      {/* Cabeçalho */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Equipe</h1>
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest mt-1">
            Inteligência Gerencial, Desempenho de Entregas e WIP
          </p>
        </div>
        <button
          onClick={() => setIsWipLimitModalOpen(true)}
          className="self-start sm:self-auto px-4 py-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 text-xs font-black uppercase tracking-wider flex items-center space-x-2 transition-all active:scale-95 shadow-sm"
        >
          <Sliders className="w-4 h-4" />
          <span>Configurar Limites de WIP</span>
        </button>
      </header>

      {/* Alerta Orientativo de Limite de WIP Ultrapassado */}
      {wipOverview.exceededUsers.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 flex items-start sm:items-center gap-3 shadow-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5 sm:mt-0" />
          <div className="text-xs font-medium leading-relaxed">
            <span className="font-bold uppercase tracking-wider">Aviso Orientativo de WIP:</span>{' '}
            {wipOverview.exceededUsers.map(uid => {
              const u = db.users.find(usr => usr.id === uid);
              const count = wipOverview.wipByAssignee[uid] || 0;
              const limit = userWipLimits[uid];
              return `${u?.username || 'Profissional'} (${count} em andamento / limite ${limit})`;
            }).join(', ')}. O limite de WIP é orientativo e visa prevenir sobrecarga sem bloquear execuções.
          </div>
        </div>
      )}

      {/* Visão Geral da Equipe (Cards Consolidados) */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">WIP Geral</span>
            <Activity className="w-4 h-4 text-sky-500" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-sky-600 dark:text-sky-400">
              {teamKPIs.canonicalWipCount}
            </div>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Em andamento na equipe</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bloqueios</span>
            <Ban className="w-4 h-4 text-[#FBBF24]" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-amber-600 dark:text-[#FDE68A]">
              {teamKPIs.activeBlocksCount}
            </div>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
              {teamKPIs.totalBlockedDays > 0 ? `${teamKPIs.totalBlockedDays}d acumulados` : 'Impedimentos ativos'}
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Atrasadas</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
              {teamKPIs.openOverdueCount}
            </div>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Abertas fora do prazo</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Entregas no Prazo</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-3">
            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
              {formatKpiRateWithFraction(
                teamKPIs.updatedDeliveryRatePercent,
                teamKPIs.completedOnUpdatedDeadlineCount,
                teamKPIs.completedWithUpdatedDeadlineCount
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Concluídas no prazo</p>
          </div>
        </div>

        <div className="col-span-2 lg:col-span-1 p-4 rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Lead Time Médio</span>
            <Clock className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-3">
            <div className="text-xl font-black text-indigo-600 dark:text-indigo-400">
              {formatKpiLeadTimeDays(teamKPIs.averageLeadTimeDaysCompleted)}
            </div>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Início real até conclusão</p>
          </div>
        </div>
      </section>

      {/* Painel Principal de Desempenho de Entregas */}
      <section className="bg-white dark:bg-[#1e293b] rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Filtros da Seção */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">
              Desempenho de Entregas e Atribuições
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Acompanhamento de prazos, atividades em andamento (WIP) e entregas concluídas por profissional.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <label className="flex flex-col gap-1">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mês de Análise</span>
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500 shadow-sm"
                />
                {selectedMonth && (
                  <button
                    onClick={() => setSelectedMonth('')}
                    title="Ver todo o histórico"
                    className="h-10 px-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 transition-colors"
                  >
                    Todos
                  </button>
                )}
              </div>
            </label>

            <label className="flex flex-col gap-1 sm:min-w-[200px]">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Profissional</span>
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                className="h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500 shadow-sm"
              >
                <option value="">Toda a Equipe</option>
                {activeUsers.map(user => (
                  <option key={user.id} value={user.id}>{user.username}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Lista de Cartões por Profissional */}
        <div className="p-6">
          {isLoading ? (
            <div className="py-16 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
              Carregando indicadores da equipe...
            </div>
          ) : error ? (
            <div className="py-16 text-center text-xs font-bold text-rose-500">{error}</div>
          ) : professionalMetrics.length === 0 ? (
            <div className="py-16 text-center text-xs font-bold text-slate-400">
              Nenhum profissional ativo encontrado.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {professionalMetrics.map(metric => {
                const user = db.users.find(u => u.id === metric.userId);
                return (
                  <article
                    key={metric.userId}
                    className="p-5 rounded-2xl bg-slate-50 dark:bg-[#0f172a]/70 border border-slate-200 dark:border-slate-700/70 shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      {/* Cabeçalho do Card */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-200/80 dark:border-slate-800">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 shrink-0 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-sm uppercase">
                            {(user?.username || '?').charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-black text-sm text-slate-900 dark:text-white truncate">
                              {user?.username || 'Profissional'}
                            </h3>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              {user?.role === 'ADMIN' ? 'Administrador' : 'Colaborador'}
                            </p>
                          </div>
                        </div>

                        {/* Badges de Alerta / Limite de WIP */}
                        <div className="flex items-center gap-2">
                          {metric.isWipLimitExceeded ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              WIP: {metric.inProgressCount} / Limite {metric.wipLimit}
                            </span>
                          ) : metric.wipLimit ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold text-slate-400 border border-slate-200 dark:border-slate-800">
                              WIP: {metric.inProgressCount} / {metric.wipLimit}
                            </span>
                          ) : null}

                          {metric.blockedCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#78350F]/20 text-amber-700 dark:text-[#FDE68A] border border-[#FBBF24]/50">
                              {metric.blockedCount} bloqueio(s)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Métricas Principais (6 Indicadores) */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                        <div className="p-2.5 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-800/80">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Em Andamento (WIP)</p>
                          <p className="mt-1 text-base font-black text-sky-600 dark:text-sky-400">
                            {metric.inProgressCount}
                          </p>
                        </div>

                        <div className="p-2.5 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-800/80">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bloqueadas</p>
                          <p className={`mt-1 text-base font-black ${metric.blockedCount > 0 ? 'text-amber-600 dark:text-[#FDE68A]' : 'text-slate-400'}`}>
                            {metric.blockedCount}
                          </p>
                        </div>

                        <div className="p-2.5 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-800/80">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Atrasadas</p>
                          <p className={`mt-1 text-base font-black ${metric.overdueCount > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                            {metric.overdueCount}
                          </p>
                        </div>

                        <div className="p-2.5 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-800/80">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Concluídas no Período</p>
                          <p className="mt-1 text-base font-black text-slate-700 dark:text-slate-200">
                            {metric.completedInPeriodCount}
                          </p>
                        </div>

                        <div className="p-2.5 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-800/80">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Entregas no Prazo</p>
                          <p className={`mt-1 text-sm font-black ${metric.onTimeRatePercent !== null && metric.onTimeRatePercent >= 80 ? 'text-emerald-500' : 'text-slate-600 dark:text-slate-300'}`}>
                            {formatKpiRateWithFraction(
                              metric.onTimeRatePercent,
                              metric.completedOnTimeCount,
                              metric.completedWithDeadlineCount
                            )}
                          </p>
                        </div>

                        <div className="p-2.5 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-800/80">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Lead Time Médio</p>
                          <p className="mt-1 text-sm font-black text-indigo-500 dark:text-indigo-400">
                            {formatKpiLeadTimeDays(metric.averageLeadTimeDays)}
                          </p>
                        </div>
                      </div>

                      {/* Próximas Entregas do Profissional */}
                      <div>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center justify-between">
                          <span>Próximas Entregas</span>
                          <span className="text-[9px] font-semibold text-slate-400 lowercase">
                            {metric.upcomingDeliveries.length} atividade(s)
                          </span>
                        </h4>

                        {metric.upcomingDeliveries.length === 0 ? (
                          <p className="text-xs text-slate-400 italic py-2">
                            Nenhuma entrega pendente com prazo cadastrado.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {metric.upcomingDeliveries.map(item => {
                              const proj = projectMap.get(item.projectId);
                              return (
                                <div
                                  key={item.id}
                                  className="px-3 py-2 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 text-xs"
                                >
                                  <div className="min-w-0 flex-1">
                                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate block">
                                      {item.name}
                                    </span>
                                    {proj && (
                                      <span className="text-[10px] font-semibold text-slate-400 truncate block">
                                        {proj.code} · {proj.name}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                      {new Date(item.deliveryDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                                    </span>

                                    {item.isOverdue ? (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                        Atrasada
                                      </span>
                                    ) : item.isUpcoming ? (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                        Vence breve
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                                        No prazo
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Modal para Configuração dos Limites Orientativos de WIP */}
      {isWipLimitModalOpen && (
        <WipLimitModal
          users={activeUsers}
          currentLimits={userWipLimits}
          onSave={handleSaveWipLimits}
          onClose={() => setIsWipLimitModalOpen(false)}
        />
      )}
    </div>
  );
};

// Modal de Limites de WIP Orientativos
interface WipLimitModalProps {
  users: InternalUser[];
  currentLimits: Record<string, number>;
  onSave: (limits: Record<string, number>) => void;
  onClose: () => void;
}

const WipLimitModal: React.FC<WipLimitModalProps> = ({
  users,
  currentLimits,
  onSave,
  onClose
}) => {
  const [limits, setLimits] = useState<Record<string, number>>({ ...currentLimits });

  const handleChange = (userId: string, val: string) => {
    const num = parseInt(val, 10);
    setLimits(prev => {
      const next = { ...prev };
      if (isNaN(num) || num <= 0) {
        delete next[userId];
      } else {
        next[userId] = num;
      }
      return next;
    });
  };

  const handleClearAll = () => {
    setLimits({});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#1e293b] rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Limites Orientativos de WIP
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Defina o máximo sugerido de atividades simultâneas em andamento por profissional.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 rounded-2xl bg-indigo-50/50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs flex items-start gap-2.5">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Os limites de WIP são <strong>orientativos</strong>. Ultrapassar o limite exibe um aviso visual para a gestão, sem impedir a movimentação ou execução do trabalho.
          </span>
        </div>

        <div className="max-h-72 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
          {users.map(u => (
            <div
              key={u.id}
              className="p-3 rounded-2xl bg-slate-50 dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-600 dark:text-slate-300 uppercase">
                  {u.username.charAt(0)}
                </div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                  {u.username}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Limite:</span>
                <input
                  type="number"
                  min="1"
                  max="50"
                  placeholder="Sem limite"
                  value={limits[u.id] || ''}
                  onChange={e => handleChange(u.id, e.target.value)}
                  className="w-24 h-9 px-2 text-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-white outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={handleClearAll}
            className="text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors"
          >
            Limpar todos os limites
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onSave(limits)}
              className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
            >
              Salvar Limites
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
