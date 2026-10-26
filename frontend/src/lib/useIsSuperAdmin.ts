import { useAuth } from './auth';

/** True for the Super Admin role. Lets a component shared with other roles relabel a column for Super Admin only. */
export function useIsSuperAdmin(): boolean {
  const { user } = useAuth();
  return user?.role === 'superadmin';
}
