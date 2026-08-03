import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ResponsiveContainer, LineChart, Line } from 'recharts';
import {
  Ban, Calendar, ChevronDown, ChevronRight, Flag, Loader2, TrendingDown, TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { todayISO as localTodayISO, toLocalISODate } from '../../lib/date';
import { getEntry } from '../../api/eod';
import {
  useAcknowledgeBlocker, useTeamLeadBlockers, useTeamLeadSummary, useTeamLeadTrend, useTeamMemberStatuses,
  type DateRange, type MemberEodStatus, type MemberEodStatusDto, type TeamBlockerDto, type TrendPointDto,
} from '../../api/teamLead';

// ── status config ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<MemberEodStatus, { color: string; label: string }> = {
  SUBMITTED:         { color: 'var(--ok)',      label: 'Submitted' },
  PENDING_APPROVAL:  { color: 'var(--warn)',    label: 'Pending' },
  MISSING:           { color: 'var(--risk)',    label: 'Missing' },
  ON_LEAVE:          { color: 'var(--txt-dim)', label: 'On Leave' },
};

// Missing -> Pending Approval -> Submitted -> On Leave
const STATUS_PRIORITY: Record<MemberEodStatus, number> = {
  MISSING: 0, PENDING_APPROVAL: 1, SUBMITTED: 2, ON_LEAVE: 3,
};

function fmtPct(pct: number | null): string {
  return pct === null ? '—' : `${Math.round(pct)}%`;
}

function fmtLongDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtShortDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function rangeLabel(range: DateRange, fmt: (iso: string) => string): string {
  return range.from === range.to ? fmt(range.from) : `${fmt(range.from)} – ${fmt(range.to)}`;
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalISODate(d);
}

// ── trend helpers ──────────────────────────────────────────────────────────────

function lastTwo(points: TrendPointDto[] | undefined): [number | null, number | null] {
  if (!points || points.length < 2) return [null, null];
  return [points[points.length - 1].value, points[points.length - 2].value];
}

function fmtDelta(delta: number | null, suffix = ''): string {
  if (delta === null) return '';
  const rounded = Math.round(delta);
  if (rounded === 0) return `±0${suffix}`;
  return `${rounded > 0 ? '+' : ''}${rounded}${suffix}`;
}

// ── primitives (local — matches the per-page Card convention used across lead pages) ──

function Skel({ h = 14, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />;
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, ...style }}>
      {children}
    </div>
  );
}

function Pill({ color, label }: { color: string; label: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      background: `color-mix(in srgb, ${color} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      color, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
    }}>
      {label}
    </span>
  );
}

// Deterministic per-person identity color (not a status/semantic color, so it lives
// outside the --ok/--warn/--risk/--info token set) — same person always gets the same hue.
const AVATAR_PALETTE = [
  '#3FB68A', '#E8935B', '#D6A93B', '#E06A8B', '#8B7FE0', '#5FA8DE', '#4FA37A', '#D9707A',
];

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function Avatar({ name, seed }: { name: string; seed: string }) {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: avatarColor(seed),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 700, color: '#fff',
    }}>
      {name.split(' ').map(w => w[0]).slice(0, 2).join('')}
    </div>
  );
}

// ── sparkline ──────────────────────────────────────────────────────────────────

function Sparkline({ points, color }: { points: TrendPointDto[] | undefined; color: string }) {
  const data = (points ?? []).map(p => ({ v: p.value ?? 0 }));
  if (data.length < 2) return <div style={{ width: 72, height: 28 }} />;
  return (
    <div style={{ width: 72, height: 28 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── KPI card with trend delta + sparkline ───────────────────────────────────────

function TrendKpiCard({
  label, value, delta, deltaSuffix = '', deltaLabel, deltaGoodDirection, accent, sparkline, sparklineColor, showDelta = true,
}: {
  label: string;
  value: React.ReactNode;
  delta: number | null;
  deltaSuffix?: string;
  deltaLabel?: (n: number) => string;
  deltaGoodDirection: 'up' | 'down';
  accent: string;
  sparkline: TrendPointDto[] | undefined;
  sparklineColor: string;
  showDelta?: boolean;
}) {
  const deltaUp = delta !== null && delta > 0;
  const deltaDown = delta !== null && delta < 0;
  const deltaColor = delta === null || delta === 0
    ? 'var(--txt-dim)'
    : (deltaUp ? deltaGoodDirection === 'up' : deltaGoodDirection === 'down')
      ? 'var(--ok)' : 'var(--risk)';
  const deltaText = delta === null ? null : deltaLabel ? deltaLabel(delta) : fmtDelta(delta, deltaSuffix);

  return (
    <div style={{
      background: 'var(--panel)', borderRadius: 10, padding: 18,
      border: `1px solid color-mix(in srgb, ${accent} 25%, var(--line))`,
    }}>
      <div style={{ fontSize: 11, color: 'var(--txt-mut)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 28, fontWeight: 700, color: 'var(--txt)', letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {value}
          </div>
          {showDelta && deltaText && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: deltaColor, marginTop: 6, fontWeight: 600 }}>
              {deltaUp ? <TrendingUp size={11} aria-hidden="true" /> : deltaDown ? <TrendingDown size={11} aria-hidden="true" /> : null}
              {deltaText}
            </div>
          )}
        </div>
        <Sparkline points={sparkline} color={sparklineColor} />
      </div>
    </div>
  );
}

// ── util bar (color driven by real thresholds, not fixed bands) ────────────────

function UtilBar({ pct, underutilized, overloaded }: { pct: number | null; underutilized: boolean; overloaded: boolean }) {
  const color = pct === null ? 'var(--txt-dim)' : overloaded ? 'var(--risk)' : underutilized ? 'var(--warn)' : 'var(--ok)';
  const capAt = 120;
  const fill = pct === null ? 0 : Math.min(pct, capAt);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--raised2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(fill / capAt) * 100}%`, background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color, minWidth: 34, textAlign: 'right' }}>
        {fmtPct(pct)}
      </span>
    </div>
  );
}

