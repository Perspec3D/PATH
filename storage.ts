import { Company, InternalUser, Client, Project, LicenseStatus, UserRole, TeamTask, TaskType, SystemLog, LogModule, LogAction, ActivityType, ProjectActivity, ActivityExecution, WorkSession } from './types';
import { supabase } from './lib/supabase';

export interface AppDB {
  company: Company | null;
  users: InternalUser[];
  clients: Client[];
  projects: Project[];
  tasks: TeamTask[];
}

export { supabase };

// --- Supabase Sync Functions ---

let memoryCache: { timestamp: number, data: Partial<AppDB> | null, companyId: string } = { timestamp: 0, data: null, companyId: '' };
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

export const fetchAllData = async (companyId?: string, forceRefresh = false): Promise<Partial<AppDB>> => {
  if (companyId && !forceRefresh && memoryCache.companyId === companyId && memoryCache.data && (Date.now() - memoryCache.timestamp < CACHE_TTL)) {
    return memoryCache.data;
  }

  // Optimize Egress by requesting explicit columns and adding the explicit workspace_id filter
  const { data: clients } = await supabase.from('clients')
    .select('id, workspace_id, code, name, type, status, photo_url, cpf_cnpj, email, phone, zip_code, address, number, neighborhood, city, state, complement, contacts')
    .eq('workspace_id', companyId);

  const { data: projects } = await supabase.from('projects')
    .select('id, workspace_id, client_id, assignee_id, code, name, photo_url, revision, status, start_date, delivery_date, due_date, notes, subtasks, created_at')
    .eq('workspace_id', companyId);

  const { data: teamTasks } = await supabase.from('team_tasks')
    .select('id, workspace_id, title, type, assignee_id, start_date, end_date, description, created_at, start_time, end_time, reminder, reminder_dismissed, snooze_until, invited_users, reminder_state')
    .eq('workspace_id', companyId);

  const { data: users } = await supabase.from('internal_users')
    .select('id, workspace_id, username, password_hash, role, is_active, must_change_password')
    .eq('workspace_id', companyId);

  let profile = null;
  if (companyId) {
    const { data } = await supabase.from('profiles')
      .select('id, name, email, license_status, trial_start, user_limit, subscription_id, subscription_end, logo_url, work_start_time, work_end_time, lunch_duration_minutes, work_days')
      .eq('id', companyId).maybeSingle();
    profile = data;
  }

  // Map snake_case from DB to camelCase in types
  const result = {
    clients: (clients || []).map((c: any) => ({
      id: c.id,
      workspaceId: c.workspace_id,
      code: c.code,
      name: c.name,
      type: c.type,
      status: c.status,
      photoUrl: c.photo_url,
      cpfCnpj: c.cpf_cnpj,
      email: c.email,
      phone: c.phone,
      zipCode: c.zip_code,
      address: c.address,
      number: c.number,
      neighborhood: c.neighborhood,
      city: c.city,
      state: c.state,
      complement: c.complement,
      contacts: c.contacts || []
    })),
    projects: (projects || []).map((p: any) => ({
      id: p.id,
      workspaceId: p.workspace_id,
      clientId: p.client_id,
      assigneeId: p.assignee_id,
      code: p.code,
      name: p.name,
      photoUrl: p.photo_url,
      revision: p.revision,
      status: p.status,
      startDate: p.start_date,
      deliveryDate: p.delivery_date,
      dueDate: p.due_date,
      notes: p.notes,
      subtasks: p.subtasks || [],
      createdAt: new Date(p.created_at).getTime()
    })),
    tasks: (teamTasks || []).map((t: any) => ({
      id: t.id,
      workspaceId: t.workspace_id,
      title: t.title,
      type: t.type,
      assigneeId: t.assignee_id,
      startDate: t.start_date,
      endDate: t.end_date,
      description: t.description,
      createdAt: new Date(t.created_at).getTime(),
      startTime: t.start_time || undefined,
      endTime: t.end_time || undefined,
      reminder: t.reminder || 'none',
      reminderDismissed: t.reminder_dismissed || false,
      snoozeUntil: t.snooze_until ? new Date(t.snooze_until).getTime() : undefined,
      invitedUsers: t.invited_users || [],
      reminderState: t.reminder_state || {}
    })),
    users: (users || []).map((u: any) => ({
      id: u.id,
      workspaceId: u.workspace_id,
      username: u.username,
      passwordHash: u.password_hash,
      role: u.role,
      isActive: u.is_active,
      mustChangePassword: u.must_change_password
    })),
    company: profile ? {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      passwordHash: '',
      licenseStatus: profile.license_status,
      trialStart: new Date(profile.trial_start).getTime(),
      userLimit: profile.user_limit || 1,
      subscriptionId: profile.subscription_id,
      subscriptionEnd: profile.subscription_end ? new Date(profile.subscription_end).getTime() : undefined,
      logoUrl: profile.logo_url,
      workStartTime: profile.work_start_time || '08:00',
      workEndTime: profile.work_end_time || '18:00',
      lunchDurationMinutes: profile.lunch_duration_minutes !== null && profile.lunch_duration_minutes !== undefined ? profile.lunch_duration_minutes : 60,
      workDays: profile.work_days || [1, 2, 3, 4, 5]
    } : null
  };

  memoryCache = {
    timestamp: Date.now(),
    data: result,
    companyId: companyId || ''
  };

  return result;

};

