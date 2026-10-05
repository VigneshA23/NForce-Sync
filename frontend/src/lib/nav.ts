import {
  LayoutDashboard, ClipboardList, BarChart3, Activity,
  ClipboardCheck, AlertOctagon, Inbox,
  FolderKanban, Users,
  Lock, Settings, Bot, ScrollText, Building2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Role } from './types';
import type { ServerUserCapabilities } from '../api/auth';

/**
 * A searchable sub-heading within a nav item's page — a status filter, a section of a
 * long-scrolling dashboard, etc. Deliberately nested under NavItem rather than tracked in a
 * parallel list, so Global Search (and anything else that walks NAV) picks these up for free
 * and can never drift out of sync with what a role can actually reach.
 *
 * Exactly one of `query`/`anchor` should be set: `query` deep-links a page that already reads
 * the param on mount (e.g. EodHistory's `?status=`), `anchor` scrolls to a DOM id on a page
 * that renders every section at once (e.g. the Dashboard's "Month Overview" heading).
 */
export interface NavSubItem {
  key: string;
  label: string;
  query?: Record<string, string>;
  anchor?: string;
}

export interface NavItem {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: number;
  phase?: 2 | 3 | 4;
  subItems?: NavSubItem[];
}

/**
 * An expandable navigation group — e.g. Super Admin's "Project Manager Views" / "Team Lead
 * Views" (Reportee Views enhancement). Renders as a collapsible parent with a down-arrow
 * indicator; it is not itself a routable page (no `path`), only its `children` are.
 */
export interface NavGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  children: NavItem[];
}

export type NavEntry = NavItem | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

/** Builds the URL a NavSubItem's search result should navigate to. */
export function navSubItemPath(item: NavItem, sub: NavSubItem): string {
  if (sub.query) return `${item.path}?${new URLSearchParams(sub.query).toString()}`;
  if (sub.anchor) return `${item.path}#${sub.anchor}`;
  return item.path;
}

export interface NavSection {
  section: string;
  items: NavEntry[];
}

export type RoleNav = NavSection[];

export const ROLE_COLORS: Record<Role, string> = {
  employee:   '#4C8DD6',
  pm:         '#E0A93B',
  admin:      '#6366F1',
  superadmin: '#A78BFA',
};

export const ROLE_LABELS: Record<Role, string> = {
  employee:   'Employee',
  pm:         'Project Manager',
  admin:      'Admin',
  superadmin: 'Super Admin',
};

export const ALL_ROLES: Role[] = [
  'employee', 'pm', 'admin', 'superadmin',
];