// ── member detail (inline expand) ────────────────────────────────────────────────

function MemberDetail({ eodEntryId }: { eodEntryId: number }) {
  const { data, isPending } = useQuery({
    queryKey: ['eod', 'entry', eodEntryId],
    queryFn: () => getEntry(eodEntryId),
  });

  if (isPending) return <div style={{ padding: '4px 16px 12px 58px' }}><Skel h={13} w="60%" /></div>;
  if (!data) return null;

  return (
    <div style={{ padding: '0 16px 14px 58px' }}>
      {data.tasks.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>No tasks logged.</div>
      ) : (
        data.tasks.map(t => (
          <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--txt)', marginBottom: 2 }}>
                {t.description || '—'}
                {t.categoryName && <span style={{ color: 'var(--txt-dim)' }}> · {t.categoryName}</span>}
              </div>
              {t.blockerReason && <div style={{ fontSize: 11, color: 'var(--risk)' }}>Blocker: {t.blockerReason}</div>}
            </div>
            <div style={{ fontSize: 12, fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt-mut)', whiteSpace: 'nowrap' }}>
              {t.hours != null ? `${t.hours}h` : '—'}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── project names cell (truncated, full list via native tooltip) ──────────────────

function ProjectsCell({ names }: { names: string[] }) {
  if (names.length === 0) {
    return <span style={{ fontSize: 12, color: 'var(--txt-mut)' }}>—</span>;
  }
  const shown = names.slice(0, 2);
  const extra = names.length - shown.length;
  return (
    <div
      title={extra > 0 ? names.join(', ') : undefined}
      style={{
        fontSize: 12, color: 'var(--txt-mut)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        cursor: extra > 0 ? 'help' : 'default',
      }}
    >
      {shown.join(', ')}{extra > 0 && ` +${extra}`}
    </div>
  );
}

// ── team status row ──────────────────────────────────────────────────────────────

function MemberRow({ member, isLast, expanded, onToggle }: {
  member: MemberEodStatusDto; isLast: boolean; expanded: boolean; onToggle: () => void;
}) {
  const { color, label } = STATUS_CFG[member.status];
  const canExpand = member.eodEntryId != null;

  return (
    <div style={{ borderBottom: isLast && !expanded ? 'none' : '1px solid var(--line)' }}>
      <div
        onClick={canExpand ? onToggle : undefined}
        role={canExpand ? 'button' : undefined}
        tabIndex={canExpand ? 0 : undefined}
        onKeyDown={canExpand ? (e) => { if (e.key === 'Enter') onToggle(); } : undefined}
        style={{
          display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 1fr 110px', gap: 12, alignItems: 'center',
          padding: '11px 16px', cursor: canExpand ? 'pointer' : 'default',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Avatar name={member.fullName} seed={member.employeeCode} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {member.fullName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>
              {member.employeeCode}
            </div>
          </div>
        </div>
        <ProjectsCell names={member.projectNames} />
        <UtilBar pct={member.utilizationPct} underutilized={member.underutilized} overloaded={member.overloaded} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} aria-hidden="true" />
          <span style={{ fontSize: 12, color, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
          {canExpand && (expanded
            ? <ChevronDown size={13} style={{ color: 'var(--txt-dim)' }} aria-hidden="true" />
            : <ChevronRight size={13} style={{ color: 'var(--txt-dim)' }} aria-hidden="true" />)}
        </div>
      </div>
      {expanded && canExpand && <MemberDetail eodEntryId={member.eodEntryId!} />}
    </div>
  );
}

// ── blockers-today row ────────────────────────────────────────────────────────────

function BlockerRow({ b, isLast, flagged, expanded, onToggle, onAcknowledge, acking }: {
  b: TeamBlockerDto; isLast: boolean; flagged: boolean; expanded: boolean;
  onToggle: () => void; onAcknowledge: () => void; acking: boolean;
}) {
  const rowContent = (
    <div
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onToggle(); }}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: flagged ? '10px 12px' : '12px 16px', cursor: 'pointer' }}
    >
      {flagged
        ? <Flag size={14} style={{ color: 'var(--warn)', flexShrink: 0 }} aria-hidden="true" />
        : <Ban size={14} style={{ color: 'var(--txt-dim)', flexShrink: 0 }} aria-hidden="true" />}
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <strong style={{ color: 'var(--txt)', fontWeight: 600 }}>{b.employeeName}</strong>
        <span style={{ color: 'var(--txt-mut)' }}> — {b.blockerReason ?? b.description ?? 'No detail provided'}</span>
      </div>
      {b.acknowledged
        ? <Pill color="var(--ok)" label="Acknowledged" />
        : <span style={{ fontSize: 10, color: flagged ? 'var(--warn)' : 'var(--txt-dim)', whiteSpace: 'nowrap' }}>{b.openHours}h open</span>}
    </div>
  );

  return (
    <div style={{ borderBottom: isLast && !expanded ? 'none' : '1px solid var(--line)', padding: flagged ? '8px 16px' : 0 }}>
      {flagged ? (
        <div style={{
          background: 'color-mix(in srgb, var(--warn) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--warn) 26%, transparent)',
          borderRadius: 8,
        }}>
          {rowContent}
        </div>
      ) : rowContent}
      {expanded && (
        <div style={{ padding: '0 16px 14px 40px' }}>
          {b.projectName && <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginBottom: 6 }}>{b.projectName}</div>}
          {b.description && <div style={{ fontSize: 12, color: 'var(--txt-mut)', marginBottom: 8, lineHeight: 1.5 }}>{b.description}</div>}
          <div style={{
            background: 'color-mix(in srgb, var(--risk) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--risk) 22%, transparent)',
            borderRadius: 6, padding: '8px 12px', marginBottom: b.acknowledged ? 0 : 10,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--risk)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Blocker</div>
            <div style={{ fontSize: 12, color: 'var(--txt)', lineHeight: 1.5 }}>{b.blockerReason ?? '—'}</div>
          </div>
          {!b.acknowledged && (
            <button
              onClick={(e) => { e.stopPropagation(); onAcknowledge(); }}
              disabled={acking}
              style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)',
                cursor: acking ? 'default' : 'pointer', opacity: acking ? 0.6 : 1,
              }}
            >
              Acknowledge
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────────────

type DateMode = 'today' | 'yesterday' | 'range';

// Backs up the URL-held date selection so it also survives navigation that drops the query
// string entirely (e.g. clicking the "Team Dashboard" sidebar link, which points at the bare
// path) — the URL stays the source of truth whenever it has the params, this is only the
// fallback so a plain nav-away-and-back doesn't silently reset to "Today".
const DATE_FILTER_STORAGE_KEY = 'nfsync_team_dashboard_date';

interface StoredDateFilter {
  mode: DateMode;
  from?: string;
  to?: string;
}

function readStoredDateFilter(): StoredDateFilter | null {
  try {
    const raw = sessionStorage.getItem(DATE_FILTER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredDateFilter) : null;
  } catch {
    return null;
  }
}

function writeStoredDateFilter(filter: StoredDateFilter): void {
  try {
    sessionStorage.setItem(DATE_FILTER_STORAGE_KEY, JSON.stringify(filter));
  } catch {}
}

export default function TeamDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const todayISO = localTodayISO();

  // Selected date/range lives in the URL (?mode=today|yesterday|range&from=&to=) so it survives
  // navigation within the session, is shareable/bookmarkable, and only ever changes on an
  // explicit user action — never as a side effect of remounting this page.
  const [searchParams, setSearchParams] = useSearchParams();

  // If the URL doesn't carry a selection (e.g. we arrived via a plain nav link rather than the
  // browser back button / a bookmarked URL), fall back to the last explicit selection in
  // sessionStorage instead of defaulting straight to "today".
  const stored = searchParams.get('mode') ? null : readStoredDateFilter();
  const modeParam = searchParams.get('mode') ?? stored?.mode ?? null;
  const fromParam = searchParams.get('from') ?? stored?.from ?? null;
  const toParam = searchParams.get('to') ?? stored?.to ?? null;
  const mode: DateMode = modeParam === 'yesterday'
    ? 'yesterday'
    : modeParam === 'range' && fromParam && toParam
      ? 'range'
      : 'today';

  const singleISO = mode === 'yesterday' ? yesterdayISO() : todayISO;
  const rangeFrom = mode === 'range' ? fromParam! : todayISO;
  const rangeTo = mode === 'range' ? toParam! : todayISO;

  // Mirror a storage-only fallback back into the URL so it stays shareable/bookmarkable too.
  // Runs once on mount; a no-op whenever the URL already carries the selection.
  useEffect(() => {
    if (searchParams.get('mode')) return;
    const saved = readStoredDateFilter();
    if (!saved) return;
    const next = new URLSearchParams(searchParams);
    next.set('mode', saved.mode);
    if (saved.mode === 'range' && saved.from && saved.to) {
      next.set('from', saved.from);
      next.set('to', saved.to);
    }
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(todayISO);
  const [draftTo, setDraftTo] = useState(todayISO);

  const range: DateRange = mode === 'range' ? { from: rangeFrom, to: rangeTo } : { from: singleISO, to: singleISO };
  const isToday = mode !== 'range' && singleISO === todayISO;

  function selectQuick(kind: 'today' | 'yesterday') {
    const next = new URLSearchParams(searchParams);
    next.set('mode', kind);
    next.delete('from');
    next.delete('to');
    setSearchParams(next, { replace: true });
    writeStoredDateFilter({ mode: kind });
    setPickerOpen(false);
  }

  function applyRange() {
    if (draftFrom > draftTo) return;
    const next = new URLSearchParams(searchParams);
    next.set('mode', 'range');
    next.set('from', draftFrom);
    next.set('to', draftTo);
    setSearchParams(next, { replace: true });
    writeStoredDateFilter({ mode: 'range', from: draftFrom, to: draftTo });
    setPickerOpen(false);
  }

  function openPicker() {
    setDraftFrom(mode === 'range' ? rangeFrom : singleISO);
    setDraftTo(mode === 'range' ? rangeTo : singleISO);
    setPickerOpen(true);
  }

  const { data: summary, isPending: summaryPending, isFetching: summaryFetching, isError: summaryError, refetch: refetchSummary } = useTeamLeadSummary(range, isToday);
  const { data: members, isPending: membersPending, isFetching: membersFetching, isError: membersError, refetch: refetchMembers } = useTeamMemberStatuses(range, isToday);
  const { data: blockers, isPending: blockersPending, isFetching: blockersFetching } = useTeamLeadBlockers(range, isToday);
  const { data: trend } = useTeamLeadTrend(range.to, 7);
  const acknowledge = useAcknowledgeBlocker(range);

  const [expandedMemberId, setExpandedMemberId] = useState<number | null>(null);
  const [expandedBlockerId, setExpandedBlockerId] = useState<number | null>(null);
  const [ackingId, setAckingId] = useState<number | null>(null);

  const sortedMembers = useMemo(() => {
    if (!members) return [];
    return [...members].sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);
  }, [members]);

  const isPending = summaryPending || membersPending;
  const isError = summaryError || membersError;
  // True only for a background refresh (e.g. after applying a new date/range) where prior data
  // is still on screen — distinct from isPending, which is the true first-load/no-data case.
  const isRefreshing = !isPending && (summaryFetching || membersFetching || blockersFetching);

  if (isPending) {
    return (
      <div>
        <div style={{ marginBottom: 28 }}>
          <Skel h={26} w={200} />
          <div style={{ marginTop: 8 }}><Skel h={14} w={220} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[0, 1, 2, 3].map(i => (
            <Card key={i} style={{ padding: 18 }}><Skel h={28} w={60} /><div style={{ marginTop: 8 }}><Skel h={12} w={80} /></div></Card>
          ))}
        </div>
        <Card style={{ padding: 20 }}><Skel h={200} /></Card>
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>Team Dashboard</h1>
        </div>
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load dashboard.</div>
          <button
            onClick={() => { refetchSummary(); refetchMembers(); }}
            style={{ padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}
          >
            Retry
          </button>
        </Card>
      </div>
    );
  }

  const submittedTodayLabel = `${summary.submittedCount + summary.pendingApprovalCount}/${summary.activeMembers}`;
  const avgUtilLabel = summary.avgUtilization === null ? '—' : fmtPct(summary.avgUtilization);

  const [utilToday, utilYesterday] = lastTwo(trend?.avgUtilization);
  const utilDelta = utilToday !== null && utilYesterday !== null ? utilToday - utilYesterday : null;
  const [pendingToday, pendingYesterday] = lastTwo(trend?.pendingApprovalCount);
  const pendingDelta = pendingToday !== null && pendingYesterday !== null ? pendingToday - pendingYesterday : null;
  const [blockersToday, blockersYesterday] = lastTwo(trend?.blockersCount);
  const blockersDelta = blockersToday !== null && blockersYesterday !== null ? blockersToday - blockersYesterday : null;

  const flaggedBlockerIds = new Set(
    (blockers ?? []).filter(b => !b.acknowledged && b.openHours > summary.thresholds.blockerAgeAlertHours).map(b => b.taskId),
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            Team Dashboard
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
            {user?.name} · {summary.activeMembers} direct report{summary.activeMembers !== 1 ? 's' : ''} · {rangeLabel(range, fmtLongDate)}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', fontSize: 12, fontWeight: 600,
                color: isToday ? 'var(--info)' : 'var(--txt)',
                background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <Calendar size={13} aria-hidden="true" />
              {mode === 'today' ? 'Today' : mode === 'yesterday' ? 'Yesterday' : rangeLabel(range, fmtShortDate)}
              {isRefreshing
                ? <Loader2 size={12} aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }} />
                : <ChevronDown size={12} aria-hidden="true" />}
            </button>

            {pickerOpen && (
              <>
                <div
                  onClick={() => setPickerOpen(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 19 }}
                />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, minWidth: 260,
                  background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 14,
                  boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
                }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <button
                      onClick={() => selectQuick('today')}
                      style={{
                        flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                        background: mode === 'today' ? 'var(--info)' : 'var(--raised2)',
                        color: mode === 'today' ? '#fff' : 'var(--txt)',
                        border: '1px solid var(--line2)',
                      }}
                    >
                      Today
                    </button>
                    <button
                      onClick={() => selectQuick('yesterday')}
                      style={{
                        flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                        background: mode === 'yesterday' ? 'var(--info)' : 'var(--raised2)',
                        color: mode === 'yesterday' ? '#fff' : 'var(--txt)',
                        border: '1px solid var(--line2)',
                      }}
                    >
                      Yesterday
                    </button>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                    Custom range
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <input
                      type="date"
                      value={draftFrom}
                      max={todayISO}
                      onChange={(e) => setDraftFrom(e.target.value)}
                      style={{
                        flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 12, borderRadius: 6,
                        background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)',
                      }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--txt-dim)' }}>to</span>
                    <input
                      type="date"
                      value={draftTo}
                      max={todayISO}
                      onChange={(e) => setDraftTo(e.target.value)}
                      style={{
                        flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 12, borderRadius: 6,
                        background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)',
                      }}
                    />
                  </div>
                  {draftFrom > draftTo && (
                    <div style={{ fontSize: 11, color: 'var(--risk)', marginBottom: 10 }}>"From" must not be after "to".</div>
                  )}
                  <button
                    onClick={applyRange}
                    disabled={draftFrom > draftTo}
                    style={{
                      width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 600, borderRadius: 6,
                      background: 'var(--brand)', border: '1px solid var(--brand)', color: '#fff',
                      cursor: draftFrom > draftTo ? 'default' : 'pointer',
                      opacity: draftFrom > draftTo ? 0.6 : 1,
                    }}
                  >
                    Apply
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => navigate('/team/approvals')}
            style={{
              padding: '9px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8,
              background: 'var(--brand)', border: '1px solid var(--brand)', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Review approvals ({summary.pendingApprovalCount})
          </button>
        </div>
      </div>

      {/* KPI row — 4 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <TrendKpiCard
          label="Team Util"
          value={avgUtilLabel}
          delta={utilDelta}
          deltaSuffix=" pts"
          deltaGoodDirection="up"
          accent="var(--info)"
          sparkline={trend?.avgUtilization}
          sparklineColor="var(--info)"
        />
        <TrendKpiCard
          label="Submitted Today"
          value={submittedTodayLabel}
          delta={-summary.missingCount}
          deltaLabel={(n) => `${Math.abs(n)} missing`}
          deltaGoodDirection="up"
          accent="var(--ok)"
          sparkline={trend?.submittedCount}
          sparklineColor="var(--ok)"
        />
        <TrendKpiCard
          label="Pending Approval"
          value={summary.pendingApprovalCount}
          delta={pendingDelta}
          deltaGoodDirection="down"
          accent="var(--warn)"
          sparkline={trend?.pendingApprovalCount}
          sparklineColor="var(--warn)"
        />
        <TrendKpiCard
          label="Open Blockers"
          value={blockers ? blockers.length : summary.activeBlockersCount}
          delta={blockersDelta}
          deltaGoodDirection="down"
          accent="var(--risk)"
          sparkline={trend?.blockersCount}
          sparklineColor="var(--risk)"
          showDelta={false}
        />
      </div>

      {/* Two-column: today's team status + blockers today */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16 }}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
              {isToday ? "Today's team status" : `Team status — ${rangeLabel(range, fmtShortDate)}`}
            </div>
            <button
              onClick={() => navigate('/team/utilization')}
              style={{ fontSize: 11, color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Utilization →
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 1fr 110px', gap: 12, padding: '8px 16px', borderBottom: '1px solid var(--line)', fontSize: 10, color: 'var(--txt-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <span>Member</span>
            <span>Project</span>
            <span>Util</span>
            <span style={{ textAlign: 'right' }}>Status</span>
          </div>
          {sortedMembers.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>No team members assigned yet.</div>
          ) : (
            sortedMembers.map((m, i) => (
              <MemberRow
                key={m.id}
                member={m}
                isLast={i === sortedMembers.length - 1}
                expanded={expandedMemberId === m.id}
                onToggle={() => setExpandedMemberId(id => (id === m.id ? null : m.id))}
              />
            ))
          )}
        </Card>

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
                {isToday ? 'Blockers today' : `Blockers — ${rangeLabel(range, fmtShortDate)}`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginTop: 2 }}>
                Unacknowledged blockers for {rangeLabel(range, fmtLongDate)}
              </div>
            </div>
            <button
              onClick={() => navigate('/team/blockers')}
              style={{ fontSize: 11, color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              All →
            </button>
          </div>
          {blockersPending ? (
            <div style={{ padding: 16 }}><Skel h={60} /></div>
          ) : !blockers || blockers.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>
              {isToday ? 'No blockers reported today.' : `No blockers for ${rangeLabel(range, fmtShortDate)}.`}
            </div>
          ) : (
            blockers.map((b, i) => (
              <BlockerRow
                key={b.taskId}
                b={b}
                isLast={i === blockers.length - 1}
                flagged={flaggedBlockerIds.has(b.taskId)}
                expanded={expandedBlockerId === b.taskId}
                onToggle={() => setExpandedBlockerId(id => (id === b.taskId ? null : b.taskId))}
                acking={ackingId === b.taskId && acknowledge.isPending}
                onAcknowledge={() => { setAckingId(b.taskId); acknowledge.mutate(b.taskId, { onSettled: () => setAckingId(null) }); }}
              />
            ))
          )}
        </Card>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