export const syncClient = async (client: Client) => {
  const { error } = await supabase.from('clients').upsert({
    id: client.id,
    workspace_id: client.workspaceId,
    code: client.code,
    name: client.name,
    type: client.type,
    status: client.status,
    photo_url: client.photoUrl,
    cpf_cnpj: client.cpfCnpj,
    email: client.email,
    phone: client.phone,
    zip_code: client.zipCode,
    address: client.address,
    number: client.number,
    neighborhood: client.neighborhood,
    city: client.city,
    state: client.state,
    complement: client.complement,
    contacts: client.contacts
  });
  if (error) throw error;
};

export const syncProject = async (project: Project) => {
  const { error } = await supabase.from('projects').upsert({
    id: project.id,
    workspace_id: project.workspaceId,
    client_id: project.clientId,
    assignee_id: project.assigneeId || null,
    code: project.code,
    name: project.name,
    photo_url: project.photoUrl,
    revision: project.revision,
    status: project.status,
    start_date: project.startDate || null,
    delivery_date: project.deliveryDate || null,
    due_date: project.dueDate || null,
    notes: project.notes,
    subtasks: project.subtasks || [],
    created_at: new Date(project.createdAt).toISOString()
  });
  if (error) throw error;
};

export const deleteProject = async (projectId: string) => {
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) throw error;
};

export const syncTeamTask = async (task: TeamTask) => {
  const { error } = await supabase.from('team_tasks').upsert({
    id: task.id,
    workspace_id: task.workspaceId,
    title: task.title,
    type: task.type,
    assignee_id: task.assigneeId,
    start_date: task.startDate,
    end_date: task.endDate,
    description: task.description,
    created_at: new Date(task.createdAt).toISOString(),
    start_time: task.startTime || null,
    end_time: task.endTime || null,
    reminder: task.reminder || 'none',
    reminder_dismissed: task.reminderDismissed || false,
    snooze_until: task.snoozeUntil ? new Date(task.snoozeUntil).toISOString() : null,
    invited_users: task.invitedUsers || [],
    reminder_state: task.reminderState || {}
  });
  if (error) throw error;
};

export const deleteTeamTask = async (taskId: string) => {
  const { error } = await supabase.from('team_tasks').delete().eq('id', taskId);
  if (error) throw error;
};

export const syncUser = async (user: InternalUser) => {
  const { error } = await supabase.from('internal_users').upsert({
    id: user.id,
    workspace_id: user.workspaceId,
    username: user.username,
    password_hash: user.passwordHash,
    role: user.role,
    is_active: user.isActive,
    must_change_password: user.mustChangePassword
  }, { onConflict: 'id' });
  if (error) throw error;
};

