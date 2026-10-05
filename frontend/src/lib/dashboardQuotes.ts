import type { Role } from './types';

/**
 * Role → dashboard hero banner quote. Each quote is two sentences — the first renders as the
 * banner's small caption line, the second as its bold value line (see HeroBanner's "Small steps,
 * big progress!" mini-card) — so the layout stays exactly what it was, only the words per role.
 */
export interface DashboardQuote {
  label: string;
  value: string;
}

const DASHBOARD_QUOTES: Partial<Record<Role, DashboardQuote>> = {
  employee: {
    label: 'Make every day count.',
    value: 'Own your work and drive your impact.',
  },
  pm: {
    label: 'Turn plans into progress.',
    value: 'Align resources and accelerate delivery.',
  },
  admin: {
    label: 'Keep people, processes, and progress in sync.',
    value: 'Simplify the way work gets done.',
  },
  superadmin: {
    label: 'Power the platform.',
    value: 'See the bigger picture and drive what matters.',
  },
};

/** Roles with no quote of their own (dm/finance/leadership) get the Employee one rather than a
 *  blank banner. */
export function dashboardQuoteFor(role: Role | undefined): DashboardQuote {
  return (role && DASHBOARD_QUOTES[role]) || DASHBOARD_QUOTES.employee!;
}
