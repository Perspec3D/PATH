import React, { useMemo, useState, useEffect } from 'react';
import { ProjectStatus, Project, InternalUser, Client, ProjectActivity } from '../types';
import { isProjectActivityClosed } from '../utils/projectActivityStatus';
import { AppDB, fetchProjectActivities } from '../storage';
import {
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts';
import { Info, CheckCircle2, TrendingUp, Users, Clock, AlertTriangle, Calendar, Trophy, Medal, Eye, ArrowRight, Search } from 'lucide-react';

interface DashboardProps {
  db: AppDB;
  theme?: 'dark' | 'light';
}

const HealthGauge: React.FC<{ value: number; theme?: 'dark' | 'light' }> = ({ value, theme = 'dark' }) => {
  const [displayValue, setDisplayValue] = React.useState(0);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayValue(value);
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
        <span
          className="text-4xl font-black tracking-tighter leading-none transition-colors duration-500"
          style={{ color: getInterpolatedColor(normalizedValue) }}
        >
          {Math.round(normalizedValue)}%
        </span>
        <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.4em] mt-3">
          INTEGRIDADE OPERACIONAL
        </p>
      </div>
    </div>
  );
};

const InfoTooltip: React.FC<{ title: string; content: string; calculation?: string; position?: 'top' | 'bottom' }> = ({
  title, content, calculation, position = 'top'
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block ml-2 group/info">
      <button
        type="button"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
      >
        <Info size={14} />
      </button>
      {isOpen && (
        <div className={`absolute ${position === 'top' ? 'bottom-full mb-2 slide-in-from-bottom-2' : 'top-full mt-2 slide-in-from-top-2'} left-1/2 -translate-x-1/2 p-4 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.7)] z-[200] w-72 pointer-events-none animate-in fade-in duration-200 ring-1 ring-slate-200 dark:ring-white/10`}>
          <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-2 border-b border-slate-100 dark:border-slate-800 pb-2">{title}</p>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed mb-3">{content}</p>
          {calculation && (
            <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
              <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter mb-1">Base de Cálculo:</p>
              <p className="text-[10px] text-indigo-600 dark:text-indigo-300/80 font-mono italic">{calculation}</p>
            </div>
          )}
          <div className={`absolute ${position === 'top' ? 'top-full border-t-white dark:border-t-[#0f172a]' : 'bottom-full border-b-white dark:border-b-[#0f172a]'} left-1/2 -translate-x-1/2 border-8 border-transparent`}></div>
        </div>
      )}
    </div>
  );
};
const formatDate = (dateStr?: string) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y.slice(-2)}`;
};

const UserDetailModal: React.FC<{
  userId: string;
  userName: string;
  projects: Project[];
  projectActivities: ProjectActivity[];
  clients: Client[];
  onClose: () => void;
}> = ({ userId, userName, projects, projectActivities, clients, onClose }) => {
  const titularProjects = projects.filter(p =>
    p.assigneeId === userId && [ProjectStatus.QUEUE, ProjectStatus.IN_PROGRESS, ProjectStatus.PAUSED].includes(p.status)
  );

  const userActivities = projectActivities
    .filter(activity => activity.assigneeId === userId && !isProjectActivityClosed(activity.status))
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
                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-md">REV.{p.revision || '00'}</span>
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
                    <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${activity.status === ProjectStatus.IN_PROGRESS ? 'bg-emerald-500/10 text-emerald-500' :
                      activity.status === ProjectStatus.QUEUE ? 'bg-slate-500/10 text-slate-500' :
                        'bg-purple-500/10 text-purple-500'
                      }`}>
                      {activity.status}
                    </span>
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


