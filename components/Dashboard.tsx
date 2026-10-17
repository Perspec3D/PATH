import React, { useMemo, useState, useEffect } from 'react';
import { ProjectStatus, Project, InternalUser, Client, ProjectActivity } from '../types';
import { isProjectActivityClosed } from '../utils/projectActivityStatus';
import {
  normalizeActivityStatus,
  calculateUnifiedKPIs,
  calculateWipOverview,
  calculateProfessionalDeliveryMetrics,
  getTodayDateString,
  formatDisplayDate,
  formatKpiRateWithFraction,
  formatKpiLeadTimeDays,
  addCalendarDays,
  ActivityCanonicalStatus,
  ActivityDeadlineStatus,
  evaluateDeadlineStatus
} from '../utils/activityOperationalModel';
import { AppDB, fetchOperationalMetricsDataset, OperationalMetricsDataset } from '../storage';
import {
  calculateProjectDeliveryPredictability,
  ProjectDeliveryPredictability,
  ProjectDeliveryPredictabilityStatus,
  getDeliveryPredictabilityBadge
} from '../utils/deliveryForecast';
import { InfoTooltip } from './InfoTooltip';
import { isCurrentProjectRevision } from '../utils/projectRevision';
import {
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  CheckCircle2, TrendingUp, Users, Clock, AlertTriangle, Calendar,
  Trophy, Medal, Eye, ArrowRight, Search, Ban, Activity, PieChart as PieChartIcon,
  Sliders, Target, Sparkles, Layers, LayoutDashboard, ShieldCheck, AlertCircle
} from 'lucide-react';
import {
  calculateTeamOperationalCapacity,
  HistoricalWindowWeeks,
  SampleConfidence
} from '../utils/teamOperationalCapacity';
import { ManagementAttentionCenter } from './ManagementAttentionCenter';
import { IntelligentPlanning } from './IntelligentPlanning';
import { fetchProjectActivitiesEventsBatch } from '../storage';

interface DashboardProps {
  db: AppDB;
  theme?: 'dark' | 'light';
  onOpenProject?: (project: Project) => void;
  onOpenActivity?: (project: Project, activity: ProjectActivity) => void;
  onNavigateToTeam?: (userId?: string) => void;
}

interface HealthGaugeProps {
  value: number | null;
  label?: string;
  subtitle?: string;
  theme?: 'dark' | 'light';
}

