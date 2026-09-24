import { getNavPaths } from "../nav";
import type { Role } from "../types";

/**
 * Resolves an assistant `pageId` (from `AssistantResponse.navigation.pageId`, already validated
 * server-side by `NavigationValidator` against `registry.yaml`) to an actual Sync route, for
 * *this* role. Nothing here trusts a route from the model or the backend directly — a `pageId`
 * is the only thing that ever crosses that boundary.
 *
 * `PAGE_TARGETS` mirrors `backend/src/main/resources/ai-knowledge/pages/registry.yaml` (kept in
 * sync by that file's own build-time parity test against `nav.ts`/`App.tsx`). Every lookup here
 * is still re-validated at runtime against `getNavPaths(role)` (or the shared-page allowlist) —
 * the live, current nav — so a route can never resolve to something this role can no longer
 * reach, even if this map briefly drifts from a nav.ts change before the next deploy.
 *
 * Sync's own nav `key`s are not safe to key this table by: the same registry pageId maps to a
 * *different* nav.ts key per role (e.g. "utilization" is `my-util` for Employee, `team-util` for
 * Team Lead, `pm-util` for PM), and a few keys collide across roles entirely (e.g. `eod-inbox`
 * means three different pages). Routes, not keys, are the stable cross-role identifier here.
 */
const PAGE_TARGETS: Partial<Record<string, Partial<Record<Role, { route: string; label: string }>>>> = {
  dashboard: {
    employee: { route: "/dashboard", label: "My Dashboard" },
    lead: { route: "/team/dashboard", label: "Team Dashboard" },
    pm: { route: "/projects/dashboard", label: "Project Dashboard" },
    admin: { route: "/admin/dashboard", label: "Admin Dashboard" },
    superadmin: { route: "/admin/executive-dashboard", label: "Executive Dashboard" },
  },
  "eod-submit": {
    employee: { route: "/eod/submit", label: "Submit EOD" },
    lead: { route: "/eod/submit", label: "Submit EOD" },
  },
  "eod-history": {
    employee: { route: "/eod/history", label: "My EOD History" },
  },
  "eod-inbox": {
    employee: { route: "/employee/eod-inbox", label: "EOD Inbox" },
    lead: { route: "/team/eod-inbox", label: "EOD Inbox" },
    pm: { route: "/projects/eod-inbox", label: "EOD Inbox" },
  },
  "my-projects": {
    employee: { route: "/my-projects", label: "My Projects" },
    lead: { route: "/team/projects", label: "My Projects" },
  },
  "projects-allocation": {
    pm: { route: "/projects", label: "Projects & Allocation" },
  },
  utilization: {
    employee: { route: "/utilization", label: "My Utilization" },
    lead: { route: "/team/utilization", label: "Team Utilization" },
    pm: { route: "/projects/utilization", label: "Projects Utilization" },
  },
  blockers: {
    employee: { route: "/blockers", label: "My Blockers" },
    lead: { route: "/team/blockers", label: "Blockers" },
    pm: { route: "/projects/blockers", label: "Blockers" },
  },
  approvals: {
    lead: { route: "/team/approvals", label: "Approvals" },
    pm: { route: "/projects/approvals", label: "Approvals" },
  },
  reports: {
    lead: { route: "/team/reports", label: "Reports" },
    pm: { route: "/projects/reports", label: "Reports" },
  },
  "user-management": {
    admin: { route: "/admin/users", label: "User Management" },
  },
  "org-masters": {
    admin: { route: "/admin/org-masters", label: "Organization Masters" },
    superadmin: { route: "/admin/org-masters", label: "Organization Masters" },
  },
  "business-rules": {
    admin: { route: "/admin/rules", label: "Business Rules" },
    superadmin: { route: "/admin/rules", label: "Business Rules" },
  },
  "roles-access": {
    admin: { route: "/admin/roles", label: "Roles & Access" },
  },
  "audit-log": {
    admin: { route: "/admin/audit", label: "Audit Log" },
  },
  "reportee-pm-projects": {
    superadmin: { route: "/admin/reportee/pm/projects", label: "Projects & Allocation" },
  },
  "reportee-pm-eod": {
    superadmin: { route: "/admin/reportee/pm/eod", label: "EOD" },
  },
  "reportee-pm-utilization": {
    superadmin: { route: "/admin/reportee/pm/utilization", label: "Utilization" },
  },
  "ai-assistant-admin": {
    superadmin: { route: "/admin/ai", label: "AI & Automation" },
  },
  // "integrations" and every DM/Finance/Leadership pageId are deliberately absent — they are
  // placeholders in the registry, and a placeholder never gets a route here.

  // Shared pages: reachable via the topbar for every role, not through getNavPaths(role) — see
  // Shell.tsx's own allowlist (`isAllowed`), which resolveSharedTarget below mirrors.
  notifications: { employee: { route: "/notifications", label: "Notifications" } },
  profile: { employee: { route: "/profile", label: "Profile" } },
  "change-password": { employee: { route: "/change-password", label: "Change Password" } },
  preferences: { employee: { route: "/preferences", label: "Preferences" } },
};

const SHARED_PAGE_IDS = new Set(["notifications", "profile", "change-password", "preferences"]);

export interface PageTarget {
  route: string;
  label: string;
}

/** Resolves pageId -> route for this role, or null if unreachable, placeholder, or unknown — never falls back to a guess. */
export function resolvePageTarget(pageId: string, role: Role): PageTarget | null {
  if (SHARED_PAGE_IDS.has(pageId)) {
    const shared = PAGE_TARGETS[pageId]?.employee; // route/label are role-independent for shared pages
    return shared ?? null;
  }

  const entry = PAGE_TARGETS[pageId]?.[role];
  if (!entry) {
    return null;
  }
  // Re-validated against the live nav, not just this static map — see module javadoc.
  if (!getNavPaths(role).includes(entry.route)) {
    return null;
  }
  return entry;
}

export function canNavigateTo(pageId: string, role: Role): boolean {
  return resolvePageTarget(pageId, role) !== null;
}

/**
 * The registry pageId for the current pathname, for this role — or null if it isn't one of the
 * assistant's known pages. Rebuilt on every call rather than cached: the map is 32 entries, cheap
 * to scan, and a per-role cache keyed only by pathname would risk serving one role's mapping to
 * another if this were ever called for more than one role in the same session.
 */
export function pageIdFor(role: Role, pathname: string): string | null {
  for (const [pageId, byRole] of Object.entries(PAGE_TARGETS)) {
    const entry = SHARED_PAGE_IDS.has(pageId) ? byRole?.employee : byRole?.[role];
    if (entry && entry.route === pathname) {
      return pageId;
    }
  }
  return null;
}
