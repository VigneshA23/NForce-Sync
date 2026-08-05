import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './client';
import { RULES } from '../lib/rules';
import { toLocalISODate } from '../lib/date';

// ── types (mirror backend DTOs in com.nforceone.sync.teamlead) ────────────────────

export type MemberEodStatus = 'SUBMITTED' | 'PENDING_APPROVAL' | 'MISSING' | 'ON_LEAVE';

export interface ThresholdsDto {
  underutilizedPct: number;
  overloadedPct: number;
  atRiskMissingPct: number;
  blockerAgeAlertHours: number;
}

export interface TrendPointDto {
  date: string;
  value: number | null;
  /** False on weekends/company holidays — value carries no real signal on those days. */
  workingDay: boolean;
}

export interface DashboardTrendDto {
  avgUtilization: TrendPointDto[];
  submittedCount: TrendPointDto[];
  pendingApprovalCount: TrendPointDto[];
  blockersCount: TrendPointDto[];
}

export interface TeamLeadSummaryDto {
  activeMembers: number;
  onLeaveCount: number;
  missingCount: number;
  pendingApprovalCount: number;
  submittedCount: number;
  avgUtilization: number | null;
  underutilizedCount: number;
  overloadedCount: number;
  activeBlockersCount: number;
  thresholds: ThresholdsDto;
  /** False on weekends/company holidays — avgUtilization/underutilizedCount/overloadedCount carry no real signal. */
  workingDay: boolean;
}

