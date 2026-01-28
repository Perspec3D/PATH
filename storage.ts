import { Company, InternalUser, Client, Project, LicenseStatus, UserRole } from './types';
import { supabase } from './lib/supabase';

export interface AppDB {
  company: Company | null;
  users: InternalUser[];
  clients: Client[];
  projects: Project[];
}

export { supabase };

// --- Supabase Sync Functions ---

export const fetchAllData = async (companyId?: string): Promise<Partial<AppDB>> => {
  const { data: clients } = await supabase.from('clients').select('*');
  const { data: projects } = await supabase.from('projects').select('*');
  const { data: users } = await supabase.from('internal_users').select('*');

  let profile = null;
  if (companyId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', companyId).maybeSingle();
    profile = data;
  }

  // Map snake_case from DB to camelCase in types
  return {
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
      state: c.state
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
      createdAt: new Date(p.created_at).getTime()
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
      userLimit: profile.user_limit || 1
    } : null
  };
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
    state: client.state
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
    created_at: new Date(project.createdAt).toISOString()
  });
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
    email: company.email
  }).eq('id', company.id);
  if (error) throw error;
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
  if (projects.length === 0) return 1;

  const seqs = projects.map(p => {
    const parts = p.code.split('-');
    // Padrão: [CLIENTE]-[SEQ GLOBAL]-[ANO]
    return parts.length >= 2 ? parseInt(parts[1]) : 0;
  }).filter(n => !isNaN(n));

  if (seqs.length === 0) return 1;
  return Math.max(...seqs) + 1;
};

export const getNextProjectSeq = (projects: Project[], clientId: string, year: number): number => {
  return getNextGlobalProjectSeq(projects);
};
