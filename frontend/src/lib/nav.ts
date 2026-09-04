import {
  LayoutDashboard, ClipboardList, BarChart3, Activity,
  Bell, User, ClipboardCheck, AlertOctagon,
  FolderKanban, Users, TrendingUp, Map,
  AlertTriangle, CalendarDays, DollarSign, Trophy,
  Lock, Settings, Plug, Bot, ScrollText, Building2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Role } from './types';

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

/** Builds the URL a NavSubItem's search result should navigate to. */
export function navSubItemPath(item: NavItem, sub: NavSubItem): string {
  if (sub.query) return `${item.path}?${new URLSearchParams(sub.query).toString()}`;
  if (sub.anchor) return `${item.path}#${sub.anchor}`;
  return item.path;
}

export interface NavSection {
  section: string;
  items: NavItem[];
}

export type RoleNav = NavSection[];

export const ROLE_COLORS: Record<Role, string> = {
  employee:   '#4C8DD6',
  lead:       '#2FB67C',
  pm:         '#E0A93B',
  dm:         '#9B6DFF',
  hr:         '#E4373D',
  finance:    '#14B8A6',
  leadership: '#F09030',
  superadmin: '#A78BFA',
};

export const ROLE_LABELS: Record<Role, string> = {
  employee:   'Employee',
  lead:       'Team Lead',
  pm:         'Project Manager',
  dm:         'Delivery Manager',
  hr:         'HR Admin',
  finance:    'Finance Admin',
  leadership: 'Leadership Viewer',
  superadmin: 'Super Admin',
};

export const ALL_ROLES: Role[] = [
  'employee', 'lead', 'pm', 'dm', 'hr', 'finance', 'leadership', 'superadmin',
];

