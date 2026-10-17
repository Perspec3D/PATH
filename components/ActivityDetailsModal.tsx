import React, { useEffect, useMemo } from 'react';
import {
  ProjectActivity,
  Project,
  Client,
  InternalUser,
  ActivityType,
  ProjectStatus,
  ActivityCanonicalStatus
} from '../types';
import {
  formatDisplayDate,
  getActivityStatusTheme,
  normalizeActivityStatus
} from '../utils/activityOperationalModel';
import {
  X,
  ExternalLink,
  Ban,
  Calendar,
  User,
  CheckCircle2,
  AlertCircle,
  FileText,
  Briefcase,
  Layers,
  Clock,
  ArrowRight
} from 'lucide-react';

interface ActivityDetailsModalProps {
  activity: ProjectActivity;
  onClose: () => void;
  onOpenProject?: (project: Project) => void;
  allActivities: ProjectActivity[];
  projects: Project[];
  clients: Client[];
  users: InternalUser[];
  activityTypes?: ActivityType[];
  onSelectActivity?: (activity: ProjectActivity) => void;
}

export const ActivityDetailsModal: React.FC<ActivityDetailsModalProps> = ({
  activity,
  onClose,
  onOpenProject,
  allActivities,
  projects,
  clients,
  users,
  activityTypes = [],
  onSelectActivity
}) => {
  // ESC key listener to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Lookup linked project for this exact activity revision
  const project = useMemo(() => {
    return projects.find(p => p.id === activity.projectId) || null;
  }, [projects, activity.projectId]);

  // Lookup client
  const client = useMemo(() => {
    if (!project?.clientId) return null;
    return clients.find(c => c.id === project.clientId) || null;
  }, [clients, project?.clientId]);

  // Lookup activity assignee
  const activityAssignee = useMemo(() => {
    if (!activity.assigneeId) return null;
    return users.find(u => u.id === activity.assigneeId) || null;
  }, [users, activity.assigneeId]);

  // Lookup project main assignee
  const projectAssignee = useMemo(() => {
    if (!project?.assigneeId) return null;
    return users.find(u => u.id === project.assigneeId) || null;
  }, [users, project?.assigneeId]);

  // Lookup activity type
  const matchedActivityType = useMemo(() => {
    if (!activity.activityTypeId) return null;
    return activityTypes.find(t => t.id === activity.activityTypeId) || null;
  }, [activityTypes, activity.activityTypeId]);

  // Activities belonging to the same project revision
  const revisionActivities = useMemo(() => {
    return allActivities
      .filter(a => a.projectId === activity.projectId)
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  }, [allActivities, activity.projectId]);

  // Status themes
  const activityStatusTheme = getActivityStatusTheme(activity.status);
  const isBlocked = activityStatusTheme.canonical === ActivityCanonicalStatus.BLOCKED || Boolean(activity.blockedReason);

  // Project status styling
  const getProjectStatusBadgeClass = (status?: ProjectStatus) => {
    switch (status) {
      case ProjectStatus.DONE:
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
      case ProjectStatus.IN_PROGRESS:
        return 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30';
      case ProjectStatus.PAUSED:
        return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30';
      case ProjectStatus.QUEUE:
        return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30';
      case ProjectStatus.CANCELED:
        return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30';
    }
  };

  const handleOpenCompleteProject = () => {
    if (!project) return;
    onClose();
    if (onOpenProject) {
      onOpenProject(project);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-details-title"
    >
      <div
        className="bg-white dark:bg-[#1e293b] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl flex flex-col max-h-[92vh] overflow-hidden transform transition-all select-text"
        onClick={e => e.stopPropagation()}
      >
        {/* ================================================================== */}
        {/* CABEÇALHO DO MODAL                                                 */}
        {/* ================================================================== */}
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/40 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                Consulta de Atividade
              </span>
              {project && (
                <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {project.code} • {project.revision || 'Rev.00'}
                </span>
              )}
            </div>
            <h2
              id="activity-details-title"
              className="text-lg sm:text-xl font-black text-slate-900 dark:text-white truncate"
              title={activity.name}
            >
              {activity.name}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {project && onOpenProject && (
              <button
                type="button"
                onClick={handleOpenCompleteProject}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 transition-all active:scale-95 shadow-sm"
                title="Abrir projeto correspondente no módulo Projetos"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                <span>Abrir projeto completo</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Fechar (Esc)"
              aria-label="Fechar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ================================================================== */}
        {/* CORPO DO MODAL (ROLAGEM ÚNICA)                                     */}
        {/* ================================================================== */}
        <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar space-y-6 flex-1">
          {/* GRADE: ATIVIDADE SELECIONADA vs PROJETO VINCULADO */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
            {/* -------------------------------------------------------------- */}
            {/* SEÇÃO 1: ATIVIDADE SELECIONADA                                  */}
            {/* -------------------------------------------------------------- */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between space-y-4">
              <div>
                {/* Cabeçalho da Seção */}
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200/60 dark:border-slate-800/60 mb-3.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 block">
                        Atividade Selecionada
                      </span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Informações Operacionais
                      </span>
                    </div>
                  </div>

                  {/* Badge de Status Atual */}
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${activityStatusTheme.badgeBg} ${activityStatusTheme.badgeText} ${activityStatusTheme.badgeBorder}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${activityStatusTheme.dotBg}`} />
                    {activityStatusTheme.label}
                  </span>
                </div>

                {/* Nome & Tipo */}
                <div className="mb-3.5">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
                    Nome / Tipo
                  </div>
                  <div className="text-sm font-black text-slate-900 dark:text-white leading-snug">
                    {activity.name}
                  </div>
                  {matchedActivityType && (
                    <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      <span className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {matchedActivityType.name}
                      </span>
                      {matchedActivityType.category && (
                        <span className="text-[9px] text-slate-400">
                          • {matchedActivityType.category}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Motivo do Bloqueio (se aplicável) */}
                {isBlocked && (
                  <div className="mb-4 p-3 rounded-xl bg-[#78350F]/15 dark:bg-[#78350F]/30 border border-[#FBBF24]/50 text-[#FDE68A] flex items-start gap-2.5 shadow-sm">
                    <Ban className="w-4 h-4 text-[#FBBF24] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-[#FDE68A] mb-0.5">
                        Motivo do Bloqueio
                      </div>
                      <div className="text-xs font-medium text-amber-900 dark:text-amber-100 leading-relaxed">
                        {activity.blockedReason || 'Atividade marcada como bloqueada sem motivo detalhado.'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Grade de Prazos e Responsável */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  {/* Responsável */}
                  <div className="col-span-2 sm:col-span-1 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 block mb-1">
                      Responsável
                    </span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-black text-[9px] flex items-center justify-center uppercase shrink-0">
                        {(activityAssignee?.username || '?').charAt(0)}
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        {activityAssignee?.username || 'Não atribuído'}
                      </span>
                    </div>
                  </div>

                  {/* Início Planejado */}
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 block mb-1">
                      Início Planejado
                    </span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {activity.startDate ? formatDisplayDate(activity.startDate) : '—'}
                    </span>
                  </div>

                  {/* Início Real */}
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 block mb-1">
                      Início Real
                    </span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {activity.actualStartDate ? formatDisplayDate(activity.actualStartDate) : 'Não iniciado'}
                    </span>
                  </div>

                  {/* Previsão Original de Término */}
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 block mb-1">
                      Previsão Original
                    </span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {activity.originalDeliveryDate
                        ? formatDisplayDate(activity.originalDeliveryDate)
                        : (activity.deliveryDate ? formatDisplayDate(activity.deliveryDate) : '—')}
                    </span>
                  </div>

                  {/* Previsão Atual de Término */}
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 block mb-1">
                      Previsão Atual
                    </span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {activity.deliveryDate ? formatDisplayDate(activity.deliveryDate) : '—'}
                    </span>
                  </div>

                  {/* Conclusão Real */}
                  <div className="col-span-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 block mb-1">
                      Conclusão Real
                    </span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {activity.actualEndDate ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {formatDisplayDate(activity.actualEndDate)}
                        </span>
                      ) : (
                        'Em aberto'
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Observações da Atividade */}
              {activity.notes && (
                <div className="pt-2">
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                    <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
                      <FileText className="w-3 h-3" />
                      <span>Observações</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {activity.notes}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* -------------------------------------------------------------- */}
            {/* SEÇÃO 2: PROJETO VINCULADO                                      */}
            {/* -------------------------------------------------------------- */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between space-y-4">
              <div>
                {/* Cabeçalho da Seção */}
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200/60 dark:border-slate-800/60 mb-3.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                      <Briefcase className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 block">
                        Projeto Vinculado
                      </span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Contexto do Projeto
                      </span>
                    </div>
                  </div>

                  {project && (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${getProjectStatusBadgeClass(project.status)}`}
                    >
                      {project.status}
                    </span>
                  )}
                </div>

                {project ? (
                  <>
                    {/* Código, Revisão & Nome do Projeto */}
                    <div className="mb-3.5">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-200/70 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                          {project.code}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30">
                          {project.revision || 'Rev.00'}
                        </span>
                      </div>
                      <div className="text-sm font-black text-slate-900 dark:text-white leading-snug">
                        {project.name}
                      </div>
                    </div>

                    {/* Metadados do Projeto */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      {/* Cliente */}
                      <div className="col-span-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 block mb-1">
                          Cliente
                        </span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {client?.name || 'Cliente não identificado'}
                        </span>
                      </div>

                      {/* Responsável Principal */}
                      <div className="col-span-2 sm:col-span-1 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 block mb-1">
                          Responsável Principal
                        </span>
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 font-black text-[9px] flex items-center justify-center uppercase shrink-0">
                            {(projectAssignee?.username || '?').charAt(0)}
                          </div>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                            {projectAssignee?.username || 'Não atribuído'}
                          </span>
                        </div>
                      </div>

                      {/* Revisão Atual */}
                      <div className="col-span-2 sm:col-span-1 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 block mb-1">
                          Revisão Cadastrada
                        </span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {project.revision || 'Rev.00'}
                        </span>
                      </div>

                      {/* Data Prevista de Entrega Global */}
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 block mb-1">
                          Previsão Global
                        </span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {project.deliveryDate
                            ? formatDisplayDate(project.deliveryDate)
                            : (project.dueDate ? formatDisplayDate(project.dueDate) : '—')}
                        </span>
                      </div>

                      {/* Conclusão Real do Projeto */}
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 block mb-1">
                          Conclusão do Projeto
                        </span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {project.actualEndDate ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" />
                              {formatDisplayDate(project.actualEndDate)}
                            </span>
                          ) : (
                            'Em andamento'
                          )}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <strong className="block font-bold">Projeto não localizado</strong>
                      O projeto associado a esta atividade pode ter sido removido ou pertence a uma referência histórica inacessível.
                    </div>
                  </div>
                )}
              </div>

              {/* Botão contextual para abrir o projeto completo em telas menores */}
              {project && onOpenProject && (
                <div className="pt-2 sm:hidden">
                  <button
                    type="button"
                    onClick={handleOpenCompleteProject}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md active:scale-95"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Abrir projeto completo</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* SEÇÃO 3: ATIVIDADES DO PROJETO (REVISÃO CORRESPONDENTE)          */}
          {/* ---------------------------------------------------------------- */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Atividades do Projeto — {project?.code || 'Projeto'} ({project?.revision || 'Revisão'})
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {revisionActivities.length}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">
                Apresentando apenas as atividades desta revisão ({project?.revision || 'Rev.00'})
              </span>
            </div>

            {/* Lista com rolagem interna compacta */}
            <div className="max-h-60 overflow-y-auto custom-scrollbar rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 divide-y divide-slate-100 dark:divide-slate-800/60">
              {revisionActivities.map(act => {
                const isCurrent = act.id === activity.id;
                const actAssignee = users.find(u => u.id === act.assigneeId);
                const actTheme = getActivityStatusTheme(act.status);

                return (
                  <div
                    key={act.id}
                    onClick={() => {
                      if (!isCurrent && onSelectActivity) {
                        onSelectActivity(act);
                      }
                    }}
                    className={`p-3 sm:px-4 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors ${
                      isCurrent
                        ? 'bg-indigo-50/70 dark:bg-indigo-500/15 border-l-4 border-indigo-500'
                        : onSelectActivity
                          ? 'hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer'
                          : ''
                    }`}
                    title={isCurrent ? 'Atividade atualmente visualizada' : 'Clique para ver detalhes desta atividade'}
                  >
                    {/* Nome & Indicador de Seleção */}
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      {isCurrent && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-indigo-600 text-white shrink-0">
                          Atual
                        </span>
                      )}
                      <span className={`text-xs font-bold truncate ${isCurrent ? 'text-indigo-950 dark:text-indigo-100 font-black' : 'text-slate-800 dark:text-slate-200'}`}>
                        {act.name}
                      </span>
                    </div>

                    {/* Metadados: Responsável, Prazo e Status */}
                    <div className="flex items-center gap-3 sm:gap-4 shrink-0 justify-between sm:justify-end text-xs">
                      {/* Responsável */}
                      <div className="flex items-center gap-1.5 min-w-[90px]">
                        <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-800 text-[8px] font-black flex items-center justify-center uppercase text-slate-600 dark:text-slate-400 shrink-0">
                          {(actAssignee?.username || '?').charAt(0)}
                        </div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[80px]">
                          {actAssignee?.username || '—'}
                        </span>
                      </div>

                      {/* Prazo */}
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 min-w-[65px] text-right font-medium">
                        {act.deliveryDate ? formatDisplayDate(act.deliveryDate) : '—'}
                      </span>

                      {/* Badge de Status */}
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border min-w-[85px] justify-center ${actTheme.badgeBg} ${actTheme.badgeText} ${actTheme.badgeBorder}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${actTheme.dotBg}`} />
                        {actTheme.label}
                      </span>
                    </div>
                  </div>
                );
              })}

              {revisionActivities.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-400 italic">
                  Nenhuma atividade registrada nesta revisão.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ================================================================== */}
        {/* RODAPÉ DO MODAL (AÇÕES)                                            */}
        {/* ================================================================== */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Pressione <strong>Esc</strong> para fechar
          </span>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
            >
              Fechar
            </button>

            {project && onOpenProject && (
              <button
                type="button"
                onClick={handleOpenCompleteProject}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md shadow-indigo-500/20 active:scale-95"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir projeto completo</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
