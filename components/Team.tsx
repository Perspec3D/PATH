import React, { useEffect, useMemo, useState } from 'react';
import { AppDB, fetchOperationalMetricsDataset, OperationalMetricsDataset } from '../storage';
import { aggregateOperationalMetricsByProfessional, buildActivityOperationalMetrics } from '../utils/operationalMetrics';

interface TeamProps {
  db: AppDB;
  theme: 'dark' | 'light';
}

const formatDuration = (durationMs: number | null, signed = false): string => {
  if (durationMs === null || !Number.isFinite(durationMs)) return 'SEM ESTIMATIVA';
  const totalMinutes = Math.round(Math.abs(durationMs) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const sign = signed && durationMs !== 0 ? (durationMs > 0 ? '+' : '-') : '';
  return `${sign}${hours}h ${String(minutes).padStart(2, '0')}m`;
};

const formatPercent = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return 'SEM ESTIMATIVA';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
};

const currentMonthValue = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
};

export const Team: React.FC<TeamProps> = ({ db }) => {
  const [dataset, setDataset] = useState<OperationalMetricsDataset | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const workspaceId = db.company?.id;
    if (!workspaceId) {
      setDataset(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchOperationalMetricsDataset(workspaceId)
      .then(result => {
        if (!cancelled) setDataset(result);
      })
      .catch(loadError => {
        console.error('Erro ao carregar desempenho operacional:', loadError);
        if (!cancelled) setError('Não foi possível carregar as métricas operacionais.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [db.company?.id]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const period = useMemo(() => {
    if (!selectedMonth) return { internalUserId: selectedUserId || undefined };
    const [year, month] = selectedMonth.split('-').map(Number);
    return {
      startMs: new Date(year, month - 1, 1).getTime(),
      endMs: new Date(year, month, 1).getTime() - 1,
      internalUserId: selectedUserId || undefined
    };
  }, [selectedMonth, selectedUserId]);

  const metrics = useMemo(() => {
    if (!dataset || !db.company) return [];
    const activityMetrics = buildActivityOperationalMetrics({
      ...dataset,
      company: db.company,
      nowMs,
      period
    });
    const users = db.users.filter(user => user.isActive && (!selectedUserId || user.id === selectedUserId));
    return aggregateOperationalMetricsByProfessional(activityMetrics, users);
  }, [dataset, db.company, db.users, nowMs, period, selectedUserId]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full mb-10 pb-10">
      <header>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Equipe</h1>
        <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest mt-1">Desempenho operacional por atividades</p>
      </header>

      <section className="bg-white dark:bg-[#1e293b] rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Desempenho operacional</h2>
            <p className="text-xs text-slate-500 mt-2 max-w-2xl">
              Atividades concluídas no período, com estimativa, tempo regular contabilizado e horas extras administrativas.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <label className="flex flex-col gap-1">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mês de conclusão</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={event => setSelectedMonth(event.target.value)}
                className="h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500"
              />
            </label>
            <label className="flex flex-col gap-1 sm:min-w-[190px]">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Profissional</span>
              <select
                value={selectedUserId}
                onChange={event => setSelectedUserId(event.target.value)}
                className="h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500"
              >
                <option value="">Todos</option>
                {db.users.filter(user => user.isActive).map(user => (
                  <option key={user.id} value={user.id}>{user.username}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="py-12 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">Carregando métricas...</div>
          ) : error ? (
            <div className="py-12 text-center text-xs font-bold text-rose-500">{error}</div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {metrics.map(metric => {
                const user = db.users.find(item => item.id === metric.internalUserId);
                return (
                  <article key={metric.internalUserId} className="p-5 rounded-2xl bg-slate-50 dark:bg-[#0f172a]/70 border border-slate-200 dark:border-slate-700/70">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 shrink-0 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black">
                          {(user?.username || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-black text-sm text-slate-900 dark:text-white truncate">{user?.username || 'Profissional não encontrado'}</h3>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            {metric.completedActivities} concluída(s) · {metric.inProgressActivities} em andamento
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {metric.completedWithinEstimatePercent === null
                          ? 'Sem estimativa comparável'
                          : `${metric.completedWithinEstimate}/${metric.completedWithEstimate} dentro da estimativa`}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <Metric label="Estimado" value={metric.completedWithEstimate > 0 ? formatDuration(metric.completedEstimatedMs) : 'SEM ESTIMATIVA'} />
                      <Metric label="Regular" value={formatDuration(metric.completedRegularMs)} color="text-sky-600 dark:text-sky-400" />
                      <Metric label="Horas extras" value={formatDuration(metric.completedOvertimeMs)} color="text-amber-600 dark:text-amber-400" />
                      <Metric label="Contabilizado" value={formatDuration(metric.completedAccountedMs)} color="text-emerald-600 dark:text-emerald-400" />
                      <Metric
                        label="Desvio da estimativa"
                        value={metric.aggregateDeviationMs === null
                          ? 'SEM ESTIMATIVA'
                          : `${formatDuration(metric.aggregateDeviationMs, true)} / ${formatPercent(metric.aggregateDeviationPercent)}`}
                        color={metric.aggregateDeviationMs !== null && metric.aggregateDeviationMs > 0 ? 'text-rose-500' : 'text-indigo-500'}
                        wide
                      />
                    </div>
                  </article>
                );
              })}
              {!isLoading && !error && metrics.length === 0 && (
                <div className="xl:col-span-2 py-12 text-center text-xs font-bold text-slate-500">Nenhum profissional ativo encontrado.</div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

const Metric = ({ label, value, color = 'text-slate-700 dark:text-slate-200', wide = false }: {
  label: string;
  value: string;
  color?: string;
  wide?: boolean;
}) => (
  <div className={wide ? 'col-span-2' : undefined}>
    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
    <p className={`mt-1 text-base font-black ${color}`}>{value}</p>
  </div>
);
