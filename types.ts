
export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER'
}

export enum ProjectStatus {
  QUEUE = 'Fila de Espera',
  IN_PROGRESS = 'Em Andamento',
  PAUSED = 'Pausado',
  DONE = 'Concluído',
  CANCELED = 'Cancelado'
}

export enum TaskStatus {
  TODO = 'TODO',
  DOING = 'DOING',
  DONE = 'DONE'
}

export enum LicenseStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED'
}

export interface Company {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  licenseStatus: LicenseStatus;
  trialStart: number;
}

export interface InternalUser {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword?: boolean;
}

export interface Client {
  id: string;
  code: string; 
  name: string;
  type: 'PF' | 'PJ';
  status: 'ACTIVE' | 'INACTIVE';
  photoUrl?: string;
  cpfCnpj?: string;
  email?: string;
  phone?: string;
  address?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

export interface Project {
  id: string;
  clientId: string;
  assigneeId?: string; // ID do usuário responsável
  code: string; // [client_code]-[project_seq]-[year]
  name: string;
  photoUrl?: string;
  revision: string;
  status: ProjectStatus;
  startDate?: string;
  deliveryDate?: string;
  dueDate?: string;
  notes?: string;
  createdAt: number;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  startDate?: string;
  endDate?: string;
  status: TaskStatus;
  assignee?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  username: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT';
  entity: 'CLIENT' | 'PROJECT' | 'TASK' | 'USER' | 'AUTH';
  entityId?: string;
  details: string; 
  timestamp: number;
}
