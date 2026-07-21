export const RULES = {
  util: { under: 60, over: 100 },
  benchAllocation: 0,
  standardDayHours: 8,
  cutoff: '19:00',
  escalationHours: 48,
} as const;

export type UtilState = 'na' | 'under' | 'healthy' | 'over';

export function utilState(pct: number | null): UtilState {
  if (pct === null) return 'na';
  if (pct < RULES.util.under) return 'under';
  if (pct > RULES.util.over) return 'over';
  return 'healthy';
}

export function utilColor(pct: number | null): string {
  switch (utilState(pct)) {
    case 'na':      return 'var(--txt-dim)';
    case 'under':   return 'var(--warn)';
    case 'healthy': return 'var(--ok)';
    case 'over':    return 'var(--risk)';
  }
}

export function isBench(allocationPct: number): boolean {
  return allocationPct === RULES.benchAllocation;
}

export function allocationLabel(pct: number): string {
  if (isBench(pct)) return 'Bench';
  if (pct < RULES.util.under) return 'Under-allocated';
  if (pct <= RULES.util.over) return 'Allocated';
  return 'Over-allocated';
}

export function isWorkingDay(d: Date): boolean {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

export function workingWeek(anchor: Date): { date: Date; label: string }[] {
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
  const base = new Date(anchor);
  const dow = base.getDay();
  const monday = new Date(base);
  monday.setDate(base.getDate() - ((dow + 6) % 7));

  return Array.from({ length: 5 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return { date, label: DAY_NAMES[date.getDay()] };
  });
}

export function fmtPct(pct: number | null): string {
  if (pct === null) return 'N/A';
  return `${Math.round(pct)}%`;
}
