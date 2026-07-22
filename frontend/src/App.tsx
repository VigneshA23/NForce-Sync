import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './lib/theme';
import { AuthProvider, useAuth, ROLE_LANDING } from './lib/auth';
import { ToastProvider } from './lib/toast';
import { Shell } from './components/Shell';
import { NotAuthorized } from './pages/NotAuthorized';
import { Placeholder } from './pages/Placeholder';
import Login    from './pages/auth/Login';
import Forgot   from './pages/auth/Forgot';
import Reset    from './pages/auth/Reset';
import Locked   from './pages/auth/Locked';
import Inactive from './pages/auth/Inactive';
import AdminDashboard  from './pages/admin/Dashboard';
import UserManagement  from './pages/admin/UserManagement';
import AuditLog        from './pages/admin/AuditLog';
import RolesAccess     from './pages/admin/RolesAccess';

function RequireAuth() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
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
        <Route element={<Shell />}>
          <Route index element={<RoleLanding />} />

          {/* ── Employee ───────────────────────────── */}
          <Route path="/dashboard"   element={<Placeholder title="My Dashboard" />} />
          <Route path="/eod/submit"  element={<Placeholder title="Submit EOD" />} />
          <Route path="/eod/history" element={<Placeholder title="My EOD History" />} />
          <Route path="/utilization" element={<Placeholder title="My Utilization" />} />

          {/* ── Team Lead ──────────────────────────── */}
          <Route path="/team/dashboard"   element={<Placeholder title="Team Dashboard" />} />
          <Route path="/team/approvals"   element={<Placeholder title="Approvals" />} />
          <Route path="/team/utilization" element={<Placeholder title="Team Utilization" />} />
          <Route path="/team/blockers"    element={<Placeholder title="Blockers" />} />
          <Route path="/team/reports"     element={<Placeholder title="Reports" />} />

          {/* ── Project Manager ────────────────────── */}
          <Route path="/projects/dashboard"      element={<Placeholder title="Project Dashboard" />} />
          <Route path="/projects"                element={<Placeholder title="Projects" />} />
          <Route path="/projects/allocation"     element={<Placeholder title="Allocation" />} />
          <Route path="/projects/planned-actual" element={<Placeholder title="Planned vs Actual" />} />
          <Route path="/projects/blockers"       element={<Placeholder title="Blockers" />} />
          <Route path="/projects/approvals"      element={<Placeholder title="Approvals" />} />
          <Route path="/projects/reports"        element={<Placeholder title="Reports" />} />

          {/* ── Delivery Manager ───────────────────── */}
          <Route path="/dm/dashboard"   element={<Placeholder title="Delivery Dashboard" />} />
          <Route path="/dm/escalations"   element={<Placeholder title="Escalations" />} />
          <Route path="/dm/allocation"    element={<Placeholder title="Allocation" />} />
          <Route path="/dm/heatmap"       element={<Placeholder title="Allocation Heatmap" />} />
          <Route path="/dm/planned-actual" element={<Placeholder title="Planned vs Actual" />} />
          <Route path="/dm/utilization"   element={<Placeholder title="Cross-Project Util" />} />
          <Route path="/dm/reports"     element={<Placeholder title="Reports" />} />

          {/* ── HR Admin ───────────────────────────── */}
          <Route path="/hr/dashboard" element={<Placeholder title="HR Dashboard" />} />
          <Route path="/hr/activity"  element={<Placeholder title="Activity & Compliance" />} />
          <Route path="/hr/leave"     element={<Placeholder title="Leave Alignment" />} />
          <Route path="/hr/reports"   element={<Placeholder title="Reports" />} />

          {/* ── Finance Admin ──────────────────────── */}
          <Route path="/finance/dashboard"      element={<Placeholder title="Finance Dashboard" />} />
          <Route path="/finance/billable"       element={<Placeholder title="Billable Data" />} />
          <Route path="/finance/profitability"  element={<Placeholder title="Profitability" />} />
          <Route path="/finance/reports"        element={<Placeholder title="Reports" />} />

          {/* ── Leadership ─────────────────────────── */}
          <Route path="/leadership/dashboard" element={<Placeholder title="Org Dashboard" />} />
          <Route path="/leadership/trends"    element={<Placeholder title="Trends & Drilldown" />} />
          <Route path="/leadership/teams"     element={<Placeholder title="Team Rankings" />} />
          <Route path="/leadership/reports"   element={<Placeholder title="Reports" />} />

          {/* ── Super Admin ────────────────────────── */}
          <Route path="/admin/dashboard"    element={<AdminDashboard />} />
          <Route path="/admin/users"        element={<UserManagement />} />
          <Route path="/admin/roles"        element={<RolesAccess />} />
          <Route path="/admin/rules"        element={<Placeholder title="Business Rules" />} />
          <Route path="/admin/integrations" element={<Placeholder title="Integrations" />} />
          <Route path="/admin/ai"           element={<Placeholder title="AI & Automation" />} />
          <Route path="/admin/audit"        element={<AuditLog />} />

          {/* ── Shared ─────────────────────────────── */}
          <Route path="/notifications" element={<Placeholder title="Notifications" />} />
          <Route path="/profile"       element={<Placeholder title="Profile" />} />

          {/* Catch-all → 403 inside shell */}
          <Route path="*" element={<NotAuthorized />} />
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
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