export const NAV: Record<Role, RoleNav> = {
  employee: [
    {
      // Employee has only this one section now (Account was removed once Notifications/Profile
      // dropped off the sidebar), so a "Work" heading no longer distinguishes anything — see
      // Shell.tsx's SidebarContent, which skips rendering an empty section label.
      section: '',
      items: [
        {
          key: 'emp-dash', label: 'My Dashboard', path: '/dashboard', icon: LayoutDashboard,
          subItems: [
            { key: 'month-overview',    label: 'Month Overview',    anchor: 'month-overview' },
            { key: 'assigned-projects', label: 'Assigned Projects', anchor: 'assigned-projects' },
            { key: 'holiday-calendar',  label: 'Holiday Calendar',  anchor: 'holiday-calendar' },
            { key: 'dashboard-blockers', label: 'My Blockers',      anchor: 'dashboard-blockers' },
            { key: 'recent-entries',    label: 'Recent Entries',    anchor: 'recent-entries' },
            { key: 'monthly-activity',  label: 'Monthly Activity',  anchor: 'monthly-activity' },
          ],
        },
        { key: 'my-projects', label: 'My Projects',     path: '/my-projects', icon: FolderKanban },
        { key: 'my-blockers', label: 'My Blockers',     path: '/blockers',    icon: AlertOctagon },
        { key: 'eod-inbox',   label: 'EOD Inbox',       path: '/employee/eod-inbox', icon: Inbox },
        { key: 'eod-submit',  label: 'Submit EOD',      path: '/eod/submit',  icon: ClipboardList },
        {
          key: 'eod-history', label: 'My EOD History', path: '/eod/history', icon: BarChart3,
          // Query values match EodHistory.tsx's STATUS_FILTERS exactly — that page already reads
          // ?status= on mount, so these are plain links, not new page behavior.
          subItems: [
            { key: 'eod-submitted', label: 'Submitted', query: { status: 'SUBMITTED' } },
            { key: 'eod-approved',  label: 'Approved',  query: { status: 'APPROVED' } },
            { key: 'eod-rejected',  label: 'Rejected',  query: { status: 'REJECTED' } },
            { key: 'eod-draft',     label: 'Draft',     query: { status: 'DRAFT' } },
            { key: 'eod-missing',   label: 'Missing',   query: { status: 'MISSED' } },
          ],
        },
        {
          key: 'my-util', label: 'My Utilization', path: '/utilization', icon: Activity,
          subItems: [
            { key: 'util-weekly-trend',    label: 'Weekly Trend',    anchor: 'weekly-trend' },
            { key: 'util-period-summary',  label: 'Period Summary',  anchor: 'period-summary' },
            { key: 'util-hours-breakdown', label: 'Hours Breakdown', anchor: 'hours-breakdown' },
            { key: 'util-daily-history',   label: 'Daily History',   anchor: 'daily-history' },
          ],
        },
      ],
    },
  ],

  pm: [
    {
      section: 'Projects',
      items: [
        { key: 'pm-dash',        label: 'Project Dashboard', path: '/projects/dashboard',     icon: LayoutDashboard },
        { key: 'projects',       label: 'Projects & Allocation', path: '/projects',               icon: FolderKanban },
        { key: 'pm-util',        label: 'Projects Utilization', path: '/projects/utilization',  icon: Activity },
        { key: 'blockers',       label: 'Blockers',           path: '/projects/blockers',       icon: AlertOctagon },
        { key: 'eod-inbox',      label: 'EOD Inbox',          path: '/projects/eod-inbox',      icon: Inbox },
      ],
    },
    {
      section: 'Work',
      items: [
        { key: 'approvals',     label: 'Approvals',      path: '/projects/approvals', icon: ClipboardCheck },
        { key: 'reports',       label: 'Reports',         path: '/projects/reports',   icon: BarChart3 },
      ],
    },
  ],

  // Admin owns user administration — split off from Super Admin (see the Reportee Views
  // block below for Super Admin's system-wide operational visibility). Organization Masters is
  // additionally shared with Admin (Department/Designation/Location/Project Type are attributes
  // on a user record, so Admin manages them as part of user administration too — see
  // OrgController, now hasAnyRole('SUPERADMIN','ADMIN') on writes). Business Rules is likewise
  // shared with Admin (BusinessRuleController, now hasAnyRole('SUPERADMIN','ADMIN')) — same page,
  // same API, same data as Super Admin's. Admin does not get AI & Automation (still Super Admin-
  // only system config), and does not get Reportee Views (operational oversight, not
  // user-administration).
  admin: [
    {
      section: 'Administration',
      items: [
        { key: 'admin-dash',     label: 'Admin Dashboard',      path: '/admin/dashboard',    icon: LayoutDashboard },
        { key: 'user-mgmt',      label: 'User Management',      path: '/admin/users',        icon: Users },
        { key: 'admin-projects', label: 'Projects & Allocation', path: '/admin/projects',   icon: FolderKanban },
        { key: 'org-masters',    label: 'Organization Masters', path: '/admin/org-masters',  icon: Building2 },
        { key: 'business-rules', label: 'Business Rules',       path: '/admin/rules',        icon: Settings },
        { key: 'role-mgmt',      label: 'Roles & Access',       path: '/admin/roles',        icon: Lock },
        { key: 'audit',          label: 'Audit Log',            path: '/admin/audit',        icon: ScrollText },
      ],
    },
  ],

  superadmin: [
    {
      // Super Admin's primary landing surface — organization-wide executive oversight
      // (workforce/projects/EOD/utilization/allocation), distinct from Admin's user-
      // administration-focused Admin Dashboard.
      section: 'Executive / Organization',
      items: [
        { key: 'exec-dash', label: 'Executive Dashboard', path: '/admin/executive-dashboard', icon: LayoutDashboard },
      ],
    },
    {
      // User administration (Admin Dashboard, User Management, Roles & Access, Audit Log) has
      // moved to the Admin role. Super Admin keeps system/business-level configuration.
      section: 'Administration',
      items: [
        { key: 'org-masters',    label: 'Organization Masters', path: '/admin/org-masters',  icon: Building2 },
        { key: 'business-rules', label: 'Business Rules',       path: '/admin/rules',        icon: Settings },
        { key: 'ai-settings',    label: 'AI & Automation',  path: '/admin/ai',           icon: Bot },
      ],
    },
    {
      // Read-only, system-wide visibility into the operational views Project Managers use day to
      // day — reuses their exact page components/business logic (already resolves a SUPERADMIN
      // caller to system-wide data server-side; see ProjectDashboardService/AllocationService's
      // SUPERADMIN branches), at dedicated /admin/reportee/* routes rather than the PM's own
      // paths, so each has its own URL for direct-link/refresh/active-highlighting purposes.
      // Does not change PM workflow ownership: write actions remain scoped to their existing
      // owners. Blockers/Approvals/Reports are deliberately excluded (out of scope for this
      // visibility-only enhancement — see the Super Admin Reportee Views spec). Team Lead Views
      // was removed from here — Super Admin no longer has a Reportee Views entry point into
      // Team Lead's operational pages; Team Lead's own navigation/permissions are unaffected.
      section: 'Reportee Views',
      items: [
        {
          key: 'ro-pm-group', label: 'Project Manager Views', icon: FolderKanban,
          children: [
            // Projects and Resource Allocation were separate sidebar entries but opened the
            // same page (ProjectsAllocation, which already has its own internal Projects/
            // Allocation tabs) — consolidated into one entry, matching PM's own single
            // "Projects & Allocation" nav item.
            { key: 'ro-pm-projects', label: 'Projects & Allocation', path: '/admin/reportee/pm/projects',    icon: FolderKanban },
            { key: 'ro-pm-eod',      label: 'EOD',                  path: '/admin/reportee/pm/eod',         icon: ClipboardList },
            { key: 'ro-pm-util',     label: 'Utilization',          path: '/admin/reportee/pm/utilization', icon: Activity },
          ],
        },
      ],
    },
  ],
};

