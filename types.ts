
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
  VISITA_TECNICA = 'Visita Técnica',
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
  workStartTime?: string;
  workEndTime?: string;
  lunchDurationMinutes?: number;
  workDays?: number[];
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
  familyId?: string;
  familyCode?: string;
  familyName?: string;
  revisionNumber?: number;
  isCurrentRevision?: boolean;
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
  updatedAt?: number;
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
  startTime?: string;
  endTime?: string;
  reminder?: string;
  reminderDismissed?: boolean;
  snoozeUntil?: number;
  invitedUsers?: string[];
  reminderState?: { [userId: string]: { dismissed: boolean; snoozeUntil?: number } };
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

export interface ActivityType {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  category?: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: number;
  updatedAt: number;
}

export enum ActivityCanonicalStatus {
  TO_DO = 'A FAZER',
  IN_PROGRESS = 'EM ANDAMENTO',
  BLOCKED = 'BLOQUEADA',
  COMPLETED = 'CONCLUÍDA'
}

export type ActivityEventType = 
  | 'CREATED'
  | 'STARTED'
  | 'BLOCKED'
  | 'RESUMED'
  | 'COMPLETED'
  | 'REOPENED'
  | 'RESCHEDULED'
  | 'DATES_ADJUSTED'
  | 'ASSIGNEE_CHANGED'
  | 'UPDATED';

export interface ProjectActivityEvent {
  id: string;
  workspaceId: string;
  activityId: string;
  eventType: ActivityEventType;
  fromStatus?: string;
  toStatus?: string;
  details?: string;
  metadata?: Record<string, any>;
  actorId?: string;
  actorName?: string;
  createdAt: number;
}

export enum ActivityDeadlineStatus {
  ON_TIME = 'NO_PRAZO',
  UPCOMING = 'VENCIMENTO_PROXIMO',
  OVERDUE = 'ATRASADA',
  COMPLETED_ON_TIME = 'CONCLUIDA_NO_PRAZO',
  COMPLETED_EARLY = 'CONCLUIDA_ADIANTADA',
  COMPLETED_LATE = 'CONCLUIDA_COM_ATRASO',
  NOT_APPLICABLE = 'NAO_APLICAVEL'
}

export interface ActivityManagerialMetrics {
  plannedDurationDays: number | null;
  leadTimeRealizedDays: number | null;
  leadTimeInProgressDays: number | null;
  originalDeadlineDeviationDays: number | null;
  updatedDeadlineDeviationDays: number | null;
  deadlineChangesCount: number;
  blockedDurationDays: number | null;
  isOverdue: boolean;
  isUpcoming: boolean;
  isOnTime: boolean;
  deadlineStatus: ActivityDeadlineStatus;
  deadlineLabel: string;
}

export interface ProjectActivity {
  id: string;
  workspaceId: string;
  projectId: string;
  activityTypeId?: string;
  name: string;
  assigneeId?: string;
  status: ProjectStatus | ActivityCanonicalStatus | string;
  startDate?: string; // Planned start date (YYYY-MM-DD)
  deliveryDate?: string; // Updated delivery forecast (YYYY-MM-DD)
  originalDeliveryDate?: string; // Original approved delivery forecast (YYYY-MM-DD)
  notes?: string;
  blockedReason?: string;
  estimatedDurationHours?: number; // Legacy preserved
  estimatedCurrentHours?: number; // Legacy preserved
  orderIndex: number;
  actualStartDate?: string; // Actual start date (YYYY-MM-DD)
  actualEndDate?: string; // Actual completion date (YYYY-MM-DD)
  conclusionResponsibleId?: string;
  deadlineChangesCount: number;
  deadlineAtConclusion?: string;
  createdAt: number;
  updatedAt: number;
}

export enum ActivityExecutionStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  CANCELED = 'CANCELED'
}

export interface ActivityExecution {
  id: string;
  workspaceId: string;
  projectActivityId: string;
  internalUserId: string;
  status: ActivityExecutionStatus;
  startedAt: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface WorkSession {
  id: string;
  workspaceId: string;
  activityExecutionId: string;
  internalUserId: string;
  startedAt: number;
  endedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ActivityOvertimeEntry {
  id: string;
  workspaceId: string;
  projectActivityId: string;
  date: string;
  authorizedHours: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  notes?: string;
}

export type ActivityTransitionAction = 'STARTED' | 'RESUMED' | 'ALREADY_RUNNING';

export interface ActivityTransitionResult {
  activityExecutionId: string;
  workSessionId?: string;
  transitionAction?: ActivityTransitionAction;
  transitionedAt: number;
  previousProjectActivityId?: string;
}

export interface ActiveWorkSessionContext {
  session: WorkSession;
  sessions: WorkSession[];
  overtimeEntries: ActivityOvertimeEntry[];
  execution: ActivityExecution;
  activity: {
    id: string;
    projectId: string;
    name: string;
    status: ProjectStatus;
  };
  project: {
    id: string;
    code: string;
    name: string;
  };
}
