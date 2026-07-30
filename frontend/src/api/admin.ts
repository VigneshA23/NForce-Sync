import { api } from './client';

// ── Response types (mirror backend DTOs) ──────────────────────────────────────

export interface UserDto {
  id: number;
  fullName: string;
  email: string;
  role: string;
  employeeCode: string;
  status: string;
  managerId: number | null;
  // Org fields
  departmentId: number | null;
  designationId: number | null;
  locationId: number | null;
  // Employee profile
  employmentType: string | null;
  workMode: string | null;
  joiningDate: string | null;
  shiftId: number | null;
}

export interface AuditLogDto {
  id: number;
  entityType: string;
  entityId: number | null;
  action: string;
  actorId: number | null;
  actorName: string | null;
  beforeValue: string | null;
  afterValue: string | null;
  occurredAt: string;
}

export interface AdminStatsDto {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  inactiveUserNames: string[];
  usersByRole: Record<string, number>;
  recentAuditEvents: AuditLogDto[];
  auditEventsLast24h: number;
}

export interface RoleInfoDto {
  key: string;
  displayName: string;
  description: string;
  isReadOnly: boolean;
}

export interface PageDto<T> {
  content: T[];
  totalPages: number;
  totalElements: number;
  number: number;
  size: number;
}

// ── Request payloads ───────────────────────────────────────────────────────────

export interface CreateUserPayload {
  fullName: string;
  email: string;
  role: string;
  employeeCode: string;
  // Org assignments
  departmentId?: number | null;
  designationId?: number | null;
  locationId?: number | null;
  // Employee profile
  employmentType?: string;
  workMode?: string;
  joiningDate?: string;
  shiftId?: number | null;
  // Reporting line
  managerId?: number | null;
}

export interface UserCreateResult {
  user: UserDto;
  tempPassword: string;
}

export interface UpdateUserPayload {
  fullName: string;
  role: string;
  // Org assignments (null = unassign)
  departmentId: number | null;
  designationId: number | null;
  locationId: number | null;
  // Employee profile
  employmentType?: string;
  workMode?: string;
  shiftId?: number | null;
  // Reporting line
  managerId: number | null;
}

export interface AuditFilters {
  entityType?: string;
  action?: string;
  actorId?: number;
  actorName?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

// ── API helpers ────────────────────────────────────────────────────────────────

export function extractApiError(err: unknown, fallback = 'An unexpected error occurred'): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const r = (err as { response?: { data?: Record<string, unknown> } }).response;
    if (r?.data) {
      const d = r.data;
      if (typeof d.detail === 'string') return d.detail;
      if (typeof d.message === 'string') return d.message;
      if (typeof d.error === 'string' && d.error !== 'Validation failed') return d.error;
    }
  }
  return fallback;
}

export function extractFieldErrors(err: unknown): Record<string, string> {
  if (err && typeof err === 'object' && 'response' in err) {
    const r = (err as { response?: { data?: { fields?: Record<string, string> } } }).response;
    if (r?.data?.fields) return r.data.fields;
  }
  return {};
}

export function isHttpStatus(err: unknown, status: number): boolean {
  if (err && typeof err === 'object' && 'response' in err) {
    return (err as { response?: { status?: number } }).response?.status === status;
  }
  return false;
}

// ── User endpoints ─────────────────────────────────────────────────────────────

export async function listUsers(): Promise<UserDto[]> {
  const res = await api.get<UserDto[]>('/users');
  return res.data;
}

export async function getUser(id: number): Promise<UserDto> {
  const res = await api.get<UserDto>(`/users/${id}`);
  return res.data;
}

export interface UserSearchParams {
  q?: string;
  role?: string;
  locationId?: number;
}

// Top-nav workspace search — matches name, email, role, and location (case-insensitive, partial).
export async function searchUsers(params: UserSearchParams): Promise<UserDto[]> {
  const res = await api.get<UserDto[]>('/users/search', { params });
  return res.data;
}

export async function createUser(data: CreateUserPayload): Promise<UserCreateResult> {
  const res = await api.post<UserCreateResult>('/users', data);
  return res.data;
}