export const NAV: Record<Role, RoleNav> = {
  employee: [
    {
      section: 'Work',
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
    {
      section: 'Account',
      items: [
        {
          key: 'notifications', label: 'Notifications', path: '/notifications', icon: Bell,
          // Query values match Notifications.tsx's StatusFilter ('all' | 'unread' | 'read').
          subItems: [
            { key: 'notif-unread', label: 'Unread notifications', query: { status: 'unread' } },
            { key: 'notif-read',   label: 'Read notifications',   query: { status: 'read' } },
          ],
        },
        {
          key: 'profile', label: 'Profile', path: '/profile', icon: User,
          subItems: [
            { key: 'profile-personal',    label: 'Personal Information', anchor: 'personal-information' },
            { key: 'profile-employment',  label: 'Employment',           anchor: 'employment' },
            { key: 'profile-emergency',   label: 'Emergency Contact',    anchor: 'emergency-contact' },
            { key: 'profile-security',    label: 'Security',             anchor: 'security' },
          ],
        },
      ],
    },
  ],

  lead: [
    {
      section: 'Overview',
      items: [
        { key: 'lead-dash',      label: 'Team Dashboard', path: '/team/dashboard',   icon: LayoutDashboard },
        { key: 'lead-projects',  label: 'My Projects',    path: '/team/projects',    icon: FolderKanban },
        { key: 'approvals',  label: 'Approvals',         path: '/team/approvals',   icon: ClipboardCheck },
        { key: 'team-util',  label: 'Team Utilization',  path: '/team/utilization', icon: Activity },
        { key: 'blockers',   label: 'Blockers',          path: '/team/blockers',    icon: AlertOctagon },
      ],
    },
    {
      section: 'Personal',
      items: [
        { key: 'eod-submit',    label: 'Submit EOD',     path: '/eod/submit',    icon: ClipboardList },
        { key: 'reports',       label: 'Reports',         path: '/team/reports',  icon: BarChart3 },
        { key: 'notifications', label: 'Notifications',  path: '/notifications', icon: Bell },
        { key: 'profile',       label: 'Profile',         path: '/profile',       icon: User },
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
        { key: 'planned-actual', label: 'Planned vs Actual',  path: '/projects/planned-actual', icon: TrendingUp, phase: 2 },
        { key: 'blockers',       label: 'Blockers',           path: '/projects/blockers',       icon: AlertOctagon },
      ],
    },
    {
      section: 'Work',
      items: [
        { key: 'approvals',     label: 'Approvals',      path: '/projects/approvals', icon: ClipboardCheck },
        { key: 'reports',       label: 'Reports',         path: '/projects/reports',   icon: BarChart3 },
        { key: 'notifications', label: 'Notifications',  path: '/notifications',       icon: Bell },
        { key: 'profile',       label: 'Profile',         path: '/profile',             icon: User },
      ],
    },
  ],

  dm: [
    {
      section: 'Delivery',
      items: [
        { key: 'dm-dash',        label: 'Delivery Dashboard',  path: '/dm/dashboard',    icon: LayoutDashboard },
        { key: 'escalations',    label: 'Escalations',         path: '/dm/escalations',  icon: AlertTriangle, badge: 3 },
        { key: 'allocation',     label: 'Allocation',          path: '/dm/allocation',   icon: Users },
        { key: 'heatmap',        label: 'Allocation Heatmap',  path: '/dm/heatmap',      icon: Map },
        { key: 'planned-actual', label: 'Planned vs Actual',   path: '/dm/planned-actual', icon: TrendingUp, phase: 2 },
        { key: 'dm-util',        label: 'Cross-Project Util',  path: '/dm/utilization',  icon: Activity, phase: 2 },
      ],
    },
    {
      section: 'More',
      items: [
        { key: 'reports',       label: 'Reports',        path: '/dm/reports',    icon: BarChart3 },
        { key: 'notifications', label: 'Notifications', path: '/notifications', icon: Bell },
        { key: 'profile',       label: 'Profile',        path: '/profile',       icon: User },
      ],
    },
  ],

  hr: [
    {
      section: 'People',
      items: [
        { key: 'hr-dash',     label: 'HR Dashboard',          path: '/hr/dashboard', icon: LayoutDashboard },
        { key: 'hr-activity', label: 'Activity & Compliance',  path: '/hr/activity',  icon: Users },
        { key: 'hr-leave',    label: 'Leave Alignment',        path: '/hr/leave',     icon: CalendarDays },
      ],
    },
    {
      section: 'More',
      items: [
        { key: 'reports',       label: 'Reports',        path: '/hr/reports',    icon: BarChart3 },
        { key: 'notifications', label: 'Notifications', path: '/notifications', icon: Bell },
        { key: 'profile',       label: 'Profile',        path: '/profile',       icon: User },
      ],
    },
  ],

  finance: [
    {
      section: 'Billing',
      items: [
        { key: 'fin-dash',     label: 'Finance Dashboard', path: '/finance/dashboard',    icon: LayoutDashboard },
        { key: 'fin-billable', label: 'Billable Data',      path: '/finance/billable',     icon: DollarSign },
        { key: 'fin-profit',   label: 'Profitability',      path: '/finance/profitability', icon: TrendingUp, phase: 2 },
      ],
    },
    {
      section: 'More',
      items: [
        { key: 'reports',       label: 'Reports',        path: '/finance/reports', icon: BarChart3 },
        { key: 'notifications', label: 'Notifications', path: '/notifications',   icon: Bell },
        { key: 'profile',       label: 'Profile',        path: '/profile',         icon: User },
      ],
    },
  ],

  leadership: [
    {
      section: 'Organization',
      items: [
        { key: 'lead-org-dash', label: 'Org Dashboard',      path: '/leadership/dashboard', icon: LayoutDashboard },
        { key: 'org-trends',    label: 'Trends & Drilldown',  path: '/leadership/trends',    icon: TrendingUp, phase: 2 },
        { key: 'org-teams',     label: 'Team Rankings',       path: '/leadership/teams',     icon: Trophy, phase: 2 },
      ],
    },
    {
      section: 'More',
      items: [
        { key: 'reports', label: 'Reports', path: '/leadership/reports', icon: BarChart3 },
        { key: 'profile', label: 'Profile', path: '/profile',             icon: User },
      ],
    },
  ],

  superadmin: [
    {
      section: 'Administration',
      items: [
        { key: 'admin-dash',     label: 'Admin Dashboard',  path: '/admin/dashboard',   icon: LayoutDashboard },
        { key: 'user-mgmt',      label: 'User Management',  path: '/admin/users',        icon: Users },
        { key: 'role-mgmt',      label: 'Roles & Access',       path: '/admin/roles',        icon: Lock },
        { key: 'org-masters',    label: 'Organization Masters', path: '/admin/org-masters',  icon: Building2 },
        { key: 'business-rules', label: 'Business Rules',       path: '/admin/rules',        icon: Settings },
        { key: 'integrations',   label: 'Integrations',     path: '/admin/integrations', icon: Plug, phase: 2 },
        { key: 'ai-settings',    label: 'AI & Automation',  path: '/admin/ai',           icon: Bot, phase: 3 },
        { key: 'audit',          label: 'Audit Log',        path: '/admin/audit',        icon: ScrollText },
      ],
    },
    {
      section: 'More',
      items: [
        { key: 'notifications', label: 'Notifications', path: '/notifications', icon: Bell },
        { key: 'profile',       label: 'Profile',        path: '/profile',       icon: User },
      ],
    },
  ],
};

export function getNavPaths(role: Role): string[] {
  return NAV[role].flatMap(s => s.items.map(i => i.path));
}

export function getNavItem(role: Role, path: string): { item: NavItem; section: NavSection } | undefined {
  for (const section of NAV[role]) {
    const item = section.items.find(i => i.path === path);
    if (item) return { item, section };
  }
}
