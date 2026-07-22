import { api } from './client';
import type { Role } from '../lib/types';

const BACKEND_ROLE_MAP: Record<string, Role> = {
  EMPLOYEE:   'employee',
  MANAGER:    'lead',
  HR:         'hr',
  SUPERADMIN: 'superadmin',
  PM:         'pm',
  DM:         'dm',
  FINANCE:    'finance',
  LEADERSHIP: 'leadership',
};

export interface ServerUser {
  id: number;
  fullName: string;
  email: string;
  role: string;
  employeeCode: number | null;
  status: string;
}

export function toRole(serverRole: string): Role {
  return BACKEND_ROLE_MAP[serverRole] ?? (serverRole.toLowerCase() as Role);
}

export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: ServerUser }> {
  const res = await api.post<{ token: string; user: ServerUser }>('/auth/login', {
    email,
    password,
  });
  return res.data;
}

export async function getMe(token: string): Promise<ServerUser> {
  const res = await api.get<ServerUser>('/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}
