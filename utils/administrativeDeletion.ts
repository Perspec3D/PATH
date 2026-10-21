import { Client, InternalUser, Project, ProjectActivity, ProjectActivityEvent, UserRole } from '../types';
import type { AppDB } from '../storage';

export interface UserPermissionCheck {
  allowed: boolean;
  reason?: string;
}

export interface ClientDeletionEligibility {
  canDelete: boolean;
  reason?: string;
  linkedProjectsCount: number;
  linkedProjects: Project[];
}

export interface ProjectDeletionImpact {
  familyId: string;
  familyCode: string;
  familyName: string;
  revisionsCount: number;
  revisions: Project[];
  activitiesCount: number;
  activities: ProjectActivity[];
  eventsCount: number;
  attachmentsCount: number;
}

/**
 * Validates whether the given user has administrative permission
 * to execute permanent deletions in the designated workspace.
 */
export const canUserDeletePermanently = (
  user: InternalUser | null | undefined,
  workspaceId: string
): UserPermissionCheck => {
  if (!user) {
    return {
      allowed: false,
      reason: 'Usuário não autenticado.'
    };
  }

  if (!workspaceId || user.workspaceId !== workspaceId) {
    return {
      allowed: false,
      reason: 'Acesso negado: operação entre workspaces não permitida.'
    };
  }

  if (!user.isActive) {
    return {
      allowed: false,
      reason: 'Usuário inativo não possui permissão para executar exclusões.'
    };
  }

  if (user.role !== UserRole.ADMIN) {
    return {
      allowed: false,
      reason: 'Permissão negada: apenas administradores do workspace podem excluir registros permanentemente.'
    };
  }

  return { allowed: true };
};

/**
 * Evaluates if a client is eligible for permanent deletion.
 * Blocks deletion if the client has any associated projects (active or historical revisions).
 */
export const evaluateClientDeletionEligibility = (
  clientId: string,
  workspaceId: string,
  allProjects: Project[]
): ClientDeletionEligibility => {
  if (!clientId) {
    return {
      canDelete: false,
      reason: 'Identificador do cliente não informado.',
      linkedProjectsCount: 0,
      linkedProjects: []
    };
  }

  const linkedProjects = allProjects.filter(p => {
    const isMatchingClient = p.clientId === clientId;
    const isMatchingWorkspace = !workspaceId || p.workspaceId === workspaceId;
    return isMatchingClient && isMatchingWorkspace;
  });

  if (linkedProjects.length > 0) {
    return {
      canDelete: false,
      linkedProjectsCount: linkedProjects.length,
      linkedProjects,
      reason: `Este cliente possui ${linkedProjects.length} projeto(s) vinculado(s) e não pode ser excluído. Os vínculos precisam ser resolvidos antes da exclusão.`
    };
  }

  return {
    canDelete: true,
    linkedProjectsCount: 0,
    linkedProjects: []
  };
};

/**
 * Resolves the canonical identity of a project and calculates
 * the full impact of permanent deletion across all its revisions and activities.
 */
