import { createContext, useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
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

export function buildAuthUser(serverUser: ServerUser, mustChangePassword?: boolean): AuthUser {
  return {
    id:                 serverUser.id,
    name:               serverUser.fullName,
    initials:           initials(serverUser.fullName),
    email:              serverUser.email,
    role:               toRole(serverUser.role),
    employeeCode:       serverUser.employeeCode,
    mustChangePassword: mustChangePassword ?? serverUser.mustChangePassword,
  };
}

// No failed-attempt counter here: sign-in lockout is enforced per account by the backend
// (see AccountLockoutService). A client-side tally was global across emails, reset on refresh,
// and could be skipped entirely by calling the API directly.
interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loginWithCredentials: (token: string, user: AuthUser) => void;
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
      .catch((err) => {
        // A 403 means the token is valid but the account is restricted — currently only the
        // force-change-password gate in JwtFilter. Keep the session so a refresh on that
        // screen doesn't bounce the user back to /login. Only clear on 401 / bad token.
        if (axios.isAxiosError(err) && err.response?.status === 403) return;
        saveSession(null);
        setUser(null);
        setToken(null);
      });
  }, []);

  function loginWithCredentials(newToken: string, newUser: AuthUser) {
    saveSession({ token: newToken, user: newUser });
    setToken(newToken);
    setUser(newUser);
  }

  function logout() {
    saveSession(null);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loginWithCredentials, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
