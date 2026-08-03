import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from './lib/theme';
import { AuthProvider, useAuth, ROLE_LANDING } from './lib/auth';
import { ToastProvider } from './lib/toast';
import { Shell } from './components/Shell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotAuthorized } from './pages/NotAuthorized';
import { Placeholder } from './pages/Placeholder';
import Login               from './pages/auth/Login';
import Forgot              from './pages/auth/Forgot';
import Reset               from './pages/auth/Reset';
import Locked              from './pages/auth/Locked';
import Inactive            from './pages/auth/Inactive';
import ForceChangePassword from './pages/auth/ForceChangePassword';

const AdminDashboard      = lazy(() => import('./pages/admin/Dashboard'));
const UserManagement      = lazy(() => import('./pages/admin/UserManagement'));
const AuditLog            = lazy(() => import('./pages/admin/AuditLog'));
const RolesAccess         = lazy(() => import('./pages/admin/RolesAccess'));
const OrganizationMasters = lazy(() => import('./pages/admin/OrganizationMasters'));
const BusinessRules       = lazy(() => import('./pages/admin/BusinessRules'));
const SubmitEOD           = lazy(() => import('./pages/employee/SubmitEOD'));
const EodHistory          = lazy(() => import('./pages/employee/EodHistory'));
const TeamDashboard       = lazy(() => import('./pages/lead/TeamDashboard'));
const Approvals           = lazy(() => import('./pages/lead/Approvals'));
const TeamUtilization     = lazy(() => import('./pages/lead/TeamUtilization'));
const Blockers            = lazy(() => import('./pages/lead/Blockers'));
const ProjectsAllocation  = lazy(() => import('./pages/pm/ProjectsAllocation'));
const Profile             = lazy(() => import('./pages/Profile'));
const Notifications       = lazy(() => import('./pages/Notifications'));
const ChangePassword      = lazy(() => import('./pages/ChangePassword'));

function PageFallback() {
  return (
    <div style={{ padding: '32px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[300, 220, 180].map((w) => (
        <div key={w} className="skeleton" style={{ height: 14, width: w, borderRadius: 4 }} />
      ))}
    </div>
  );
}

// Eagerly trigger dynamic imports for the chunks a role will commonly visit.
// Runs once after login; by the time the user navigates, the chunk is cached.
function ChunkPrefetcher() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    // Shared — everyone uses these
    import('./pages/Profile');
    import('./pages/Notifications');
    import('./pages/employee/SubmitEOD');
    import('./pages/employee/EodHistory');
    // Role-specific heavy chunks
    if (user.role === 'superadmin') {
      import('./pages/admin/Dashboard');
      import('./pages/admin/UserManagement');
      import('./pages/admin/AuditLog');
      import('./pages/admin/RolesAccess');
      import('./pages/admin/OrganizationMasters');
      import('./pages/admin/BusinessRules');
    } else if (user.role === 'lead') {
      import('./pages/lead/TeamDashboard');
      import('./pages/lead/Approvals');
      import('./pages/lead/TeamUtilization');
      import('./pages/lead/Blockers');
    } else if (user.role === 'pm') {
      import('./pages/pm/ProjectsAllocation');
    }
  }, [user?.role]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword && location.pathname !== '/force-change-password') {
    return <Navigate to="/force-change-password" replace />;
  }
  return (
    <>
      <ChunkPrefetcher />
      <Outlet />
    </>
  );
}

function RedirectAuth() {
  const { user } = useAuth();
  if (user) return <Navigate to={ROLE_LANDING[user.role]} replace />;
  return <Outlet />;
}

