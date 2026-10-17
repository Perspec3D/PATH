import React, { useMemo, useState } from 'react';
import { Project, ProjectActivity, InternalUser, Client, ProjectStatus } from '../types';
import {
  calculateManagementAttention,
  AlertSeverity,
  AlertCategory,
  ConsolidatedAttentionItem,
  ProjectAttentionItem,
  TeamWipAttentionItem,
  ActivityAlertDetail
} from '../utils/managementAttentionEngine';
import { InfoTooltip } from './InfoTooltip';
import { ActivityDetailsModal } from './ActivityDetailsModal';
import {
  AlertOctagon,
  AlertTriangle,
  Info,
  Calendar,
  Clock,
  Ban,
  Users,
  Search,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Layers,
  ArrowRight,
  Filter,
  X,
  Sliders,
  CheckCircle2
} from 'lucide-react';

interface ManagementAttentionCenterProps {
  projects: Project[];
  activities: ProjectActivity[];
  users: InternalUser[];
  clients: Client[];
  theme?: 'dark' | 'light';
  todayStr: string;
  userWipLimits: Record<string, number>;
  eventsByActivityId?: Record<string, any[]>;
  onOpenProject?: (project: Project) => void;
  onOpenActivity?: (project: Project, activity: ProjectActivity) => void;
  onNavigateToTeam?: (userId?: string) => void;
  compact?: boolean;
}

