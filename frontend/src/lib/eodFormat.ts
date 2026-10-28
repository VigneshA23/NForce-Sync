import type { ApprovalPieceDto } from '../api/approvalPieces';

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

export function fmtRelative(d: string | null | undefined): string {
  if (!d) return '—';
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(d);
}

export function fmtInactivity(hoursPending: number | null | undefined): string {
  if (hoursPending == null) return '';
  if (hoursPending >= 24) return `${Math.floor(hoursPending / 24)}d`;
  return `${Math.round(hoursPending)}h`;
}

export function fmtHours(h: number | null | undefined): string {
  if (h == null) return '—';
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins > 0 ? `${whole}h ${mins}m` : `${whole}h`;
}

export function totalHours(piece: ApprovalPieceDto): number {
  if (piece.entryForm === 'PLAIN_LOG') return Number(piece.logTotalHours ?? 0);
  return (piece.taskLines ?? []).reduce((s, t) => s + Number(t.hours ?? 0), 0);
}

export function dayTypeLabel(dt: string | null | undefined): string {
  switch (dt) {
    case 'FULL_DAY':           return 'Full Day';
    case 'HALF_DAY':           return 'Half Day';
    case 'FIRST_HALF_LEAVE':   return 'First Half Leave';
    case 'SECOND_HALF_LEAVE':  return 'Second Half Leave';
    case 'LEAVE':              return 'Leave';
    case 'HOLIDAY':            return 'Holiday';
    case 'WORK_FROM_HOME':     return 'WFH';
    default:                   return dt ?? '';
  }
}