function RoleLanding() {
  const { user } = useAuth();
  return <Navigate to={ROLE_LANDING[user!.role]} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Auth routes — redirect to dashboard if already signed in */}
      <Route element={<RedirectAuth />}>
        <Route path="/login"  element={<Login />} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/reset"  element={<Reset />} />
      </Route>

      {/* Lockout / inactive — always accessible */}
      <Route path="/locked"   element={<Locked />} />
      <Route path="/inactive" element={<Inactive />} />

      {/* App shell — requires auth */}
      <Route element={<RequireAuth />}>
        {/* Force-change-password: requires auth but no Shell chrome */}
        <Route path="/force-change-password" element={<ForceChangePassword />} />

        <Route element={<Shell />}>
          <Route index element={<RoleLanding />} />

          {/* All feature routes wrapped in a single Suspense boundary for lazy chunks */}
          <Route element={<Suspense fallback={<PageFallback />}><Outlet /></Suspense>}>

            {/* ── Employee ───────────────────────────── */}
            <Route path="/dashboard"   element={<Placeholder title="My Dashboard" />} />
            <Route path="/eod/submit"  element={<SubmitEOD />} />
            <Route path="/eod/history" element={<EodHistory />} />
            <Route path="/utilization" element={<Placeholder title="My Utilization" />} />

            {/* ── Team Lead ──────────────────────────── */}
            <Route path="/team/dashboard"   element={<TeamDashboard />} />
            <Route path="/team/approvals"   element={<Approvals />} />
            <Route path="/team/utilization" element={<TeamUtilization />} />
            <Route path="/team/blockers"    element={<Blockers />} />
            <Route path="/team/reports"     element={<Placeholder title="Reports" />} />

            {/* ── Project Manager ────────────────────── */}
            <Route path="/projects/dashboard"      element={<Placeholder title="Project Dashboard" />} />
            <Route path="/projects"                element={<ProjectsAllocation />} />
            <Route path="/projects/allocation"     element={<Navigate to="/projects" replace />} />
            <Route path="/projects/planned-actual" element={<Placeholder title="Planned vs Actual" />} />
            <Route path="/projects/blockers"       element={<Placeholder title="Blockers" />} />
            <Route path="/projects/approvals"      element={<Placeholder title="Approvals" />} />
            <Route path="/projects/reports"        element={<Placeholder title="Reports" />} />

            {/* ── Delivery Manager ───────────────────── */}
            <Route path="/dm/dashboard"      element={<Placeholder title="Delivery Dashboard" />} />
            <Route path="/dm/escalations"    element={<Placeholder title="Escalations" />} />
            <Route path="/dm/allocation"     element={<Placeholder title="Allocation" />} />
            <Route path="/dm/heatmap"        element={<Placeholder title="Allocation Heatmap" />} />
            <Route path="/dm/planned-actual" element={<Placeholder title="Planned vs Actual" />} />
            <Route path="/dm/utilization"    element={<Placeholder title="Cross-Project Util" />} />
            <Route path="/dm/reports"        element={<Placeholder title="Reports" />} />

            {/* ── HR Admin ───────────────────────────── */}
            <Route path="/hr/dashboard" element={<Placeholder title="HR Dashboard" />} />
            <Route path="/hr/activity"  element={<Placeholder title="Activity & Compliance" />} />
            <Route path="/hr/leave"     element={<Placeholder title="Leave Alignment" />} />
            <Route path="/hr/reports"   element={<Placeholder title="Reports" />} />

            {/* ── Finance Admin ──────────────────────── */}
            <Route path="/finance/dashboard"     element={<Placeholder title="Finance Dashboard" />} />
            <Route path="/finance/billable"      element={<Placeholder title="Billable Data" />} />
            <Route path="/finance/profitability" element={<Placeholder title="Profitability" />} />
            <Route path="/finance/reports"       element={<Placeholder title="Reports" />} />

            {/* ── Leadership ─────────────────────────── */}
            <Route path="/leadership/dashboard" element={<Placeholder title="Org Dashboard" />} />
            <Route path="/leadership/trends"    element={<Placeholder title="Trends & Drilldown" />} />
            <Route path="/leadership/teams"     element={<Placeholder title="Team Rankings" />} />
            <Route path="/leadership/reports"   element={<Placeholder title="Reports" />} />

            {/* ── Super Admin ────────────────────────── */}
            <Route path="/admin/dashboard"    element={<AdminDashboard />} />
            <Route path="/admin/users"        element={<UserManagement />} />
            <Route path="/admin/roles"        element={<RolesAccess />} />
            <Route path="/admin/org-masters"  element={<OrganizationMasters />} />
            <Route path="/admin/rules"        element={<BusinessRules />} />
            <Route path="/admin/integrations" element={<Placeholder title="Integrations" />} />
            <Route path="/admin/ai"           element={<Placeholder title="AI & Automation" />} />
            <Route path="/admin/audit"        element={<AuditLog />} />

            {/* ── Shared ─────────────────────────────── */}
            <Route path="/notifications"   element={<Notifications />} />
            <Route path="/profile"         element={<Profile />} />
            <Route path="/change-password" element={<ChangePassword />} />

            {/* Catch-all → 403 inside shell */}
            <Route path="*" element={<NotAuthorized />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          {/* Inside the providers so the fallback picks up the theme variables. */}
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
