import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, Loader2, Layers, CheckCircle2, Ban, FileText, Image, Building2 } from 'lucide-react';
import { Project } from '../types';
import {
  isProjectConfirmationCodeValid,
  isClientConfirmationValid,
  isOrganizationNameConfirmationValid,
  ProjectDeletionImpact,
  sanitizeAdministrativeErrorMessage
} from '../utils/administrativeDeletion';
import type { WorkspaceCleanupSummary } from '../storage';

export interface AdministrativeDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (adminPassword: string) => Promise<void>;
  entityType: 'PROJECT' | 'CLIENT';
  entityCode: string;
  entityName: string;
  impact?: ProjectDeletionImpact | null;
  isLoadingImpact?: boolean;
}

export const AdministrativeDeleteModal: React.FC<AdministrativeDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  entityType,
  entityCode,
  entityName,
  impact,
  isLoadingImpact = false
}) => {
  const [typedValue, setTypedValue] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTypedValue('');
      setAdminPassword('');
      setIsDeleting(false);
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isProject = entityType === 'PROJECT';

  const isMatchValid = isProject
    ? isProjectConfirmationCodeValid(typedValue, entityCode)
    : isClientConfirmationValid(typedValue, entityCode, entityName);

  const isPasswordValid = adminPassword.trim().length > 0;
  const canExecute = isMatchValid && isPasswordValid && !isDeleting;

  const handleExecute = async () => {
    if (!canExecute) return;

    try {
      setIsDeleting(true);
      setErrorMessage(null);
      await onConfirm(adminPassword.trim());
      onClose();
    } catch (err: any) {
      console.error('Erro na exclusão administrativa:', err);
      setErrorMessage(sanitizeAdministrativeErrorMessage(err));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) onClose();
      }}
    >
      <div className="w-full max-w-xl bg-white dark:bg-[#0f172a] rounded-[32px] border border-rose-500/20 shadow-2xl dark:shadow-rose-950/20 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header com destaque de perigo */}
        <div className="px-8 pt-8 pb-6 border-b border-slate-100 dark:border-white/5 bg-rose-500/5 flex items-start gap-4">
          <div className="p-3.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-2xl border border-rose-500/20 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-rose-500/15 text-rose-600 dark:text-rose-400 mb-1.5 border border-rose-500/20">
              Operação Destrutiva Privilegiada
            </span>
            <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
              {isProject ? 'Excluir projeto permanentemente?' : 'Excluir cliente permanentemente?'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
              Esta ação é permanente e irreversível pela interface.
            </p>
          </div>
        </div>

        {/* Corpo com resumo e impacto */}
        <div className="p-8 space-y-6 overflow-y-auto max-h-[calc(85vh-200px)]">
          {/* Card da entidade selecionada */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200/60 dark:border-white/5 flex items-center justify-between">
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                {isProject ? 'Projeto Selecionado' : 'Cliente Selecionado'}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-black px-2 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg border border-indigo-500/20">
                  {entityCode}
                </span>
                <span className="text-sm font-black text-slate-900 dark:text-white truncate max-w-[280px]">
                  {entityName}
                </span>
              </div>
            </div>
          </div>

          {/* Resumo do impacto (para projetos) */}
          {isProject && (
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3">
                Resumo do Impacto da Exclusão
              </span>
              {isLoadingImpact ? (
                <div className="py-8 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin mb-2 text-indigo-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[10px]">
                    Calculando registros vinculados...
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-white/5 text-center">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Revisões</span>
                    <span className="text-lg font-black text-slate-900 dark:text-white">
                      {impact?.revisionsCount ?? 1}
                    </span>
                  </div>
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-white/5 text-center">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Atividades</span>
                    <span className="text-lg font-black text-slate-900 dark:text-white">
                      {impact?.activitiesCount ?? 0}
                    </span>
                  </div>
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-white/5 text-center">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Histórico/Eventos</span>
                    <span className="text-lg font-black text-slate-900 dark:text-white">
                      {impact?.eventsCount ?? 0}
                    </span>
                  </div>
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-white/5 text-center">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Anexos/Fotos</span>
                    <span className="text-lg font-black text-slate-900 dark:text-white">
                      {impact?.attachmentsCount ?? 0}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Caixa de aviso de irreversibilidade */}
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-700 dark:text-rose-300 text-xs font-medium leading-relaxed">
            {isProject ? (
              <p>
                <strong>Atenção:</strong> Esta operação excluirá permanentemente o projeto, todas as suas revisões (históricas e ativas), atividades, sessões de trabalho e históricos vinculados. A exclusão não poderá ser desfeita pela interface.
              </p>
            ) : (
              <p>
                <strong>Atenção:</strong> Esta operação excluirá permanentemente o cadastro do cliente e seus contatos. A exclusão não poderá ser desfeita pela interface.
              </p>
            )}
          </div>

          {/* Mensagem de erro, se houver */}
          {errorMessage && (
            <div className="p-4 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-600 dark:text-rose-400 text-xs font-bold leading-relaxed flex items-start gap-2.5 animate-in shake duration-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Campo de confirmação digitada */}
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              {isProject ? (
                <>Para confirmar, digite exatamente o código do projeto: <span className="font-mono text-rose-600 dark:text-rose-400 select-all font-black">{entityCode}</span></>
              ) : (
                <>Para confirmar, digite o código (<span className="font-mono text-rose-600 dark:text-rose-400 select-all font-black">{entityCode}</span>) ou o nome do cliente:</>
              )}
            </label>
            <div className="relative">
              <input
                type="text"
                value={typedValue}
                disabled={isDeleting}
                onChange={(e) => setTypedValue(e.target.value)}
                placeholder={isProject ? entityCode : `Digite "${entityCode}" ou o nome`}
                className={`w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-900 border rounded-xl text-sm font-mono text-slate-900 dark:text-white outline-none transition-all ${
                  isMatchValid
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-950/20'
                    : 'border-slate-200 dark:border-slate-700 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                }`}
                autoComplete="off"
                spellCheck="false"
              />
              {isMatchValid && (
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-500 flex items-center gap-1 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}
            </div>
          </div>

          {/* Campo de confirmação por Senha do Administrador */}
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Senha Pessoal do Administrador
            </label>
            <div className="relative">
              <input
                type="password"
                value={adminPassword}
                disabled={isDeleting}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Digite sua senha de administrador"
                className={`w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-900 border rounded-xl text-sm text-slate-900 dark:text-white outline-none transition-all ${
                  adminPassword.trim().length > 0
                    ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 dark:border-slate-700 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                }`}
                autoComplete="current-password"
              />
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
              A autenticação individual é obrigatória para autorizar operações administrativas destrutivas.
            </p>
          </div>
        </div>

        {/* Rodapé com ações */}
        <div className="px-8 py-6 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="px-6 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canExecute}
            onClick={handleExecute}
            className="px-6 py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-500/20 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Excluindo permanentemente...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>{isProject ? 'Confirmar Exclusão do Projeto' : 'Confirmar Exclusão do Cliente'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export interface ClientDeletionBlockedModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientCode: string;
  clientName: string;
  linkedProjectsCount: number;
  linkedProjects?: { id: string; code: string; name: string }[];
}

export const ClientDeletionBlockedModal: React.FC<ClientDeletionBlockedModalProps> = ({
  isOpen,
  onClose,
  clientCode,
  clientName,
  linkedProjectsCount,
  linkedProjects = []
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white dark:bg-[#0f172a] rounded-[32px] border border-amber-500/20 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="px-8 pt-8 pb-6 border-b border-slate-100 dark:border-white/5 bg-amber-500/5 flex items-start gap-4">
          <div className="p-3.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-2xl border border-amber-500/20 shrink-0">
            <Ban className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-amber-500/15 text-amber-600 dark:text-amber-400 mb-1.5 border border-amber-500/20">
              Integridade Referencial
            </span>
            <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
              Exclusão de Cliente Bloqueada
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
              O cliente possui dependências ativas no workspace.
            </p>
          </div>
        </div>

        <div className="p-8 space-y-6">
          <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200/60 dark:border-white/5">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
              Cliente Selecionado
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-black px-2 py-0.5 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg border border-amber-500/20">
                {clientCode}
              </span>
              <span className="text-sm font-black text-slate-900 dark:text-white truncate">
                {clientName}
              </span>
            </div>
          </div>

          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-800 dark:text-amber-300 text-xs font-medium leading-relaxed space-y-2">
            <p className="font-bold">
              Este cliente possui {linkedProjectsCount} projeto(s) vinculado(s) e não pode ser excluído.
            </p>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
              Os vínculos precisam ser resolvidos antes da exclusão. A plataforma PERSPECPATH não oferece exclusão automática em cascata de projetos a partir do cliente para assegurar a rastreabilidade e integridade histórica do workspace.
            </p>
          </div>

          {linkedProjects.length > 0 && (
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-2">
                Projetos vinculados ({linkedProjectsCount})
              </span>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {linkedProjects.slice(0, 5).map(p => (
                  <div
                    key={p.id}
                    className="p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/50 dark:border-white/5 flex items-center justify-between text-xs"
                  >
                    <span className="font-mono font-bold text-slate-600 dark:text-slate-300">
                      {p.code}
                    </span>
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                      {p.name}
                    </span>
                  </div>
                ))}
                {linkedProjectsCount > 5 && (
                  <p className="text-[10px] text-slate-400 font-bold text-center pt-1">
                    + {linkedProjectsCount - 5} outro(s) projeto(s)
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-8 py-5 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
          >
            Compreendi
          </button>
        </div>
      </div>
    </div>
  );
};

export interface WorkspaceCleanupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (adminPassword: string, confirmedOrgName: string) => Promise<void>;
  organizationName: string;
  summary: WorkspaceCleanupSummary | null;
  isLoadingSummary?: boolean;
}

export const WorkspaceCleanupModal: React.FC<WorkspaceCleanupModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  organizationName,
  summary,
  isLoadingSummary = false
}) => {
  const [typedOrgName, setTypedOrgName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isCleaning, setIsCleaning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTypedOrgName('');
      setAdminPassword('');
      setIsCleaning(false);
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isNameMatchValid = isOrganizationNameConfirmationValid(typedOrgName, organizationName);
  const isPasswordValid = adminPassword.trim().length > 0;
  const canExecute = isNameMatchValid && isPasswordValid && !isCleaning;

  const handleExecute = async () => {
    if (!canExecute) return;

    try {
      setIsCleaning(true);
      setErrorMessage(null);
      await onConfirm(adminPassword.trim(), typedOrgName.trim());
      onClose();
    } catch (err: any) {
      console.error('Erro na limpeza do workspace:', err);
      setErrorMessage(sanitizeAdministrativeErrorMessage(err));
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isCleaning) onClose();
      }}
    >
      <div className="w-full max-w-xl bg-white dark:bg-[#0f172a] rounded-[32px] border border-rose-500/20 shadow-2xl dark:shadow-rose-950/20 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header com destaque de perigo */}
        <div className="px-8 pt-8 pb-6 border-b border-slate-100 dark:border-white/5 bg-rose-500/5 flex items-start gap-4">
          <div className="p-3.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-2xl border border-rose-500/20 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-rose-500/15 text-rose-600 dark:text-rose-400 mb-1.5 border border-rose-500/20">
              Operação Destrutiva de Workspace
            </span>
            <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
              Limpar dados da organização?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
              Esta ação removerá definitivamente todos os dados operacionais da organização.
            </p>
          </div>
        </div>

        {/* Corpo com resumo e impacto */}
        <div className="p-8 space-y-6 overflow-y-auto max-h-[calc(85vh-200px)]">
          {/* Card da organização selecionada */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200/60 dark:border-white/5 flex items-center justify-between">
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                Organização Selecionada
              </span>
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="text-sm font-black text-slate-900 dark:text-white">
                  {organizationName || 'Workspace Atual'}
                </span>
              </div>
            </div>
          </div>

          {/* Resumo dos registros a serem excluídos */}
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3">
              Impacto da Limpeza de Dados Operacionais
            </span>
            {isLoadingSummary ? (
              <div className="py-8 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin mb-2 text-indigo-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-[10px]">
                  Contabilizando dados operacionais...
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-white/5 text-center">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Clientes</span>
                  <span className="text-lg font-black text-slate-900 dark:text-white">
                    {summary?.clientsCount ?? 0}
                  </span>
                </div>
                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-white/5 text-center">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Projetos (Famílias)</span>
                  <span className="text-lg font-black text-slate-900 dark:text-white">
                    {summary?.projectFamiliesCount ?? 0}
                  </span>
                </div>
                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-white/5 text-center">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Revisões Totais</span>
                  <span className="text-lg font-black text-slate-900 dark:text-white">
                    {summary?.projectsCount ?? 0}
                  </span>
                </div>
                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-white/5 text-center">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Atividades</span>
                  <span className="text-lg font-black text-slate-900 dark:text-white">
                    {summary?.activitiesCount ?? 0}
                  </span>
                </div>
                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-white/5 text-center">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Tarefas</span>
                  <span className="text-lg font-black text-slate-900 dark:text-white">
                    {summary?.tasksCount ?? 0}
                  </span>
                </div>
                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-white/5 text-center">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Tipos Customizados</span>
                  <span className="text-lg font-black text-slate-900 dark:text-white">
                    {summary?.customActivityTypesCount ?? 0}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Caixa explicativa detalhando escopo da limpeza */}
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-700 dark:text-rose-300 text-xs leading-relaxed space-y-2">
            <p>
              <strong>O que será apagado:</strong> Todos os clientes, famílias de projetos, todas as revisões (históricas e ativas), atividades, sessões de trabalho, eventos operacionais, tarefas e tipos de atividades customizados pertencentes a este workspace.
            </p>
            <p className="text-emerald-700 dark:text-emerald-300 pt-1 border-t border-rose-500/20">
              <strong>O que será preservado:</strong> A conta da organização, suas credenciais de login, o perfil do workspace e todos os usuários internos cadastrados. Você poderá cadastrar novos clientes e projetos imediatamente após a conclusão.
            </p>
          </div>

          {/* Mensagem de erro, se houver */}
          {errorMessage && (
            <div className="p-4 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-600 dark:text-rose-400 text-xs font-bold leading-relaxed flex items-start gap-2.5 animate-in shake duration-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Campo de confirmação do Nome da Organização */}
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Para confirmar, digite o nome da organização: <span className="text-rose-600 dark:text-rose-400 font-black select-all">{organizationName}</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={typedOrgName}
                disabled={isCleaning}
                onChange={(e) => setTypedOrgName(e.target.value)}
                placeholder={`Digite "${organizationName}"`}
                className={`w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-900 border rounded-xl text-sm font-semibold text-slate-900 dark:text-white outline-none transition-all ${
                  isNameMatchValid
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-950/20'
                    : 'border-slate-200 dark:border-slate-700 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                }`}
                autoComplete="off"
                spellCheck="false"
              />
              {isNameMatchValid && (
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-500 flex items-center gap-1 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}
            </div>
          </div>

          {/* Campo de confirmação por Senha do Administrador */}
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Senha Pessoal do Administrador
            </label>
            <div className="relative">
              <input
                type="password"
                value={adminPassword}
                disabled={isCleaning}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Digite sua senha de administrador"
                className={`w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-900 border rounded-xl text-sm text-slate-900 dark:text-white outline-none transition-all ${
                  adminPassword.trim().length > 0
                    ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 dark:border-slate-700 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                }`}
                autoComplete="current-password"
              />
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
              A autenticação individual é obrigatória para autorizar a limpeza completa dos dados operacionais.
            </p>
          </div>
        </div>

        {/* Rodapé com ações */}
        <div className="px-8 py-6 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={isCleaning}
            onClick={onClose}
            className="px-6 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canExecute}
            onClick={handleExecute}
            className="px-6 py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-500/20 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isCleaning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Limpando workspace...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Confirmar Limpeza Completa</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

