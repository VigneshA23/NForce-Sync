import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Role } from './types';
import { getMe, toRole } from '../api/auth';
import type { ServerUser } from '../api/auth';

const SESSION_KEY = 'nfsync_session';

interface StoredSession {
  token: string;
  user: AuthUser;
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function saveSession(s: StoredSession | null): void {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export interface AuthUser {
  id: number;
  name: string;
  initials: string;
  email: string;
  role: Role;
  employeeCode: string;
  mustChangePassword: boolean;
}

export function buildAuthUser(serverUser: ServerUser, mustChangePassword = false): AuthUser {
  return {
    id:                 serverUser.id,
    name:               serverUser.fullName,
    initials:           initials(serverUser.fullName),
    email:              serverUser.email,
    role:               toRole(serverUser.role),
    employeeCode:       serverUser.employeeCode,
    mustChangePassword: serverUser.mustChangePassword ?? mustChangePassword,
  };
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  failCount: number;
  loginWithCredentials: (token: string, user: AuthUser) => void;
  recordFailedAttempt: () => number;
  resetFailCount: () => void;
  logout: () => void;
}

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
  const initSession = useRef(loadSession());
  const [user, setUser]   = useState<AuthUser | null>(initSession.current?.user ?? null);
  const [token, setToken] = useState<string | null>(initSession.current?.token ?? null);
  const failRef           = useRef(0);
  const [failCount, setFailCount] = useState(0);

  useEffect(() => {
    const savedToken = initSession.current?.token;
    if (!savedToken) return;
    getMe(savedToken)
      .then((serverUser) => {
        const freshUser = buildAuthUser(serverUser);
        setUser(freshUser);
        setToken(savedToken);
        saveSession({ token: savedToken, user: freshUser });
      })
      .catch(() => {
        saveSession(null);
        setUser(null);
        setToken(null);
      });
  }, []);

  function loginWithCredentials(newToken: string, newUser: AuthUser) {
    failRef.current = 0;
    setFailCount(0);
    saveSession({ token: newToken, user: newUser });
    setToken(newToken);
    setUser(newUser);
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
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, token, failCount, loginWithCredentials, recordFailedAttempt, resetFailCount, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