export const syncCompany = async (company: Company) => {
  const { error } = await supabase.from('profiles').update({
    name: company.name,
    email: company.email,
    logo_url: company.logoUrl,
    work_start_time: company.workStartTime,
    work_end_time: company.workEndTime,
    lunch_duration_minutes: company.lunchDurationMinutes,
    work_days: company.workDays
  }).eq('id', company.id);
  if (error) throw error;

  if (memoryCache.data && memoryCache.data.company && memoryCache.data.company.id === company.id) {
    memoryCache.data.company = { ...company };
  }
};

// --- Helper Functions ---
export const getNextClientCode = (clients: Client[]): string => {
  const codes = clients.map(c => parseInt(c.code)).filter(n => !isNaN(n)).sort((a, b) => a - b);
  let next = 1;
  for (const code of codes) {
    if (code === next) next++;
    else if (code > next) break;
  }
  return next.toString().padStart(3, '0');
};

export const getNextGlobalProjectSeq = (projects: Project[]): number => {
  const seqs = projects.map(p => {
    const parts = p.code.split('-');
    // A sequência é sempre a penúltima parte no padrão [PREFIX-]CLI-SEQ-YY
    if (parts.length >= 3) {
      const seqStr = parts[parts.length - 2];
      const val = parseInt(seqStr);
      return isNaN(val) ? 0 : val;
    }
    const matches = p.code.match(/\d+/);
    return matches ? parseInt(matches[0]) : 0;
  }).filter(n => n > 0).sort((a, b) => a - b);

  let next = 1;
  for (const seq of seqs) {
    if (seq === next) next++;
    else if (seq > next) break;
  }
  return next;
};

export const getNextProjectSeq = (projects: Project[], clientId: string, year: number): number => {
  return getNextGlobalProjectSeq(projects);
};

export const logAction = async (workspaceId: string, user: InternalUser, module: LogModule, action: LogAction, details: string, itemId?: string) => {
  const { error } = await supabase.from('logs').insert({
    workspace_id: workspaceId,
    user_id: user.id,
    user_name: user.username,
    user_role: user.role,
    module: module,
    action: action,
    details: details,
    item_id: itemId || null
  });
  if (error) console.error("Error logging action:", error);
};

export const fetchLogs = async (workspaceId: string): Promise<SystemLog[]> => {
  const { data, error } = await supabase.from('logs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error("Error fetching logs:", error);
    return [];
  }

  return (data || []).map((l: any) => ({
    id: l.id,
    workspaceId: l.workspace_id,
    createdAt: new Date(l.created_at).getTime(),
    userId: l.user_id,
    userName: l.user_name,
    userRole: l.user_role,
    module: l.module,
    action: l.action,
    itemId: l.item_id,
    details: l.details,
    ipAddress: l.ip_address
  }));
};

// --- Activity Types & Project Activities Data Access ---

export const fetchActivityTypes = async (workspaceId: string): Promise<ActivityType[]> => {
  const { data, error } = await supabase.from('activity_types')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data || []).map((at: any) => ({
    id: at.id,
    workspaceId: at.workspace_id,
    name: at.name,
    description: at.description || undefined,
    category: at.category || undefined,
    isActive: at.is_active,
    displayOrder: at.display_order,
    createdAt: new Date(at.created_at).getTime(),
    updatedAt: new Date(at.updated_at).getTime()
  }));
};