export const ManagementAttentionCenter: React.FC<ManagementAttentionCenterProps> = ({
  projects,
  activities,
  users,
  clients,
  theme = 'dark',
  todayStr,
  userWipLimits,
  eventsByActivityId,
  onOpenProject,
  onOpenActivity,
  onNavigateToTeam,
  compact = false
}) => {
  // Filters State
  const [severityFilter, setSeverityFilter] = useState<'ALL' | AlertSeverity>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | AlertCategory>('ALL');
  const [selectedClientId, setSelectedClientId] = useState<string>('ALL');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Expandable cards state (project IDs that are expanded to view activity sub-items)
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());

  // Activity modal state
  const [modalActivity, setModalActivity] = useState<ProjectActivity | null>(null);

  // Pagination for large lists (progressive loading)
  const [visibleCount, setVisibleCount] = useState<number>(15);

  // Run the pure Management Attention Engine
  const engineResult = useMemo(() => {
    return calculateManagementAttention({
      projects,
      activities,
      users,
      clients,
      todayStr,
      userWipLimits,
      eventsByActivityId,
      upcomingBusinessDaysHorizon: 3
    });
  }, [projects, activities, users, clients, todayStr, userWipLimits, eventsByActivityId]);

  const { summary, items } = engineResult;

  // Filter items deterministically
  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return items.filter(item => {
      // 1. Severity Filter
      if (severityFilter !== 'ALL' && item.maxSeverity !== severityFilter) {
        return false;
      }

      // 2. Category Filter
      if (categoryFilter !== 'ALL') {
        if (!item.categories.includes(categoryFilter)) {
          return false;
        }
      }

      // 3. Client Filter
      if (selectedClientId !== 'ALL') {
        if (item.type !== 'project' || item.clientId !== selectedClientId) {
          return false;
        }
      }

      // 4. Assignee Filter
      if (selectedAssigneeId !== 'ALL') {
        if (item.type === 'team') {
          if (item.userId !== selectedAssigneeId) return false;
        } else {
          const hasProjectAssignee = item.projectAssigneeId === selectedAssigneeId;
          const hasActivityAssignee = item.activities.some(a => a.assigneeId === selectedAssigneeId);
          if (!hasProjectAssignee && !hasActivityAssignee) return false;
        }
      }

      // 5. Search Text Filter
      if (q) {
        if (item.type === 'project') {
          const matchCode = item.projectCode.toLowerCase().includes(q);
          const matchName = item.projectName.toLowerCase().includes(q);
          const matchClient = item.clientName.toLowerCase().includes(q);
          const matchReason = item.primaryReason.toLowerCase().includes(q);
          const matchActivities = item.activities.some(a => a.activityName.toLowerCase().includes(q));
          if (!matchCode && !matchName && !matchClient && !matchReason && !matchActivities) {
            return false;
          }
        } else {
          const matchUser = item.userName.toLowerCase().includes(q);
          const matchReason = item.primaryReason.toLowerCase().includes(q);
          const matchActs = item.inProgressActivities.some(a => a.name.toLowerCase().includes(q) || a.projectCode.toLowerCase().includes(q));
          if (!matchUser && !matchReason && !matchActs) {
            return false;
          }
        }
      }

      return true;
    });
  }, [items, severityFilter, categoryFilter, selectedClientId, selectedAssigneeId, searchTerm]);

  const toggleExpand = (id: string) => {
    setExpandedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleOpenActivityDetail = (activityId: string) => {
    const act = activities.find(a => a.id === activityId);
    if (act) {
      setModalActivity(act);
    }
  };

  const handleOpenProjectContext = (projectId: string) => {
    const prj = projects.find(p => p.id === projectId);
    if (prj && onOpenProject) {
      onOpenProject(prj);
    }
  };

  const hasActiveFilters = severityFilter !== 'ALL'
    || categoryFilter !== 'ALL'
    || selectedClientId !== 'ALL'
    || selectedAssigneeId !== 'ALL'
    || searchTerm.trim().length > 0;

  const resetFilters = () => {
    setSeverityFilter('ALL');
    setCategoryFilter('ALL');
    setSelectedClientId('ALL');
    setSelectedAssigneeId('ALL');
    setSearchTerm('');
    setVisibleCount(15);
  };

  return (
    <div className={`bg-white dark:bg-[#1e293b]/50 backdrop-blur-3xl border border-slate-200 dark:border-white/10 shadow-xl dark:shadow-2xl relative overflow-hidden transition-all duration-300 ${
      compact ? 'rounded-[32px] p-5 sm:p-6 space-y-4' : 'rounded-[48px] p-8 sm:p-10 space-y-8'
    }`}>
      {/* Decorative Aura */}
      <div className="absolute -top-32 -left-32 w-80 h-80 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* --- SEÇÃO SUPERIOR: TÍTULO E EXPLICAÇÃO --- */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-white/5 ${
        compact ? 'pb-3' : 'pb-6'
      }`}>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-[0.25em] flex items-center">
              Central de Atenção Gerencial
              <InfoTooltip
                title="Central de Atenção Gerencial"
                content="Camada de inteligência operacional que consolida desvios de prazo, bloqueios ativos, entregas iminentes e sobrecarga de atividades para ação imediata."
                calculation="Severidade: CRÍTICA (Prazos de Projeto Vencidos) · ATENÇÃO (Atividades Atrasadas, Bloqueadas, Entregas em 3d úteis e Carga Elevada) · INFORMATIVA (Dados Incompletos)"
              />
            </h3>
            {summary.totalAlertsCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                {summary.totalAlertsCount} {summary.totalAlertsCount === 1 ? 'Ponto de Atenção' : 'Pontos de Atenção'}
              </span>
            )}
          </div>
          <p className="mt-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            Identifique onde agir, a causa raiz dos bloqueios e acesse diretamente os registros
          </p>
        </div>

        {/* Severidade Pills Rápidas */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSeverityFilter(prev => prev === AlertSeverity.CRITICAL ? 'ALL' : AlertSeverity.CRITICAL);
              setCategoryFilter('ALL');
            }}
            className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border ${
              severityFilter === AlertSeverity.CRITICAL
                ? 'bg-rose-500 text-white border-rose-600 shadow-md shadow-rose-500/20'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            <span>Críticas ({summary.criticalAlertsCount})</span>
          </button>

          <button
            onClick={() => {
              setSeverityFilter(prev => prev === AlertSeverity.ATTENTION ? 'ALL' : AlertSeverity.ATTENTION);
              setCategoryFilter('ALL');
            }}
            className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border ${
              severityFilter === AlertSeverity.ATTENTION
                ? 'bg-amber-500 text-white border-amber-600 shadow-md shadow-amber-500/20'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>Atenção ({summary.attentionAlertsCount})</span>
          </button>

          {summary.informativeAlertsCount > 0 && (
            <button
              onClick={() => {
                setSeverityFilter(prev => prev === AlertSeverity.INFORMATIVE ? 'ALL' : AlertSeverity.INFORMATIVE);
                setCategoryFilter('ALL');
              }}
              className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border ${
                severityFilter === AlertSeverity.INFORMATIVE
                  ? 'bg-slate-600 text-white border-slate-700 shadow-md shadow-slate-500/20'
                  : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20 hover:bg-slate-500/20'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span>Informativas ({summary.informativeAlertsCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* --- RESUMO SUPERIOR (4 CARDS DE GESTÃO) --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Projetos Atrasados */}
        <button
          type="button"
          onClick={() => {
            setCategoryFilter(prev => prev === AlertCategory.PROJECT_OVERDUE ? 'ALL' : AlertCategory.PROJECT_OVERDUE);
            setSeverityFilter('ALL');
          }}
          className={`p-5 rounded-3xl text-left border transition-all duration-200 relative overflow-hidden group ${
            categoryFilter === AlertCategory.PROJECT_OVERDUE
              ? 'bg-rose-500/15 border-rose-500/50 ring-2 ring-rose-500/20'
              : 'bg-slate-50/70 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800/80 hover:border-rose-500/40'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Projetos Atrasados
            </span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              summary.overdueProjectsCount > 0
                ? 'bg-rose-500/15 text-rose-500'
                : 'bg-slate-200/50 dark:bg-slate-800 text-slate-400'
            }`}>
              <AlertOctagon size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black tracking-tight ${
              summary.overdueProjectsCount > 0 ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'
            }`}>
              {summary.overdueProjectsCount}
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase">
              {summary.overdueProjectsCount === 1 ? 'projeto ativo' : 'projetos ativos'}
            </span>
          </div>
          <p className="mt-2 text-[9px] font-semibold text-slate-400 dark:text-slate-500">
            Prazo final global vencido
          </p>
        </button>

        {/* Card 2: Atividades Bloqueadas */}
        <button
          type="button"
          onClick={() => {
            setCategoryFilter(prev => prev === AlertCategory.ACTIVE_BLOCK ? 'ALL' : AlertCategory.ACTIVE_BLOCK);
            setSeverityFilter('ALL');
          }}
          className={`p-5 rounded-3xl text-left border transition-all duration-200 relative overflow-hidden group ${
            categoryFilter === AlertCategory.ACTIVE_BLOCK
              ? 'bg-amber-500/15 border-amber-500/50 ring-2 ring-amber-500/20'
              : 'bg-slate-50/70 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800/80 hover:border-amber-500/40'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Atividades Bloqueadas
            </span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              summary.blockedActivitiesCount > 0
                ? 'bg-amber-500/15 text-amber-500'
                : 'bg-slate-200/50 dark:bg-slate-800 text-slate-400'
            }`}>
              <Ban size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black tracking-tight ${
              summary.blockedActivitiesCount > 0 ? 'text-amber-500' : 'text-slate-700 dark:text-slate-300'
            }`}>
              {summary.blockedActivitiesCount}
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase">
              {summary.blockedActivitiesCount === 1 ? 'bloqueio ativo' : 'bloqueios ativos'}
            </span>
          </div>
          <p className="mt-2 text-[9px] font-semibold text-slate-400 dark:text-slate-500">
            Aguardando liberação operacional
          </p>
        </button>

        {/* Card 3: Próximas Entregas (3 dias úteis) */}
        <button
          type="button"
          onClick={() => {
            setCategoryFilter(prev => prev === AlertCategory.UPCOMING_DELIVERY ? 'ALL' : AlertCategory.UPCOMING_DELIVERY);
            setSeverityFilter('ALL');
          }}
          className={`p-5 rounded-3xl text-left border transition-all duration-200 relative overflow-hidden group ${
            categoryFilter === AlertCategory.UPCOMING_DELIVERY
              ? 'bg-indigo-500/15 border-indigo-500/50 ring-2 ring-indigo-500/20'
              : 'bg-slate-50/70 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-500/40'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Entregas Próximas
            </span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              summary.upcomingDeliveriesCount > 0
                ? 'bg-indigo-500/15 text-indigo-500'
                : 'bg-slate-200/50 dark:bg-slate-800 text-slate-400'
            }`}>
              <Calendar size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black tracking-tight ${
              summary.upcomingDeliveriesCount > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300'
            }`}>
              {summary.upcomingDeliveriesCount}
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase">
              nos próximos 3d úteis
            </span>
          </div>
          <p className="mt-2 text-[9px] font-semibold text-slate-400 dark:text-slate-500">
            Projetos e atividades no horizonte
          </p>
        </button>

        {/* Card 4: Profissionais Acima do Limite de Atividades */}
        <button
          type="button"
          onClick={() => {
            setCategoryFilter(prev => prev === AlertCategory.WIP_LIMIT_EXCEEDED ? 'ALL' : AlertCategory.WIP_LIMIT_EXCEEDED);
            setSeverityFilter('ALL');
          }}
          className={`p-5 rounded-3xl text-left border transition-all duration-200 relative overflow-hidden group ${
            categoryFilter === AlertCategory.WIP_LIMIT_EXCEEDED
              ? 'bg-amber-500/15 border-amber-500/50 ring-2 ring-amber-500/20'
              : 'bg-slate-50/70 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800/80 hover:border-amber-500/40'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Carga Elevada na Equipe
            </span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              summary.wipExceededUsersCount > 0
                ? 'bg-amber-500/15 text-amber-500'
                : 'bg-slate-200/50 dark:bg-slate-800 text-slate-400'
            }`}>
              <Users size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black tracking-tight ${
              summary.wipExceededUsersCount > 0 ? 'text-amber-500' : 'text-slate-700 dark:text-slate-300'
            }`}>
              {summary.wipExceededUsersCount}
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase">
              {summary.wipExceededUsersCount === 1 ? 'profissional' : 'profissionais'}
            </span>
          </div>
          <p className="mt-2 text-[9px] font-semibold text-slate-400 dark:text-slate-500">
            Atividades em andamento acima do limite
          </p>
        </button>
      </div>

      {/* --- BARRA DE FILTROS --- */}
      <div className="p-4 rounded-3xl bg-slate-50/60 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Busca textual */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar projeto, código, responsável..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl text-[10px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48 sm:w-60"
            />
          </div>

          {/* Filtro de Tipo de Alerta */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value as any)}
            className="px-3 py-1.5 rounded-xl text-[10px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="ALL">Todos os Tipos de Alerta</option>
            <option value={AlertCategory.PROJECT_OVERDUE}>Projetos Atrasados</option>
            <option value={AlertCategory.ACTIVE_BLOCK}>Atividades Bloqueadas</option>
            <option value={AlertCategory.ACTIVITY_OVERDUE}>Atividades Atrasadas</option>
            <option value={AlertCategory.UPCOMING_DELIVERY}>Próximas Entregas</option>
            <option value={AlertCategory.WIP_LIMIT_EXCEEDED}>Limite de WIP Excedido</option>
            <option value={AlertCategory.INCOMPLETE_DATA}>Dados Incompletos</option>
          </select>

          {/* Filtro de Cliente */}
          <select
            value={selectedClientId}
            onChange={e => setSelectedClientId(e.target.value)}
            className="px-3 py-1.5 rounded-xl text-[10px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[160px] truncate"
          >
            <option value="ALL">Todos os Clientes</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} - ${c.name}` : c.name}
              </option>
            ))}
          </select>

          {/* Filtro de Responsável */}
          <select
            value={selectedAssigneeId}
            onChange={e => setSelectedAssigneeId(e.target.value)}
            className="px-3 py-1.5 rounded-xl text-[10px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[160px] truncate"
          >
            <option value="ALL">Todos os Responsáveis</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="px-2.5 py-1 rounded-xl text-[9px] font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition flex items-center gap-1 bg-slate-200/50 dark:bg-slate-800"
          >
            <X size={11} />
            <span>Limpar filtros</span>
          </button>
        )}
      </div>

      {/* --- LISTA DE PRIORIDADES CONSOLIDADA --- */}
      <div className={compact ? "space-y-3 max-h-[380px] overflow-y-auto custom-scrollbar pr-1" : "space-y-3"}>
        {filteredItems.length === 0 ? (
          <div className="py-12 px-6 rounded-3xl bg-slate-50/50 dark:bg-slate-900/30 border border-dashed border-slate-200 dark:border-slate-800 text-center">
            <CheckCircle2 size={32} className="mx-auto text-emerald-500/80 mb-3" />
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">
              Nenhum Ponto de Atenção Identificado
            </h4>
            <p className="mt-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
              {hasActiveFilters
                ? 'Nenhum registro encontrado para os filtros selecionados. Clique em "Limpar filtros" para restaurar a visão completa.'
                : 'Todos os projetos ativos e atividades estão em conformidade operacional sem impedimentos ou atrasos.'}
            </p>
          </div>
        ) : (
          filteredItems.slice(0, visibleCount).map(item => {
            if (item.type === 'team') {
              // RENDER CARD DE WIP DA EQUIPE
              return (
                <div
                  key={item.id}
                  className="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border border-amber-500/20 hover:border-amber-500/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        ATENÇÃO · LIMITE DE WIP
                      </span>
                      <span className="text-[11px] font-mono font-black text-indigo-500">
                        {item.userName}
                      </span>
                    </div>

                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Users size={13} className="text-amber-500 shrink-0" />
                      <span>{item.primaryReason}</span>
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-[9px] font-semibold text-slate-400">
                        Atividades em andamento:
                      </span>
                      {item.inProgressActivities.map(act => (
                        <span
                          key={act.id}
                          className="px-2 py-0.5 rounded-md text-[8px] font-bold bg-slate-200/60 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/40 dark:border-slate-700/50"
                        >
                          {act.projectCode}: {act.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {onNavigateToTeam && (
                      <button
                        onClick={() => onNavigateToTeam(item.userId)}
                        className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1.5 shadow-sm"
                      >
                        <span>Ver na Equipe</span>
                        <ArrowRight size={11} />
                      </button>
                    )}
                  </div>
                </div>
              );
            }

            // RENDER CARD DE PROJETO CONSOLIDADO
            const isExpanded = expandedItemIds.has(item.projectId);
            const severityTheme = item.maxSeverity === AlertSeverity.CRITICAL
              ? { badgeBg: 'bg-rose-500/10', badgeText: 'text-rose-500', badgeBorder: 'border-rose-500/20', dotBg: 'bg-rose-500', cardBorder: 'border-rose-500/20 hover:border-rose-500/40' }
              : item.maxSeverity === AlertSeverity.ATTENTION
                ? { badgeBg: 'bg-amber-500/10', badgeText: 'text-amber-500', badgeBorder: 'border-amber-500/20', dotBg: 'bg-amber-500', cardBorder: 'border-amber-500/20 hover:border-amber-500/40' }
                : { badgeBg: 'bg-slate-500/10', badgeText: 'text-slate-400', badgeBorder: 'border-slate-500/20', dotBg: 'bg-slate-400', cardBorder: 'border-slate-200 dark:border-slate-800' };

            return (
              <div
                key={item.id}
                className={`p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/60 border ${severityTheme.cardBorder} transition-all space-y-3`}
              >
                {/* Linha Principal do Projeto */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider flex items-center gap-1 border ${severityTheme.badgeBg} ${severityTheme.badgeText} ${severityTheme.badgeBorder}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${severityTheme.dotBg}`} />
                        {item.maxSeverity}
                      </span>
                      <span className="font-mono text-[11px] font-black text-indigo-600 dark:text-indigo-400">
                        {item.projectCode}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">
                        ({item.clientName})
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-slate-200/50 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {item.projectRevision}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                      {item.projectName}
                    </h4>

                    {/* Motivo Principal */}
                    <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {item.maxSeverity === AlertSeverity.CRITICAL ? (
                        <AlertOctagon size={13} className="text-rose-500 shrink-0" />
                      ) : item.primaryCategory === AlertCategory.ACTIVE_BLOCK ? (
                        <Ban size={13} className="text-amber-500 shrink-0" />
                      ) : (
                        <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                      )}
                      <span>{item.primaryReason}</span>
                    </div>

                    {/* Tags de Alertas Vinculados */}
                    {item.linkedAlertDescriptions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.linkedAlertDescriptions.map((desc, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider bg-slate-200/50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300/40 dark:border-slate-700/40"
                          >
                            + {desc}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Informações de Prazo e Ações */}
                  <div className="flex flex-wrap items-center gap-3 md:justify-end shrink-0">
                    <div className="text-left md:text-right pr-2">
                      <span className="text-[8px] font-bold text-slate-400 uppercase block">
                        Prazo Global
                      </span>
                      <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                        {item.formattedProjectDeliveryDate}
                        {item.daysOverdue !== null && item.daysOverdue > 0 && (
                          <strong className="text-rose-500 ml-1">
                            (-{item.daysOverdue}d)
                          </strong>
                        )}
                        {item.daysRemaining !== null && item.daysRemaining >= 0 && (
                          <strong className="text-indigo-500 ml-1">
                            ({item.daysRemaining === 0 ? 'Hoje' : `em ${item.daysRemaining}d`})
                          </strong>
                        )}
                      </span>
                    </div>

                    {/* Ação Contextual: Abrir Projeto */}
                    {onOpenProject && (
                      <button
                        onClick={() => handleOpenProjectContext(item.projectId)}
                        className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition flex items-center gap-1.5 shadow-sm"
                      >
                        <span>Abrir Projeto</span>
                        <ExternalLink size={10} />
                      </button>
                    )}

                    {/* Toggle de Detalhes das Atividades */}
                    {item.activities.length > 0 && (
                      <button
                        onClick={() => toggleExpand(item.projectId)}
                        className="px-2.5 py-1.5 rounded-xl text-[9px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white transition flex items-center gap-1 bg-slate-200/50 dark:bg-slate-800/80"
                      >
                        <span>{item.activities.length} {item.activities.length === 1 ? 'atividade' : 'atividades'}</span>
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* --- SUB-ITENS: ATIVIDADES VINCULADAS AO PROJETO --- */}
                {isExpanded && item.activities.length > 0 && (
                  <div className="pt-3 border-t border-slate-200/60 dark:border-white/5 space-y-2 animate-in fade-in duration-200">
                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                      Atividades Relevantes Deste Projeto:
                    </span>
                    <div className="grid grid-cols-1 gap-2">
                      {item.activities.map(act => (
                        <div
                          key={act.activityId}
                          className="px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`px-1.5 py-0.2 rounded text-[7px] font-black uppercase tracking-wider ${
                                act.category === AlertCategory.ACTIVE_BLOCK
                                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                  : act.category === AlertCategory.ACTIVITY_OVERDUE
                                    ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                                    : act.category === AlertCategory.UPCOMING_DELIVERY
                                      ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                      : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                              }`}>
                                {act.category === AlertCategory.ACTIVE_BLOCK ? 'BLOQUEADA' :
                                 act.category === AlertCategory.ACTIVITY_OVERDUE ? 'ATRASADA' :
                                 act.category === AlertCategory.UPCOMING_DELIVERY ? 'PRÓXIMA' : 'INCOMPLETA'}
                              </span>
                              <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                                {act.activityName}
                              </span>
                            </div>

                            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                              {act.description}
                              {act.blockedSinceDate && (
                                <span className="ml-1 text-slate-400">
                                  (desde {act.blockedSinceDate})
                                </span>
                              )}
                            </p>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 text-[10px]">
                            {act.assigneeName && (
                              <span className="text-slate-500 font-medium">
                                Resp: <strong className="text-slate-700 dark:text-slate-300">{act.assigneeName}</strong>
                              </span>
                            )}
                            {act.deliveryDate && (
                              <span className="text-slate-400 font-mono">
                                Prazo: {act.formattedDeliveryDate}
                              </span>
                            )}

                            {/* Botão para abrir o Modal de Detalhes da Atividade */}
                            <button
                              onClick={() => handleOpenActivityDetail(act.activityId)}
                              className="px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 transition flex items-center gap-1 border border-indigo-200 dark:border-indigo-800"
                            >
                              <span>Ver detalhes</span>
                              <ArrowRight size={10} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Botão de Paginação Progressiva se houver mais de 15 itens */}
        {filteredItems.length > visibleCount && (
          <div className="pt-4 text-center">
            <button
              onClick={() => setVisibleCount(prev => prev + 15)}
              className="px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition"
            >
              Carregar mais alertas (+{Math.min(15, filteredItems.length - visibleCount)} de {filteredItems.length - visibleCount} restantes)
            </button>
          </div>
        )}
      </div>

      {/* --- MODAL DE DETALHES DA ATIVIDADE REUTILIZADO --- */}
      {modalActivity && (
        <ActivityDetailsModal
          activity={modalActivity}
          onClose={() => setModalActivity(null)}
          onOpenProject={(project) => {
            setModalActivity(null);
            if (onOpenProject) {
              onOpenProject(project);
            }
          }}
          allActivities={activities}
          projects={projects}
          clients={clients}
          users={users}
        />
      )}
    </div>
  );
};
