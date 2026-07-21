import {
  LayoutDashboard, ClipboardList, BarChart3, Activity,
  Bell, User, ClipboardCheck, AlertOctagon,
  FolderKanban, Users, TrendingUp, Map,
  AlertTriangle, CalendarDays, DollarSign, Trophy,
  Lock, Settings, Plug, Bot, ScrollText,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Role } from './types';

export interface NavItem {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: number;
  phase?: 2 | 3 | 4;
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
        { key: 'emp-dash',    label: 'My Dashboard',   path: '/dashboard',   icon: LayoutDashboard },
        { key: 'eod-submit',  label: 'Submit EOD',      path: '/eod/submit',  icon: ClipboardList },
        { key: 'eod-history', label: 'My EOD History',  path: '/eod/history', icon: BarChart3 },
        { key: 'my-util',     label: 'My Utilization',  path: '/utilization', icon: Activity },
      ],
    },
    {
      section: 'Account',
      items: [
        { key: 'notifications', label: 'Notifications', path: '/notifications', icon: Bell, badge: 3 },
        { key: 'profile',       label: 'Profile',        path: '/profile',       icon: User },
      ],
    },
  ],

  lead: [
    {
      section: 'Overview',
      items: [
        { key: 'lead-dash',  label: 'Team Dashboard',   path: '/team/dashboard',   icon: LayoutDashboard },
        { key: 'approvals',  label: 'Approvals',         path: '/team/approvals',   icon: ClipboardCheck, badge: 5 },
        { key: 'team-util',  label: 'Team Utilization',  path: '/team/utilization', icon: Activity },
        { key: 'blockers',   label: 'Blockers',          path: '/team/blockers',    icon: AlertOctagon },
      ],
    },
    {
      section: 'Personal',
      items: [
        { key: 'eod-submit',    label: 'Submit EOD',     path: '/eod/submit',    icon: ClipboardList },
        { key: 'reports',       label: 'Reports',         path: '/team/reports',  icon: BarChart3 },
        { key: 'notifications', label: 'Notifications',  path: '/notifications', icon: Bell, badge: 2 },
        { key: 'profile',       label: 'Profile',         path: '/profile',       icon: User },
      ],
    },
  ],

  pm: [
    {
      section: 'Projects',
      items: [
        { key: 'pm-dash',        label: 'Project Dashboard', path: '/projects/dashboard',     icon: LayoutDashboard },
        { key: 'projects',       label: 'Projects',           path: '/projects',                icon: FolderKanban },
        { key: 'allocation',     label: 'Allocation',         path: '/projects/allocation',     icon: Users },
        { key: 'planned-actual', label: 'Planned vs Actual',  path: '/projects/planned-actual', icon: TrendingUp, phase: 2 },
        { key: 'blockers',       label: 'Blockers',           path: '/projects/blockers',       icon: AlertOctagon },
      ],
    },
    {
      section: 'Work',
      items: [
        { key: 'approvals',     label: 'Approvals',      path: '/projects/approvals', icon: ClipboardCheck, badge: 4 },
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
        { key: 'role-mgmt',      label: 'Roles & Access',   path: '/admin/roles',        icon: Lock },
        { key: 'business-rules', label: 'Business Rules',   path: '/admin/rules',        icon: Settings },
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