export const calculateProjectDeletionImpact = (
  targetProjectIdOrFamilyId: string,
  workspaceId: string,
  allProjects: Project[],
  allActivities: ProjectActivity[] = [],
  allEvents: ProjectActivityEvent[] = []
): ProjectDeletionImpact => {
  // 1. Locate the target project in the loaded projects
  const targetProject = allProjects.find(
    p => (p.familyId === targetProjectIdOrFamilyId || p.id === targetProjectIdOrFamilyId) &&
         (!workspaceId || p.workspaceId === workspaceId)
  );

  const canonicalFamilyId = targetProject?.familyId || targetProjectIdOrFamilyId;
  const canonicalCode = targetProject?.familyCode || targetProject?.code || 'PROJETO';
  const canonicalName = targetProject?.familyName || targetProject?.name || 'Projeto';

  // 2. Identify all revisions belonging to this canonical family
  const revisions = allProjects.filter(p => {
    const matchesFamily = p.familyId ? p.familyId === canonicalFamilyId : p.id === canonicalFamilyId;
    const matchesWorkspace = !workspaceId || p.workspaceId === workspaceId;
    return matchesFamily && matchesWorkspace;
  });

  const revisionIds = new Set(revisions.map(r => r.id));
  if (targetProject && !revisionIds.has(targetProject.id)) {
    revisionIds.add(targetProject.id);
  }

  // 3. Identify all activities linked to any revision in this family
  const activities = allActivities.filter(act => {
    const matchesRevision = revisionIds.has(act.projectId);
    const matchesWorkspace = !workspaceId || act.workspaceId === workspaceId;
    return matchesRevision && matchesWorkspace;
  });

  const activityIds = new Set(activities.map(a => a.id));

  // 4. Count events linked to these activities
  const eventsCount = allEvents.filter(ev => {
    const matchesActivity = activityIds.has(ev.activityId);
    const matchesWorkspace = !workspaceId || ev.workspaceId === workspaceId;
    return matchesActivity && matchesWorkspace;
  }).length;

  // 5. Count attachments / photos associated exclusively with revisions
  const attachmentsCount = revisions.filter(r => Boolean(r.photoUrl)).length;

  return {
    familyId: canonicalFamilyId,
    familyCode: canonicalCode,
    familyName: canonicalName,
    revisionsCount: Math.max(revisions.length, 1),
    revisions,
    activitiesCount: activities.length,
    activities,
    eventsCount,
    attachmentsCount
  };
};

/**
 * Validates typed confirmation code for project deletion.
 * The administrator must type the exact project code (case-sensitive, trimmed).
 */
export const isProjectConfirmationCodeValid = (
  typedInput: string,
  expectedCode: string
): boolean => {
  if (!typedInput || !expectedCode) return false;
  return typedInput.trim() === expectedCode.trim();
};

/**
 * Validates typed confirmation for client deletion.
 * The administrator must type either the client code or the client name.
 */
export const isClientConfirmationValid = (
  typedInput: string,
  clientCode: string,
  clientName: string
): boolean => {
  if (!typedInput) return false;
  const normalizedInput = typedInput.trim().toLowerCase();
  const normalizedCode = (clientCode || '').trim().toLowerCase();
  const normalizedPaddedCode = (clientCode || '').trim().padStart(3, '0').toLowerCase();
  const unpaddedCode = (clientCode || '').trim().replace(/^0+/, '').toLowerCase();
  const unpaddedInput = normalizedInput.replace(/^0+/, '');
  const normalizedName = (clientName || '').trim().toLowerCase();

  return (
    normalizedInput === normalizedCode ||
    normalizedInput === normalizedPaddedCode ||
    (unpaddedInput !== '' && unpaddedInput === unpaddedCode) ||
    normalizedInput === normalizedName
  );
};

/**
 * Validates typed confirmation for workspace operational cleanup.
 * The administrator must type the exact organization name (case-insensitive, trimmed).
 */
export const isOrganizationNameConfirmationValid = (
  typedInput: string,
  expectedOrgName: string
): boolean => {
  if (!typedInput || !expectedOrgName) return false;
  return typedInput.trim().toLowerCase() === expectedOrgName.trim().toLowerCase();
};

/**
 * Pure state reducer function: removes all operational data (clients, projects, tasks)
 * from the local application database state while preserving organization profile and users.
 */
export const applyWorkspaceCleanupToState = (prevState: AppDB): AppDB => {
  return {
    ...prevState,
    clients: [],
    projects: [],
    tasks: []
  };
};

/**
 * Pure state reducer function: removes all project revisions belonging to the deleted family
 * from the local application database state.
 */
export const applyProjectDeletionToState = (
  prevState: AppDB,
  deletedFamilyId: string
): AppDB => {
  if (!deletedFamilyId) return prevState;

  const filteredProjects = prevState.projects.filter(p => {
    const isThisFamily = p.familyId === deletedFamilyId || p.id === deletedFamilyId;
    return !isThisFamily;
  });

  return {
    ...prevState,
    projects: filteredProjects
  };
};

