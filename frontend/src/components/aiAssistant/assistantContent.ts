import {
  Activity, Ban, Bot, Building2, ClipboardCheck, ClipboardList, FolderKanban, Lock, Settings, Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Role } from '../../lib/types';

export interface AssistantQuickAction {
  label: string;
  route: string;
  /** Same icon this page already uses in NAV (lib/nav.ts) or its KPI card, not a new choice per item. */
  icon: LucideIcon;
}

export interface AssistantRoleContent {
  quickActions: AssistantQuickAction[];
  popularQuestions: string[];
}

/**
 * Role-specific Quick Actions/Popular Questions for the assistant's empty state, keyed the same
 * way NAV (lib/nav.ts) is. Routes and icons are drawn from NAV/PAGE_TARGETS (lib/ai/pageTargets.ts)
 * and TeamDashboard's "Open Blockers" KPI card (Ban), not invented, so a Quick Action always lands
 * on a route the role can actually reach and reads with the icon it already carries elsewhere.
 *
 * Note: Super Admin no longer owns User Management/Roles & Access in this app — those moved to
 * the Admin role (see nav.ts's `admin` vs `superadmin` comment). Content below reflects that split
 * rather than mirroring OneHR's undifferentiated "admin" copy.
 *
 * Roles with no entry here (dm, finance, leadership) fall back to AssistantPanel's generic
 * suggestions — they weren't part of this rollout's scope.
 */
export const ASSISTANT_ROLE_CONTENT: Partial<Record<Role, AssistantRoleContent>> = {
  employee: {
    quickActions: [
      { label: 'Submit EOD', route: '/eod/submit', icon: ClipboardList },
      { label: 'My Blockers', route: '/blockers', icon: Ban },
      { label: 'My Utilization', route: '/utilization', icon: Activity },
    ],
    popularQuestions: [
      'How do I submit my EOD?',
      'How do I raise a blocker?',
      'Why is my utilization low this week?',
    ],
  },
  lead: {
    quickActions: [
      { label: 'EOD Approvals', route: '/team/approvals', icon: ClipboardCheck },
      { label: 'Blockers Inbox', route: '/team/blockers', icon: Ban },
      { label: 'Team Utilization', route: '/team/utilization', icon: Activity },
    ],
    popularQuestions: [
      "How do I approve a team member's EOD?",
      'How do I resolve a blocker?',
      'How is team utilization calculated?',
    ],
  },
  pm: {
    quickActions: [
      { label: 'Projects & Allocation', route: '/projects', icon: FolderKanban },
      { label: 'Projects Utilization', route: '/projects/utilization', icon: Activity },
      { label: 'Blockers', route: '/projects/blockers', icon: Ban },
    ],
    popularQuestions: [
      'How do I allocate someone to a project?',
      "What's driving the utilization dip this month?",
      'Can I reply to a blocker?',
    ],
  },
  admin: {
    quickActions: [
      { label: 'User Management', route: '/admin/users', icon: Users },
      { label: 'Business Rules', route: '/admin/rules', icon: Settings },
      { label: 'Roles & Access', route: '/admin/roles', icon: Lock },
    ],
    popularQuestions: [
      'How do I add a new user?',
      'How do I set the holiday calendar?',
      "How do I change someone's role?",
    ],
  },
  superadmin: {
    quickActions: [
      { label: 'Business Rules', route: '/admin/rules', icon: Settings },
      { label: 'Organization Masters', route: '/admin/org-masters', icon: Building2 },
      { label: 'AI & Automation', route: '/admin/ai', icon: Bot },
    ],
    popularQuestions: [
      'How do I set the holiday calendar?',
      'How do I update business rules?',
      'How do I configure the AI assistant?',
    ],
  },
};