const HealthGauge: React.FC<HealthGaugeProps> = ({ value, label = 'CONFIABILIDADE DE ENTREGAS', subtitle, theme = 'dark' }) => {
  const [displayValue, setDisplayValue] = React.useState(0);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayValue(value ?? 0);
    }, 100);
    return () => clearTimeout(timer);
  }, [value]);

  const normalizedValue = Math.max(0, Math.min(100, displayValue));
  const angle = (normalizedValue / 100) * 180 - 180;

  // Motor de Interpolação de Cores 5.1 (Smooth Transition & Balanced Palette)
  const getInterpolatedColor = (pct: number) => {
    // Escala Original: Rose -> Orange -> Yellow -> Emerald
    const colors = [
      { p: 0, r: 244, g: 63, b: 94 },    // Tailind Rose-500
      { p: 40, r: 249, g: 115, b: 22 },  // Tailind Orange-500
      { p: 65, r: 234, g: 179, b: 8 },   // Tailind Yellow-500
      { p: 100, r: 16, g: 185, b: 129 }  // Tailind Emerald-500
    ];

    let lower = colors[0];
    let upper = colors[colors.length - 1];

    for (let i = 0; i < colors.length - 1; i++) {
      if (pct >= colors[i].p && pct <= colors[i + 1].p) {
        lower = colors[i];
        upper = colors[i + 1];
        break;
      }
    }

    const range = upper.p - lower.p;
    const rangePct = range === 0 ? 0 : (pct - lower.p) / range;

    const r = Math.round(lower.r + (upper.r - lower.r) * rangePct);
    const g = Math.round(lower.g + (upper.g - lower.g) * rangePct);
    const b = Math.round(lower.b + (upper.b - lower.b) * rangePct);

    return `rgb(${r}, ${g}, ${b})`;
  };

  // Gerador de segmentos do arco (blocos estilo Imagem 02)
  const segments = [];
  const numSegments = 40;
  for (let i = 0; i < numSegments; i++) {
    const startAngle = (i / numSegments) * 180 - 180;
    const endAngle = ((i + 0.7) / numSegments) * 180 - 180;
    const radStart = (startAngle * Math.PI) / 180;
    const radEnd = (endAngle * Math.PI) / 180;

    const x1 = 100 + 85 * Math.cos(radStart);
    const y1 = 100 + 85 * Math.sin(radStart);
    const x2 = 100 + 85 * Math.cos(radEnd);
    const y2 = 100 + 85 * Math.sin(radEnd);

    // Cor interpolada baseada na posição do segmento
    const segmentValue = (i / numSegments) * 100;
    const color = getInterpolatedColor(segmentValue);

    segments.push(
      <path
        key={i}
        d={`M ${x1} ${y1} A 85 85 0 0 1 ${x2} ${y2}`}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="butt"
        className={segmentValue > normalizedValue ? 'opacity-10 grayscale-[1]' : 'opacity-100'}
        style={{
          filter: segmentValue <= normalizedValue
            ? `drop-shadow(0 0 3px ${color})`
            : 'none',
          transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}
      />
    );
  }

  // Gerador de Ticks e Números
  const scaleItems = [];
  for (let i = 0; i <= 10; i++) {
    const tickAngle = (i * i * 10 / 100) * 180 / 10 - 180; // Isso estava errado, vamos simplificar:
    const simpleAngle = (i * 10 / 100) * 180 - 180;
    const rad = (simpleAngle * Math.PI) / 180;

    // Ticks maiores para dezenas (0, 10, 20...)
    const x1 = 100 + 72 * Math.cos(rad);
    const y1 = 100 + 72 * Math.sin(rad);
    const x2 = 100 + 78 * Math.cos(rad);
    const y2 = 100 + 78 * Math.sin(rad);

    scaleItems.push(
      <line key={`tick-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.5" className="text-slate-400 opacity-30" />
    );

    // Números (0, 20, 40, 60, 80, 100)
    if (i % 2 === 0) {
      const tx = 100 + 60 * Math.cos(rad);
      const ty = 100 + 60 * Math.sin(rad);
      scaleItems.push(
        <text
          key={`text-${i}`}
          x={tx}
          y={ty}
          fontSize="7"
          fontWeight="900"
          textAnchor="middle"
          alignmentBaseline="middle"
          fill="currentColor"
          className="text-slate-500 opacity-60 font-black tracking-tighter"
        >
          {i * 10}
        </text>
      );
    }
  }

  return (
    <div className="relative flex flex-col items-center justify-center group/gauge w-full max-w-[420px]">
      <svg viewBox="0 0 200 130" className="w-full drop-shadow-[0_20px_40px_rgba(0,0,0,0.3)]">
        <defs>
          <filter id="needleGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Arco de Fundo Discreto */}
        <path
          d="M 15 100 A 85 85 0 0 1 185 100"
          fill="none"
          stroke={theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}
          strokeWidth="12"
          strokeLinecap="round"
        />

        {segments}
        {scaleItems}

        {/* Ponteiro Sólido de Alta Performance */}
        <g
          transform={`rotate(${angle}, 100, 100)`}
          className="transition-transform duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
        >
          {/* Base do ponteiro */}
          <circle cx="100" cy="100" r="10" fill={theme === 'dark' ? '#0f172a' : '#ffffff'} stroke="#3b82f6" strokeWidth="1" />

          {/* Agulha Triangular Sólida */}
          <path
            d="M 100 96 L 195 100 L 100 104 Z"
            fill="#f43f5e"
            className="drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]"
            filter="url(#needleGlow)"
          />

          <circle cx="100" cy="100" r="3" fill="#3b82f6" />
        </g>
      </svg>

      <div className="mt-2 flex flex-col items-center">
        {value === null ? (
          <span className="text-2xl font-black text-slate-400 dark:text-slate-500 tracking-tight leading-none">
            Dados insuficientes
          </span>
        ) : (
          <span
            className="text-4xl font-black tracking-tighter leading-none transition-colors duration-500"
            style={{ color: getInterpolatedColor(normalizedValue) }}
          >
            {Math.round(normalizedValue)}%
          </span>
        )}
        <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mt-3 text-center">
          {label}
        </p>
        {subtitle && (
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1 text-center">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
};

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return null;
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1].slice(-2)}`;
  return String(dateStr);
};

const UserDetailModal: React.FC<{
  userId: string;
  userName: string;
  projects: Project[];
  projectActivities: ProjectActivity[];
  clients: Client[];
  onClose: () => void;
}> = ({ userId, userName, projects, projectActivities, clients, onClose }) => {
  const currentProjectIds = new Set(projects.filter(isCurrentProjectRevision).map(project => project.id));
  const titularProjects = projects.filter(p =>
    isCurrentProjectRevision(p)
    && p.assigneeId === userId
    && [ProjectStatus.QUEUE, ProjectStatus.IN_PROGRESS, ProjectStatus.PAUSED].includes(p.status)
  );

  const userActivities = projectActivities
    .filter(activity => (
      currentProjectIds.has(activity.projectId)
      && activity.assigneeId === userId
      && !isProjectActivityClosed(activity.status)
    ))
    .map(activity => {
      const parent = projects.find(project => project.id === activity.projectId);
      return {
        ...activity,
        parentProjectName: parent?.name || 'Projeto não encontrado',
        parentProjectCode: parent?.code || '—'
      };
    });

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'Cliente não encontrado';
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-[#0f172a] rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-white/5 flex flex-col max-h-[85vh] transition-all">
        {/* Header */}
        <div className="px-8 py-6 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl text-indigo-600 dark:text-indigo-400">
              <Users size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">{userName}</h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mt-1">Detalhamento de Carga Ativa</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300 dark:hover:bg-white/20 transition-all active:scale-95"
          >
            <ArrowRight size={20} className="rotate-180" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-10">
          {/* Projetos Principais (Onde ele é o titular) */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-2">Responsável Principal ({titularProjects.length})</h4>
            <div className="grid gap-3">
              {titularProjects.map(p => (
                <div key={p.id} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 p-5 rounded-[32px] flex flex-col group hover:border-indigo-500/30 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{p.name}</span>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-[10px] font-mono font-black text-indigo-600/60 dark:text-indigo-400/50 uppercase">#{p.code}</span>
                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-md">{p.revision || 'Rev.00'}</span>
                      </div>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${p.status === ProjectStatus.IN_PROGRESS ? 'bg-indigo-500/10 text-indigo-500' :
                      p.status === ProjectStatus.QUEUE ? 'bg-slate-500/10 text-slate-500' :
                        'bg-purple-500/10 text-purple-500'
                      }`}>
                      {p.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200/50 dark:border-white/5">
                    <div className="flex items-center space-x-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/40"></div>
                      <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-tight truncate max-w-[200px]">{getClientName(p.clientId)}</span>
                    </div>
                    {p.deliveryDate && (
                      <div className="flex items-center space-x-1.5 text-slate-500">
                        <Calendar size={10} className="text-indigo-500/60" />
                        <span className="text-[9px] font-black uppercase tracking-tighter">{formatDate(p.deliveryDate)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {titularProjects.length === 0 && (
                <div className="text-center py-4 text-slate-300 dark:text-slate-700 italic text-[10px] font-black uppercase tracking-widest opacity-40">Nenhum projeto sob titularidade</div>
              )}
            </div>
          </div>

          {/* Atividades do projeto designadas */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-2">Atividades em execução ({userActivities.length})</h4>
            <div className="grid gap-3">
              {userActivities.map(activity => (
                <div key={activity.id} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 p-5 rounded-[32px] flex flex-col group hover:border-emerald-500/30 transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{activity.name}</span>
                      {activity.deliveryDate && (
                        <div className="flex items-center space-x-1.5 text-emerald-600/60 dark:text-emerald-400/40 mt-1">
                          <Calendar size={10} />
                          <span className="text-[9px] font-black uppercase tracking-tighter">Entrega: {formatDate(activity.deliveryDate)}</span>
                        </div>
                      )}
                    </div>
                    {(() => {
                      const canonical = normalizeActivityStatus(activity.status);
                      return (
                        <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${
                          canonical === 'EM ANDAMENTO' ? 'bg-emerald-500/10 text-emerald-500' :
                          canonical === 'BLOQUEADA' ? 'bg-rose-500/10 text-rose-500' :
                          canonical === 'CONCLUÍDA' ? 'bg-purple-500/10 text-purple-500' :
                          'bg-slate-500/10 text-slate-500'
                        }`}>
                          {canonical}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex items-center space-x-2 bg-white/40 dark:bg-white/5 p-2 rounded-xl border border-slate-200/50 dark:border-white/5">
                    <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Projeto:</span>
                    <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300 uppercase truncate">{activity.parentProjectName}</span>
                    <span className="text-[9px] font-mono font-black text-indigo-500/40 dark:text-indigo-400/30">({activity.parentProjectCode})</span>
                  </div>
                </div>
              ))}
              {userActivities.length === 0 && (
                <div className="text-center py-4 text-slate-300 dark:text-slate-700 italic text-[10px] font-black uppercase tracking-widest opacity-40">Nenhuma atividade designada</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const RiskDetailModal: React.FC<{
  type: 'inertia' | 'scale';
  data: any;
  onClose: () => void;
  formatDate: (dateStr?: string) => string | null;
}> = ({ type, data, onClose, formatDate }) => {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-[#0f172a] rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-white/5 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-8 py-6 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className={`p-2.5 rounded-xl ${type === 'inertia' ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600'}`}>
              {type === 'inertia' ? <Clock size={20} /> : <AlertTriangle size={20} />}
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                {type === 'inertia' ? 'Rastreabilidade de Inércia' : 'Rastreabilidade de Escala'}
              </h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mt-1">Detalhamento Operacional Crítico</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/70 hover:text-slate-900 dark:hover:text-white transition-all active:scale-95">
            <ArrowRight size={20} className="rotate-180" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-8">
          {type === 'inertia' ? (
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-2">Projetos em Fila Crítica (&lt; 48h)</h4>
              <div className="grid gap-3">
                {data.inertiaDetails.map((p: any) => (
                  <div key={p.id} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 p-5 rounded-[28px] flex items-center justify-between group transition-all">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight">{p.name}</span>
                      <span className="text-[10px] font-black text-indigo-500/60 mt-1 uppercase tracking-tighter">Deadline: {formatDate(p.deliveryDate)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[9px] font-black uppercase text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full animate-pulse">Ação Requerida</span>
                      <span className="text-[8px] font-bold text-slate-400 mt-1">#{p.code}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Fragmentação */}
              {data.fragmentationDetails.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest px-2">⚠️ Fragmentação (Filtro: &gt;= 4 Projetos Ativos)</h4>
                  <div className="grid gap-3">
                    {data.fragmentationDetails.map((u: any) => (
                      <div key={u.userId} className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10">
                        <p className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase mb-2">{u.userName}</p>
                        <div className="flex flex-wrap gap-2">
                          {u.projects.map((p: any) => (
                            <span key={p.id} className="text-[8px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/5 px-2 py-1 rounded-lg text-slate-500 dark:text-slate-400 uppercase">{p.name}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sobrecarga */}
              {data.overloadedDetails.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-orange-500 uppercase tracking-widest px-2">🔥 Sobrecarga (Carga: &gt;= 6 Tarefas Totais)</h4>
                  <div className="grid gap-3">
                    {data.overloadedDetails.map((u: any) => (
                      <div key={u.userId} className="p-4 rounded-2xl bg-orange-500/5 border border-orange-500/10 flex justify-between items-center">
                        <p className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase">{u.userName}</p>
                        <span className="text-[10px] font-black text-orange-600 bg-orange-500/10 px-3 py-1 rounded-full">{u.tasksCount} tarefas ativas</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Conflitos */}
              {data.conflictDetails.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-widest px-2">⚡ Conflitos Temporais (Sobreposição Reais)</h4>
                  <div className="grid gap-3">
                    {data.conflictDetails.map((conf: any) => (
                      <div key={conf.userId} className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/10">
                        <p className="text-[11px] font-black text-rose-600 uppercase mb-2">{conf.userName}</p>
                        <div className="space-y-2">
                          {conf.conflicts.map((c: any, idx: number) => (
                            <div key={idx} className="flex items-center space-x-2 text-[8px] text-slate-500 dark:text-slate-400 font-bold uppercase">
                              <span className="truncate max-w-[120px] text-slate-800 dark:text-slate-200">{c.a.name}</span>
                              <ArrowRight size={8} />
                              <span className="truncate max-w-[120px] text-slate-800 dark:text-slate-200">{c.b.name}</span>
                              <span className="text-rose-400">({formatDate(c.a.deadline || c.a.end.toISOString().split('T')[0])})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};


export const Dashboard: React.FC<DashboardProps> = ({
  db,
  theme = 'dark',
  onOpenProject,
  onOpenActivity,
  onNavigateToTeam
}) => {
  const [dashboardViewMode, setDashboardViewMode] = useState<'executive' | 'analytic'>('executive');
  const [predictabilityFilter, setPredictabilityFilter] = useState<'ALL' | ProjectDeliveryPredictabilityStatus>('ALL');
  const [predictabilitySearch, setPredictabilitySearch] = useState('');
  const [capacityWindow, setCapacityWindow] = useState<HistoricalWindowWeeks>(8);
  const [capacityTab, setCapacityTab] = useState<'overview' | 'professionals' | 'projection'>('overview');
  const [viewingUser, setViewingUser] = useState<any>(null);
  const [viewingRisk, setViewingRisk] = useState<{ type: 'inertia' | 'scale', data: any } | null>(null);
  const projects = db.projects || [];
  const users = db.users || [];
  const clients = db.clients || [];
  const [projectActivities, setProjectActivities] = useState<ProjectActivity[]>([]);
  const [forecastDataset, setForecastDataset] = useState<OperationalMetricsDataset | null>(null);
  const [activityEventsBatch, setActivityEventsBatch] = useState<Record<string, any[]>>({});

  useEffect(() => {
    const loadForecastDataset = async () => {
      if (!db.company?.id) return;
      try {
        const data = await fetchOperationalMetricsDataset(db.company.id);
        setForecastDataset(data);
        setProjectActivities(data.activities);
      } catch (err) {
        console.error("Erro ao carregar dados operacionais no Dashboard:", err);
      }
    };
    loadForecastDataset();
  }, [db.company?.id]);

  useEffect(() => {
    const loadBlockedEvents = async () => {
      if (!db.company?.id) return;
      const blockedIds = projectActivities
        .filter(a => normalizeActivityStatus(a.status) === ActivityCanonicalStatus.BLOCKED)
        .map(a => a.id);
      if (blockedIds.length > 0) {
        try {
          const events = await fetchProjectActivitiesEventsBatch(db.company.id, blockedIds);
          setActivityEventsBatch(events);
        } catch (e) {
          console.error("Erro ao carregar eventos de atividades bloqueadas no Dashboard:", e);
        }
      }
    };
    loadBlockedEvents();
  }, [db.company?.id, projectActivities]);

  const now = new Date();
  const next7Days = new Date();
  next7Days.setDate(now.getDate() + 7);
  const todayStr = useMemo(() => getTodayDateString(), []);

  const deliveryPredictabilities = useMemo(() => {
    return calculateProjectDeliveryPredictability({
      projects,
      activities: projectActivities,
      todayStr
    });
  }, [projects, projectActivities, todayStr]);

  const filteredPredictabilities = useMemo(() => {
    const q = predictabilitySearch.trim().toLowerCase();
    return deliveryPredictabilities.filter(item => {
      const matchesFilter = predictabilityFilter === 'ALL' || item.status === predictabilityFilter;
      const matchesSearch = !q
        || item.projectCode.toLowerCase().includes(q)
        || item.projectName.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [deliveryPredictabilities, predictabilityFilter, predictabilitySearch]);


  // 1. Métricas de Saúde e Confiabilidade
  const activeProjects = useMemo(() => projects.filter((p: Project) =>
    isCurrentProjectRevision(p) &&
    [ProjectStatus.QUEUE, ProjectStatus.IN_PROGRESS, ProjectStatus.PAUSED].includes(p.status)
  ), [projects]);

  const currentProjectIds = useMemo(() => new Set(projects.filter(isCurrentProjectRevision).map(project => project.id)), [projects]);

  const unifiedKPIs = useMemo(() => {
    return calculateUnifiedKPIs(
      projectActivities,
      [],
      undefined,
      todayStr,
      currentProjectIds
    );
  }, [projectActivities, todayStr, currentProjectIds]);

  const overdueProjects = useMemo(() => projects.filter((p: Project) => {
    if (!isCurrentProjectRevision(p) || !p.deliveryDate || p.status === ProjectStatus.DONE || p.status === ProjectStatus.CANCELED) return false;
    return p.deliveryDate < todayStr;
  }), [projects, todayStr]);

  const healthInfo = useMemo(() => {
    // 1. Se houver atividades concluídas com prazo válido, reflete a taxa real de cumprimento
    if (unifiedKPIs.completedWithUpdatedDeadlineCount > 0) {
      const val = unifiedKPIs.updatedDeliveryRatePercent;
      return {
        value: val,
        label: 'CONFIABILIDADE DE ENTREGAS',
        subtitle: formatKpiRateWithFraction(
          val,
          unifiedKPIs.completedOnUpdatedDeadlineCount,
          unifiedKPIs.completedWithUpdatedDeadlineCount
        ),
        explanation: 'Taxa real de cumprimento de prazos das atividades concluídas. Baseada na proporção de entregas realizadas até o prazo aplicável.',
        calculation: `${unifiedKPIs.completedOnUpdatedDeadlineCount} entregas no prazo de ${unifiedKPIs.completedWithUpdatedDeadlineCount} concluídas (${val}%)`
      };
    }

    // 2. Se não houver histórico de conclusões ainda, reflete a pontualidade dos projetos ativos
    if (activeProjects.length > 0) {
      const onTimeCount = Math.max(0, activeProjects.length - overdueProjects.length);
      const val = Math.round((onTimeCount / activeProjects.length) * 100);
      return {
        value: val,
        label: 'PROJETOS ATIVOS NO PRAZO',
        subtitle: `${onTimeCount} de ${activeProjects.length} ativos no prazo`,
        explanation: 'Proporção de projetos ativos cujo prazo final ainda não foi ultrapassado. Sem histórico de conclusões registradas no período.',
        calculation: `${onTimeCount} projetos no prazo de ${activeProjects.length} ativos (${val}%)`
      };
    }

    // 3. Sem projetos ativos e sem entregas: dados insuficientes
    return {
      value: null,
      label: 'DADOS INSUFICIENTES',
      subtitle: 'Nenhum projeto ativo ou entrega registrada',
      explanation: 'Não há dados operacionais suficientes cadastrados para calcular o índice de confiabilidade.',
      calculation: 'Dados insuficientes'
    };
  }, [unifiedKPIs, activeProjects, overdueProjects]);

  const health = healthInfo.value ?? 0;

  // 2. Projetos da Próxima Semana (seguro com datas de calendário)
  const upcomingProjects = useMemo(() => {
    const deadlineLimit = addCalendarDays(todayStr, 7) || todayStr;
    return projects.filter((p: Project) => {
      if (!isCurrentProjectRevision(p) || !p.deliveryDate || p.status === ProjectStatus.DONE || p.status === ProjectStatus.CANCELED) return false;
      return p.deliveryDate >= todayStr && p.deliveryDate <= deadlineLimit;
    });
  }, [projects, todayStr]);

  // 4. Tendência Mensal (Criados vs Concluídos)
  const monthlyTimeline = useMemo(() => {
    const months: Record<string, { month: string; created: number; done: number }> = {};
    const last6Months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short' });
      months[key] = { month: label, created: 0, done: 0 };
      last6Months.push(key);
    }

    projects.forEach(p => {
      const date = new Date(p.createdAt || Date.now());
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (months[key]) months[key].created++;

      if (p.status === ProjectStatus.DONE) {
        // Para simplificar, assumimos que projetcs marcados como DONE foram concluidos no mes atual se nao houver data de conclusao real
        const doneDate = new Date(p.deliveryDate ? (p.deliveryDate + 'T12:00:00') : (p.createdAt || Date.now()));
        const doneKey = `${doneDate.getFullYear()}-${String(doneDate.getMonth() + 1).padStart(2, '0')}`;
        if (months[doneKey]) months[doneKey].done++;
      }
    });

    return last6Months.map(key => months[key]);
  }, [projects]);

  // 5. Matriz de carga das atividades abertas
  const userStatusMatrix = useMemo(() => {
    const matrix: Record<string, { id: string; name: string; activities: number; stats: Record<string, number> }> = {};

    users.forEach(u => {
      matrix[u.username] = {
        id: u.id,
        name: u.username,
        activities: 0,
        stats: {
          [ProjectStatus.QUEUE]: 0,
          [ProjectStatus.IN_PROGRESS]: 0,
          [ProjectStatus.PAUSED]: 0
        }
      };
    });

    projectActivities.filter(activity => (
      currentProjectIds.has(activity.projectId) && !isProjectActivityClosed(activity.status)
    )).forEach(activity => {
      const user = users.find(item => item.id === activity.assigneeId);
      if (user && matrix[user.username]) {
        matrix[user.username].activities++;
        const canonical = normalizeActivityStatus(activity.status);
        if (canonical === 'EM ANDAMENTO') {
          matrix[user.username].stats[ProjectStatus.IN_PROGRESS] = (matrix[user.username].stats[ProjectStatus.IN_PROGRESS] || 0) + 1;
        } else if (canonical === 'BLOQUEADA') {
          matrix[user.username].stats[ProjectStatus.PAUSED] = (matrix[user.username].stats[ProjectStatus.PAUSED] || 0) + 1;
        } else {
          matrix[user.username].stats[ProjectStatus.QUEUE] = (matrix[user.username].stats[ProjectStatus.QUEUE] || 0) + 1;
        }
      }
    });

    return Object.entries(matrix).filter(([_, data]) => data.activities > 0);
  }, [projectActivities, users, projects]);

  // 6. Média de Tempo de Execução (Dias Úteis)
  const avgExecutionTime = useMemo(() => {
    const completed = projects.filter((p: Project) => p.status === ProjectStatus.DONE && p.startDate && p.deliveryDate);
    if (completed.length === 0) return 0;

    const totalBusinessDays = completed.reduce((acc: number, p: Project) => {
      const start = new Date(p.startDate! + 'T12:00:00');
      const end = new Date(p.deliveryDate! + 'T12:00:00');

      let count = 0;
      const current = new Date(start);
      while (current <= end) {
        const dow = current.getDay();
        if (dow !== 0 && dow !== 6) count++; // Ignora Sáb (6) e Dom (0)
        current.setDate(current.getDate() + 1);
      }
      return acc + count;
    }, 0);

    return Math.round(totalBusinessDays / completed.length);
  }, [projects]);

  // 7. Ranking Top 10 Clientes (Completo para Tabela)
  const rankingTopClients = useMemo(() => {
    const data: Record<string, { count: number; code: string }> = {};
    projects.forEach(p => {
      const client = clients.find(c => c.id === p.clientId);
      if (client) {
        if (!data[client.name]) data[client.name] = { count: 0, code: client.code || 'CLI' };
        data[client.name].count++;
      }
    });
    return Object.entries(data)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);
  }, [projects, clients]);

  // 8. Concentração de Clientes (Pie Data)
  const clientConcentrationData = useMemo(() => {
    const data: Record<string, number> = {};
    projects.forEach(p => {
      const client = clients.find(c => c.id === p.clientId);
      const name = client ? client.name : 'Outros';
      data[name] = (data[name] || 0) + 1;
    });
    return Object.entries(data)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5); // Top 5 e Agrupar outros
  }, [projects, clients]);

  // 9. Dashboard 2.0: NOVAS MÉTRICAS ESTRATÉGICAS
  const dashboard2Logics = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);

    // Listas para Rastreabilidade
    const inertiaRiskProjects: Project[] = [];
    const fragmentedUsers: any[] = [];
    const overloadedUsers: any[] = [];
    const conflictUsers: any[] = [];

    // Vazão (Throughput)
    const createdLast7 = projects.filter(p => new Date(p.createdAt || Date.now()) >= sevenDaysAgo).length;
    const doneLast7 = projects.filter(p => p.status === ProjectStatus.DONE && new Date(p.deliveryDate || Date.now()) >= sevenDaysAgo).length;
    const throughputFactor = createdLast7 > 0 ? (doneLast7 / createdLast7) : 1;

    // Risco de Inércia (Entrega em < 48h e ainda na Fila)
    const fortyEightHours = new Date();
    fortyEightHours.setHours(now.getHours() + 48);
    activeProjects.forEach(p => {
      if (p.status === ProjectStatus.QUEUE && p.deliveryDate && new Date(p.deliveryDate) <= fortyEightHours) {
        inertiaRiskProjects.push(p);
      }
    });

    // 4. Carga operacional por atividades abertas
    const userWorkloadSummary = users.map(u => {
      const projectsOnRadar = new Set<string>();
      const userProjects: Project[] = [];
      const userTasks: any[] = [];
      const userOpenActivities = projectActivities.filter(activity => (
        activity.assigneeId === u.id
        && currentProjectIds.has(activity.projectId)
        && !isProjectActivityClosed(activity.status)
      ));

      userOpenActivities.forEach(activity => {
        const parent = projects.find(project => project.id === activity.projectId);
        if (parent && !projectsOnRadar.has(parent.id)) {
          projectsOnRadar.add(parent.id);
          userProjects.push(parent);
        }
        userTasks.push({
          type: 'ATIVIDADE',
          name: activity.name,
          status: activity.status,
          deadline: activity.deliveryDate,
          parentName: parent?.name
        });
      });

      const summary = {
        userId: u.id,
        userName: u.username,
        projectsCount: projectsOnRadar.size,
        tasksCount: userOpenActivities.length,
        projects: userProjects,
        tasks: userTasks
      };

      if (summary.projectsCount >= 4) fragmentedUsers.push(summary);
      if (summary.tasksCount >= 6) overloadedUsers.push(summary);

      return summary;
    });

    // Conflitos: mesma regra do Cronograma, baseada em atividades e intervalos planejados.
    users.forEach(u => {
      const uAssignments = projectActivities
        .filter(activity => (
          activity.assigneeId === u.id
          && activity.startDate
          && activity.deliveryDate
          && !isProjectActivityClosed(activity.status)
          && activeProjects.some(project => project.id === activity.projectId)
        ))
        .map(activity => {
          const parent = projects.find(project => project.id === activity.projectId);
          return {
            id: activity.id,
            name: activity.name,
            start: new Date(`${activity.startDate}T12:00:00`),
            end: new Date(`${activity.deliveryDate}T12:00:00`),
            parentName: parent?.name
          };
        });

      const conflicts: any[] = [];
      for (let i = 0; i < uAssignments.length; i++) {
        for (let j = i + 1; j < uAssignments.length; j++) {
          const a = uAssignments[i];
          const b = uAssignments[j];
          if (a.start <= b.end && b.start <= a.end) {
            conflicts.push({ a, b });
          }
        }
      }
      if (conflicts.length > 0) {
        conflictUsers.push({ userId: u.id, userName: u.username, conflicts });
      }
    });

    return {
      inertia: inertiaRiskProjects.length,
      inertiaDetails: inertiaRiskProjects,
      fragmentation: fragmentedUsers.length,
      fragmentationDetails: fragmentedUsers,
      overloaded: overloadedUsers.length,
      overloadedDetails: overloadedUsers,
      conflicts: conflictUsers.length,
      conflictDetails: conflictUsers,
      throughput: { factor: throughputFactor, created: createdLast7, done: doneLast7 }
    };
  }, [projects, activeProjects, users, projectActivities]);

  const userWipLimits = useMemo<Record<string, number>>(() => {
    if (!db.company?.id) return {};
    try {
      const saved = localStorage.getItem(`perspecpath_wip_limits_${db.company.id}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }, [db.company?.id]);

  const activeUsers = useMemo(() => users.filter(u => u.isActive), [users]);

  const wipOverview = useMemo(() => {
    return calculateWipOverview(projectActivities, userWipLimits, todayStr, currentProjectIds);
  }, [projectActivities, userWipLimits, todayStr, currentProjectIds]);

  const teamWipMetrics = useMemo(() => {
    return calculateProfessionalDeliveryMetrics(
      projectActivities,
      activeUsers,
      undefined,
      todayStr,
      userWipLimits,
      currentProjectIds
    );
  }, [projectActivities, activeUsers, todayStr, userWipLimits, currentProjectIds]);

  const teamCapacity = useMemo(() => {
    return calculateTeamOperationalCapacity({
      projects,
      activities: projectActivities,
      users,
      todayStr,
      windowWeeks: capacityWindow,
      userWipLimits,
      workDays: db.company?.workDays || [1, 2, 3, 4, 5],
      currentProjectIds
    });
  }, [projects, projectActivities, users, todayStr, capacityWindow, userWipLimits, db.company?.workDays, currentProjectIds]);

  const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f97316', '#10b981'];

  const getHealthColor = (h: number) => {
    if (h > 80) return 'text-emerald-500';
    if (h > 50) return 'text-amber-500';
    return 'text-rose-500';
  };

  const getHealthStatus = (h: number) => {
    if (h > 80) return 'EXCELENTE';
    if (h > 60) return 'ESTÁVEL';
    if (h > 40) return 'ATENÇÃO';
    if (h > 20) return 'INSTÁVEL';
    return 'CRÍTICO';
  };

  const statusConfigs = [
    { label: 'CRÍTICO', range: [0, 20], color: 'rose' },
    { label: 'INSTÁVEL', range: [21, 40], color: 'orange' },
    { label: 'ATENÇÃO', range: [41, 60], color: 'amber' },
    { label: 'ESTÁVEL', range: [61, 80], color: 'emerald' },
    { label: 'EXCELENTE', range: [81, 100], color: 'emerald' }
  ];

  const currentStatus = getHealthStatus(health);

  // BRIEFING EXECUTIVO DINÂMICO (ETAPA 8 - INSIGHTS TEXTUAIS CURTOS)
  const executiveInsights = useMemo(() => {
    const criticalItems: string[] = [];
    const infoItems: string[] = [];

    if (unifiedKPIs.activeBlocksCount > 0) {
      criticalItems.push(`${unifiedKPIs.activeBlocksCount} ${unifiedKPIs.activeBlocksCount === 1 ? 'bloqueio ativo' : 'bloqueios ativos'}`);
    }

    if (overdueProjects.length > 0) {
      criticalItems.push(`${overdueProjects.length} ${overdueProjects.length === 1 ? 'projeto atrasado' : 'projetos atrasados'}`);
    }

    if (teamCapacity.exceededWipProfessionalsCount > 0) {
      criticalItems.push(`${teamCapacity.exceededWipProfessionalsCount} ${teamCapacity.exceededWipProfessionalsCount === 1 ? 'profissional sobrecarregado' : 'profissionais sobrecarregados'}`);
    }

    if (upcomingProjects.length > 0) {
      infoItems.push(`${upcomingProjects.length} ${upcomingProjects.length === 1 ? 'entrega programada' : 'entregas programadas'} nos próximos 7 dias`);
    }

    let badgeText = 'Operação Estável';
    let badgeColor: 'emerald' | 'amber' | 'rose' | 'sky' = 'emerald';
    let headline = 'Fluxo de trabalho saudável, entregas no prazo e equipe equilibrada.';

    if (overdueProjects.length > 0 || unifiedKPIs.activeBlocksCount > 2) {
      badgeText = 'Ação Imediata';
      badgeColor = 'rose';
      headline = `${criticalItems.join(' e ')} exigem intervenção gerencial prioritária.`;
    } else if (criticalItems.length > 0) {
      badgeText = 'Atenção Operacional';
      badgeColor = 'amber';
      headline = `${criticalItems.join(' · ')} requerem acompanhamento pontual.`;
    } else if (infoItems.length > 0) {
      badgeText = 'Fluxo Contínuo';
      badgeColor = 'sky';
      headline = `Operação em dia. Concentração de ${infoItems[0]}.`;
    }

    return {
      badgeText,
      badgeColor,
      headline,
      teamMessage: teamCapacity.exceededWipProfessionalsCount > 0
        ? `${teamCapacity.exceededWipProfessionalsCount} profissional(is) acima da referência estimada`
        : 'Equipe operando dentro da capacidade observada',
      upcomingMessage: upcomingProjects.length > 0
        ? `Concentração de ${upcomingProjects.length} entrega(s) na próxima semana`
        : 'Sem concentração crítica de entregas na semana',
      rhythmMessage: dashboard2Logics.throughput.factor >= 1
        ? 'Ritmo de entregas equilibrado com novas entradas'
        : 'Entradas de projetos superiores ao ritmo recente de entregas'
    };
  }, [unifiedKPIs, overdueProjects, teamCapacity, upcomingProjects, dashboard2Logics]);

  return (
    <div id="dashboard-content" className="space-y-8 animate-in fade-in duration-700 pb-12 relative">
      {/* BACKGROUND DE ALTA TECNOLOGIA */}
      <div className="fixed inset-0 pointer-events-none opacity-20 dark:opacity-20 overflow-hidden z-[-1]">
        <div className="absolute inset-0 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px]"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-transparent to-slate-50 dark:from-[#0f172a] dark:via-transparent dark:to-[#0f172a]"></div>
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 3px, transparent 3px)' }}></div>
      </div>

      {/* CABEÇALHO DO DASHBOARD COM SELETOR DE VISÃO (ETAPA 7: EXECUTIVA VS ANALÍTICA) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/60 dark:border-white/5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              Painel Gerencial
            </span>
            <span className="text-[10px] font-bold text-slate-400">·</span>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Atualização em tempo real</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mt-1">
            Visão Geral de Operações
          </h1>
        </div>

        {/* CONTROLE DE VISÃO: EXECUTIVA VS ANALÍTICA */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-900/90 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner self-start md:self-auto">
          <button
            type="button"
            onClick={() => setDashboardViewMode('executive')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center space-x-2 ${
              dashboardViewMode === 'executive'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-md shadow-black/5 dark:shadow-black/20'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <LayoutDashboard size={14} />
            <span>Visão Executiva</span>
          </button>
          <button
            type="button"
            onClick={() => setDashboardViewMode('analytic')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center space-x-2 ${
              dashboardViewMode === 'analytic'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-md shadow-black/5 dark:shadow-black/20'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sliders size={14} />
            <span>Visão Analítica</span>
          </button>
        </div>
      </div>

      {/* BRIEFING EXECUTIVO DINÂMICO (ETAPA 8 - INSIGHTS TEXTUAIS CURTOS) */}
      <div className={`p-6 rounded-[32px] border transition-all ${
        executiveInsights.badgeColor === 'rose'
          ? 'bg-rose-500/5 border-rose-500/20 text-rose-900 dark:text-rose-100'
          : executiveInsights.badgeColor === 'amber'
            ? 'bg-amber-500/5 border-amber-500/20 text-amber-900 dark:text-amber-100'
            : executiveInsights.badgeColor === 'sky'
              ? 'bg-sky-500/5 border-sky-500/20 text-sky-900 dark:text-sky-100'
              : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-900 dark:text-emerald-100'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start md:items-center space-x-3.5">
            <div className={`p-2.5 rounded-2xl ${
              executiveInsights.badgeColor === 'rose'
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                : executiveInsights.badgeColor === 'amber'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : executiveInsights.badgeColor === 'sky'
                    ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            }`}>
              {executiveInsights.badgeColor === 'rose' ? (
                <AlertCircle size={20} />
              ) : executiveInsights.badgeColor === 'amber' ? (
                <AlertTriangle size={20} />
              ) : (
                <ShieldCheck size={20} />
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${
                  executiveInsights.badgeColor === 'rose'
                    ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                    : executiveInsights.badgeColor === 'amber'
                      ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                      : executiveInsights.badgeColor === 'sky'
                        ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300'
                        : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                }`}>
                  {executiveInsights.badgeText}
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Diagnóstico da Operação
                </span>
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {executiveInsights.headline}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-200/40 dark:border-white/5">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-white/60 dark:bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-200/50 dark:border-white/5">
              {executiveInsights.teamMessage}
            </span>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-white/60 dark:bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-200/50 dark:border-white/5">
              {executiveInsights.upcomingMessage}
            </span>
          </div>
        </div>
      </div>

      {/* RESUMO EXECUTIVO (ETAPA 4.1.A - 6 CARDS DE INDICADORES PRINCIPAIS) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Card 1: Projetos Ativos */}
        <div className="p-5 rounded-[28px] bg-white dark:bg-[#1e293b]/40 backdrop-blur-xl border border-slate-200/80 dark:border-white/5 shadow-sm flex flex-col justify-between group hover:border-indigo-500/30 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Projetos Ativos</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 group-hover:scale-110 transition-transform">
              <Layers size={14} />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {activeProjects.length}
            </span>
            <p className="text-[9px] font-bold text-slate-400 mt-1 truncate">
              {activeProjects.filter(p => p.status === ProjectStatus.IN_PROGRESS).length} em execução
            </p>
          </div>
        </div>

        {/* Card 2: Entregas da Semana */}
        <div className="p-5 rounded-[28px] bg-white dark:bg-[#1e293b]/40 backdrop-blur-xl border border-slate-200/80 dark:border-white/5 shadow-sm flex flex-col justify-between group hover:border-sky-500/30 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Entregas da Semana</span>
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-500 group-hover:scale-110 transition-transform">
              <Calendar size={14} />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-sky-600 dark:text-sky-400 tracking-tight">
              {upcomingProjects.length}
            </span>
            <p className="text-[9px] font-bold text-slate-400 mt-1 truncate">
              próximos 7 dias
            </p>
          </div>
        </div>

        {/* Card 3: Entregas no Prazo */}
        <div className="p-5 rounded-[28px] bg-white dark:bg-[#1e293b]/40 backdrop-blur-xl border border-slate-200/80 dark:border-white/5 shadow-sm flex flex-col justify-between group hover:border-emerald-500/30 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Entregas no Prazo</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 group-hover:scale-110 transition-transform">
              <CheckCircle2 size={14} />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
              {healthInfo.value !== null ? `${healthInfo.value}%` : '---'}
            </span>
            <p className="text-[9px] font-bold text-slate-400 mt-1 truncate">
              {healthInfo.value !== null ? (healthInfo.value >= 80 ? 'Ritmo excelente' : 'Acompanhar') : 'Sem histórico'}
            </p>
          </div>
        </div>

        {/* Card 4: Projetos Atrasados */}
        <div className={`p-5 rounded-[28px] bg-white dark:bg-[#1e293b]/40 backdrop-blur-xl border shadow-sm flex flex-col justify-between group transition-all ${
          overdueProjects.length > 0 ? 'border-rose-500/30 hover:border-rose-500' : 'border-slate-200/80 dark:border-white/5 hover:border-slate-300'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Projetos Atrasados</span>
            <div className={`p-2 rounded-xl ${overdueProjects.length > 0 ? 'bg-rose-500/10 text-rose-500' : 'bg-slate-500/10 text-slate-400'} group-hover:scale-110 transition-transform`}>
              <AlertTriangle size={14} />
            </div>
          </div>
          <div>
            <span className={`text-2xl font-black tracking-tight ${overdueProjects.length > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
              {overdueProjects.length}
            </span>
            <p className="text-[9px] font-bold text-slate-400 mt-1 truncate">
              {overdueProjects.length > 0 ? 'Prazo expirado' : 'Nenhum atraso'}
            </p>
          </div>
        </div>

        {/* Card 5: Bloqueios Ativos */}
        <div className={`p-5 rounded-[28px] bg-white dark:bg-[#1e293b]/40 backdrop-blur-xl border shadow-sm flex flex-col justify-between group transition-all ${
          unifiedKPIs.activeBlocksCount > 0 ? 'border-amber-500/30 hover:border-amber-500' : 'border-slate-200/80 dark:border-white/5 hover:border-slate-300'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Bloqueios Ativos</span>
            <div className={`p-2 rounded-xl ${unifiedKPIs.activeBlocksCount > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-500/10 text-slate-400'} group-hover:scale-110 transition-transform`}>
              <Ban size={14} />
            </div>
          </div>
          <div>
            <span className={`text-2xl font-black tracking-tight ${unifiedKPIs.activeBlocksCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
              {unifiedKPIs.activeBlocksCount}
            </span>
            <p className="text-[9px] font-bold text-slate-400 mt-1 truncate">
              {unifiedKPIs.activeBlocksCount > 0 ? 'Aguardando liberação' : 'Fluxo liberado'}
            </p>
          </div>
        </div>

        {/* Card 6: Ritmo de Entregas */}
        <div className="p-5 rounded-[28px] bg-white dark:bg-[#1e293b]/40 backdrop-blur-xl border border-slate-200/80 dark:border-white/5 shadow-sm flex flex-col justify-between group hover:border-purple-500/30 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Ritmo de Entregas</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500 group-hover:scale-110 transition-transform">
              <TrendingUp size={14} />
            </div>
          </div>
          <div>
            <span className="text-2xl font-black text-purple-600 dark:text-purple-400 tracking-tight">
              {teamCapacity.teamWeeklyThroughput !== null ? `${teamCapacity.teamWeeklyThroughput}/sem` : `${dashboard2Logics.throughput.done} ent.`}
            </span>
            <p className="text-[9px] font-bold text-slate-400 mt-1 truncate">
              Últimas semanas
            </p>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODO 1: VISÃO EXECUTIVA (LEITURA RÁPIDA, DECISÃO, FOCO GERENCIAL)     */}
      {/* ===================================================================== */}
      {dashboardViewMode === 'executive' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* BLOCO 1: CENTRAL DE ATENÇÃO GERENCIAL (ONDE AGIR AGORA) */}
          <ManagementAttentionCenter
            projects={projects}
            activities={projectActivities}
            users={users}
            clients={clients}
            theme={theme}
            todayStr={todayStr}
            userWipLimits={userWipLimits}
            eventsByActivityId={activityEventsBatch}
            onOpenProject={onOpenProject}
            onOpenActivity={onOpenActivity}
            onNavigateToTeam={onNavigateToTeam}
          />

          {/* BLOCO 2: EQUIPE & CARGA DE TRABALHO */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  Equilíbrio da Equipe e Alocação de Trabalho
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                  Identificação de sobrecargas, dispersão e volume ativo por profissional
                </p>
              </div>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                {userStatusMatrix.length} colaboradores ativos
              </span>
            </div>

            {/* 3 CARDS ESTRATÉGICOS DE FLUXO */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* RITMO DE CONCLUSÃO */}
              <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl p-7 rounded-[36px] border border-slate-200 dark:border-white/5 relative group transition-all duration-300 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] flex items-center">
                    Ritmo de Conclusão
                    <InfoTooltip title="Ritmo de Conclusão" content="Saldo de projetos concluídos vs criados nos últimos 7 dias. Um saldo inferior a 100% indica que novas demandas estão entrando mais rápido que as entregas." />
                  </h4>
                  <TrendingUp size={16} className={dashboard2Logics.throughput.factor >= 1 ? 'text-emerald-500' : 'text-amber-500'} />
                </div>
                <div className="flex items-end space-x-4">
                  <span className={`text-4xl font-black transition-colors ${dashboard2Logics.throughput.factor >= 1 ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {Math.round(dashboard2Logics.throughput.factor * 100)}%
                  </span>
                  <div className="flex flex-col pb-1">
                    <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase">{dashboard2Logics.throughput.done} entregas</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">vs {dashboard2Logics.throughput.created} novos</span>
                  </div>
                </div>
                <p className="text-[9px] font-bold text-slate-400 mt-3 pt-3 border-t border-slate-100 dark:border-white/5">
                  {dashboard2Logics.throughput.factor >= 1 ? 'Ritmo positivo: mais entregas do que entradas' : 'Atenção: mais entradas do que entregas'}
                </p>
              </div>

              {/* PROJETOS PARADOS NA FILA */}
              <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl p-7 rounded-[36px] border border-slate-200 dark:border-white/5 relative group transition-all duration-300 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] flex items-center">
                    Projetos Parados na Fila
                    <InfoTooltip title="Alerta de Início" content="Projetos que têm prazo de entrega em menos de 48 horas e ainda não tiveram execução iniciada. Exige mobilização urgente." />
                  </h4>
                  <button
                    onClick={() => setViewingRisk({ type: 'inertia', data: dashboard2Logics })}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg text-slate-400 hover:text-indigo-500 transition-all flex items-center space-x-1"
                  >
                    <Search size={12} />
                    <span className="text-[8px] font-black uppercase">Ver</span>
                  </button>
                </div>
                <div className="flex items-center space-x-4">
                  <span className={`text-4xl font-black transition-colors ${dashboard2Logics.inertia > 0 ? 'text-rose-500 animate-pulse' : 'text-slate-200 dark:text-slate-700'}`}>
                    {dashboard2Logics.inertia}
                  </span>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase leading-tight">
                    {dashboard2Logics.inertia === 1 ? 'Projeto pendente' : 'Projetos pendentes'} <br />com prazo &lt; 48h
                  </p>
                </div>
                <p className="text-[9px] font-bold text-slate-400 mt-3 pt-3 border-t border-slate-100 dark:border-white/5">
                  {dashboard2Logics.inertia === 0 ? 'Nenhum projeto crítico aguardando início' : 'Exige mobilização imediata'}
                </p>
              </div>

              {/* EQUILÍBRIO DE CARGA DA EQUIPE */}
              <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl p-7 rounded-[36px] border border-slate-200 dark:border-white/5 relative group transition-all duration-300 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] flex items-center">
                    Equilíbrio de Carga
                    <InfoTooltip title="Equilíbrio de Carga" content="Dispersão: profissionais em >= 4 projetos. Sobrecarga: profissionais com >= 6 tarefas ativas. Conflito: sobreposições temporais reais." />
                  </h4>
                  <button
                    onClick={() => setViewingRisk({ type: 'scale', data: dashboard2Logics })}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg text-slate-400 hover:text-amber-500 transition-all flex items-center space-x-1"
                  >
                    <Search size={12} />
                    <span className="text-[8px] font-black uppercase">Ver</span>
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col items-center">
                    <span className={`text-2xl font-black transition-colors ${dashboard2Logics.fragmentation > 0 ? 'text-amber-500' : 'text-slate-300 dark:text-slate-700'}`}>
                      {dashboard2Logics.fragmentation}
                    </span>
                    <p className="text-[8px] font-black text-slate-400 uppercase mt-1 tracking-widest text-center">Dispersão</p>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className={`text-2xl font-black transition-colors ${dashboard2Logics.overloaded > 0 ? 'text-orange-500' : 'text-slate-300 dark:text-slate-700'}`}>
                      {dashboard2Logics.overloaded}
                    </span>
                    <p className="text-[8px] font-black text-slate-400 uppercase mt-1 tracking-widest text-center">Volume Alto</p>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className={`text-2xl font-black transition-colors ${dashboard2Logics.conflicts > 0 ? 'text-rose-500' : 'text-slate-300 dark:text-slate-700'}`}>
                      {dashboard2Logics.conflicts}
                    </span>
                    <p className="text-[8px] font-black text-slate-400 uppercase mt-1 tracking-widest text-center">Conflito</p>
                  </div>
                </div>
                <p className="text-[9px] font-bold text-slate-400 mt-3 pt-3 border-t border-slate-100 dark:border-white/5 text-center">
                  {dashboard2Logics.overloaded + dashboard2Logics.fragmentation + dashboard2Logics.conflicts === 0 ? 'Equipe com distribuição equilibrada' : 'Alocação exige rebalanceamento'}
                </p>
              </div>
            </div>

            {/* LISTA VISUAL: DISTRIBUIÇÃO DE TRABALHO POR PROFISSIONAL */}
            <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl rounded-[40px] shadow-sm border border-slate-200 dark:border-white/5 p-8 transition-all">
              <div className="flex items-center justify-between pb-6 border-b border-slate-100 dark:border-white/5">
                <div>
                  <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    Distribuição de Atividades por Profissional
                  </h4>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                    Proporção de atividades em fila, em andamento e bloqueadas
                  </p>
                </div>
                <div className="flex items-center space-x-4 text-[9px] font-black uppercase text-slate-400">
                  <div className="flex items-center space-x-1.5"><div className="w-2.5 h-2.5 rounded-full bg-slate-400/50"></div><span>Fila</span></div>
                  <div className="flex items-center space-x-1.5"><div className="w-2.5 h-2.5 rounded-full bg-indigo-600"></div><span>Andamento</span></div>
                  <div className="flex items-center space-x-1.5"><div className="w-2.5 h-2.5 rounded-full bg-purple-600"></div><span>Pausada/Bloqueada</span></div>
                </div>
              </div>

              <div className="pt-6 space-y-6 max-h-[380px] overflow-y-auto custom-scrollbar">
                {userStatusMatrix.map(([name, data]) => {
                  const totalItems = data.activities;
                  return (
                    <div key={name} className="group">
                      <div className="flex justify-between items-center mb-2.5">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-tight">
                            {name}
                          </span>
                          <button
                            onClick={() => setViewingUser(data)}
                            className="p-1 bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md transition-colors"
                            title="Ver detalhes de carga"
                          >
                            <Eye size={12} />
                          </button>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-black text-slate-900 dark:text-white">
                            {totalItems}
                          </span>
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                            {totalItems === 1 ? 'atividade' : 'atividades'}
                          </span>
                        </div>
                      </div>

                      <div className="h-3 w-full flex rounded-xl overflow-hidden border border-slate-100 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 p-0.5">
                        <div
                          className="bg-slate-400/60 h-full rounded-l-lg transition-all duration-700"
                          style={{ width: `${(data.stats[ProjectStatus.QUEUE] / totalItems) * 100}%` }}
                          title={`Fila: ${data.stats[ProjectStatus.QUEUE]}`}
                        />
                        <div
                          className="bg-indigo-600 h-full transition-all duration-700"
                          style={{ width: `${(data.stats[ProjectStatus.IN_PROGRESS] / totalItems) * 100}%` }}
                          title={`Em Andamento: ${data.stats[ProjectStatus.IN_PROGRESS]}`}
                        />
                        <div
                          className="bg-purple-600 h-full rounded-r-lg transition-all duration-700"
                          style={{ width: `${(data.stats[ProjectStatus.PAUSED] / totalItems) * 100}%` }}
                          title={`Pausada: ${data.stats[ProjectStatus.PAUSED]}`}
                        />
                      </div>
                    </div>
                  );
                })}
                {userStatusMatrix.length === 0 && (
                  <div className="py-12 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest italic opacity-60">
                    Nenhum colaborador com atividades ativas no momento
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* BLOCO 3: TENDÊNCIA OPERACIONAL (FLUXO DE ENTREGAS VS CRIAÇÃO) */}
          <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl rounded-[40px] shadow-sm border border-slate-200 dark:border-white/5 flex flex-col min-h-[380px] transition-all">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between rounded-t-[40px]">
              <div>
                <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-900 dark:text-white flex items-center">
                  Tendência de Fluxo Operacional
                  <InfoTooltip
                    title="Entradas vs Saídas"
                    content="Compara o volume de novos projetos cadastrados com projetos concluídos nos últimos meses."
                    calculation="Criados no mês vs Concluídos no mês"
                  />
                </h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  Evolução semestral de novos projetos e entregas finalizadas
                </p>
              </div>
              <TrendingUp size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="p-6 flex-1">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={monthlyTimeline} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCreatedExec" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={theme === 'dark' ? 0.3 : 0.15} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorDoneExec" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={theme === 'dark' ? 0.3 : 0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#2a374a' : '#e2e8f0'} vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: theme === 'dark' ? '#64748b' : '#94a3b8', fontSize: 10, fontWeight: 800 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: theme === 'dark' ? '#64748b' : '#94a3b8', fontSize: 10, fontWeight: 800 }} />
                  <RechartsTooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff', border: `1px solid ${theme === 'dark' ? '#1e293b' : '#e2e8f0'}`, borderRadius: '12px', color: theme === 'dark' ? '#ffffff' : '#0f172a' }} />
                  <Area type="monotone" dataKey="created" name="Novos Projetos" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorCreatedExec)" />
                  <Area type="monotone" dataKey="done" name="Entregas Concluídas" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorDoneExec)" />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '15px', fontSize: '10px', textTransform: 'uppercase', fontWeight: 800, color: theme === 'dark' ? '#64748b' : '#94a3b8' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* BLOCO 4: PLANEJAMENTO FUTURO & CAPACIDADE DA EQUIPE */}
          <div className="bg-white dark:bg-[#1e293b]/40 backdrop-blur-3xl p-8 rounded-[48px] border border-slate-200 dark:border-white/10 shadow-sm relative group overflow-hidden transition-all">
            <div className="relative z-10 space-y-6">
              {/* Header do Painel */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-white/5">
                <div>
                  <h3 className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.3em] mb-1 flex items-center">
                    Capacidade da Equipe & Planejamento Futuro
                    <InfoTooltip
                      title="Capacidade Operacional"
                      content="Estimativa gerencial baseada no fluxo real: ritmo de entregas histórico, tempo médio de conclusão e atividades em andamento."
                      calculation="Ritmo Semanal = Entregas Concluídas / Semanas da Janela"
                      position="bottom"
                    />
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    Ritmo de entregas · Tempo médio · Atividades em andamento · Previsibilidade de próximas semanas
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {capacityTab !== 'projection' && (
                    <div className="flex items-center bg-slate-100 dark:bg-slate-900/80 p-1 rounded-2xl border border-slate-200 dark:border-slate-800">
                      <span className="text-[9px] font-black uppercase text-slate-400 px-2.5">Últimas:</span>
                      {([4, 8, 12] as HistoricalWindowWeeks[]).map(w => (
                        <button
                          key={w}
                          onClick={() => setCapacityWindow(w)}
                          className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                            capacityWindow === w
                              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {w} Semanas
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center bg-slate-100 dark:bg-slate-900/80 p-1 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <button
                      onClick={() => setCapacityTab('overview')}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                        capacityTab === 'overview'
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-black'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Visão Geral
                    </button>
                    <button
                      onClick={() => setCapacityTab('professionals')}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                        capacityTab === 'professionals'
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-black'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Por Profissional ({teamCapacity.professionals.length})
                    </button>
                    <button
                      onClick={() => setCapacityTab('projection')}
                      className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                        capacityTab === 'projection'
                          ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20 font-black'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Sparkles size={12} className={capacityTab === 'projection' ? 'text-white' : 'text-purple-500'} />
                      <span>Planejamento &amp; Previsibilidade</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* ABA 1: VISÃO GERAL */}
              {capacityTab === 'overview' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Card 1: Ritmo de Entregas da Equipe */}
                    <div className="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                            Ritmo de Entregas da Equipe
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider border ${
                            teamCapacity.sampleConfidence === SampleConfidence.SUFFICIENT
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                              : teamCapacity.sampleConfidence === SampleConfidence.LOW
                                ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                                : 'bg-slate-500/10 border-slate-500/20 text-slate-500'
                          }`}>
                            {teamCapacity.sampleConfidence === SampleConfidence.SUFFICIENT ? 'Alta Confiança' : 'Amostra Baixa'}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1 mt-1">
                          {teamCapacity.teamWeeklyThroughput !== null ? (
                            <>
                              <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                                {teamCapacity.teamWeeklyThroughput}
                              </span>
                              <span className="text-xs font-bold text-slate-400 uppercase">entregas/sem</span>
                            </>
                          ) : (
                            <span className="text-sm font-black text-slate-400 dark:text-slate-500 italic">
                              Histórico insuficiente
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between text-[9px] font-bold text-slate-500">
                        <span>Projeção mensal:</span>
                        <span className="text-slate-700 dark:text-slate-300">
                          {teamCapacity.teamMonthlyThroughput !== null ? `≈ ${teamCapacity.teamMonthlyThroughput} entregas/mês` : '---'}
                        </span>
                      </div>
                    </div>

                    {/* Card 2: Tempo Médio de Conclusão */}
                    <div className="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                            Tempo Médio para Concluir
                          </span>
                          <Clock size={14} className="text-indigo-500" />
                        </div>
                        <div className="flex items-baseline gap-1 mt-1">
                          {teamCapacity.averageBusinessLeadTimeDays !== null ? (
                            <>
                              <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">
                                {teamCapacity.averageBusinessLeadTimeDays}
                              </span>
                              <span className="text-xs font-bold text-slate-400 uppercase">dias úteis</span>
                            </>
                          ) : (
                            <span className="text-sm font-black text-slate-400 dark:text-slate-500 italic">
                              Sem conclusões
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between text-[9px] font-bold text-slate-500">
                        <span>Dias corridos:</span>
                        <span className="text-slate-700 dark:text-slate-300">
                          {teamCapacity.averageCalendarLeadTimeDays !== null ? `${teamCapacity.averageCalendarLeadTimeDays} dias corridos` : '---'}
                        </span>
                      </div>
                    </div>

                    {/* Card 3: Atividades em Andamento & Bloqueios */}
                    <div className="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                            Em Andamento &amp; Bloqueios
                          </span>
                          <Activity size={14} className="text-sky-500" />
                        </div>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-3xl font-black text-sky-600 dark:text-sky-400 tracking-tight">
                            {teamCapacity.totalWip}
                          </span>
                          <span className="text-xs font-bold text-slate-400 uppercase">em execução</span>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between text-[9px] font-bold">
                        <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <Ban size={10} /> {teamCapacity.totalBlocked} bloqueio(s)
                        </span>
                        <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                          <AlertTriangle size={10} /> {teamCapacity.totalOverdue} atraso(s)
                        </span>
                      </div>
                    </div>

                    {/* Card 4: Entregas Concluídas */}
                    <div className="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                            Entregas Concluídas ({teamCapacity.windowWeeks} sem)
                          </span>
                          <CheckCircle2 size={14} className="text-emerald-500" />
                        </div>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                            {teamCapacity.totalConcludedDeliveries}
                          </span>
                          <span className="text-xs font-bold text-slate-400 uppercase">entregas</span>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between text-[9px] font-bold text-slate-500">
                        <span>Desde:</span>
                        <span className="text-slate-700 dark:text-slate-300">
                          {formatDisplayDate(teamCapacity.windowStartDate)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ABA 2: POR PROFISSIONAL */}
              {capacityTab === 'professionals' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {teamCapacity.professionals.map(prof => {
                      const initialLetter = prof.userName.charAt(0).toUpperCase() || 'P';
                      const nextCommitment = prof.upcomingDeliveries[0];
                      return (
                        <div
                          key={prof.userId}
                          onClick={() => setViewingUser({ id: prof.userId, name: prof.userName })}
                          className="p-5 rounded-3xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-500/30 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center space-x-3 min-w-0">
                              <div className="w-9 h-9 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-black text-sm flex items-center justify-center shrink-0">
                                {initialLetter}
                              </div>
                              <div className="min-w-0">
                                <span className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase truncate block group-hover:text-indigo-500 transition-colors">
                                  {prof.userName}
                                </span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                  {prof.openActivitiesCount} atividade(s) ativas
                                </span>
                              </div>
                            </div>
                            <Eye size={16} className="text-slate-400 group-hover:text-indigo-500 transition-colors shrink-0 mt-1" />
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`px-2.5 py-0.5 rounded-xl text-[8px] font-black uppercase tracking-wider border ${
                              prof.isWipLimitExceeded
                                ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                                : 'bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400'
                            }`}>
                              Em Andamento: {prof.inProgressCount}
                              {prof.wipLimit ? ` / Limite ${prof.wipLimit}` : ''}
                            </span>
                            {prof.blockedCount > 0 && (
                              <span className="px-2.5 py-0.5 rounded-xl text-[8px] font-black uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                                {prof.blockedCount} bloqueio(s)
                              </span>
                            )}
                            {prof.overdueCount > 0 && (
                              <span className="px-2.5 py-0.5 rounded-xl text-[8px] font-black uppercase tracking-wider bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400">
                                {prof.overdueCount} atraso(s)
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-white/60 dark:bg-slate-950/40 border border-slate-200/50 dark:border-white/5 text-[9px]">
                            <div>
                              <span className="text-slate-400 uppercase font-black block tracking-wider">Ritmo de Entregas:</span>
                              <span className="font-black text-slate-800 dark:text-slate-200 text-xs mt-0.5 block">
                                {prof.weeklyThroughput !== null ? `${prof.weeklyThroughput} ent/sem` : 'Histórico insuficiente'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 uppercase font-black block tracking-wider">Tempo Médio:</span>
                              <span className="font-black text-indigo-600 dark:text-indigo-400 text-xs mt-0.5 block">
                                {prof.averageBusinessLeadTimeDays !== null ? `${prof.averageBusinessLeadTimeDays}d úteis` : '---'}
                              </span>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-200/50 dark:border-white/5 flex items-center justify-between text-[8px] font-bold">
                            <span className="text-slate-400 uppercase tracking-wider">Próxima entrega:</span>
                            {nextCommitment ? (
                              <span className="text-slate-700 dark:text-slate-300 truncate max-w-[180px]" title={nextCommitment.name}>
                                {nextCommitment.formattedDeliveryDate} · {nextCommitment.name}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Sem compromissos agendados</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ABA 3: PLANEJAMENTO INTELIGENTE */}
              {capacityTab === 'projection' && (
                <IntelligentPlanning
                  projects={projects}
                  activities={projectActivities}
                  users={users}
                  clients={clients}
                  theme={theme}
                  todayStr={todayStr}
                  userWipLimits={userWipLimits}
                  onOpenProject={onOpenProject}
                  onOpenActivity={onOpenActivity}
                  onNavigateToTeam={onNavigateToTeam}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODO 2: VISÃO ANALÍTICA (DETALHAMENTO, HISTÓRICO, TABELAS COMPLETAS)  */}
      {/* ===================================================================== */}
      {dashboardViewMode === 'analytic' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* BLOCO 1: SAÚDE DO ESCRITÓRIO & CONFIABILIDADE DE PRAZOS (GAUGE) */}
          <div className="bg-white dark:bg-[#1e293b]/40 backdrop-blur-3xl p-10 rounded-[56px] shadow-xl border border-slate-200 dark:border-white/5 relative group overflow-hidden transition-all duration-500">
            <div className={`absolute -top-24 -right-24 w-96 h-96 blur-[120px] opacity-10 dark:opacity-20 transition-all duration-1000 ${health > 80 ? 'bg-emerald-500' : health > 40 ? 'bg-amber-500' : 'bg-rose-500'}`}></div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.8fr_1fr] gap-12 relative z-10 w-full items-center">
              {/* COLUNA ESQUERDA: GAUGE E STATUS */}
              <div className="flex flex-col items-center justify-center">
                <div className="w-full mb-6 flex justify-start">
                  <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] px-2 flex items-center">
                    Confiabilidade de Prazos
                    <InfoTooltip
                      title={healthInfo.label}
                      content={healthInfo.explanation}
                      calculation={healthInfo.calculation}
                      position="bottom"
                    />
                  </h3>
                </div>

                <HealthGauge
                  value={healthInfo.value}
                  label={healthInfo.label}
                  subtitle={healthInfo.subtitle}
                  theme={theme}
                />

                {/* STATUS HUD */}
                <div className="flex items-center justify-center space-x-3 w-full mt-8">
                  {statusConfigs.map((status) => {
                    const isActive = currentStatus === status.label;
                    const colorClass = status.color === 'emerald' ? 'text-emerald-500/80' : status.color === 'amber' ? 'text-amber-500/80' : status.color === 'orange' ? 'text-orange-500/80' : 'text-rose-500/80';
                    const dotColor = status.color === 'emerald' ? 'bg-emerald-500' : status.color === 'amber' ? 'bg-amber-500' : status.color === 'orange' ? 'bg-orange-500' : 'bg-rose-500';

                    return (
                      <div
                        key={status.label}
                        className={`flex items-center space-x-1 transition-all duration-700 ${isActive ? 'opacity-100 scale-105' : 'opacity-20 grayscale scale-90'}`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${isActive ? dotColor : 'bg-slate-400'}`} />
                        <span className={`text-[7px] font-black tracking-[0.2em] uppercase ${isActive ? colorClass : 'text-slate-400'}`}>
                          {status.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* COLUNA DIREITA: KPIs ANALÍTICOS */}
              <div className="flex flex-col space-y-3 lg:border-l lg:border-slate-100 lg:dark:border-white/5 lg:pl-10">
                {[
                  {
                    label: 'Tempo Médio para Concluir',
                    value: formatKpiLeadTimeDays(unifiedKPIs.averageLeadTimeDaysCompleted),
                    color: 'indigo',
                    icon: Clock
                  },
                  {
                    label: 'Projetos com Prazo Expirado',
                    value: `${overdueProjects.length}`,
                    color: overdueProjects.length > 0 ? 'rose' : 'slate',
                    icon: AlertTriangle
                  },
                  {
                    label: 'Atividades em Andamento',
                    value: `${unifiedKPIs.canonicalWipCount}`,
                    color: 'sky',
                    icon: Activity
                  },
                  {
                    label: 'Bloqueios Ativos',
                    value: `${unifiedKPIs.activeBlocksCount}`,
                    color: unifiedKPIs.activeBlocksCount > 0 ? 'amber' : 'slate',
                    icon: Ban
                  }
                ].map((kpi, idx) => {
                  const Icon = kpi.icon;
                  return (
                    <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 dark:bg-white/[0.02] border border-transparent hover:border-slate-200 dark:hover:border-white/10 transition-all">
                      <div className="flex items-center space-x-3.5">
                        <div className={`p-2.5 rounded-xl bg-${kpi.color}-500/10 text-${kpi.color}-500`}>
                          <Icon size={16} />
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{kpi.label}</p>
                          <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{kpi.value}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Referência Estimada de Conclusão */}
                <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-200/50 dark:border-indigo-500/20 text-[10px]">
                  <div className="flex items-center justify-between font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider mb-1">
                    <span>Referência Estimada (Little's Law)</span>
                    <Sparkles size={12} />
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 leading-snug">
                    {teamCapacity.theoreticalExplanation}
                  </p>
                  <div className="mt-2 pt-2 border-t border-indigo-200/40 dark:border-indigo-500/20 flex justify-between items-center font-black">
                    <span className="text-slate-400 uppercase text-[9px]">Capacidade Teórica:</span>
                    <span className="text-indigo-600 dark:text-indigo-400 text-xs">
                      {teamCapacity.teamTheoreticalWeeklyCapacity !== null ? `${teamCapacity.teamTheoreticalWeeklyCapacity} ent/sem` : 'Dados insuficientes'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* BLOCO 2: PREVISIBILIDADE DETALHADA DE PROJETOS */}
          <div className="bg-white dark:bg-[#1e293b]/40 backdrop-blur-3xl rounded-[40px] border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden transition-all">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/60 dark:bg-white/[0.02]">
              <div>
                <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-[0.25em] flex items-center">
                  Previsibilidade de Entrega por Projeto
                  <InfoTooltip
                    title="Previsibilidade de Entrega"
                    content="Classificação gerencial de projetos ativos baseada em prazos de entrega, atividades bloqueadas, atividades atrasadas e histórico de reprogramações."
                    calculation="Classificações: NO PRAZO · ATENÇÃO · ATRASADO · SEM DADOS SUFICIENTES"
                  />
                </h3>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Prazos, bloqueios e alertas operacionais por projeto ativo
                </p>
              </div>

              {/* Filtros e Busca */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center bg-slate-100 dark:bg-slate-900/80 p-1 rounded-2xl border border-slate-200 dark:border-slate-700/50">
                  {(['ALL', ProjectDeliveryPredictabilityStatus.OVERDUE, ProjectDeliveryPredictabilityStatus.ATTENTION, ProjectDeliveryPredictabilityStatus.ON_TRACK, ProjectDeliveryPredictabilityStatus.INSUFFICIENT_DATA] as const).map(statusKey => {
                    const count = statusKey === 'ALL'
                      ? deliveryPredictabilities.length
                      : deliveryPredictabilities.filter(p => p.status === statusKey).length;
                    const label = statusKey === 'ALL' ? 'Todos' :
                      statusKey === ProjectDeliveryPredictabilityStatus.OVERDUE ? 'Atrasados' :
                      statusKey === ProjectDeliveryPredictabilityStatus.ATTENTION ? 'Atenção' :
                      statusKey === ProjectDeliveryPredictabilityStatus.ON_TRACK ? 'No Prazo' : 'Sem Dados';
                    const isActive = predictabilityFilter === statusKey;
                    return (
                      <button
                        key={statusKey}
                        onClick={() => setPredictabilityFilter(statusKey)}
                        className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                            : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <span>{label}</span>
                        <span className={`px-1.5 py-0.2 rounded-full text-[8px] ${
                          isActive ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="relative">
                  <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar projeto..."
                    value={predictabilitySearch}
                    onChange={e => setPredictabilitySearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-xl text-[10px] font-bold bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-36 sm:w-44"
                  />
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-[420px] overflow-y-auto custom-scrollbar">
              {filteredPredictabilities.length === 0 ? (
                <div className="p-10 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Nenhum projeto encontrado para o filtro selecionado
                </div>
              ) : filteredPredictabilities.map(projectPredictability => {
                const badge = getDeliveryPredictabilityBadge(projectPredictability.status);
                return (
                  <div
                    key={projectPredictability.projectId}
                    className="px-8 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] font-black text-indigo-600 dark:text-indigo-400">
                          {projectPredictability.projectCode}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-lg border text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 ${badge.badgeBg} ${badge.badgeText} ${badge.badgeBorder}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dotColor}`} />
                          {badge.label}
                        </span>
                        {projectPredictability.reprogrammingCount > 0 && (
                          <span className="px-2 py-0.5 rounded-lg text-[8px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                            Rev.{String(projectPredictability.reprogrammingCount + 1).padStart(2, '0')}
                          </span>
                        )}
                      </div>

                      <p className="mt-1 truncate text-sm font-bold text-slate-800 dark:text-slate-200">
                        {projectPredictability.projectName}
                      </p>

                      {projectPredictability.attentionReasons.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {projectPredictability.attentionReasons.map((reason, idx) => (
                            <span
                              key={idx}
                              className={`px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider ${
                                projectPredictability.status === ProjectDeliveryPredictabilityStatus.OVERDUE
                                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                              }`}
                            >
                              ⚠ {reason}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 lg:justify-end">
                      <div className="flex flex-col items-start lg:items-end">
                        <span className="text-[8px] text-slate-400 font-bold">Prazo de Entrega</span>
                        <span className="text-slate-800 dark:text-slate-200 font-bold">
                          {projectPredictability.formattedDeliveryDate}
                          {projectPredictability.daysRemaining !== null && (
                            <strong className={`ml-1.5 ${
                              projectPredictability.isOverdue ? 'text-rose-500' :
                              projectPredictability.isNearDeadline ? 'text-amber-500' :
                              'text-emerald-500'
                            }`}>
                              ({projectPredictability.daysRemaining < 0
                                ? `Vencido há ${Math.abs(projectPredictability.daysRemaining)}d`
                                : projectPredictability.daysRemaining === 0
                                  ? 'Hoje'
                                  : `Em ${projectPredictability.daysRemaining}d`})
                            </strong>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 pl-2 border-l border-slate-200 dark:border-slate-800">
                        <div className="flex flex-col items-center">
                          <span className="text-xs font-black text-sky-600 dark:text-sky-400">
                            {projectPredictability.inProgressActivitiesCount}
                          </span>
                          <span className="text-[7px] text-slate-400 font-bold uppercase">Em Andamento</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className={`text-xs font-black ${projectPredictability.blockedActivitiesCount > 0 ? 'text-amber-500' : 'text-slate-300 dark:text-slate-700'}`}>
                            {projectPredictability.blockedActivitiesCount}
                          </span>
                          <span className="text-[7px] text-slate-400 font-bold uppercase">Bloqueadas</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className={`text-xs font-black ${projectPredictability.overdueActivitiesCount > 0 ? 'text-rose-500' : 'text-slate-300 dark:text-slate-700'}`}>
                            {projectPredictability.overdueActivitiesCount}
                          </span>
                          <span className="text-[7px] text-slate-400 font-bold uppercase">Atrasadas</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* BLOCO 3: RADAR DE PRAZOS EXPIRADOS & PRÓXIMAS ENTREGAS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* RADAR DE ATRASOS */}
            <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl rounded-[40px] shadow-sm border border-slate-200 dark:border-white/5 flex flex-col transition-all">
              <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-rose-50 dark:bg-rose-500/10 rounded-t-[40px]">
                <h3 className="font-black text-xs uppercase tracking-[0.2em] text-rose-600 dark:text-rose-500 flex items-center">
                  <AlertTriangle size={16} className="mr-3 text-rose-500 animate-pulse" />
                  Prazos Expirados
                  <InfoTooltip
                    title="Alertas de Atraso"
                    content="Projetos ativos que já ultrapassaram a data de entrega pactuada."
                    calculation="Filtro(Projetos Ativos onde Prazo < Hoje)"
                  />
                </h3>
                <span className="text-xs font-black text-rose-600 dark:text-rose-500 bg-rose-100 dark:bg-rose-500/10 px-3 py-1 rounded-full">{overdueProjects.length}</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/50 max-h-[380px] overflow-y-auto custom-scrollbar">
                {overdueProjects.length === 0 ? (
                  <div className="p-16 text-center text-slate-400 dark:text-slate-700 font-black uppercase tracking-widest text-[10px] italic opacity-50">Operação em Dia</div>
                ) : overdueProjects.map((p: Project) => (
                  <div key={p.id} className="p-6 hover:bg-rose-50 dark:hover:bg-rose-500/[0.05] transition-colors group">
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col min-w-0 pr-4">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white truncate uppercase tracking-tight group-hover:text-rose-600 dark:group-hover:text-rose-400">{p.name}</h4>
                        <p className="text-[10px] text-slate-400 font-mono font-black uppercase tracking-wider mt-1">{p.code}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-lg font-black text-rose-600 dark:text-rose-500">{p.deliveryDate?.split('-').reverse().slice(0, 2).join('/')}</span>
                        <div className="mt-1">
                          <span className="inline-block text-[8px] text-rose-600 uppercase font-black tracking-widest bg-rose-100 dark:bg-rose-500/10 px-3 py-0.5 rounded-full">ATRASO</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* PRÓXIMAS ENTREGAS */}
            <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl rounded-[40px] shadow-sm border border-slate-200 dark:border-white/5 flex flex-col transition-all">
              <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-emerald-50 dark:bg-emerald-500/10 rounded-t-[40px]">
                <h3 className="font-black text-xs uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 flex items-center">
                  <Calendar size={16} className="mr-3 text-emerald-500" />
                  Próximos 7 Dias
                  <InfoTooltip
                    title="Planejamento Semanal"
                    content="Calendário de entregas previstas para a semana atual."
                    calculation="Filtro(Projetos onde Prazo está entre Hoje e +7 dias)"
                  />
                </h3>
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 px-3 py-1 rounded-full">{upcomingProjects.length}</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/50 max-h-[380px] overflow-y-auto custom-scrollbar">
                {upcomingProjects.length === 0 ? (
                  <div className="p-16 text-center text-slate-400 dark:text-slate-700 font-black uppercase tracking-widest text-[10px] italic opacity-50">Sem Entregas Agendadas</div>
                ) : upcomingProjects.map((p: Project) => (
                  <div key={p.id} className="p-6 hover:bg-emerald-50 dark:hover:bg-emerald-500/[0.05] transition-colors group">
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col min-w-0 pr-4">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white truncate uppercase tracking-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400">{p.name}</h4>
                        <p className="text-[10px] text-slate-400 font-mono font-black uppercase tracking-wider mt-1">{p.code}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">{p.deliveryDate?.split('-').reverse().slice(0, 2).join('/')}</span>
                        <div className="mt-1">
                          <span className="inline-block text-[8px] text-emerald-600 dark:text-emerald-500/70 uppercase font-black tracking-widest bg-emerald-100 dark:bg-emerald-500/10 px-3 py-0.5 rounded-full">ENTREGA</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* BLOCO 4: CONCENTRAÇÃO DE CLIENTES & RANKING ESTRATÉGICO */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* CONCENTRAÇÃO DE CLIENTES */}
            <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl rounded-[40px] shadow-sm border border-slate-200 dark:border-white/5 flex flex-col min-h-[380px] transition-all">
              <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between rounded-t-[40px]">
                <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-900 dark:text-white flex items-center">
                  Concentração por Cliente
                  <InfoTooltip
                    title="Volume por Cliente"
                    content="Identifica a distribuição ou dependência de clientes dentro do portfólio."
                    calculation="Projetos_por_Cliente / Projetos_Totais * 100"
                  />
                </h3>
                <PieChartIcon size={18} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="p-4 flex-1 flex flex-col items-center justify-center">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={clientConcentrationData}
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                      cx="50%"
                      cy="45%"
                    >
                      {clientConcentrationData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff', border: `1px solid ${theme === 'dark' ? '#1e293b' : '#e2e8f0'}`, borderRadius: '12px', color: theme === 'dark' ? '#ffffff' : '#0f172a' }} />
                    <Legend
                      layout="horizontal"
                      align="center"
                      verticalAlign="bottom"
                      iconType="circle"
                      wrapperStyle={{
                        fontSize: '9px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        paddingTop: '15px',
                        color: theme === 'dark' ? '#64748b' : '#94a3b8'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* RANKING TOP CLIENTES */}
            <div className="lg:col-span-2 bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl rounded-[40px] shadow-sm border border-slate-200 dark:border-white/5 flex flex-col transition-all">
              <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between rounded-t-[40px]">
                <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-900 dark:text-white flex items-center">
                  Ranking Estratégico de Clientes
                  <InfoTooltip
                    title="Top Clientes"
                    content="Classificação dos clientes com maior volume de projetos registrados."
                    calculation="Contagem total de registros agrupados por Cliente"
                  />
                </h3>
                <Trophy size={18} className="text-amber-500" />
              </div>
              <div className="p-6 overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="pb-4 text-[9px] font-black text-slate-400 uppercase tracking-widest px-4">Posição</th>
                      <th className="pb-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Cliente</th>
                      <th className="pb-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right px-4">Total Projetos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {rankingTopClients.map(([name, data], idx) => (
                      <tr key={name} className="group hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="py-4 px-4">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-black text-slate-400">#{String(idx + 1).padStart(2, '0')}</span>
                            {idx === 0 && <Trophy size={14} className="text-amber-400" />}
                            {idx === 1 && <Medal size={14} className="text-slate-300" />}
                            {idx === 2 && <Medal size={14} className="text-amber-700/80" />}
                          </div>
                        </td>
                        <td className="py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">{name}</span>
                            <span className="text-[9px] font-mono font-black text-slate-400">{data.code.padStart(3, '0')}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span className="text-base font-black text-indigo-600 dark:text-indigo-400">{data.count}</span>
                        </td>
                      </tr>
                    ))}
                    {rankingTopClients.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-16 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px] italic opacity-50">Sem dados de clientes registrados</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      {
        viewingUser && (
          <UserDetailModal
            userId={viewingUser.id}
            userName={viewingUser.name}
            projects={projects}
            projectActivities={projectActivities}
            clients={clients}
            onClose={() => setViewingUser(null)}
          />
        )
      }
      {
        viewingRisk && (
          <RiskDetailModal
            type={viewingRisk.type}
            data={viewingRisk.data}
            onClose={() => setViewingRisk(null)}
            formatDate={formatDate}
          />
        )
      }
    </div >
  );
};
