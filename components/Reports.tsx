import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Calendar, CheckCircle2, Clock, Download, ShieldCheck } from 'lucide-react';
import { AppDB, fetchOperationalMetricsDataset, OperationalMetricsDataset } from '../storage';
import { aggregateOperationalMetricsByProfessional, buildActivityOperationalMetrics } from '../utils/operationalMetrics';
import { exportReportToPDF } from '../utils/exportUtils';

interface ReportsProps {
  db: AppDB;
  theme?: 'dark' | 'light';
}

const localDateValue = (date: Date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

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
  return `${value > 0 ? '+' : ''}${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
};

export const Reports: React.FC<ReportsProps> = ({ db }) => {
  const today = new Date();
  const [startDate, setStartDate] = useState(() => localDateValue(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [endDate, setEndDate] = useState(() => localDateValue(today));
  const [dataset, setDataset] = useState<OperationalMetricsDataset | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const workspaceId = db.company?.id;
    if (!workspaceId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchOperationalMetricsDataset(workspaceId)
      .then(result => {
        if (!cancelled) setDataset(result);
      })
      .catch(loadError => {
        console.error('Erro ao carregar relatório operacional:', loadError);
        if (!cancelled) setError('Não foi possível carregar os dados operacionais.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [db.company?.id]);

  const report = useMemo(() => {
    if (!dataset || !db.company) return null;
    const startMs = new Date(`${startDate}T00:00:00`).getTime();
    const endMs = new Date(`${endDate}T23:59:59.999`).getTime();
    const activityMetrics = buildActivityOperationalMetrics({
      ...dataset,
      company: db.company,
      nowMs: Date.now(),
      period: { startMs, endMs }
    });
    const professionals = aggregateOperationalMetricsByProfessional(
      activityMetrics,
      db.users.filter(user => user.isActive)
    );
    const completed = activityMetrics.filter(metric => metric.isCompleted);
    const comparable = completed.filter(metric => metric.estimatedMs !== null && metric.totalAccountedMs !== null);
    const comparableEstimatedMs = comparable.reduce((total, metric) => total + (metric.estimatedMs ?? 0), 0);
    const comparableAccountedMs = comparable.reduce((total, metric) => total + (metric.totalAccountedMs ?? 0), 0);
    const deviationMs = comparableEstimatedMs > 0 ? comparableAccountedMs - comparableEstimatedMs : null;

    return {
      professionals,
      completedActivities: completed.length,
      estimatedMs: completed.reduce((total, metric) => total + (metric.estimatedMs ?? 0), 0),
      regularMs: completed.reduce((total, metric) => total + (metric.regularMs ?? 0), 0),
      overtimeMs: completed.reduce((total, metric) => total + (metric.overtimeMs ?? 0), 0),
      accountedMs: completed.reduce((total, metric) => total + (metric.totalAccountedMs ?? 0), 0),
      deviationMs,
      deviationPercent: deviationMs !== null ? (deviationMs / comparableEstimatedMs) * 100 : null
    };
  }, [dataset, db.company, db.users, startDate, endDate]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white dark:bg-[#1e293b] p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-2">
            <BarChart3 className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Relatórios administrativos</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Execução operacional</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">Indicadores objetivos das atividades concluídas no período.</p>
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

      <div id="report-print-area" className="space-y-8 p-4 bg-slate-50 dark:bg-[#0f172a] rounded-[48px]">
        <div className="bg-white dark:bg-[#1e293b] p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center p-3">
              <img src="/PATH_logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Relatório operacional auditável</h2>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <span className="flex items-center gap-1.5"><Calendar className="w-3 h-3" />{new Date(`${startDate}T12:00:00`).toLocaleDateString('pt-BR')} — {new Date(`${endDate}T12:00:00`).toLocaleDateString('pt-BR')}</span>
                <span className="flex items-center gap-1.5 text-indigo-500"><ShieldCheck className="w-3 h-3" />{db.company?.name || 'PATH System'}</span>
              </div>
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500">Gerado em {new Date().toLocaleString('pt-BR')}</p>
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-xs font-black text-slate-500 uppercase tracking-widest">Carregando relatório...</div>
        ) : error ? (
          <div className="py-20 text-center text-xs font-black text-rose-500">{error}</div>
        ) : report && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard label="Atividades concluídas" value={String(report.completedActivities)} icon={<CheckCircle2 className="w-5 h-5" />} />
              <SummaryCard label="Estimado" value={formatDuration(report.estimatedMs)} />
              <SummaryCard label="Regular" value={formatDuration(report.regularMs)} />
              <SummaryCard label="Horas extras" value={formatDuration(report.overtimeMs)} />
              <SummaryCard label="Contabilizado" value={formatDuration(report.accountedMs)} icon={<Clock className="w-5 h-5" />} />
              <SummaryCard
                label="Desvio da estimativa"
                value={report.deviationMs === null ? 'SEM ESTIMATIVA' : `${formatDuration(report.deviationMs, true)} / ${formatPercent(report.deviationPercent)}`}
                wide
              />
            </div>

            <div className="bg-white dark:bg-[#1e293b] rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Detalhamento por profissional</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-900/30">
                    <tr>
                      {['Profissional', 'Concluídas', 'Estimado', 'Regular', 'Extra', 'Contabilizado', 'Desvio'].map(label => (
                        <th key={label} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {report.professionals.map(metric => {
                      const user = db.users.find(item => item.id === metric.internalUserId);
                      return (
                        <tr key={metric.internalUserId}>
                          <td className="px-6 py-5 text-sm font-bold text-slate-700 dark:text-white">{user?.username || 'Profissional não encontrado'}</td>
                          <td className="px-6 py-5 text-sm font-black text-slate-700 dark:text-slate-200">{metric.completedActivities}</td>
                          <td className="px-6 py-5 text-sm font-black text-slate-700 dark:text-slate-200">{metric.completedWithEstimate > 0 ? formatDuration(metric.completedEstimatedMs) : 'SEM ESTIMATIVA'}</td>
                          <td className="px-6 py-5 text-sm font-black text-sky-500">{formatDuration(metric.completedRegularMs)}</td>
                          <td className="px-6 py-5 text-sm font-black text-amber-500">{formatDuration(metric.completedOvertimeMs)}</td>
                          <td className="px-6 py-5 text-sm font-black text-emerald-500">{formatDuration(metric.completedAccountedMs)}</td>
                          <td className="px-6 py-5 text-sm font-black text-indigo-500">{metric.aggregateDeviationMs === null ? 'SEM ESTIMATIVA' : `${formatDuration(metric.aggregateDeviationMs, true)} / ${formatPercent(metric.aggregateDeviationPercent)}`}</td>
                        </tr>
                      );
                    })}
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
    <input type="date" value={value} onChange={event => onChange(event.target.value)} className="bg-transparent text-sm font-bold text-slate-700 dark:text-white outline-none border-none p-0" />
  </label>
);

const SummaryCard = ({ label, value, icon, wide = false }: { label: string; value: string; icon?: React.ReactNode; wide?: boolean }) => (
  <div className={`${wide ? 'col-span-2' : ''} bg-white dark:bg-[#1e293b] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm`}>
    <div className="flex items-center justify-between gap-3">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
      <span className="text-indigo-500">{icon}</span>
    </div>
    <p className="text-2xl font-black text-slate-900 dark:text-white mt-3">{value}</p>
  </div>
);
