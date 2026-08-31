import axios from 'axios';
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
  employeeCode: string;
  status: string;
  mustChangePassword: boolean;
}

export function toRole(serverRole: string): Role {
  return BACKEND_ROLE_MAP[serverRole] ?? (serverRole.toLowerCase() as Role);
}

export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: ServerUser; mustChangePassword: boolean }> {
  const res = await api.post<{ token: string; user: ServerUser; mustChangePassword: boolean }>(
    '/auth/login',
    { email, password },
  );
  return res.data;
}

// ── Sign-in failure shapes ────────────────────────────────────────────────────
// The server distinguishes two failures: 401 (bad credentials, with how many tries are left before
// the account locks) and 423 (Account Lockout in force, with the seconds until it lifts). Both are
// read straight off the axios error, so the UI never has to guess at the policy.

/** HTTP 423 Locked. */
export const LOCKED_STATUS = 423;

export interface LoginLockedError {
  retryAfterSeconds: number;
}

/** Returns the lockout details when the error is a 423, otherwise null. */
export function asLockedError(err: unknown): LoginLockedError | null {
  if (!axios.isAxiosError(err) || err.response?.status !== LOCKED_STATUS) return null;
  const seconds = Number(err.response?.data?.retryAfterSeconds);
  return { retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 0 };
}

/** Attempts left before lockout, from a 401 body. Null when the server didn't say. */
export function attemptsRemainingFrom(err: unknown): number | null {
  if (!axios.isAxiosError(err) || err.response?.status !== 401) return null;
  const remaining = Number(err.response?.data?.attemptsRemaining);
  return Number.isFinite(remaining) ? remaining : null;
}

/**
 * currentPassword is omitted for the forced-password-change flow (temporary password from a
 * Super Admin reset or the forgot-password email) — the backend already knows the caller
 * authenticated with it via /login and does not ask for it again. A voluntary change (from the
 * account settings page) must still pass it.
 */
export async function changePassword(
  newPassword: string,
  currentPassword?: string,
): Promise<{ token: string; user: ServerUser; mustChangePassword: boolean }> {
  const res = await api.post<{ token: string; user: ServerUser; mustChangePassword: boolean }>(
    '/auth/change-password',
    { currentPassword, newPassword },
  );
  return res.data;
}

/**
 * Checked when the sign-in screen is opened from the password-reset email link, so the email
 * field can be pre-filled and an expired/used/unknown link can be reported. Never returns a
 * password or a session — actual authentication still happens through the normal login() call.
 */
export async function checkResetTokenValid(
  token: string,
): Promise<{ valid: boolean; firstName?: string; email?: string }> {
  const res = await api.get<{ valid: boolean; firstName?: string; email?: string }>(
    '/auth/reset-password-token-status',
    { params: { token } },
  );
  return res.data;
}

export async function getMe(token: string): Promise<ServerUser> {
  const res = await api.get<ServerUser>('/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}