export async function updateUser(id: number, data: UpdateUserPayload): Promise<UserDto> {
  const res = await api.patch<UserDto>(`/users/${id}`, data);
  return res.data;
}

export async function setUserStatus(
  id: number,
  status: 'ACTIVE' | 'INACTIVE',
): Promise<UserDto> {
  const res = await api.patch<UserDto>(`/users/${id}/status`, { status });
  return res.data;
}

export async function resetPassword(id: number): Promise<{ message: string; tempPassword: string }> {
  const res = await api.post<{ message: string; tempPassword: string }>(
    `/users/${id}/reset-password`,
  );
  return res.data;
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export async function listAuditLog(filters: AuditFilters): Promise<PageDto<AuditLogDto>> {
  const res = await api.get<PageDto<AuditLogDto>>('/audit', { params: filters });
  return res.data;
}

export async function getAuditEntry(id: number): Promise<AuditLogDto> {
  const res = await api.get<AuditLogDto>(`/audit/${id}`);
  return res.data;
}

// ── Roles ──────────────────────────────────────────────────────────────────────

export async function listRoles(): Promise<RoleInfoDto[]> {
  const res = await api.get<RoleInfoDto[]>('/roles');
  return res.data;
}

// ── Admin stats ────────────────────────────────────────────────────────────────

export async function getAdminStats(): Promise<AdminStatsDto> {
  const res = await api.get<AdminStatsDto>('/admin/stats');
  return res.data;
}

// ── Org Masters ────────────────────────────────────────────────────────────────

export interface DepartmentDto {
  id: number;
  name: string;
  active: boolean;
}

export interface DesignationDto {
  id: number;
  title: string;
  active: boolean;
}

export interface OrgLocationDto {
  id: number;
  name: string;
  active: boolean;
}

export async function listDepartments(): Promise<DepartmentDto[]> {
  const res = await api.get<DepartmentDto[]>('/org/departments');
  return res.data;
}

export async function createDepartment(name: string): Promise<DepartmentDto> {
  const res = await api.post<DepartmentDto>('/org/departments', { name });
  return res.data;
}

export async function toggleDepartment(id: number): Promise<DepartmentDto> {
  const res = await api.patch<DepartmentDto>(`/org/departments/${id}`);
  return res.data;
}

export async function listDesignations(): Promise<DesignationDto[]> {
  const res = await api.get<DesignationDto[]>('/org/designations');
  return res.data;
}

export async function createDesignation(title: string): Promise<DesignationDto> {
  const res = await api.post<DesignationDto>('/org/designations', { title });
  return res.data;
}

export async function toggleDesignation(id: number): Promise<DesignationDto> {
  const res = await api.patch<DesignationDto>(`/org/designations/${id}`);
  return res.data;
}

export async function listLocations(): Promise<OrgLocationDto[]> {
  const res = await api.get<OrgLocationDto[]>('/org/locations');
  return res.data;
}

export async function createLocation(name: string): Promise<OrgLocationDto> {
  const res = await api.post<OrgLocationDto>('/org/locations', { name });
  return res.data;
}

export async function toggleLocation(id: number): Promise<OrgLocationDto> {
  const res = await api.patch<OrgLocationDto>(`/org/locations/${id}`);
  return res.data;
}

// ── Shift timings (Business Rules) ─────────────────────────────────────────────

export interface ShiftDefinitionDto {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  active: boolean;
  assignedEmployeeCount: number;
}

export async function listShifts(): Promise<ShiftDefinitionDto[]> {
  const res = await api.get<ShiftDefinitionDto[]>('/admin/business-rules/shifts');
  return res.data;
}

// Fix 2: Delete org master records (FK-safe — backend returns 409 if employees assigned)
export async function deleteDepartment(id: number): Promise<void> {
  await api.delete(`/org/departments/${id}`);
}

export async function deleteDesignation(id: number): Promise<void> {
  await api.delete(`/org/designations/${id}`);
}

export async function deleteLocation(id: number): Promise<void> {
  await api.delete(`/org/locations/${id}`);
}