export interface MemberEodStatusDto {
  id: number;
  fullName: string;
  employeeCode: string;
  status: MemberEodStatus;
  eodEntryId: number | null;
  projectNames: string[];
  utilizationPct: number | null;
  underutilized: boolean;
  overloaded: boolean;
  hasOpenBlocker: boolean;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface TeamBlockerDto {
  taskId: number;
  entryId: number;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  entryDate: string;
  projectCode: string | null;
  projectName: string | null;
  categoryName: string | null;
  description: string | null;
  hours: number | null;
  blockerReason: string | null;
  supportNeeded: string | null;
  submittedAt: string | null;
  openHours: number;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
}

/**
 * Warms today's dashboard queries right after login, in parallel with the lazy JS chunk
 * import — otherwise the first visit to Team Dashboard pays a full chunk-load-then-fetch
 * waterfall instead of the two overlapping.
 */
export function prefetchTeamLeadLanding(queryClient: QueryClient, today: string): void {
  const range: DateRange = { from: today, to: today };
  queryClient.prefetchQuery({
    queryKey: ['team-lead', 'summary', range.from, range.to],
    queryFn: () => api.get<TeamLeadSummaryDto>('/team-lead/dashboard/summary', { params: range }).then(r => r.data),
  });
  queryClient.prefetchQuery({
    queryKey: ['team-lead', 'member-status', range.from, range.to],
    queryFn: () => api.get<MemberEodStatusDto[]>('/team-lead/team-members/status', { params: range }).then(r => r.data),
  });
  queryClient.prefetchQuery({
    queryKey: ['team-lead', 'blockers', range.from, range.to],
    queryFn: () => api.get<TeamBlockerDto[]>('/team-lead/blockers', { params: range }).then(r => r.data),
  });
}

// ── hooks ───────────────────────────────────────────────────────────────────────

// `live` enables 60s polling — pass it only while the Team Lead is viewing "today";
// polling a historical date/range would silently overwrite the snapshot they asked to see.
// A historical date/range can't change once its day is over, so it's cached far longer than
// "today" — matches the staleTime convention already used by useTeamLeadTrend/useThresholds.
function rangeStaleTime(live: boolean): number {
  return live ? 30_000 : 5 * 60_000;
}

export function useTeamLeadSummary(range: DateRange, live = false) {
  return useQuery({
    queryKey: ['team-lead', 'summary', range.from, range.to],
    queryFn: () =>
      api.get<TeamLeadSummaryDto>('/team-lead/dashboard/summary', { params: range }).then(r => r.data),
    staleTime: rangeStaleTime(live),
    refetchInterval: live ? 60_000 : false,
    // Keep showing the previous range's data while a newly-picked range loads, instead of
    // unmounting the whole dashboard to a loading skeleton on every date/range change.
    placeholderData: keepPreviousData,
  });
}

export function useTeamMemberStatuses(range: DateRange, live = false) {
  return useQuery({
    queryKey: ['team-lead', 'member-status', range.from, range.to],
    queryFn: () =>
      api.get<MemberEodStatusDto[]>('/team-lead/team-members/status', { params: range }).then(r => r.data),
    staleTime: rangeStaleTime(live),
    refetchInterval: live ? 60_000 : false,
    placeholderData: keepPreviousData,
  });
}

export function useTeamLeadBlockers(range: DateRange, live = false) {
  return useQuery({
    queryKey: ['team-lead', 'blockers', range.from, range.to],
    queryFn: () =>
      api.get<TeamBlockerDto[]>('/team-lead/blockers', { params: range }).then(r => r.data),
    staleTime: rangeStaleTime(live),
    refetchInterval: live ? 60_000 : false,
    placeholderData: keepPreviousData,
  });
}

export function useTeamLeadTrend(date: string, days = 7) {
  return useQuery({
    queryKey: ['team-lead', 'trend', date, days],
    queryFn: () =>
      api.get<DashboardTrendDto>('/team-lead/dashboard/trend', { params: { date, days } }).then(r => r.data),
    staleTime: 5 * 60_000,
  });
}

export interface TeamMemberDetailDto {
  employeeId: number;
  designation: string | null;
  /** Scheduled business days in the same window as `trend` (length matches the requested
   *  `days`) — calendar-only, independent of whether anything was submitted/approved. */
  workingDays: number;
  /** Of those days, how many have an APPROVED entry. */
  loggedDays: number;
  lastApprovedEodAt: string | null;
  trend: TrendPointDto[];
}

/** Supplements useTeamMemberStatuses/useTeamUtil (status, hours, utilization — already
 *  fetched for the member list) with the extra fields the Team Utilization detail panel
 *  needs: designation, working/logged days, last-approved-EOD timestamp, and a per-employee
 *  trend over the requested window (`days`, default 7). */
export function useTeamMemberDetail(employeeId: number | undefined, date: string, days = 7) {
  return useQuery({
    queryKey: ['team-lead', 'member-detail', employeeId, date, days],
    queryFn: () =>
      api.get<TeamMemberDetailDto>(`/team-lead/team-members/${employeeId}/detail`, { params: { date, days } }).then(r => r.data),
    enabled: employeeId != null,
    staleTime: 5 * 60_000,
  });
}

/** Warms the detail panel's cache on row hover, before the click — the backend request itself
 *  is now fast (batched, ~3 queries), but prefetching on hover hides even that brief fetch,
 *  so switching between employees reads as instant instead of a visible reload. */
export function prefetchTeamMemberDetail(queryClient: QueryClient, employeeId: number, date: string, days = 7): void {
  queryClient.prefetchQuery({
    queryKey: ['team-lead', 'member-detail', employeeId, date, days],
    queryFn: () =>
      api.get<TeamMemberDetailDto>(`/team-lead/team-members/${employeeId}/detail`, { params: { date, days } }).then(r => r.data),
    staleTime: 5 * 60_000,
  });
}

export function useThresholds() {
  return useQuery({
    queryKey: ['team-lead', 'thresholds'],
    queryFn: () => api.get<ThresholdsDto>('/team-lead/thresholds').then(r => r.data),
    staleTime: 5 * 60_000,
  });
}

// ── team monthly activity ──────────────────────────────────────────────────────
// TODO(backend): GET /team-lead/monthly-activity?month=YYYY-MM does not exist yet.
// This is team-wide (per-day member counts across the whole roster), distinct from the
// existing daily dashboard-summary endpoint — do not fold it into that one. Once the
// endpoint ships, delete `mockMonthlyActivity` below and point `useTeamMonthlyActivity`'s
// queryFn at:
//   api.get<TeamMonthlyActivityDto>('/team-lead/monthly-activity', { params: { month } }).then(r => r.data)

export interface TeamMonthlyActivityDayDto {
  date: string;
  isWeekend: boolean;
  isFuture: boolean;
  isToday: boolean;
  /** Only meaningful when `isToday` — whether today's submission cutoff has already passed. */
  cutoffPassed: boolean;
  approvedCount: number;
  pendingCount: number;
  needsActionCount: number;
  missedCount: number;
}

export interface TeamMonthlyActivityDto {
  month: string;
  activeMemberCount: number;
  days: TeamMonthlyActivityDayDto[];
}

// Deterministic per-day PRNG so the mock doesn't reshuffle on every refetch/re-render.
function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return () => {
    h = (h * 1664525 + 1013904223) | 0;
    return ((h >>> 0) % 10000) / 10000;
  };
}

