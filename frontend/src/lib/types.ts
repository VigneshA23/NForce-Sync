export type Role =
  | 'employee'
  | 'lead'
  | 'pm'
  | 'dm'
  | 'hr'
  | 'finance'
  | 'leadership'
  | 'superadmin';

export type EodStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'changes_requested'
  | 'missed';

export type TaskStatus =
  | 'completed'
  | 'in_progress'
  | 'blocked'
  | 'not_started';

export type UtilCategory =
  | 'billable'
  | 'non_billable_productive'
  | 'bench'
  | 'idle';

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  managerId: string | null;
  allocationPct: number;
  joinedAt: string;
}

export interface Project {
  id: string;
  name: string;
  code: string;
  clientName: string;
  isBillable: boolean;
  startDate: string;
  endDate: string | null;
  pmId: string;
  dmId: string;
}

export interface Allocation {
  id: string;
  employeeId: string;
  projectId: string;
  allocationPct: number;
  startDate: string;
  endDate: string | null;
  category: UtilCategory;
}

export interface TaskRow {
  id: string;
  description: string;
  projectId: string;
  allocationId: string;
  hoursLogged: number;
  category: UtilCategory;
  status: TaskStatus;
  notes: string;
}

export interface EodEntry {
  id: string;
  employeeId: string;
  date: string;
  status: EodStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectionReason: string | null;
  tasks: TaskRow[];
  totalHours: number;
}

export interface Approval {
  id: string;
  eodEntryId: string;
  reviewerId: string;
  action: 'approved' | 'rejected' | 'changes_requested';
  comment: string | null;
  actedAt: string;
}

export interface UtilSnapshot {
  id: string;
  employeeId: string;
  date: string;
  approvedHours: number;
  availableHours: number;
  utilizationPct: number | null;
  category: UtilCategory;
  snapshotAt: string;
}