export const syncActivityType = async (activityType: ActivityType) => {
  const { error } = await supabase.from('activity_types').upsert({
    id: activityType.id,
    workspace_id: activityType.workspaceId,
    name: activityType.name,
    description: activityType.description || null,
    category: activityType.category || null,
    is_active: activityType.isActive,
    display_order: activityType.displayOrder,
    created_at: activityType.createdAt ? new Date(activityType.createdAt).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
};

export const deleteOrDeactivateActivityType = async (typeId: string): Promise<{ deleted: boolean }> => {
  // Check if there are any project activities referencing this activity type
  const { count, error: countError } = await supabase.from('project_activities')
    .select('*', { count: 'exact', head: true })
    .eq('activity_type_id', typeId);

  if (countError) throw countError;

  if (count && count > 0) {
    // If used, just deactivate
    const { error: updateError } = await supabase.from('activity_types')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', typeId);
    if (updateError) throw updateError;
    return { deleted: false };
  } else {
    // If never used, delete physically
    const { error: deleteError } = await supabase.from('activity_types')
      .delete()
      .eq('id', typeId);
    if (deleteError) throw deleteError;
    return { deleted: true };
  }
};

export const fetchProjectActivities = async (workspaceId: string, projectId?: string): Promise<ProjectActivity[]> => {
  let query = supabase.from('project_activities')
    .select('*')
    .eq('workspace_id', workspaceId);

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  const { data, error } = await query
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data || []).map((pa: any) => ({
    id: pa.id,
    workspaceId: pa.workspace_id,
    projectId: pa.project_id,
    activityTypeId: pa.activity_type_id || undefined,
    name: pa.name,
    assigneeId: pa.assignee_id || undefined,
    status: pa.status,
    startDate: pa.start_date || undefined,
    deliveryDate: pa.delivery_date || undefined,
    notes: pa.notes || undefined,
    estimatedDurationHours: pa.estimated_duration_hours !== null ? Number(pa.estimated_duration_hours) : undefined,
    orderIndex: pa.order_index,
    actualStartDate: pa.actual_start_date || undefined,
    actualEndDate: pa.actual_end_date || undefined,
    conclusionResponsibleId: pa.conclusion_responsible_id || undefined,
    deadlineChangesCount: pa.deadline_changes_count,
    deadlineAtConclusion: pa.deadline_at_conclusion || undefined,
    createdAt: new Date(pa.created_at).getTime(),
    updatedAt: new Date(pa.updated_at).getTime()
  }));
};

export const syncProjectActivity = async (activity: ProjectActivity) => {
  const { error } = await supabase.from('project_activities').upsert({
    id: activity.id,
    workspace_id: activity.workspaceId,
    project_id: activity.projectId,
    activity_type_id: activity.activityTypeId || null,
    name: activity.name,
    assignee_id: activity.assigneeId || null,
    status: activity.status,
    start_date: activity.startDate || null,
    delivery_date: activity.deliveryDate || null,
    notes: activity.notes || null,
    estimated_duration_hours: activity.estimatedDurationHours !== undefined ? activity.estimatedDurationHours : null,
    order_index: activity.orderIndex,
    actual_start_date: activity.actualStartDate || null,
    actual_end_date: activity.actualEndDate || null,
    conclusion_responsible_id: activity.conclusionResponsibleId || null,
    deadline_changes_count: activity.deadlineChangesCount,
    deadline_at_conclusion: activity.deadlineAtConclusion || null,
    created_at: activity.createdAt ? new Date(activity.createdAt).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
};

export const deleteProjectActivity = async (activityId: string) => {
  const { error } = await supabase.from('project_activities')
    .delete()
    .eq('id', activityId);
  if (error) throw error;
};

export const getNextUserOrderIndex = async (workspaceId: string, assigneeId: string): Promise<number> => {
  const { data, error } = await supabase.from('project_activities')
    .select('order_index')
    .eq('workspace_id', workspaceId)
    .eq('assignee_id', assigneeId)
    .order('order_index', { ascending: false })
    .limit(1);
  
  if (error) throw error;
  if (data && data.length > 0) {
    return (data[0].order_index || 0) + 1;
  }
  return 1;
};

export const reorderUserQueue = async (workspaceId: string, assigneeId: string) => {
  const { data, error } = await supabase.from('project_activities')
    .select('id, order_index, created_at')
    .eq('workspace_id', workspaceId)
    .eq('assignee_id', assigneeId)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true });
  
  if (error) throw error;
  if (!data || data.length === 0) return;

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const newIdx = i + 1;
    if (item.order_index !== newIdx) {
      await supabase.from('project_activities')
        .update({ order_index: newIdx, updated_at: new Date().toISOString() })
        .eq('id', item.id);
    }
  }
};

// --- Activity Executions & Work Sessions Data Access ---

const mapActivityExecution = (execution: any): ActivityExecution => ({
  id: execution.id,
  workspaceId: execution.workspace_id,
  projectActivityId: execution.project_activity_id,
  internalUserId: execution.internal_user_id,
  status: execution.status,
  startedAt: new Date(execution.started_at).getTime(),
  completedAt: execution.completed_at ? new Date(execution.completed_at).getTime() : undefined,
  createdAt: new Date(execution.created_at).getTime(),
  updatedAt: new Date(execution.updated_at).getTime()
});