/**
 * Pure state reducer function: removes the deleted client from the local application database state.
 */
export const applyClientDeletionToState = (
  prevState: AppDB,
  deletedClientId: string
): AppDB => {
  if (!deletedClientId) return prevState;

  const filteredClients = prevState.clients.filter(c => c.id !== deletedClientId);

  return {
    ...prevState,
    clients: filteredClients
  };
};

/**
 * Formats standard audit log details for administrative project deletion.
 */
export const formatAuditLogDetailsForProjectDeletion = (params: {
  code: string;
  name: string;
  revisionsCount: number;
  activitiesCount: number;
}): string => {
  return `Exclusão permanente do projeto ${params.code} (${params.name}). ${params.revisionsCount} revisão(ões) e ${params.activitiesCount} atividade(s) excluídas.`;
};

/**
 * Formats standard audit log details for administrative client deletion.
 */
export const formatAuditLogDetailsForClientDeletion = (params: {
  code: string;
  name: string;
}): string => {
  return `Exclusão permanente do cliente ${params.code} (${params.name}).`;
};

/**
 * Sanitizes technical Supabase / PostgreSQL error messages into clear,
 * human-readable Portuguese messages for the end user.
 */
export const sanitizeAdministrativeErrorMessage = (err: any): string => {
  const raw = String(err?.message || err?.details || err || '');

  if (
    raw.includes('schema cache') ||
    raw.includes('Could not find the function') ||
    raw.includes('PGRST202')
  ) {
    return 'A função de exclusão administrativa não está habilitada no banco de dados. A operação foi cancelada com segurança.';
  }

  if (
    raw.includes('ADMIN_CREDENTIAL_REQUIRED') ||
    raw.includes('INVALID_ADMIN_CREDENTIAL') ||
    raw.includes('ADMIN_CREDENTIAL_NOT_CONFIGURED')
  ) {
    return 'Credencial de confirmação do administrador inválida ou não informada. A operação foi cancelada com segurança.';
  }

  if (raw.includes('DIRECT_PROJECT_DELETION_PROHIBITED') || raw.includes('DIRECT_CLIENT_DELETION_PROHIBITED')) {
    return 'A exclusão direta em tabelas é bloqueada por segurança. Utilize exclusivamente a interface de exclusão administrativa.';
  }

  if (raw.includes('ADMIN_AUTHORIZATION_REQUIRED') || raw.includes('42501')) {
    return 'Operação restrita a administradores ativos do workspace.';
  }

  if (raw.includes('WORKSPACE_ACCESS_DENIED')) {
    return 'Acesso negado: operação restrita ao workspace autenticado.';
  }

  if (raw.includes('CLIENT_HAS_DEPENDENCIES') || raw.includes('23503')) {
    return 'Este cliente possui projetos vinculados e não pode ser excluído permanentemente.';
  }

  if (raw.includes('PROJECT_FAMILY_NOT_FOUND')) {
    return 'Projeto ou família não encontrada no workspace atual.';
  }

  if (raw.includes('CLIENT_NOT_FOUND')) {
    return 'Cliente não encontrado no workspace atual.';
  }

  if (raw.includes('ORGANIZATION_NAME_REQUIRED')) {
    return 'O nome da organização é obrigatório para confirmar a limpeza.';
  }

  if (raw.includes('ORGANIZATION_NAME_MISMATCH')) {
    return 'O nome da organização digitado não corresponde à organização selecionada.';
  }

  if (raw.includes('WORKSPACE_NOT_FOUND')) {
    return 'Organização / Workspace não encontrado.';
  }

  if (raw.includes('EXCLUSION_REQUIRES_ADMINISTRATIVE_RPC')) {
    return 'A exclusão permanente exige autorização administrativa e execução via procedimento transacional seguro.';
  }

  return raw || 'Ocorreu um erro ao executar a exclusão. A operação foi cancelada com segurança.';
};

