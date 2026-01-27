
import { Company, InternalUser, Client, Project, Task, AuditLog, LicenseStatus, UserRole } from './types';

const STORAGE_KEY = 'PATH_APP_DATA';

interface AppDB {
  company: Company | null;
  users: InternalUser[];
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  auditLogs: AuditLog[];
}

const initialDB: AppDB = {
  company: null,
  users: [],
  clients: [],
  projects: [],
  tasks: [],
  auditLogs: [],
};

export const getDB = (): AppDB => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : initialDB;
};

export const saveDB = (db: AppDB) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
};

export const addAuditLog = (
  userId: string, 
  username: string, 
  action: AuditLog['action'], 
  entity: AuditLog['entity'], 
  entityId: string | undefined, 
  details: any
) => {
  const db = getDB();
  const log: AuditLog = {
    id: Math.random().toString(36).substr(2, 9),
    userId,
    username,
    action,
    entity,
    entityId,
    details: JSON.stringify(details),
    timestamp: Date.now(),
  };
  db.auditLogs.unshift(log);
  saveDB(db);
};

export const getNextClientCode = (clients: Client[]): string => {
  const codes = clients.map(c => parseInt(c.code)).sort((a, b) => a - b);
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