const MY_REPORTS_SECTIONS: RoleNav = [
  {
    section: 'My Reporting Team',
    items: [
      { key: 'rm-overview',    label: 'Overview',              path: '/my-reports/overview',    icon: LayoutDashboard },
      { key: 'rm-eod-status',  label: 'EOD Status',            path: '/my-reports/eod-status',  icon: ClipboardList },
      { key: 'rm-utilization', label: 'Utilization',           path: '/my-reports/utilization', icon: Activity },
      { key: 'rm-approvals',   label: 'Reporting Approvals',   path: '/my-reports/approvals',   icon: ClipboardCheck },
    ],
  },
];

// Employee pages shown under "My Work" for any user who leads at least one project.
// The EOD Inbox key is intentionally `emp-eod-inbox` (not `eod-inbox`) so the team inbox
// badge logic doesn't bleed onto this entry.
const MY_WORK_SECTIONS: RoleNav = [
  {
    section: 'My Work',
    items: [
      {
        key: 'emp-dash', label: 'My Dashboard', path: '/dashboard', icon: LayoutDashboard,
        subItems: [
          { key: 'month-overview',    label: 'Month Overview',    anchor: 'month-overview' },
          { key: 'assigned-projects', label: 'Assigned Projects', anchor: 'assigned-projects' },
          { key: 'holiday-calendar',  label: 'Holiday Calendar',  anchor: 'holiday-calendar' },
          { key: 'dashboard-blockers', label: 'My Blockers',      anchor: 'dashboard-blockers' },
          { key: 'recent-entries',    label: 'Recent Entries',    anchor: 'recent-entries' },
          { key: 'monthly-activity',  label: 'Monthly Activity',  anchor: 'monthly-activity' },
        ],
      },
      { key: 'my-projects',   label: 'My Projects',     path: '/my-projects',        icon: FolderKanban },
      { key: 'my-blockers',   label: 'My Blockers',     path: '/blockers',           icon: AlertOctagon },
      { key: 'emp-eod-inbox', label: 'EOD Inbox',       path: '/employee/eod-inbox', icon: Inbox },
      { key: 'eod-submit',    label: 'Submit EOD',      path: '/eod/submit',         icon: ClipboardList },
      {
        key: 'eod-history', label: 'My EOD History', path: '/eod/history', icon: BarChart3,
        subItems: [
          { key: 'eod-submitted', label: 'Submitted', query: { status: 'SUBMITTED' } },
          { key: 'eod-approved',  label: 'Approved',  query: { status: 'APPROVED' } },
          { key: 'eod-rejected',  label: 'Rejected',  query: { status: 'REJECTED' } },
          { key: 'eod-draft',     label: 'Draft',     query: { status: 'DRAFT' } },
          { key: 'eod-missing',   label: 'Missing',   query: { status: 'MISSED' } },
        ],
      },
      {
        key: 'my-util', label: 'My Utilization', path: '/utilization', icon: Activity,
        subItems: [
          { key: 'util-weekly-trend',    label: 'Weekly Trend',    anchor: 'weekly-trend' },
          { key: 'util-period-summary',  label: 'Period Summary',  anchor: 'period-summary' },
          { key: 'util-hours-breakdown', label: 'Hours Breakdown', anchor: 'hours-breakdown' },
          { key: 'util-daily-history',   label: 'Daily History',   anchor: 'daily-history' },
        ],
      },
    ],
  },
];

