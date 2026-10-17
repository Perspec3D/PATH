import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ShieldCheck,
  AlertTriangle,
  Ban,
  Activity,
  CalendarDays,
  RotateCcw
} from 'lucide-react';
import { AppDB, fetchProjectActivities } from '../storage';
import { ProjectActivity } from '../types';
import {
  calculateProfessionalDeliveryMetrics,
  calculateUnifiedKPIs,
  formatKpiLeadTimeDays,
  formatKpiRateWithFraction,
  getTodayDateString,
  ProfessionalDeliveryMetrics,
  UnifiedDeliveryKPIs
} from '../utils/activityOperationalModel';
import { isCurrentProjectRevision } from '../utils/projectRevision';
import { exportReportToPDF } from '../utils/exportUtils';

interface ReportsProps {
  db: AppDB;
  theme?: 'dark' | 'light';
}

const localDateValue = (date: Date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

export const Reports: React.FC<ReportsProps> = ({ db }) => {
  const today = new Date();
  const [startDate, setStartDate] = useState(() => localDateValue(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [endDate, setEndDate] = useState(() => localDateValue(today));
  const [activities, setActivities] = useState<ProjectActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const workspaceId = db.company?.id;
    if (!workspaceId) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchProjectActivities(workspaceId)
      .then(result => {
        if (!cancelled) setActivities(result);
      })
      .catch(loadError => {
        console.error('Erro ao carregar dados do relatório:', loadError);
        if (!cancelled) setError('Não foi possível carregar os dados das atividades.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [db.company?.id]);

  const todayStr = useMemo(() => getTodayDateString(), []);

  // Filter current active project revisions
  const currentProjectIds = useMemo(() => {
    return new Set(db.projects.filter(isCurrentProjectRevision).map(p => p.id));
  }, [db.projects]);

  const activeUsers = useMemo(() => {
    return db.users.filter(u => u.isActive);
  }, [db.users]);

  // Unified delivery KPIs for the selected period
  const unifiedKPIs: UnifiedDeliveryKPIs = useMemo(() => {
    return calculateUnifiedKPIs(
      activities,
      [],
      { startDate, endDate },
      todayStr,
      currentProjectIds
    );
  }, [activities, startDate, endDate, todayStr, currentProjectIds]);

  // Breakdown by professional for the selected period
  const professionalMetrics: ProfessionalDeliveryMetrics[] = useMemo(() => {
    return calculateProfessionalDeliveryMetrics(
      activities,
      activeUsers,
      { startDate, endDate },
      todayStr,
      {},
      currentProjectIds
    );
  }, [activities, activeUsers, startDate, endDate, todayStr, currentProjectIds]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      {/* Top Header & Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white dark:bg-[#1e293b] p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-2">
            <BarChart3 className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Inteligência Gerencial</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Relatório de Entregas e Prazos</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">
            Métricas de fluxo, cumprimento de datas originais/atualizadas, lead time e impedimentos no período.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-3xl border border-slate-100 dark:border-slate-800">
            <DateField label="Início" value={startDate} onChange={setStartDate} />
            <div className="w-px h-10 bg-slate-200 dark:bg-slate-800" />
            <DateField label="Fim" value={endDate} onChange={setEndDate} />
          </div>
          <button
            onClick={() => exportReportToPDF('report-print-area', db.company?.name || 'PATH')}
            className="bg-emerald-600 hover:bg-emerald-500 px-6 py-4 rounded-3xl text-white shadow-xl shadow-emerald-500/20 active:scale-95 transition-all flex items-center gap-3"
          >
            <Download className="w-5 h-5" />
            <span className="text-xs font-black uppercase tracking-widest">Exportar PDF</span>
          </button>
        </div>
      </div>

      {/* Área Exportável para PDF */}
      <div id="report-print-area" className="space-y-8 p-6 bg-slate-50 dark:bg-[#0f172a] rounded-[48px]">
        {/* Cabeçalho do Relatório */}
        <div className="bg-white dark:bg-[#1e293b] p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center p-3">
              <img src="/PATH_logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
                Relatório de Desempenho de Entregas
              </h2>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(`${startDate}T12:00:00`).toLocaleDateString('pt-BR')} — {new Date(`${endDate}T12:00:00`).toLocaleDateString('pt-BR')}
                </span>
                <span className="flex items-center gap-1.5 text-indigo-500">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {db.company?.name || 'PATH System'}
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500">Gerado em {new Date().toLocaleString('pt-BR')}</p>
        </div>

        {isLoading ? (
          <div className="py-24 text-center text-xs font-black text-slate-500 uppercase tracking-widest">
            Carregando indicadores do relatório...
          </div>
        ) : error ? (
          <div className="py-24 text-center text-xs font-black text-rose-500">{error}</div>
        ) : (
          <>
            {/* Grid de Métricas Principais (6 Indicadores Derivados do Motor Unificado) */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
              <SummaryCard
                label="Entregas Concluídas"
                value={String(unifiedKPIs.completedCount)}
                subtitle="no período selecionado"
                icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />}
              />
              <SummaryCard
                label="Prazo Original"
                value={formatKpiRateWithFraction(
                  unifiedKPIs.originalDeliveryRatePercent,
                  unifiedKPIs.completedOnOriginalDeadlineCount,
                  unifiedKPIs.completedWithOriginalDeadlineCount
                )}
                subtitle="entregas até prazo inicial"
                icon={<CalendarDays className="w-5 h-5 text-indigo-500" />}
              />
              <SummaryCard
                label="Prazo Atualizado"
                value={formatKpiRateWithFraction(
                  unifiedKPIs.updatedDeliveryRatePercent,
                  unifiedKPIs.completedOnUpdatedDeadlineCount,
                  unifiedKPIs.completedWithUpdatedDeadlineCount
                )}
                subtitle="entregas no prazo acordado"
                icon={<CheckCircle2 className="w-5 h-5 text-sky-500" />}
              />
              <SummaryCard
                label="Lead Time Médio"
                value={formatKpiLeadTimeDays(unifiedKPIs.averageLeadTimeDaysCompleted)}
                subtitle="início real à conclusão"
                icon={<Clock className="w-5 h-5 text-purple-500" />}
              />
              <SummaryCard
                label="Atraso Médio"
                value={formatKpiLeadTimeDays(unifiedKPIs.averageDelayDaysCompletedLate)}
                subtitle={`${unifiedKPIs.delayedCompletedCount} entrega(s) com atraso`}
                icon={<AlertTriangle className="w-5 h-5 text-rose-500" />}
              />
              <SummaryCard
                label="Reprogramações"
                value={`${unifiedKPIs.rescheduledActivitiesCount} ativ.`}
                subtitle={unifiedKPIs.averageOriginalDeviationDays ? `Desvio médio: ${unifiedKPIs.averageOriginalDeviationDays}d` : 'Planejamento aderente'}
                icon={<RotateCcw className="w-5 h-5 text-amber-500" />}
              />
            </div>

            {/* Tabela de Detalhamento por Profissional */}
            <div className="bg-white dark:bg-[#1e293b] rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">
                    Detalhamento de Entregas por Profissional
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Acompanhamento individual de conformidade com prazos e carga de trabalho em andamento.
                  </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  {professionalMetrics.length} colaborador(es)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-900/40">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Profissional</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Entregas no Período</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">No Prazo (%)</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Lead Time Médio</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">WIP (Em Andamento)</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Bloqueadas</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Atrasadas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {professionalMetrics.map(metric => {
                      const user = db.users.find(item => item.id === metric.userId);
                      return (
                        <tr key={metric.userId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-xs uppercase shrink-0">
                                {(user?.username || '?').charAt(0)}
                              </div>
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                {user?.username || 'Profissional não encontrado'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs font-black text-center text-slate-800 dark:text-slate-200">
                            {metric.completedInPeriodCount}
                          </td>
                          <td className="px-6 py-4 text-xs font-black text-center">
                            <span className={metric.onTimeRatePercent !== null && metric.onTimeRatePercent >= 80 ? 'text-emerald-500' : 'text-slate-700 dark:text-slate-300'}>
                              {formatKpiRateWithFraction(metric.onTimeRatePercent, metric.completedOnTimeCount, metric.completedWithDeadlineCount)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs font-bold text-center text-indigo-500 dark:text-indigo-400">
                            {formatKpiLeadTimeDays(metric.averageLeadTimeDays)}
                          </td>
                          <td className="px-6 py-4 text-xs font-black text-center text-sky-600 dark:text-sky-400">
                            {metric.inProgressCount}
                          </td>
                          <td className="px-6 py-4 text-xs font-black text-center">
                            <span className={metric.blockedCount > 0 ? 'text-amber-600 dark:text-[#FDE68A]' : 'text-slate-400'}>
                              {metric.blockedCount}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs font-black text-center">
                            <span className={metric.overdueCount > 0 ? 'text-rose-500' : 'text-slate-400'}>
                              {metric.overdueCount}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {professionalMetrics.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-xs font-bold text-slate-400">
                          Nenhum profissional com atividades registrado no período.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const DateField = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
  <label className="px-4 py-2 space-y-1">
    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">{label}</span>
    <input
      type="date"
      value={value}
      onChange={event => onChange(event.target.value)}
      className="bg-transparent text-sm font-bold text-slate-700 dark:text-white outline-none border-none p-0 cursor-pointer"
    />
  </label>
);

const SummaryCard = ({
  label,
  value,
  subtitle,
  icon
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon?: React.ReactNode;
}) => (
  <div className="bg-white dark:bg-[#1e293b] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
    <div className="flex items-center justify-between gap-2">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate">{label}</p>
      <span className="shrink-0">{icon}</span>
    </div>
    <div className="mt-3">
      <p className="text-xl font-black text-slate-900 dark:text-white leading-tight truncate">{value}</p>
      {subtitle && (
        <p className="text-[9px] text-slate-400 font-semibold mt-1 truncate">{subtitle}</p>
      )}
    </div>
  </div>
);