function mockMonthlyActivity(month: string, activeMemberCount: number): TeamMonthlyActivityDto {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const todayStr = toLocalISODate(new Date());
  const now = new Date();
  const [cutoffH, cutoffM] = RULES.cutoff.split(':').map(Number);
  const cutoffPassedToday = now.getHours() > cutoffH || (now.getHours() === cutoffH && now.getMinutes() >= cutoffM);

  const days: TeamMonthlyActivityDayDto[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = new Date(y, m - 1, d).getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isToday = date === todayStr;
    const isFuture = date > todayStr;

    if (isWeekend || isFuture) {
      days.push({ date, isWeekend, isFuture, isToday: false, cutoffPassed: false, approvedCount: 0, pendingCount: 0, needsActionCount: 0, missedCount: 0 });
      continue;
    }
    if (isToday && !cutoffPassedToday) {
      days.push({ date, isWeekend: false, isFuture: false, isToday: true, cutoffPassed: false, approvedCount: 0, pendingCount: 0, needsActionCount: 0, missedCount: 0 });
      continue;
    }

    const rand = seededRandom(date);
    let remaining = activeMemberCount;
    const missedCount = rand() < 0.15 ? Math.min(remaining, 1 + Math.floor(rand() * 2)) : 0;
    remaining -= missedCount;
    const needsActionCount = remaining > 0 && rand() < 0.12 ? Math.min(remaining, 1) : 0;
    remaining -= needsActionCount;
    const pendingCount = remaining > 0 && rand() < 0.3 ? Math.min(remaining, 1 + Math.floor(rand() * 2)) : 0;
    remaining -= pendingCount;
    const approvedCount = remaining;

    days.push({
      date, isWeekend: false, isFuture: false, isToday, cutoffPassed: isToday,
      approvedCount, pendingCount, needsActionCount, missedCount,
    });
  }

  return { month, activeMemberCount, days };
}

export function useTeamMonthlyActivity(month: string, activeMemberCount: number) {
  return useQuery({
    queryKey: ['team-lead', 'monthly-activity', month, activeMemberCount],
    queryFn: () => Promise.resolve(mockMonthlyActivity(month, activeMemberCount)),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    enabled: activeMemberCount > 0,
  });
}

export function useAcknowledgeBlocker(range: DateRange) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: number) =>
      api.patch<TeamBlockerDto>(`/team-lead/blockers/${taskId}/acknowledge`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-lead', 'blockers', range.from, range.to] });
      qc.invalidateQueries({ queryKey: ['team-lead', 'member-status', range.from, range.to] });
      qc.invalidateQueries({ queryKey: ['team-lead', 'summary', range.from, range.to] });
    },
  });
}
