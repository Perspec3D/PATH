
export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
  VIEWER = 'VIEWER'
}

export enum ProjectStatus {
  QUEUE = 'Fila de Espera',
  IN_PROGRESS = 'Em Andamento',
  PAUSED = 'Pausado',
  DONE = 'Concluído',
  CANCELED = 'Cancelado'
}

export enum TaskType {
  REUNIAO = 'Reunião',
  ESTUDO = 'Estudo',
  FOLGA = 'Folga',
  FERIAS = 'Férias',
  TREINAMENTO = 'Treinamento',
  OBSERVACAO = 'Observação',
  OUTROS = 'Outros'
}

export enum LicenseStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED'
}

export interface Company {
  id: string; // This is the user id and also the unique workspace identifier
  name: string;
  email: string;
  passwordHash: string;
  licenseStatus: LicenseStatus;
  trialStart: number;
  userLimit: number;
  subscriptionId?: string;
  subscriptionEnd?: number;
  logoUrl?: string;
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

export interface ClientContact {
  id: string;
  name: string;
  position: string; // Cargo
  department: string; // Setor
  email: string;
  phone: string;
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
  complement?: string;
  contacts?: ClientContact[];
}

export interface ProjectSubTask {
  id: string;
  name: string;
  assigneeId?: string;
  status: ProjectStatus;
  startDate?: string;
  deliveryDate?: string;
  notes?: string;
  // Historical Tracking
  actualStartDate?: string;
  plannedEndDate?: string;
  actualEndDate?: string;
  conclusionResponsibleId?: string;
  deadlineChangesCount?: number;
  deadlineAtConclusion?: string;
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
  subtasks?: ProjectSubTask[];
  createdAt: number;
  // Historical Tracking
  actualStartDate?: string;
  plannedEndDate?: string;
  actualEndDate?: string;
  conclusionResponsibleId?: string;
  deadlineChangesCount?: number;
  deadlineAtConclusion?: string;
}

export interface TeamTask {
  id: string;
  workspaceId: string;
  title: string;
  type: TaskType;
  assigneeId: string;
  startDate: string;
  endDate: string;
  description?: string;
  createdAt: number;
}

export enum LogModule {
  CLIENTS = 'Clientes',
  PROJECTS = 'Projetos',
  SUBTASKS = 'Subtarefas',
  TASKS = 'Tarefas',
  USERS = 'Usuários',
  SETTINGS = 'Configurações',
  AUTH = 'Login e Logout'
}

export enum LogAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  STATUS_CHANGE = 'STATUS_CHANGE',
  DATE_CHANGE = 'DATE_CHANGE',
  ASSIGNMENT_CHANGE = 'ASSIGNMENT_CHANGE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT'
}

export interface SystemLog {
  id: string;
  workspaceId: string;
  createdAt: number;
  userId: string;
  userName: string;
  userRole: string;
  module: LogModule;
  action: LogAction;
  itemId?: string;
  details: string;
  ipAddress?: string;
}