export const Dashboard: React.FC<DashboardProps> = ({ db, theme = 'dark' }) => {
  const formatCapacityHours = (hours: number): string => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (m === 0) return `${h}h`;
    return `${h}h${m.toString().padStart(2, '0')}`;
  };

  const [selectedWeekOffset, setSelectedWeekOffset] = useState(0);
  const [viewingUser, setViewingUser] = useState<any>(null);
  const [viewingRisk, setViewingRisk] = useState<{ type: 'inertia' | 'scale', data: any } | null>(null);
  const projects = db.projects || [];
  const users = db.users || [];
  const clients = db.clients || [];
  const [projectActivities, setProjectActivities] = useState<ProjectActivity[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);

  useEffect(() => {
    const loadActivities = async () => {
      if (!db.company?.id) return;
      setIsLoadingActivities(true);
      try {
        const data = await fetchProjectActivities(db.company.id);
        setProjectActivities(data);
      } catch (err) {
        console.error("Erro ao carregar atividades no Dashboard:", err);
      } finally {
        setIsLoadingActivities(false);
      }
    };
    loadActivities();
  }, [db.company?.id]);

  const now = new Date();
  const next7Days = new Date();
  next7Days.setDate(now.getDate() + 7);

  // 1. Métricas de Saúde
  const activeProjects = projects.filter((p: Project) =>
    [ProjectStatus.QUEUE, ProjectStatus.IN_PROGRESS, ProjectStatus.PAUSED].includes(p.status)
  );

  const overdueProjects = projects.filter((p: Project) => {
    if (!p.deliveryDate || p.status === ProjectStatus.DONE || p.status === ProjectStatus.CANCELED) return false;
    const [y, m, d] = p.deliveryDate.split('-').map(Number);
    return new Date(y, m - 1, d) < now;
  });

  const health = useMemo(() => {
    if (activeProjects.length === 0) return 100;
    const overdueWeight = overdueProjects.length / activeProjects.length;
    return Math.max(0, Math.min(100, Math.round((1 - overdueWeight) * 100)));
  }, [activeProjects, overdueProjects]);

  // 2. Projetos da Próxima Semana
  const upcomingProjects = projects.filter((p: Project) => {
    if (!p.deliveryDate || p.status === ProjectStatus.DONE || p.status === ProjectStatus.CANCELED) return false;
    const [y, m, d] = p.deliveryDate.split('-').map(Number);
    const due = new Date(y, m - 1, d);
    return due >= now && due <= next7Days;
  });

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

    projectActivities.filter(activity => !isProjectActivityClosed(activity.status)).forEach(activity => {
      const user = users.find(item => item.id === activity.assigneeId);
      if (user && matrix[user.username]) {
        matrix[user.username].activities++;
        matrix[user.username].stats[activity.status]++;
      }
    });

    return Object.entries(matrix).filter(([_, data]) => data.activities > 0);
  }, [projectActivities, users]);

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
        activity.assigneeId === u.id && !isProjectActivityClosed(activity.status)
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

    // Helper to calculate daily hours from company shift settings
    const getJourneyDailyHours = (company: any): number => {
      if (!company) return 8;
      const start = company.workStartTime || '08:00';
      const end = company.workEndTime || '18:00';
      const lunch = company.lunchDurationMinutes !== undefined ? company.lunchDurationMinutes : 60;
      
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      if (isNaN(sh) || isNaN(eh)) return 8;
      
      const startMins = sh * 60 + (sm || 0);
      const endMins = eh * 60 + (em || 0);
      const totalMins = endMins - startMins;
      const netMins = totalMins - lunch;
      return Math.max(0, netMins / 60);
    };

    // 10. Capacidade Operacional da Equipe (Semanal com Previsibilidade)
    const activeUsers_Capacity = users.filter(u => u.isActive);

    let teamCapacity;
    if (activeUsers_Capacity.length === 0) {
      teamCapacity = {
        percentage: 0,
        occupied: 0,
        total: 0,
        userDetails: [],
        weekRange: { start: '--/--', end: '--/--' }
      };
    } else {
      // Base de cálculo ajustada: se hoje é Sab(6) ou Dom(0), a semana 0 começa na próxima Segunda
      const baseDate = new Date(now);
      const currentDay = baseDate.getDay();

      // Ajuste para garantir que a S0 comece na segunda-feira atual ou na próxima (se fds)
      const startOfS0 = new Date(baseDate);
      const diffToMonday = currentDay === 0 ? 1 : (currentDay === 6 ? 2 : 1 - currentDay);
      startOfS0.setDate(baseDate.getDate() + diffToMonday);
      startOfS0.setHours(0, 0, 0, 0);

      // Range da semana selecionada (Offset 0 a 4) - cobrindo a semana cheia (Segunda a Domingo)
      const startOfWeek = new Date(startOfS0);
      startOfWeek.setDate(startOfS0.getDate() + (selectedWeekOffset * 7));
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6); // Domingo
      endOfWeek.setHours(23, 59, 59, 999);

      const today = new Date(now);
      today.setHours(0, 0, 0, 0);

      // Configuração de jornada do workspace
      const companyWorkDays = db.company?.workDays || [1, 2, 3, 4, 5];
      const dailyHours = getJourneyDailyHours(db.company);

      // Calcular dias e horas disponíveis para o período
      let availableDaysInPeriod = 0;
      let dayCheck = new Date(startOfWeek);
      while (dayCheck <= endOfWeek) {
        const dow = dayCheck.getDay();
        if (companyWorkDays.includes(dow)) {
          if (selectedWeekOffset > 0) {
            availableDaysInPeriod++;
          } else {
            // Semana atual: apenas dias de hoje em diante (contando hoje por inteiro)
            if (dayCheck >= today) {
              availableDaysInPeriod++;
            }
          }
        }
        dayCheck.setDate(dayCheck.getDate() + 1);
      }

      const userAvailableHours = availableDaysInPeriod * dailyHours;
      const totalAvailableHoursTeam = activeUsers_Capacity.length * userAvailableHours;

      let totalOccupiedHoursTeam = 0;

      const userDetails = activeUsers_Capacity.map(u => {
        let userPlannedHours = 0;
        let unestimatedActivitiesCount = 0;

        // Tooltip detail info collection for this user
        const detailList: { projectCode: string; activityName: string; hours: number; start: string; end: string }[] = [];

        projectActivities.forEach(pa => {
          // Filtrar apenas se for do usuário
          if (pa.assigneeId !== u.id) return;
          // Capacidade representa apenas demanda futura/aberta.
          if (isProjectActivityClosed(pa.status)) return;
          // Ignorar se não possuir datas planejadas
          if (!pa.startDate || !pa.deliveryDate) return;

          // Se a estimativa for nula ou indefinida, é sinalizada como Sem Estimativa
          if (pa.estimatedDurationHours === undefined || pa.estimatedDurationHours === null) {
            const actStart = new Date(pa.startDate + 'T00:00:00');
            const actEnd = new Date(pa.deliveryDate + 'T23:59:59');
            const overlapStart = actStart > startOfWeek ? actStart : startOfWeek;
            const overlapEnd = actEnd < endOfWeek ? actEnd : endOfWeek;
            if (overlapStart <= overlapEnd) {
              unestimatedActivitiesCount++;
            }
            return;
          }

          const estHours = pa.estimatedDurationHours;

          // 1. Encontrar o número total de dias úteis da atividade dentro de seu intervalo planejado
          const actStart = new Date(pa.startDate + 'T00:00:00');
          const actEnd = new Date(pa.deliveryDate + 'T23:59:59');

          let totalActivityWorkDays = 0;
          let tempDay = new Date(actStart);
          while (tempDay <= actEnd) {
            const dow = tempDay.getDay();
            if (companyWorkDays.includes(dow)) {
              totalActivityWorkDays++;
            }
            tempDay.setDate(tempDay.getDate() + 1);
          }

          if (totalActivityWorkDays === 0) return;

          const dailyLoad = estHours / totalActivityWorkDays;

          // 2. Distribuir a carga pelos dias do intervalo que caem na semana selecionada e que são >= hoje (se for S0)
          const effectiveCountStart = (selectedWeekOffset === 0 && today > startOfWeek) ? today : startOfWeek;
          const overlapStart = actStart > effectiveCountStart ? actStart : effectiveCountStart;
          const overlapEnd = actEnd < endOfWeek ? actEnd : endOfWeek;

          let userActivityDaysInSelectedWeek = 0;
          if (overlapStart <= overlapEnd) {
            let dayRunner = new Date(overlapStart);
            while (dayRunner <= overlapEnd) {
              const dow = dayRunner.getDay();
              if (companyWorkDays.includes(dow)) {
                userActivityDaysInSelectedWeek++;
              }
              dayRunner.setDate(dayRunner.getDate() + 1);
            }
          }

          const hoursInSelectedWeek = userActivityDaysInSelectedWeek * dailyLoad;
          userPlannedHours += hoursInSelectedWeek;

          if (hoursInSelectedWeek > 0) {
            const parentProject = projects.find(p => p.id === pa.projectId);
            detailList.push({
              projectCode: parentProject?.code || 'ATIVIDADES',
              activityName: pa.name,
              hours: hoursInSelectedWeek,
              start: pa.startDate,
              end: pa.deliveryDate
            });
          }
        });

        totalOccupiedHoursTeam += userPlannedHours;

        return {
          id: u.id,
          name: u.username,
          occupied: userPlannedHours,
          backlog: userPlannedHours,
          total: userAvailableHours,
          percentage: userAvailableHours > 0 ? Math.round((userPlannedHours / userAvailableHours) * 100) : 0,
          unestimatedCount: unestimatedActivitiesCount,
          details: detailList
        };
      });

      teamCapacity = {
        percentage: totalAvailableHoursTeam > 0 ? Math.round((totalOccupiedHoursTeam / totalAvailableHoursTeam) * 100) : 0,
        occupied: totalOccupiedHoursTeam,
        total: totalAvailableHoursTeam,
        userDetails,
        weekRange: {
          start: startOfWeek.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          end: endOfWeek.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        }
      };
    }

    return {
      inertia: inertiaRiskProjects.length,
      inertiaDetails: inertiaRiskProjects,
      fragmentation: fragmentedUsers.length,
      fragmentationDetails: fragmentedUsers,
      overloaded: overloadedUsers.length,
      overloadedDetails: overloadedUsers,
      conflicts: conflictUsers.length,
      conflictDetails: conflictUsers,
      throughput: { factor: throughputFactor, created: createdLast7, done: doneLast7 },
      teamCapacity
    };
  }, [projects, activeProjects, users, selectedWeekOffset, projectActivities]);

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

  return (
    <div id="dashboard-content" className="space-y-8 animate-in fade-in duration-700 pb-12 relative">
      {/* BACKGROUND DE ALTA TECNOLOGIA */}
      <div className="fixed inset-0 pointer-events-none opacity-20 dark:opacity-20 overflow-hidden z-[-1]">
        <div className="absolute inset-0 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px]"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-transparent to-slate-50 dark:from-[#0f172a] dark:via-transparent dark:to-[#0f172a]"></div>
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 3px, transparent 3px)' }}></div>
      </div>

      {/* SEÇÃO 1: SAÚDE DO ESCRITÓRIO */}
      <div className="bg-white dark:bg-[#1e293b]/40 backdrop-blur-3xl p-12 rounded-[56px] shadow-xl dark:shadow-[0_0_80px_rgba(0,0,0,0.4)] border border-slate-200 dark:border-white/5 relative group overflow-hidden transition-all duration-500">
        {/* AURA DE SAÚDE DINÂMICA */}
        <div className={`absolute -top-24 -right-24 w-96 h-96 blur-[120px] opacity-10 dark:opacity-20 transition-all duration-1000 ${health > 80 ? 'bg-emerald-500' : health > 40 ? 'bg-amber-500' : 'bg-rose-500'}`}></div>

        <div className="absolute top-0 right-0 p-12 opacity-[0.03] dark:opacity-5 pointer-events-none transition-opacity group-hover:opacity-10 scale-150">
          <TrendingUp className="w-48 h-48 text-indigo-500" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.8fr_1fr] gap-12 relative z-10 w-full items-center">
          {/* COLUNA ESQUERDA: GAUGE E STATUS */}
          <div className="flex flex-col items-center justify-center">
            <div className="w-full mb-8 flex justify-start">
              <h3 className="text-[12px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] px-2 flex items-center transition-colors">
                Saúde Estratégica
                <InfoTooltip
                  title="Saúde da Operação"
                  content="Métrica de integridade que reflete a pontualidade das entregas ativas. Quanto maior a porcentagem, menos atrasos críticos existem no sistema."
                  calculation="(Total_Ativos - Total_Atrasados) / Total_Ativos * 100"
                  position="bottom"
                />
              </h3>
            </div>

            <HealthGauge value={health} theme={theme} />

            {/* STATUS HUD DISCRETO */}
            <div className="flex items-center justify-center space-x-3 w-full mt-10">
              {statusConfigs.map((status) => {
                const isActive = currentStatus === status.label;
                const colorClass = status.color === 'emerald' ? 'text-emerald-500/80' : status.color === 'amber' ? 'text-amber-500/80' : status.color === 'orange' ? 'text-orange-500/80' : 'text-rose-500/80';
                const dotColor = status.color === 'emerald' ? 'bg-emerald-500' : status.color === 'amber' ? 'bg-amber-500' : status.color === 'orange' ? 'bg-orange-500' : 'bg-rose-500';

                return (
                  <div
                    key={status.label}
                    className={`flex items-center space-x-1 transition-all duration-700 ${isActive ? 'opacity-100 scale-105' : 'opacity-15 grayscale scale-90'}`}
                  >
                    <div className={`w-1 h-1 rounded-full ${isActive ? `${dotColor} shadow-[0_0_10px_rgba(16,185,129,0.5)]` : 'bg-slate-400'}`} />
                    <span className={`text-[6.5px] font-black tracking-[0.2em] uppercase ${isActive ? colorClass : 'text-slate-400'}`}>
                      {status.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* COLUNA DIREITA: KPIs EMPILHADOS */}
          <div className="flex flex-col space-y-4 lg:border-l lg:border-slate-100 lg:dark:border-white/5 lg:pl-12 transition-colors">
            {[
              { label: 'Ciclo Médio', value: `${avgExecutionTime} dias`, color: 'indigo', icon: Clock },
              { label: 'Prazos Expirados', value: `${overdueProjects.length}`, color: 'rose', icon: AlertTriangle },
              { label: 'Em Aberto', value: `${activeProjects.length}`, color: 'amber', icon: Eye },
              { label: 'Concluídos', value: `${projects.filter(p => p.status === ProjectStatus.DONE).length}`, color: 'emerald', icon: CheckCircle2 }
            ].map((kpi, idx) => {
              const Icon = kpi.icon;
              return (
                <div key={idx} className="group/kpi flex items-center justify-between p-5 rounded-3xl bg-slate-50/50 dark:bg-white/[0.02] border border-transparent hover:border-slate-200 dark:hover:border-white/10 transition-all">
                  <div className="flex items-center space-x-4">
                    <div className={`p-3 rounded-2xl bg-${kpi.color}-500/10 text-${kpi.color}-500 group-hover/kpi:scale-110 transition-transform`}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{kpi.label}</p>
                      <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{kpi.value}</p>
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-slate-300 dark:text-slate-700 opacity-0 group-hover/kpi:opacity-100 transition-all -translate-x-2 group-hover/kpi:translate-x-0" />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* SEÇÃO 2: INTELIGÊNCIA DE GESTÃO (DASHBOARD 2.0) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* VAZÃO OPERACIONAL */}
        <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl p-8 rounded-[40px] border border-slate-200 dark:border-white/5 relative group transition-all duration-300 shadow-sm dark:shadow-none">
          <div className="absolute inset-0 rounded-[40px] overflow-hidden pointer-events-none">
            <div className="absolute -bottom-4 -right-4 opacity-[0.03] dark:opacity-5 group-hover:opacity-10 transition-opacity">
              <TrendingUp size={100} />
            </div>
          </div>
          <div className="relative z-10">
            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center transition-colors">
              Vazão Operacional
              <InfoTooltip title="Efficiency Throughput" content="Saldo de projetos concluídos vs criados nos últimos 7 dias. Um saldo negativo indica que a carga de trabalho está crescendo mais rápido que as entregas." />
            </h4>
            <div className="flex items-end space-x-4">
              <span className={`text-5xl font-black transition-colors ${dashboard2Logics.throughput.factor >= 1 ? 'text-emerald-500' : 'text-amber-500'}`}>
                {Math.round(dashboard2Logics.throughput.factor * 100)}%
              </span>
              <div className="flex flex-col pb-1">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase transition-colors">{dashboard2Logics.throughput.done} entregas</span>
                <span className="text-[10px] font-black text-slate-300 dark:text-slate-400 uppercase transition-colors">vs {dashboard2Logics.throughput.created} novos</span>
              </div>
            </div>
          </div>
        </div>

        {/* RISCO DE INÉRCIA */}
        <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl p-8 rounded-[40px] border border-slate-200 dark:border-white/5 relative group text-center lg:text-left transition-all duration-300 shadow-sm dark:shadow-none">
          <div className="absolute inset-0 rounded-[40px] overflow-hidden pointer-events-none">
            <div className="absolute -bottom-2 -right-2 opacity-[0.03] dark:opacity-5 group-hover:opacity-10 transition-opacity">
              <Clock size={80} />
            </div>
          </div>
          <div className="relative z-10">
            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center justify-between transition-colors">
              <span className="flex items-center">
                Risco de Inércia
                <InfoTooltip title="Inertia Alert" content="Projetos que têm entrega em menos de 48 horas e ainda permanecem no status 'Fila'. Exige mobilização imediata do time." />
              </span>
              <button
                onClick={() => setViewingRisk({ type: 'inertia', data: dashboard2Logics })}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg text-slate-400 hover:text-indigo-500 transition-all flex items-center space-x-1 grayscale hover:grayscale-0"
              >
                <Search size={12} />
                <span className="text-[8px] font-black uppercase">Rastrear</span>
              </button>
            </h4>
            <div className="flex flex-col lg:flex-row items-center space-y-4 lg:space-y-0 lg:space-x-6">
              <span className={`text-5xl font-black transition-colors ${dashboard2Logics.inertia > 0 ? 'text-rose-500 animate-pulse' : 'text-slate-200 dark:text-slate-700'}`}>
                {dashboard2Logics.inertia}
              </span>
              <p className="text-[11px] font-bold text-slate-400 dark:text-slate-400 uppercase leading-tight transition-colors">
                {dashboard2Logics.inertia === 1 ? 'Projeto pendente' : 'Projetos pendentes'} <br />em fila crítica
              </p>
            </div>
          </div>
        </div>

        {/* ÍNDICE DE RISCOS DE ESCALA */}
        <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl p-8 rounded-[40px] border border-slate-200 dark:border-white/5 relative group transition-all duration-300 shadow-sm dark:shadow-none">
          <div className="absolute inset-0 rounded-[40px] overflow-hidden pointer-events-none">
            <div className="absolute -bottom-2 -right-2 opacity-[0.03] dark:opacity-5 group-hover:opacity-10 transition-opacity">
              <Users size={80} />
            </div>
          </div>
          <div className="relative z-10">
            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center justify-between transition-colors">
              <span className="flex items-center">
                Riscos de Escala
                <InfoTooltip title="Análise de Carga" content="Fragmentação: Profissionais com >3 projetos (dispersão). Sobrecarga: Profissionais com >5 tarefas ativas (excesso de volume). Conflito: Sobreposição temporal real entre projetos." />
              </span>
              <button
                onClick={() => setViewingRisk({ type: 'scale', data: dashboard2Logics })}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg text-slate-400 hover:text-amber-500 transition-all flex items-center space-x-1 grayscale hover:grayscale-0"
              >
                <Search size={12} />
                <span className="text-[8px] font-black uppercase">Rastrear</span>
              </button>
            </h4>
            <div className="flex items-center justify-between">
              <div className="flex flex-col items-center">
                <span className={`text-3xl font-black transition-colors ${dashboard2Logics.fragmentation > 0 ? 'text-amber-500' : 'text-slate-200 dark:text-slate-800'}`}>
                  {dashboard2Logics.fragmentation}
                </span>
                <p className="text-[7px] font-black text-slate-400 dark:text-slate-500 uppercase mt-1 tracking-widest text-center transition-colors">Filtro</p>
              </div>
              <div className="flex flex-col items-center">
                <span className={`text-3xl font-black transition-colors ${dashboard2Logics.overloaded > 0 ? 'text-orange-500' : 'text-slate-200 dark:text-slate-800'}`}>
                  {dashboard2Logics.overloaded}
                </span>
                <p className="text-[7px] font-black text-slate-400 dark:text-slate-500 uppercase mt-1 tracking-widest text-center transition-colors">Carga</p>
              </div>
              <div className="flex flex-col items-center">
                <span className={`text-3xl font-black transition-colors ${dashboard2Logics.conflicts > 0 ? 'text-rose-500' : 'text-slate-200 dark:text-slate-800'}`}>
                  {dashboard2Logics.conflicts}
                </span>
                <p className="text-[7px] font-black text-slate-400 dark:text-slate-500 uppercase mt-1 tracking-widest text-center transition-colors">Conflito</p>
              </div>
            </div>
          </div>
        </div>

        {/* --- CARD EXPANDIDO: CAPACIDADE OPERACIONAL PREVISIVA --- */}
        <div className="lg:col-span-3 bg-white dark:bg-[#1e293b]/40 backdrop-blur-3xl p-10 rounded-[48px] border border-slate-200 dark:border-white/10 shadow-xl dark:shadow-2xl relative group overflow-hidden transition-all duration-500">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all duration-1000"></div>

          <div className="relative z-10">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-10">
              <div>
                <h3 className="text-[12px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.4em] mb-2 px-2 flex items-center transition-colors">
                  Capacidade Operacional da Equipe
                  <InfoTooltip
                    title="Saturação da Equipe"
                    content="Percentual de ocupação baseado na jornada regular configurada para o Workspace. Soma as horas estimadas de todas as atividades ativas alocadas na semana selecionada."
                    calculation="(Horas_Planejadas_Semana / Horas_Disponíveis_Semana) * 100"
                    position="bottom"
                  />
                </h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest px-2 transition-colors">Sincronizado com Ciclo Médio de {avgExecutionTime} dias</p>
              </div>
 
              {/* Seletor de Semanas */}
              <div className="flex bg-slate-100 dark:bg-slate-900/80 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700/50 shadow-inner transition-colors duration-500">
                {[0, 1, 2, 3, 4].map(w => (
                  <button
                    key={w}
                    onClick={() => setSelectedWeekOffset(w)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all flex flex-col items-center min-w-[64px] ${selectedWeekOffset === w
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                      }`}
                  >
                    <span>{w === 0 ? 'Atual' : `Sêman. ${w}`}</span>
                  </button>
                ))}
              </div>
            </div>
 
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              {/* Resumo Global */}
              <div className="lg:col-span-5 flex items-center space-x-8 border-r border-slate-100 dark:border-slate-800/50 pr-8 transition-colors duration-500">
                <div className="relative">
                  <svg className="w-32 h-32 transform -rotate-90 drop-shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                    <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-100 dark:text-slate-800 transition-colors" />
                    <circle
                      cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="12" fill="transparent"
                      className={`transition-all duration-1000 ${dashboard2Logics.teamCapacity.percentage > 100 ? 'text-rose-500' :
                        dashboard2Logics.teamCapacity.percentage > 95 ? 'text-orange-500' :
                          dashboard2Logics.teamCapacity.percentage > 80 ? 'text-amber-500' :
                            'text-emerald-500'
                        }`}
                      strokeDasharray={351.8}
                      strokeDashoffset={351.8 - (351.8 * Math.min(100, dashboard2Logics.teamCapacity.percentage)) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black text-slate-900 dark:text-white transition-colors">{dashboard2Logics.teamCapacity.percentage}%</span>
                    <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter transition-colors">Global</span>
                  </div>
                </div>
 
                <div className="flex-1 space-y-4">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest transition-colors">Ocupação</span>
                    <span className="text-xl font-black text-slate-900 dark:text-white transition-colors">
                      {formatCapacityHours(dashboard2Logics.teamCapacity.occupied)}{' '}
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">planejadas</span>
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest transition-colors">Disponível</span>
                    <span className="text-xl font-black text-slate-300 dark:text-slate-700 transition-colors">
                      {formatCapacityHours(dashboard2Logics.teamCapacity.total)}{' '}
                      <span className="text-[10px] opacity-40 font-bold uppercase tracking-wider">regulares</span>
                    </span>
                  </div>
                  <div className={`text-center py-2 px-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border shadow-sm transition-all ${dashboard2Logics.teamCapacity.percentage > 100 ? 'bg-rose-500/10 text-rose-500 border-rose-500/20 animate-pulse' :
                    dashboard2Logics.teamCapacity.percentage > 95 ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                      dashboard2Logics.teamCapacity.percentage > 80 ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                        'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    }`}>
                    {dashboard2Logics.teamCapacity.percentage > 100 ? 'Sobrecarga Crítica' :
                      dashboard2Logics.teamCapacity.percentage > 95 ? 'Limite de Segurança' :
                        dashboard2Logics.teamCapacity.percentage > 80 ? 'Atenção Necessária' :
                          'Fluxo Saudável'}
                  </div>
                </div>
              </div>
 
              {/* Detalhamento por Usuário */}
              <div className="lg:col-span-7">
                <div className="flex items-center justify-between mb-6">
                  <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest transition-colors">Análise Individual ({dashboard2Logics.teamCapacity.weekRange.start} - {dashboard2Logics.teamCapacity.weekRange.end})</p>
                  <p className="text-[9px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest transition-colors">Capacidade / Semana</p>
                </div>
                <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                  {dashboard2Logics.teamCapacity.userDetails.map((u: any) => {
                    const tooltipContent = u.details && u.details.length > 0
                      ? u.details.map((d: any) => `[${d.projectCode}] ${d.activityName}: ${formatCapacityHours(d.hours)} (${d.start} a ${d.end})`).join('\n')
                      : 'Sem atividades planejadas';
                    return (
                      <div key={u.id} className="group/user" title={tooltipContent}>
                        <div className="flex justify-between items-end mb-2">
                          <div className="flex flex-col">
                            <span className="text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase truncate pr-4 transition-colors">{u.name}</span>
                            <span className="text-[8px] text-slate-450 dark:text-slate-500 font-bold uppercase mt-0.5 flex flex-wrap gap-2 items-center">
                              <span>{formatCapacityHours(u.occupied)} / {formatCapacityHours(u.total)}</span>
                              {u.unestimatedCount > 0 && (
                                <span className="text-amber-500 font-black flex items-center gap-0.5">
                                  <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                  {u.unestimatedCount} sem estimativa
                                </span>
                              )}
                            </span>
                          </div>
                          <span className={`text-[10px] font-black ${u.percentage > 100 ? 'text-rose-500' : u.percentage > 80 ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'
                            } transition-colors`}>{u.percentage}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden border border-slate-200 dark:border-white/5 transition-colors duration-500">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ${u.percentage > 100 ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.3)]' :
                              u.percentage > 80 ? 'bg-amber-500' :
                                'bg-slate-300 dark:bg-slate-700 group-hover/user:bg-indigo-500'
                              }`}
                            style={{ width: `${Math.min(100, u.percentage)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {dashboard2Logics.teamCapacity.userDetails.length === 0 && (
                    <div className="col-span-2 text-center py-4 text-slate-300 dark:text-slate-700 italic text-[10px] font-black uppercase tracking-widest opacity-40">Sem dados de alocação para este período</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>


      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* TENDÊNCIA DE PRODUÇÃO - NOVO */}
        <div className="lg:col-span-2 bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl rounded-[40px] shadow-sm dark:shadow-2xl border border-slate-200 dark:border-white/5 flex flex-col min-h-[400px] transition-all duration-500">
          <div className="px-10 py-8 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between rounded-t-[40px] transition-colors">
            <h3 className="font-black text-[12px] uppercase tracking-[0.25em] text-slate-900 dark:text-white flex items-center transition-colors">
              Tendência de Fluxo
              <InfoTooltip
                title="Entradas vs Saídas"
                content="Analisa o fluxo de trabalho comparando novos registros com projetos finalizados ao longo do semestre."
                calculation="Projetos_Criados_Mes vs Projetos_Done_Mes"
              />
            </h3>
            <TrendingUp size={20} className="text-indigo-600 dark:text-indigo-500" />
          </div>
          <div className="p-8 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTimeline} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={theme === 'dark' ? 0.3 : 0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorDone" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={theme === 'dark' ? 0.3 : 0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#2a374a' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: theme === 'dark' ? '#64748b' : '#94a3b8', fontSize: 10, fontWeight: 900 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: theme === 'dark' ? '#64748b' : '#94a3b8', fontSize: 10, fontWeight: 900 }} />
                <RechartsTooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff', border: `1px solid ${theme === 'dark' ? '#1e293b' : '#e2e8f0'}`, borderRadius: '12px', color: theme === 'dark' ? '#ffffff' : '#0f172a' }} />
                <Area type="monotone" dataKey="created" name="Criados" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorCreated)" />
                <Area type="monotone" dataKey="done" name="Concluídos" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorDone)" />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', textTransform: 'uppercase', fontWeight: 900, color: theme === 'dark' ? '#64748b' : '#94a3b8' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CONCENTRAÇÃO DE CLIENTES - NOVO */}
        <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl rounded-[40px] shadow-sm dark:shadow-2xl border border-slate-200 dark:border-white/5 flex flex-col min-h-[400px] transition-all duration-500">
          <div className="px-10 py-8 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between rounded-t-[40px] transition-colors">
            <h3 className="font-black text-[12px] uppercase tracking-[0.25em] text-slate-900 dark:text-white flex items-center transition-colors">
              Concentração
              <InfoTooltip
                title="Volume por Cliente"
                content="Identifica a pulverização ou dependência de clientes específicos dentro do portfólio."
                calculation="Projetos_por_Cliente / Projetos_Totais * 100"
              />
            </h3>
            <PieChart size={20} className="text-indigo-600 dark:text-indigo-500" />
          </div>
          <div className="p-4 flex-1 flex flex-col items-center justify-center min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={clientConcentrationData}
                  innerRadius={60}
                  outerRadius={80}
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
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    paddingTop: '20px',
                    color: theme === 'dark' ? '#64748b' : '#94a3b8'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* CARGA ATIVA POR USUÁRIO */}
        <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl rounded-[40px] shadow-sm dark:shadow-2xl border border-slate-200 dark:border-white/5 flex flex-col transition-all duration-500">
          <div className="px-10 py-8 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between rounded-t-[40px] transition-colors">
            <h3 className="font-black text-[12px] uppercase tracking-[0.25em] text-slate-900 dark:text-white flex items-center transition-colors">
              Carga Ativa por Usuário
              <InfoTooltip
                title="Distribuição de Status"
                content="Visão em tempo real da alocação do time, separando o que está parado, o que está em produção e o que aguarda início."
                calculation="Agrupamento(Status) por Usuário"
              />
            </h3>
            <Users size={20} className="text-indigo-600 dark:text-indigo-500" />
          </div>
          <div className="p-10 flex-1 overflow-y-auto max-h-[400px] custom-scrollbar">
            <div className="space-y-10">
              {userStatusMatrix.map(([name, data]) => {
                const totalItems = data.activities;

                return (
                  <div key={name} className="group">
                    <div className="flex justify-between items-end mb-4">
                      <div className="flex flex-col">
                        <div className="flex items-center space-x-2 group-hover:translate-x-1 transition-transform">
                          <span className="text-[11px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-[0.2em] transition-colors group-hover:text-indigo-600 dark:group-hover:text-indigo-400 mb-0">{name}</span>
                          <button
                            onClick={() => setViewingUser(data)}
                            className="p-1 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-md hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          >
                            <Eye size={12} />
                          </button>
                        </div>
                        <div className="flex items-center space-x-3 mt-3">
                          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg border border-indigo-100 dark:border-indigo-500/20">
                            <span className="text-[11px] font-black text-indigo-700 dark:text-indigo-300">{totalItems}</span>
                            <span className="text-[8px] font-bold text-indigo-600 dark:text-indigo-400/70 uppercase tracking-widest">{totalItems === 1 ? 'Atividade' : 'Atividades'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <span className="text-[14px] font-black text-slate-900 dark:text-white transition-colors leading-none">{totalItems}</span>
                        <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Total Ativo</span>
                      </div>
                    </div>
                    <div className="h-4 w-full flex rounded-xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-inner dark:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] bg-slate-50 dark:bg-slate-900/40 p-0.5 transition-colors duration-500">
                      <div className="bg-slate-300 dark:bg-slate-700/60 h-full rounded-l-lg transition-all duration-700 hover:brightness-110 dark:hover:brightness-125 border-r border-white/5" style={{ width: `${(data.stats[ProjectStatus.QUEUE] / totalItems) * 100}%` }}></div>
                      <div className="bg-indigo-600 h-full transition-all duration-700 hover:brightness-110 dark:hover:brightness-125 shadow-lg border-r border-white/5" style={{ width: `${(data.stats[ProjectStatus.IN_PROGRESS] / totalItems) * 100}%` }}></div>
                      <div className="bg-purple-600 h-full rounded-r-lg transition-all duration-700 hover:brightness-110 dark:hover:brightness-125" style={{ width: `${(data.stats[ProjectStatus.PAUSED] / totalItems) * 100}%` }}></div>
                    </div>
                  </div>
                );
              })}
              {userStatusMatrix.length === 0 && (
                <div className="h-64 flex flex-col items-center justify-center text-slate-400 font-black uppercase text-[12px] tracking-widest italic opacity-40">Sem colaboradores ativos</div>
              )}
            </div>
            <div className="mt-12 flex justify-center space-x-8 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-3xl border border-slate-200 dark:border-slate-800/80 transition-colors duration-500">
              <div className="flex items-center transition-colors"><div className="w-3 h-3 bg-slate-300 dark:bg-slate-700 rounded-full mr-3 border border-slate-200 dark:border-white/10"></div><span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Fila</span></div>
              <div className="flex items-center"><div className="w-3 h-3 bg-indigo-600 rounded-full mr-3 shadow-[0_0_8px_rgba(79,70,229,0.4)]"></div><span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Andamento</span></div>
              <div className="flex items-center"><div className="w-3 h-3 bg-purple-600 rounded-full mr-3 shadow-[0_0_8px_rgba(147,51,234,0.4)]"></div><span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Pausado</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* RADAR DE ATRASOS */}
        <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl rounded-[40px] shadow-sm dark:shadow-2xl border border-slate-200 dark:border-white/5 flex flex-col transition-all duration-500">
          <div className="px-10 py-8 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-rose-50 dark:bg-rose-500/10 rounded-t-[40px] transition-colors">
            <h3 className="font-black text-[12px] uppercase tracking-[0.2em] text-rose-600 dark:text-rose-500 flex items-center transition-colors">
              <AlertTriangle size={16} className="mr-4 text-rose-500 animate-pulse" />
              Prazos Expirados
              <InfoTooltip
                title="Alertas de Atraso"
                content="Identifica projetos ativos que já ultrapassaram a data de entrega pactuada, exigindo atenção imediata."
                calculation="Filtro(Active_Projects onde Delivery_Date < Hoje)"
              />
            </h3>
            <span className="text-sm font-black text-rose-600 dark:text-rose-500 bg-rose-100 dark:bg-rose-500/10 px-4 py-1.5 rounded-full ring-1 ring-rose-300 dark:ring-rose-500/30 transition-colors">{overdueProjects.length}</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/50 max-h-[450px] overflow-y-auto custom-scrollbar transition-colors">
            {overdueProjects.length === 0 ? (
              <div className="p-20 text-center text-slate-400 dark:text-slate-700 font-black uppercase tracking-widest text-[11px] italic opacity-40">Operação em Dia</div>
            ) : overdueProjects.map((p: Project) => (
              <div key={p.id} className="p-10 hover:bg-rose-50 dark:hover:bg-rose-500/[0.05] transition-colors group">
                <div className="flex justify-between items-center">
                  <div className="flex flex-col min-w-0 pr-4">
                    <h4 className="text-base font-black text-slate-900 dark:text-white truncate uppercase tracking-tighter group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">{p.name}</h4>
                    <p className="text-[12px] text-slate-400 dark:text-slate-500 font-mono font-black uppercase tracking-[0.1em] mt-2 transition-colors">{p.code}</p>
                  </div>
                  <div className="text-right shrink-0 pl-6">
                    <span className="text-xl font-black text-rose-600 dark:text-rose-500 drop-shadow-[0_0_10px_rgba(244,63,94,0.3)] transition-colors">{p.deliveryDate?.split('-').reverse().slice(0, 2).join('/')}</span>
                    <div className="mt-2 text-right">
                      <span className="inline-block text-[9px] text-rose-600 uppercase font-black tracking-widest bg-rose-100 dark:bg-rose-500/10 px-4 py-1.5 rounded-full ring-1 ring-rose-200 dark:ring-rose-500/20 transition-colors">ATRASO</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* PRÓXIMAS ENTREGAS */}
        <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl rounded-[40px] shadow-sm dark:shadow-2xl border border-slate-200 dark:border-white/5 flex flex-col transition-all duration-500">
          <div className="px-10 py-8 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-emerald-50 dark:bg-emerald-500/10 rounded-t-[40px] transition-colors">
            <h3 className="font-black text-[12px] uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 flex items-center transition-colors">
              <Calendar size={16} className="mr-4 text-emerald-500" />
              Próximos 7 Dias
              <InfoTooltip
                title="Planejamento Semanal"
                content="Calendário de entregas previstas para a semana atual, para organização da carga de faturamento e revisão."
                calculation="Filtro(Projetos onde Delivery_Date está entre Hoje e +7 dias)"
              />
            </h3>
            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 px-4 py-1.5 rounded-full ring-1 ring-emerald-300 dark:ring-emerald-500/30 transition-colors">{upcomingProjects.length}</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/50 max-h-[450px] overflow-y-auto custom-scrollbar transition-colors">
            {upcomingProjects.length === 0 ? (
              <div className="p-20 text-center text-slate-400 dark:text-slate-700 font-black uppercase tracking-widest text-[11px] italic opacity-40">Sem Entregas Agendadas</div>
            ) : upcomingProjects.map((p: Project) => (
              <div key={p.id} className="p-10 hover:bg-emerald-50 dark:hover:bg-emerald-500/[0.05] transition-colors group">
                <div className="flex justify-between items-center">
                  <div className="flex flex-col min-w-0 pr-4">
                    <h4 className="text-base font-black text-slate-900 dark:text-white truncate uppercase tracking-tighter group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{p.name}</h4>
                    <p className="text-[12px] text-slate-400 dark:text-slate-500 font-mono font-black uppercase tracking-[0.1em] mt-2 transition-colors">{p.code}</p>
                  </div>
                  <div className="text-right shrink-0 pl-6">
                    <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-colors">{p.deliveryDate?.split('-').reverse().slice(0, 2).join('/')}</span>
                    <div className="mt-2 text-right">
                      <span className="inline-block text-[9px] text-emerald-600 dark:text-emerald-500/70 uppercase font-black tracking-widest bg-emerald-100 dark:bg-emerald-500/10 px-4 py-1.5 rounded-full transition-colors">CHECK-OUT</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* NOVO: RANKING TOP 10 CLIENTES (TABELA) */}
      <div className="bg-white dark:bg-[#1e293b]/30 backdrop-blur-xl rounded-[40px] shadow-sm dark:shadow-2xl border border-slate-200 dark:border-white/5 flex flex-col transition-all duration-500">
        <div className="px-10 py-8 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between rounded-t-[40px] transition-colors">
          <h3 className="font-black text-[12px] uppercase tracking-[0.25em] text-slate-900 dark:text-white flex items-center transition-colors">
            Ranking Estratégico de Clientes
            <InfoTooltip
              title="Top Clientes"
              content="Classificação dos 10 clientes com maior histórico de volume de projetos registrados no ecossistema."
              calculation="Contagem total de registros agrupados por Cliente_ID"
            />
          </h3>
          <Trophy size={20} className="text-amber-500" />
        </div>
        <div className="p-10">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 transition-colors">
                  <th className="pb-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-4 transition-colors">Posição</th>
                  <th className="pb-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest transition-colors">Cliente</th>
                  <th className="pb-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right px-4 transition-colors">Total Projetos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 transition-colors">
                {rankingTopClients.map(([name, data], idx) => (
                  <tr key={name} className="group hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="py-6 px-4">
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-black text-slate-400 dark:text-slate-500 transition-colors">#{String(idx + 1).padStart(2, '0')}</span>
                        {idx === 0 && <Trophy size={16} className="text-amber-400" />}
                        {idx === 1 && <Medal size={16} className="text-slate-300" />}
                        {idx === 2 && <Medal size={16} className="text-amber-700/80" />}
                      </div>
                    </td>
                    <td className="py-6">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{name}</span>
                        <span className="text-[10px] font-mono font-black text-slate-400 dark:text-slate-600 uppercase tracking-tighter transition-colors">{data.code.padStart(3, '0')}</span>
                      </div>
                    </td>
                    <td className="py-6 px-4 text-right">
                      <span className="text-lg font-black text-indigo-600 dark:text-indigo-400 transition-colors">{data.count}</span>
                    </td>
                  </tr>
                ))}
                {rankingTopClients.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-20 text-center text-slate-400 dark:text-slate-700 font-black uppercase tracking-widest text-[11px] italic opacity-40 transition-colors">Sem dados de clientes registrados</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
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