const mapWorkSession = (session: any): WorkSession => ({
  id: session.id,
  workspaceId: session.workspace_id,
  activityExecutionId: session.activity_execution_id,
  internalUserId: session.internal_user_id,
  startedAt: new Date(session.started_at).getTime(),
  endedAt: session.ended_at ? new Date(session.ended_at).getTime() : undefined,
  createdAt: new Date(session.created_at).getTime(),
  updatedAt: new Date(session.updated_at).getTime()
});

export const fetchActivityExecutions = async (
  workspaceId: string,
  filters: { projectActivityId?: string; internalUserId?: string } = {}
): Promise<ActivityExecution[]> => {
  let query = supabase.from('activity_executions')
    .select('id, workspace_id, project_activity_id, internal_user_id, status, started_at, completed_at, created_at, updated_at')
    .eq('workspace_id', workspaceId);

  if (filters.projectActivityId) {
    query = query.eq('project_activity_id', filters.projectActivityId);
  }
  if (filters.internalUserId) {
    query = query.eq('internal_user_id', filters.internalUserId);
  }

  const { data, error } = await query.order('started_at', { ascending: false });
  if (error) throw error;

  return (data || []).map(mapActivityExecution);
};

export const syncActivityExecution = async (execution: ActivityExecution) => {
  const { error } = await supabase.from('activity_executions').upsert({
    id: execution.id,
    workspace_id: execution.workspaceId,
    project_activity_id: execution.projectActivityId,
    internal_user_id: execution.internalUserId,
    status: execution.status,
    started_at: new Date(execution.startedAt).toISOString(),
    completed_at: execution.completedAt !== undefined ? new Date(execution.completedAt).toISOString() : null,
    created_at: new Date(execution.createdAt).toISOString()
  });
  if (error) throw error;
};

export const deleteActivityExecution = async (executionId: string) => {
  const { error } = await supabase.from('activity_executions')
    .delete()
    .eq('id', executionId);
  if (error) throw error;
};

export const fetchWorkSessions = async (
  workspaceId: string,
  filters: { activityExecutionId?: string; internalUserId?: string } = {}
): Promise<WorkSession[]> => {
  let query = supabase.from('work_sessions')
    .select('id, workspace_id, activity_execution_id, internal_user_id, started_at, ended_at, created_at, updated_at')
    .eq('workspace_id', workspaceId);

  if (filters.activityExecutionId) {
    query = query.eq('activity_execution_id', filters.activityExecutionId);
  }
  if (filters.internalUserId) {
    query = query.eq('internal_user_id', filters.internalUserId);
  }

  const { data, error } = await query.order('started_at', { ascending: false });
  if (error) throw error;

  return (data || []).map(mapWorkSession);
};

export const fetchActiveWorkSession = async (
  workspaceId: string,
  internalUserId: string
): Promise<WorkSession | null> => {
  const { data, error } = await supabase.from('work_sessions')
    .select('id, workspace_id, activity_execution_id, internal_user_id, started_at, ended_at, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .eq('internal_user_id', internalUserId)
    .is('ended_at', null)
    .maybeSingle();

  if (error) throw error;
  return data ? mapWorkSession(data) : null;
};

export const syncWorkSession = async (session: WorkSession) => {
  const { error } = await supabase.from('work_sessions').upsert({
    id: session.id,
    workspace_id: session.workspaceId,
    activity_execution_id: session.activityExecutionId,
    internal_user_id: session.internalUserId,
    started_at: new Date(session.startedAt).toISOString(),
    ended_at: session.endedAt !== undefined ? new Date(session.endedAt).toISOString() : null,
    created_at: new Date(session.createdAt).toISOString()
  });
  if (error) throw error;
};

export const deleteWorkSession = async (sessionId: string) => {
  const { error } = await supabase.from('work_sessions')
    .delete()
    .eq('id', sessionId);
  if (error) throw error;
};
