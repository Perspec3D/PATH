import React, { useState, useMemo } from 'react';
import { Project, ProjectActivity, InternalUser, Client } from '../types';
import {
  calculateIntelligentPlanning,
  PlanningHorizonWeeks,
  HistoricalThroughputWindowWeeks,
  DeliveryUnitType,
  ProjectionConfidence,
  WeekDemandStatus,
  PlanningCommitmentItem,
  WhatIfSimulationParams
} from '../utils/intelligentPlanningEngine';
import { formatDisplayDate } from '../utils/activityOperationalModel';
import { InfoTooltip } from './InfoTooltip';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ReferenceLine
} from 'recharts';
import {
  Calendar,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Ban,
  Activity,
  Sparkles,
  Sliders,
  Target,
  Users,
  ArrowRight,
  Eye,
  Layers,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Zap,
  HelpCircle,
  FolderOpen
} from 'lucide-react';

export interface IntelligentPlanningProps {
  projects: Project[];
  activities: ProjectActivity[];
  users: InternalUser[];
  clients: Client[];
  theme?: 'dark' | 'light';
  todayStr: string;
  userWipLimits?: Record<string, number>;
  onOpenProject?: (project: Project) => void;
  onOpenActivity?: (project: Project, activity: ProjectActivity) => void;
  onNavigateToTeam?: (userId?: string) => void;
}