// Lead pages shown under "Team Lead" for any user who leads at least one project.
// Labels differ from NAV.lead where names would clash with the "My Work" set:
//   "My Projects" → "Projects I Lead", "Blockers" → "Team Blockers", "EOD Inbox" → "Team Inbox".
// Submit EOD is omitted — it already appears in MY_WORK_SECTIONS above.
const LEAD_COMBINED_SECTIONS: RoleNav = [
  {
    section: 'Team Lead',
    items: [
      { key: 'lead-dash',     label: 'Team Dashboard',   path: '/team/dashboard',   icon: LayoutDashboard },
      { key: 'lead-projects', label: 'Projects I Lead',  path: '/team/projects',    icon: FolderKanban },
      { key: 'approvals',     label: 'Approvals',        path: '/team/approvals',   icon: ClipboardCheck },
      { key: 'team-util',     label: 'Team Utilization', path: '/team/utilization', icon: Activity },
      { key: 'blockers',      label: 'Team Blockers',    path: '/team/blockers',    icon: AlertOctagon },
      { key: 'eod-inbox',     label: 'Team Inbox',       path: '/team/eod-inbox',   icon: Inbox },
      { key: 'reports',       label: 'Reports',          path: '/team/reports',     icon: BarChart3 },
    ],
  },
];

// EOD Submit + History for roles other than 'employee' whose eodForm is non-null.
// Employee and employee-with-lead already get this via NAV.employee / MY_WORK_SECTIONS.
const MY_EOD_SECTIONS: RoleNav = [
  {
    section: 'My EOD',
    items: [
      { key: 'eod-submit',  label: 'Submit EOD',      path: '/eod/submit',  icon: ClipboardList },
      {
        key: 'eod-history', label: 'My EOD History', path: '/eod/history', icon: BarChart3,
        subItems: [
          { key: 'eod-submitted', label: 'Submitted', query: { status: 'SUBMITTED' } },
          { key: 'eod-approved',  label: 'Approved',  query: { status: 'APPROVED' } },
          { key: 'eod-rejected',  label: 'Rejected',  query: { status: 'REJECTED' } },
          { key: 'eod-draft',     label: 'Draft',     query: { status: 'DRAFT' } },
        ],
      },
    ],
  },
];

function sectionPaths(sections: RoleNav): string[] {
  return sections.flatMap(s => s.items.flatMap(entry =>
    isNavGroup(entry) ? entry.children.map(c => c.path) : [entry.path]));
}

/**
 * Builds the full nav section list for a user, combining their role-based sections with any
 * capability-based sections they qualify for.
 *
 * Phase 7b rule: any user with leadsProjectIds > 0 sees BOTH sets in one sidebar —
 * "My Work" (employee pages) and "Team Lead" (lead pages, relabeled). For the `lead` role,
 * MY_WORK_SECTIONS + LEAD_COMBINED_SECTIONS replaces NAV.lead entirely. For other roles,
 * the two sections are appended after the role's own base.
 *
 * - `pm` sections appear when capabilities.managesProjectIds.length > 0 (any role)
 * - `my-reports` section appears when capabilities.hasDirectReports (any role)
 */
export function getNavSections(role: Role, capabilities: ServerUserCapabilities): NavSection[] {
  const hasLeadCaps = capabilities.leadsProjectIds.length > 0;

  let sections: NavSection[];
  if (role === 'employee' && hasLeadCaps) {
    sections = [...MY_WORK_SECTIONS, ...LEAD_COMBINED_SECTIONS];
  } else {
    sections = [...NAV[role]];
    if (hasLeadCaps) {
      sections.push(...MY_WORK_SECTIONS, ...LEAD_COMBINED_SECTIONS);
    }
  }

  if (role !== 'pm' && capabilities.managesProjectIds.length > 0) {
    sections.push(...NAV.pm);
  }

  if (capabilities.hasDirectReports) {
    sections.push(...MY_REPORTS_SECTIONS);
  }

  // Non-employee roles that submit EODs get their own section so the form and history
  // are reachable without crowding the role's primary work sections.
  if (role !== 'employee' && capabilities.submitsEod) {
    const alreadyHasEodSubmit = sections.some(s =>
      s.items.some(e => !isNavGroup(e) && (e as NavItem).path === '/eod/submit'));
    if (!alreadyHasEodSubmit) {
      sections.push(...MY_EOD_SECTIONS);
    }
  }

  return sections;
}

export function getNavPaths(role: Role, capabilities?: ServerUserCapabilities): string[] {
  if (!capabilities) return sectionPaths(NAV[role]);
  return [...new Set(sectionPaths(getNavSections(role, capabilities)))];
}

export function getNavItem(role: Role, path: string, capabilities?: ServerUserCapabilities): { item: NavItem; section: NavSection } | undefined {
  const sections = capabilities ? getNavSections(role, capabilities) : NAV[role];
  for (const section of sections) {
    for (const entry of section.items) {
      if (isNavGroup(entry)) {
        const child = entry.children.find(c => c.path === path);
        if (child) return { item: child, section };
      } else if (entry.path === path) {
        return { item: entry, section };
      }
    }
  }
}
