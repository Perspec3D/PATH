
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

export enum LicenseStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED'
}

export interface Company {
  id: string; // This is the user id and also the unique workspace identifier
  name: string;
  email: string;
  passwordHash: string;
  licenseStatus: LicenseStatus;
  trialStart: number;
  userLimit: number;
}

export interface InternalUser {
  id: string;
  workspaceId: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword?: boolean;
}

export interface Client {
  id: string;
  workspaceId: string;
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
  workspaceId: string;
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
