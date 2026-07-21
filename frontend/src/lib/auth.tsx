import { createContext, useContext, useRef, useState } from 'react';
import type { Role } from './types';

const SESSION_KEY = 'nfsync_demo_user';

function loadSession(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function saveSession(u: AuthUser | null): void {
  try {
    if (u) sessionStorage.setItem(SESSION_KEY, JSON.stringify(u));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

export interface AuthUser {
  name: string;
  initials: string;
  email: string;
  role: Role;
}

interface AuthContextValue {
  user: AuthUser | null;
  failCount: number;
  loginWithRole: (role: Role) => void;
  recordFailedAttempt: () => number;
  resetFailCount: () => void;
  logout: () => void;
}

export const ROLE_PERSONAS: Record<Role, AuthUser> = {
  employee:   { name: 'Aarav Mehta',   initials: 'AM', email: 'aarav.mehta@nforce.one',   role: 'employee' },
  lead:       { name: 'Priya Nair',    initials: 'PN', email: 'priya.nair@nforce.one',     role: 'lead' },
  pm:         { name: 'Rohan Das',     initials: 'RD', email: 'rohan.das@nforce.one',       role: 'pm' },
  dm:         { name: 'Sana Kapoor',   initials: 'SK', email: 'sana.kapoor@nforce.one',     role: 'dm' },
  hr:         { name: 'Neha Singh',    initials: 'NS', email: 'neha.singh@nforce.one',      role: 'hr' },
  finance:    { name: 'Arjun Bhat',    initials: 'AB', email: 'arjun.bhat@nforce.one',      role: 'finance' },
  leadership: { name: 'Vikram Rao',    initials: 'VR', email: 'vikram.rao@nforce.one',      role: 'leadership' },
  superadmin: { name: 'Admin Console', initials: 'SA', email: 'admin@nforce.one',            role: 'superadmin' },
};

export const ROLE_LANDING: Record<Role, string> = {
  employee:   '/dashboard',
  lead:       '/team/dashboard',
  pm:         '/projects/dashboard',
  dm:         '/dm/dashboard',
  hr:         '/hr/dashboard',
  finance:    '/finance/dashboard',
  leadership: '/leadership/dashboard',
  superadmin: '/admin/dashboard',
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadSession);
  const failRef = useRef(0);
  const [failCount, setFailCount] = useState(0);

  function loginWithRole(role: Role) {
    failRef.current = 0;
    setFailCount(0);
    const u = ROLE_PERSONAS[role];
    saveSession(u);
    setUser(u);
  }

  function recordFailedAttempt(): number {
    failRef.current += 1;
    setFailCount(failRef.current);
    return failRef.current;
  }

  function resetFailCount() {
    failRef.current = 0;
    setFailCount(0);
  }

  function logout() {
    failRef.current = 0;
    setFailCount(0);
    saveSession(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, failCount, loginWithRole, recordFailedAttempt, resetFailCount, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