export const IntelligentPlanning: React.FC<IntelligentPlanningProps> = ({
  projects,
  activities,
  users,
  clients,
  theme = 'dark',
  todayStr,
  userWipLimits = {},
  onOpenProject,
  onOpenActivity,
  onNavigateToTeam
}) => {
  // Controls & Filters State
  const [horizonWeeks, setHorizonWeeks] = useState<PlanningHorizonWeeks>(8);
  const [historicalWindowWeeks, setHistoricalWindowWeeks] = useState<HistoricalThroughputWindowWeeks>(8);
  const [deliveryUnit, setDeliveryUnit] = useState<DeliveryUnitType>(DeliveryUnitType.ACTIVITIES);
  const [activeTab, setActiveTab] = useState<'timeline' | 'professionals' | 'overdue'>('timeline');

  // What-If Simulation State (volatile, memory only, strictly non-destructive)
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);
  const [isSimulationActive, setIsSimulationActive] = useState<boolean>(false);
  const [simAdditionalCount, setSimAdditionalCount] = useState<number>(2);
  const [simTargetWeek, setSimTargetWeek] = useState<number>(1);

  // Expanded weeks for detailed commitments list
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set([1, 2]));

  const simulationParams: WhatIfSimulationParams | undefined = useMemo(() => {
    if (!isSimulationActive) return undefined;
    return {
      additionalCount: simAdditionalCount,
      targetWeekNumber: simTargetWeek
    };
  }, [isSimulationActive, simAdditionalCount, simTargetWeek]);

  // Execute Intelligent Planning Engine (Pure calculation memoized)
  const planningResult = useMemo(() => {
    return calculateIntelligentPlanning({
      projects,
      activities,
      users,
      clients,
      todayStr,
      horizonWeeks,
      historicalWindowWeeks,
      deliveryUnit,
      userWipLimits,
      simulation: simulationParams
    });
  }, [
    projects,
    activities,
    users,
    clients,
    todayStr,
    horizonWeeks,
    historicalWindowWeeks,
    deliveryUnit,
    userWipLimits,
    simulationParams
  ]);

  const { historicalThroughput, weeklyBuckets, overdueBucket, totalHorizonCommitmentsCount, professionals } = planningResult;

  // Toggle week collapse
  const toggleWeekExpand = (weekNum: number) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(weekNum)) {
        next.delete(weekNum);
      } else {
        next.add(weekNum);
      }
      return next;
    });
  };

  // Recharts Chart Data
  const chartData = useMemo(() => {
    return weeklyBuckets.map(b => {
      return {
        name: `S+${b.weekNumber}`,
        weekNumber: b.weekNumber,
        label: b.weekLabel,
        range: b.formattedRange,
        realCommitments: b.commitmentsCount,
        simulatedCommitments: b.simulatedAdditionalDeliveries,
        totalDemand: b.simulatedTotalDemand,
        capacity: b.projectedCapacity,
        capacityUpper: b.capacityUpperBound,
        capacityLower: b.capacityLowerBound,
        status: isSimulationActive && b.simulatedAdditionalDeliveries > 0 ? b.simulatedStatus : b.status,
        blockedCount: b.blockedCount,
        reprogrammedCount: b.reprogrammedCount
      };
    });
  }, [weeklyBuckets]);

  // Status Badge Colors & Labels
  const getStatusBadge = (status: WeekDemandStatus) => {
    switch (status) {
      case WeekDemandStatus.BALANCED:
        return {
          bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
          dot: 'bg-emerald-500',
          label: 'Dentro da Capacidade'
        };
      case WeekDemandStatus.ELEVATED_DEMAND:
        return {
          bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
          dot: 'bg-amber-500',
          label: 'Demanda Elevada'
        };
      case WeekDemandStatus.POTENTIAL_OVERLOAD:
        return {
          bg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
          dot: 'bg-rose-500',
          label: 'Risco de Concentração'
        };
      case WeekDemandStatus.HAS_BLOCKS:
        return {
          bg: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
          dot: 'bg-amber-600',
          label: 'Com Bloqueios'
        };
      case WeekDemandStatus.INSUFFICIENT_DATA:
      default:
        return {
          bg: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
          dot: 'bg-slate-400',
          label: 'Histórico Insuficiente'
        };
    }
  };

  // Confidence Badge
  const getConfidenceBadge = (confidence: ProjectionConfidence) => {
    switch (confidence) {
      case ProjectionConfidence.SUFFICIENT:
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400',
          label: 'Amostra Confiável'
        };
      case ProjectionConfidence.REDUCED:
        return {
          bg: 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400',
          label: 'Amostra Reduzida'
        };
      case ProjectionConfidence.INSUFFICIENT:
      default:
        return {
          bg: 'bg-slate-500/10 border-slate-500/20 text-slate-500 dark:text-slate-400',
          label: 'Histórico Insuficiente'
        };
    }
  };

  const confidenceBadge = getConfidenceBadge(historicalThroughput.confidence);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* 1. CABEÇALHO DO MÓDULO & BARRA DE CONTROLE */}
      <div className="bg-white dark:bg-[#1e293b]/40 backdrop-blur-3xl rounded-[40px] border border-slate-200 dark:border-white/10 p-8 shadow-sm dark:shadow-xl transition-all">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 pb-6 border-b border-slate-100 dark:border-white/5">
          <div>
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-md shadow-indigo-500/50" />
              <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-[0.25em] flex items-center">
                Planejamento e Previsibilidade de Entregas
                <InfoTooltip
                  title="Planejamento e Previsibilidade (Fase 5)"
                  content="Camada gerencial que compara os compromissos futuros cadastrados com o ritmo operacional histórico real da equipe, sem apontamento de horas. Permite simulações hipotéticas e identifica concentrações de demanda sem falsas certezas."
                  calculation="Vazão Histórica = Conclusões / Semanas Observadas · Capacidade = Faixa Min–Média–Max · Horizonte = 4, 8 ou 12 semanas"
                />
              </h2>
            </div>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Vazão comprovada · Balanço semanal de compromissos · Simulador de cenários
            </p>
          </div>

          {/* Barra de Filtros e Controles */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Seletor de Unidade Canônica (Atividades vs Projetos) */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-900/80 p-1 rounded-2xl border border-slate-200 dark:border-slate-800">
              <span className="text-[9px] font-black uppercase text-slate-400 px-2.5">Unidade:</span>
              <button
                onClick={() => setDeliveryUnit(DeliveryUnitType.ACTIVITIES)}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  deliveryUnit === DeliveryUnitType.ACTIVITIES
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Planejamento tático/operacional por entregas de atividades com prazo"
              >
                Atividades
              </button>
              <button
                onClick={() => setDeliveryUnit(DeliveryUnitType.PROJECTS)}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  deliveryUnit === DeliveryUnitType.PROJECTS
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Planejamento macro por marcos de entrega de projetos e revisões"
              >
                Projetos
              </button>
            </div>

            {/* Seletor de Janela Histórica */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-900/80 p-1 rounded-2xl border border-slate-200 dark:border-slate-800">
              <span className="text-[9px] font-black uppercase text-slate-400 px-2.5">Histórico:</span>
              {([4, 8, 12] as HistoricalThroughputWindowWeeks[]).map(w => (
                <button
                  key={w}
                  onClick={() => setHistoricalWindowWeeks(w)}
                  className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                    historicalWindowWeeks === w
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {w} sem
                </button>
              ))}
            </div>

            {/* Seletor de Horizonte Futuro */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-900/80 p-1 rounded-2xl border border-slate-200 dark:border-slate-800">
              <span className="text-[9px] font-black uppercase text-slate-400 px-2.5">Horizonte:</span>
              {([4, 8, 12] as PlanningHorizonWeeks[]).map(h => (
                <button
                  key={h}
                  onClick={() => setHorizonWeeks(h)}
                  className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                    horizonWeeks === h
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  +{h} sem
                </button>
              ))}
            </div>

            {/* Botão do Simulador de Cenários What-If */}
            <button
              onClick={() => setIsSimulatorOpen(prev => !prev)}
              className={`px-3.5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 border transition-all ${
                isSimulationActive
                  ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-500/25 ring-2 ring-purple-500/30 animate-pulse'
                  : isSimulatorOpen
                  ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30'
                  : 'bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-purple-500/40'
              }`}
            >
              <Sparkles size={14} className={isSimulationActive ? 'text-white' : 'text-purple-500'} />
              <span>Simulador What-If</span>
              {isSimulationActive && (
                <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-white text-[8px]">
                  Ativo (+{simAdditionalCount})
                </span>
              )}
            </button>
          </div>
        </div>

        {/* 2. PAINEL EXPANSÍVEL DO SIMULADOR WHAT-IF (NÃO DESTRUTIVO) */}
        {isSimulatorOpen && (
          <div className="mt-6 p-6 rounded-3xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-500/20 animate-in slide-in-from-top-4 duration-300">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-purple-200/40 dark:border-purple-500/10">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-purple-600 dark:text-purple-400" />
                  <span className="text-xs font-black uppercase tracking-widest text-purple-900 dark:text-purple-200">
                    Simulador de Novos Compromissos (Cenário Hipotético)
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-[8px] font-black text-purple-600 dark:text-purple-300 uppercase">
                    Em Memória · Não Destrutivo
                  </span>
                </div>
                <p className="text-[10px] text-purple-700/80 dark:text-purple-300/80 font-medium">
                  Avalie o impacto de assumir novas demandas sem alterar o banco de dados nem mover datas de projetos reais.
                </p>
              </div>

              {/* Botão de Redefinir / Desativar */}
              {isSimulationActive && (
                <button
                  onClick={() => setIsSimulationActive(false)}
                  className="px-3 py-1.5 rounded-xl bg-purple-200/60 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 hover:bg-purple-300/60 transition-colors"
                >
                  <RotateCcw size={12} />
                  Limpar Simulação
                </button>
              )}
            </div>

            {/* Controles de Simulação */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              <div className="md:col-span-4 space-y-1.5">
                <label className="text-[9px] font-black text-purple-800 dark:text-purple-300 uppercase tracking-wider block">
                  Novas Entregas a Adicionar:
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 5].map(qty => (
                    <button
                      key={qty}
                      onClick={() => {
                        setSimAdditionalCount(qty);
                        setIsSimulationActive(true);
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-black transition-all ${
                        isSimulationActive && simAdditionalCount === qty
                          ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-purple-200 dark:border-purple-800/40 hover:border-purple-400'
                      }`}
                    >
                      +{qty}
                    </button>
                  ))}
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={simAdditionalCount}
                    onChange={e => {
                      const val = Math.max(1, parseInt(e.target.value) || 1);
                      setSimAdditionalCount(val);
                      setIsSimulationActive(true);
                    }}
                    className="w-16 px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800/40 text-center text-xs font-black text-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="md:col-span-5 space-y-1.5">
                <label className="text-[9px] font-black text-purple-800 dark:text-purple-300 uppercase tracking-wider block">
                  Semana Alvo de Entrega:
                </label>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {weeklyBuckets.map(b => (
                    <button
                      key={b.weekNumber}
                      onClick={() => {
                        setSimTargetWeek(b.weekNumber);
                        setIsSimulationActive(true);
                      }}
                      className={`px-3 py-2 rounded-xl text-[10px] font-black whitespace-nowrap transition-all ${
                        isSimulationActive && simTargetWeek === b.weekNumber
                          ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-purple-200 dark:border-purple-800/40 hover:border-purple-400'
                      }`}
                    >
                      Semana +{b.weekNumber}
                    </button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-3 flex justify-end">
                <button
                  onClick={() => setIsSimulationActive(true)}
                  className={`w-full py-2.5 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                    isSimulationActive
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30'
                      : 'bg-purple-600 hover:bg-purple-500 text-white shadow-sm'
                  }`}
                >
                  <Zap size={14} />
                  <span>{isSimulationActive ? 'Simulação Ativa' : 'Aplicar Hipótese'}</span>
                </button>
              </div>
            </div>

            {isSimulationActive && (
              <div className="mt-4 p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-[10px] font-bold text-purple-700 dark:text-purple-300 flex items-center gap-2">
                <AlertTriangle size={14} className="text-purple-500 shrink-0" />
                <span>
                  Visualizando impacto de <strong>+{simAdditionalCount} entrega(s)</strong> na <strong>Semana +{simTargetWeek}</strong>. As barras em roxo no gráfico e os cards indicam a sobrecarga hipotética resultante.
                </span>
              </div>
            )}
          </div>
        )}

        {/* 3. RESUMO EXECUTIVO (4 CARDS PRINCIPAIS) */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Vazão Histórica Média */}
          <div className="p-6 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Vazão Histórica ({historicalThroughput.windowWeeks} sem)
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider border ${confidenceBadge.bg}`}>
                  {confidenceBadge.label}
                </span>
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                {historicalThroughput.averageWeeklyThroughput !== null ? (
                  <>
                    <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                      {historicalThroughput.averageWeeklyThroughput}
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
              <span>Faixa observada:</span>
              <span className="text-slate-700 dark:text-slate-300">
                {historicalThroughput.minWeeklyDeliveries !== null && historicalThroughput.maxWeeklyDeliveries !== null
                  ? `Min: ${historicalThroughput.minWeeklyDeliveries} · Max: ${historicalThroughput.maxWeeklyDeliveries} ent/sem`
                  : '---'}
              </span>
            </div>
          </div>

          {/* Card 2: Demanda Total no Horizonte */}
          <div className="p-6 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Demanda no Horizonte (+{horizonWeeks} sem)
                </span>
                <Calendar size={14} className="text-indigo-500" />
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">
                  {totalHorizonCommitmentsCount + (isSimulationActive ? simAdditionalCount : 0)}
                </span>
                <span className="text-xs font-bold text-slate-400 uppercase">
                  {deliveryUnit === DeliveryUnitType.ACTIVITIES ? 'atividades' : 'projetos'}
                </span>
                {isSimulationActive && (
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-purple-500/10 text-purple-600 dark:text-purple-300">
                    +{simAdditionalCount} sim
                  </span>
                )}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between text-[9px] font-bold text-slate-500">
              <span>Média demandada:</span>
              <span className="text-slate-700 dark:text-slate-300">
                {((totalHorizonCommitmentsCount + (isSimulationActive ? simAdditionalCount : 0)) / horizonWeeks).toFixed(1)} ent/sem
              </span>
            </div>
          </div>

          {/* Card 3: Lead Time Histórico Médio */}
          <div className="p-6 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Lead Time Realizado
                </span>
                <Clock size={14} className="text-sky-500" />
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                {historicalThroughput.averageBusinessLeadTimeDays !== null ? (
                  <>
                    <span className="text-3xl font-black text-sky-600 dark:text-sky-400 tracking-tight">
                      {historicalThroughput.averageBusinessLeadTimeDays}
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
                {historicalThroughput.averageCalendarLeadTimeDays !== null ? `${historicalThroughput.averageCalendarLeadTimeDays} dias corridos` : '---'}
              </span>
            </div>
          </div>

          {/* Card 4: Compromissos Vencidos (Isolados) */}
          <div
            onClick={() => setActiveTab('overdue')}
            className={`p-6 rounded-3xl border flex flex-col justify-between cursor-pointer transition-all ${
              overdueBucket.count > 0
                ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/80 dark:border-rose-800/40 hover:border-rose-400'
                : 'bg-slate-50/80 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800/80'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Compromissos Vencidos
                </span>
                <AlertTriangle size={14} className={overdueBucket.count > 0 ? 'text-rose-500' : 'text-slate-400'} />
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className={`text-3xl font-black tracking-tight ${overdueBucket.count > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                  {overdueBucket.count}
                </span>
                <span className="text-xs font-bold text-slate-400 uppercase">pendentes</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between text-[9px] font-bold text-slate-500">
              <span className="text-rose-600 dark:text-rose-400">Isolados das semanas</span>
              <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1">
                Ver detalhes <ArrowRight size={10} />
              </span>
            </div>
          </div>
        </div>

        {/* 4. VISUAL SUB-TABS */}
        <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center bg-slate-100 dark:bg-slate-900/80 p-1 rounded-2xl border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setActiveTab('timeline')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeTab === 'timeline'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-black'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <TrendingUp size={13} />
              <span>Cronograma & Balanço Semanal</span>
            </button>
            <button
              onClick={() => setActiveTab('professionals')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeTab === 'professionals'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-black'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users size={13} />
              <span>Visão por Profissional ({professionals.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('overdue')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeTab === 'overdue'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-black'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <AlertTriangle size={13} className={overdueBucket.count > 0 ? 'text-rose-500' : ''} />
              <span>Vencidos ({overdueBucket.count})</span>
            </button>
          </div>

          <div className="text-[10px] font-bold text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <span>Unidade ativa: <strong>{deliveryUnit === DeliveryUnitType.ACTIVITIES ? 'Atividades Operacionais' : 'Projetos Globais'}</strong></span>
          </div>
        </div>
      </div>

      {/* 5. VISÃO 1: CRONOGRAMA, GRÁFICO DEMANDA X VAZÃO & LISTA SEMANAL */}
      {activeTab === 'timeline' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* GRÁFICO RECHARTS: DEMANDA VS CAPACIDADE */}
          <div className="bg-white dark:bg-[#1e293b]/40 backdrop-blur-3xl rounded-[40px] border border-slate-200 dark:border-white/10 p-8 shadow-sm dark:shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] flex items-center gap-2">
                  <span>Demanda Programada × Capacidade Histórica</span>
                  <InfoTooltip
                    title="Demanda vs Capacidade"
                    content="Compara as entregas com prazo agendadas para cada semana futura com o patamar histórico de vazão comprovada da organização."
                    calculation="Demanda = Compromissos na semana · Referência = Vazão média da janela histórica (entregas/semana)"
                  />
                </h3>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                  Projeção sustentada por semanas consecutivas (incluindo semanas sem entregas no histórico)
                </p>
              </div>

              {/* Legenda Dinâmica */}
              <div className="flex flex-wrap items-center gap-4 text-[10px] font-black uppercase tracking-wider">
                <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                  <span className="w-3 h-3 rounded-md bg-indigo-600" />
                  <span>Compromissos Reais</span>
                </div>
                {isSimulationActive && (
                  <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
                    <span className="w-3 h-3 rounded-md bg-purple-500" />
                    <span>Cenário Simulado (+{simAdditionalCount})</span>
                  </div>
                )}
                {historicalThroughput.capacityBaseline !== null && (
                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <span className="w-3.5 h-0.5 bg-emerald-500" />
                    <span>Vazão Média ({historicalThroughput.capacityBaseline} ent/sem)</span>
                  </div>
                )}
              </div>
            </div>

            {/* Container do Gráfico */}
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 20, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} opacity={0.6} />
                  <XAxis
                    dataKey="name"
                    stroke="#94a3b8"
                    fontSize={10}
                    fontWeight={700}
                    tickLine={false}
                    axisLine={{ stroke: theme === 'dark' ? '#334155' : '#e2e8f0' }}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={10}
                    fontWeight={700}
                    tickLine={false}
                    axisLine={{ stroke: theme === 'dark' ? '#334155' : '#e2e8f0' }}
                    allowDecimals={false}
                  />
                  <RechartsTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0].payload;
                      const statusBadge = getStatusBadge(data.status);
                      return (
                        <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 p-4 rounded-2xl shadow-xl text-white text-xs max-w-xs space-y-2">
                          <div className="flex items-center justify-between border-b border-white/10 pb-2">
                            <span className="font-black uppercase tracking-wider text-indigo-400">{data.label}</span>
                            <span className="text-[9px] text-slate-400 font-bold">{data.range}</span>
                          </div>
                          <div className="space-y-1 text-[11px]">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Compromissos Reais:</span>
                              <span className="font-black text-white">{data.realCommitments}</span>
                            </div>
                            {data.simulatedCommitments > 0 && (
                              <div className="flex items-center justify-between text-purple-400 font-bold">
                                <span>Simulação Hipotética:</span>
                                <span>+{data.simulatedCommitments}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Capacidade Histórica:</span>
                              <span className="font-black text-emerald-400">
                                {data.capacity !== null ? `${data.capacity} ent/sem` : 'Histórico Insuficiente'}
                              </span>
                            </div>
                            {data.blockedCount > 0 && (
                              <div className="flex items-center justify-between text-amber-400">
                                <span>Bloqueios Ativos:</span>
                                <span>{data.blockedCount}</span>
                              </div>
                            )}
                            {data.reprogrammedCount > 0 && (
                              <div className="flex items-center justify-between text-sky-400">
                                <span>Reprogramações:</span>
                                <span>{data.reprogrammedCount}</span>
                              </div>
                            )}
                          </div>
                          <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                            <span className="text-[9px] uppercase tracking-wider text-slate-400">Status:</span>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${statusBadge.bg}`}>
                              {statusBadge.label}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="realCommitments"
                    name="Compromissos Reais"
                    fill="#6366f1"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={45}
                  />
                  {isSimulationActive && (
                    <Bar
                      dataKey="simulatedCommitments"
                      name="Simulação"
                      fill="#a855f7"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={45}
                    />
                  )}
                  {historicalThroughput.capacityBaseline !== null && (
                    <ReferenceLine
                      y={historicalThroughput.capacityBaseline}
                      stroke="#10b981"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      label={{
                        value: `Vazão: ${historicalThroughput.capacityBaseline}`,
                        fill: '#10b981',
                        fontSize: 9,
                        fontWeight: 800,
                        position: 'top'
                      }}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* LISTA SEMANAL DE COMPROMISSOS COM STATUS E AÇÕES */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] flex items-center gap-2">
                <span>Detalhamento Semanal de Entregas</span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {weeklyBuckets.length} semanas no horizonte
                </span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setExpandedWeeks(new Set(weeklyBuckets.map(b => b.weekNumber)))}
                  className="text-[9px] font-black uppercase text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Expandir todas
                </button>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <button
                  onClick={() => setExpandedWeeks(new Set())}
                  className="text-[9px] font-black uppercase text-slate-400 hover:underline"
                >
                  Recolher todas
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {weeklyBuckets.map(bucket => {
                const isExpanded = expandedWeeks.has(bucket.weekNumber);
                const currentStatus = isSimulationActive && bucket.simulatedAdditionalDeliveries > 0 ? bucket.simulatedStatus : bucket.status;
                const statusBadge = getStatusBadge(currentStatus);
                const isSimulationTarget = isSimulationActive && simTargetWeek === bucket.weekNumber;

                return (
                  <div
                    key={bucket.weekNumber}
                    className={`rounded-[32px] border transition-all ${
                      isSimulationTarget
                        ? 'bg-purple-500/[0.03] border-purple-500/30 shadow-md shadow-purple-500/5'
                        : 'bg-white dark:bg-[#1e293b]/40 border-slate-200 dark:border-white/10 shadow-sm'
                    }`}
                  >
                    {/* Header do Card da Semana */}
                    <div
                      onClick={() => toggleWeekExpand(bucket.weekNumber)}
                      className="px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200/60 dark:border-indigo-500/20 flex flex-col items-center justify-center shrink-0">
                          <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase leading-none">Sem</span>
                          <span className="text-base font-black text-indigo-700 dark:text-indigo-300 leading-none mt-0.5">
                            +{bucket.weekNumber}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                              {bucket.weekLabel}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400">
                              ({bucket.formattedRange})
                            </span>
                            {isSimulationTarget && (
                              <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20 text-[8px] font-black uppercase">
                                +{simAdditionalCount} Simuladas
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                            {bucket.statusExplanation}
                          </p>
                        </div>
                      </div>

                      {/* Métricas Compactas e Badge */}
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-3 px-3 py-1.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 text-[10px] font-bold">
                          <span className="text-slate-700 dark:text-slate-300">
                            <strong>{bucket.commitmentsCount}</strong> real
                            {bucket.simulatedAdditionalDeliveries > 0 && (
                              <span className="text-purple-600 dark:text-purple-400 font-black"> +{bucket.simulatedAdditionalDeliveries} sim</span>
                            )}
                          </span>
                          <span className="text-slate-300 dark:text-slate-700">|</span>
                          <span className="text-slate-500">
                            Cap: <strong>{bucket.projectedCapacity !== null ? `${bucket.projectedCapacity}` : '---'}</strong>
                          </span>
                          {bucket.blockedCount > 0 && (
                            <>
                              <span className="text-slate-300 dark:text-slate-700">|</span>
                              <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                <Ban size={10} /> {bucket.blockedCount}
                              </span>
                            </>
                          )}
                          {bucket.reprogrammedCount > 0 && (
                            <>
                              <span className="text-slate-300 dark:text-slate-700">|</span>
                              <span className="text-sky-600 dark:text-sky-400 flex items-center gap-1">
                                <Clock size={10} /> {bucket.reprogrammedCount} rep
                              </span>
                            </>
                          )}
                        </div>

                        <span className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider border flex items-center gap-1.5 ${statusBadge.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`} />
                          <span>{statusBadge.label}</span>
                        </span>

                        <div className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>
                    </div>

                    {/* Lista de Compromissos da Semana */}
                    {isExpanded && (
                      <div className="px-6 pb-6 pt-2 border-t border-slate-100 dark:border-white/5 space-y-3 animate-in fade-in duration-200">
                        {bucket.commitments.length === 0 ? (
                          <div className="py-6 text-center text-slate-400 text-xs italic font-medium">
                            Nenhum compromisso cadastrado para esta semana no momento.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {bucket.commitments.map(item => {
                              return (
                                <div
                                  key={item.id}
                                  className={`p-4 rounded-2xl border transition-all ${
                                    item.isBlocked
                                      ? 'bg-amber-500/5 border-amber-500/20'
                                      : 'bg-slate-50/60 dark:bg-slate-900/40 border-slate-200/80 dark:border-slate-800/80'
                                  }`}
                                >
                                  {/* Cabeçalho do Card de Compromisso */}
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                                      {item.projectCode}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      {item.isReprogrammed && (
                                        <span
                                          className="px-1.5 py-0.5 rounded text-[8px] font-black bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 uppercase"
                                          title={`Prazo originalmente previsto: ${item.formattedOriginalDeliveryDate || 'N/A'}`}
                                        >
                                          Reprogramado
                                        </span>
                                      )}
                                      {item.isBlocked && (
                                        <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 uppercase flex items-center gap-1">
                                          <Ban size={9} /> Bloqueado
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Título e Cliente */}
                                  <h4 className="text-xs font-black text-slate-900 dark:text-white leading-snug line-clamp-1">
                                    {item.activityName || item.projectName}
                                  </h4>
                                  <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                                    {item.projectName} · {item.clientName}
                                  </p>

                                  {/* Motivo de Bloqueio se houver */}
                                  {item.isBlocked && item.blockedReason && (
                                    <div className="mt-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[9px] text-amber-800 dark:text-amber-300 leading-tight">
                                      <strong>Motivo:</strong> {item.blockedReason}
                                    </div>
                                  )}

                                  {/* Rodapé: Responsável, Prazo e Ação */}
                                  <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between text-[9px] font-bold">
                                    <div className="flex items-center gap-1.5 text-slate-500">
                                      <Users size={11} className="text-slate-400" />
                                      <span className="truncate max-w-[110px]">{item.assigneeName || 'Não atribuído'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-slate-700 dark:text-slate-300">
                                        {item.formattedDeliveryDate}
                                      </span>
                                      {onOpenProject && (
                                        <button
                                          onClick={() => {
                                            const prj = projects.find(p => p.id === item.projectId);
                                            if (prj) onOpenProject(prj);
                                          }}
                                          className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                          title="Abrir detalhes do projeto"
                                        >
                                          <FolderOpen size={12} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 6. VISÃO 2: DISTRIBUIÇÃO INDIVIDUAL POR PROFISSIONAL */}
      {activeTab === 'professionals' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-200/50 dark:border-indigo-500/20 text-xs text-slate-600 dark:text-slate-300 flex items-start sm:items-center gap-3">
            <Users size={18} className="text-indigo-500 shrink-0 mt-0.5 sm:mt-0" />
            <p className="leading-relaxed font-medium">
              <strong className="uppercase tracking-wider font-black text-indigo-700 dark:text-indigo-300">Distribuição Operacional Equilibrada:</strong>{' '}
              Apresenta a carteira de entregas atribuída a cada profissional nas próximas {horizonWeeks} semanas, acompanhada de seu WIP em execução e bloqueios. Listagem em ordem alfabética sem rankings automáticos de produtividade.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {professionals.map(prof => {
              return (
                <div
                  key={prof.userId}
                  className="p-6 rounded-3xl bg-white dark:bg-[#1e293b]/40 border border-slate-200 dark:border-white/10 shadow-sm"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-white/5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900 dark:text-white">
                          {prof.userName}
                        </span>
                        {prof.isWipLimitExceeded && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[8px] font-black text-amber-600 dark:text-amber-400 uppercase">
                            WIP Acima do Limite ({prof.currentWip} &gt; {prof.wipLimit})
                          </span>
                        )}
                        {prof.overdueCount > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-[8px] font-black text-rose-600 dark:text-rose-400 uppercase">
                            {prof.overdueCount} Vencido(s)
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                        {prof.totalAssignedInHorizon} compromisso(s) previsto(s) no horizonte de {horizonWeeks} semanas
                      </p>
                    </div>

                    {/* Resumo de Indicadores do Profissional */}
                    <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold">
                      <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
                        <span className="text-slate-400 uppercase text-[8px] block">WIP Atual</span>
                        <span className="text-slate-900 dark:text-white font-black">{prof.currentWip} ativ.</span>
                      </div>
                      <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
                        <span className="text-slate-400 uppercase text-[8px] block">Bloqueios</span>
                        <span className={prof.activeBlocksCount > 0 ? 'text-amber-500 font-black' : 'text-slate-400'}>
                          {prof.activeBlocksCount} ativ.
                        </span>
                      </div>
                      <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
                        <span className="text-slate-400 uppercase text-[8px] block">Vazão Histórica</span>
                        <span className="text-indigo-600 dark:text-indigo-400 font-black">
                          {prof.individualHistoricalThroughput !== null
                            ? `${prof.individualHistoricalThroughput} ent/sem`
                            : 'Histórico insuficiente'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Distribuição Semanal em Mini-Grade */}
                  <div className="mt-4">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                      Compromissos por Semana (+1 a +{horizonWeeks}):
                    </span>
                    <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
                      {prof.weeklyDistribution.map((count, idx) => {
                        const weekNum = idx + 1;
                        return (
                          <div
                            key={weekNum}
                            className={`p-2.5 rounded-xl border text-center transition-all ${
                              count > 2
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                                : count > 0
                                ? 'bg-indigo-50/50 dark:bg-indigo-500/10 border-indigo-200/60 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                                : 'bg-slate-50/40 dark:bg-slate-900/20 border-slate-200/40 dark:border-slate-800/40 text-slate-400'
                            }`}
                          >
                            <span className="text-[8px] font-black uppercase block">S+{weekNum}</span>
                            <span className="text-sm font-black block mt-0.5">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

            {professionals.length === 0 && (
              <div className="p-12 text-center text-slate-400 italic text-xs font-medium">
                Nenhum profissional com compromissos atribuídos neste período.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. VISÃO 3: COMPROMISSOS VENCIDOS (CATEGORIA SEPARADA) */}
      {activeTab === 'overdue' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-800/40 text-xs text-rose-800 dark:text-rose-300 flex items-start sm:items-center gap-3">
            <AlertTriangle size={18} className="text-rose-500 shrink-0 mt-0.5 sm:mt-0" />
            <p className="leading-relaxed font-medium">
              <strong className="uppercase tracking-wider font-black">Isolamento Metodológico:</strong>{' '}
              Estes compromissos possuem prazos no passado em relação à data atual ({formatDisplayDate(todayStr)}) e continuam pendentes. Eles estão isolados em categoria separada para não contaminar nem inflar artificialmente a demanda das semanas futuras.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {overdueBucket.commitments.map(item => {
              return (
                <div
                  key={item.id}
                  className="p-5 rounded-3xl bg-white dark:bg-[#1e293b]/40 border border-rose-200/80 dark:border-rose-900/40 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                      {item.projectCode}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 uppercase">
                      {item.daysOverdue !== null ? `${item.daysOverdue} dias atrasado` : 'Atrasado'}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-xs font-black text-slate-900 dark:text-white leading-snug">
                      {item.activityName || item.projectName}
                    </h4>
                    <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                      {item.projectName} · {item.clientName}
                    </p>
                  </div>

                  {item.isBlocked && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[9px] text-amber-800 dark:text-amber-300">
                      <strong>Bloqueio Ativo:</strong> {item.blockedReason || 'Motivo não registrado'}
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[9px] font-bold text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Users size={11} className="text-slate-400" />
                      <span>{item.assigneeName || 'Não atribuído'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-rose-600 dark:text-rose-400 font-black">
                        Prazo: {item.formattedDeliveryDate}
                      </span>
                      {onOpenProject && (
                        <button
                          onClick={() => {
                            const prj = projects.find(p => p.id === item.projectId);
                            if (prj) onOpenProject(prj);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                          title="Abrir detalhes do projeto"
                        >
                          <FolderOpen size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {overdueBucket.count === 0 && (
              <div className="col-span-3 p-12 text-center text-slate-400 text-xs font-medium">
                <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2 opacity-80" />
                <span className="text-slate-700 dark:text-slate-300 font-black uppercase tracking-wider block">
                  Nenhum compromisso vencido pendente
                </span>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Todas as entregas em aberto estão agendadas para datas futuras.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
