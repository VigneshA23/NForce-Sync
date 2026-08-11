import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Clock, Search, ChevronDown, RefreshCw,
  X, Folder, Users, UserX, CheckCircle2, ListChecks, CalendarDays, Info,
  ChevronLeft, ChevronRight, Calendar, Download,
} from 'lucide-react';
import { Card } from '../../components/KpiCard';
import { Avatar, avatarColor } from '../../components/BlockerThread';
import { FilterDropdown, SortDropdown, toggleFilterVal } from '../../components/FilterDropdown';
import { usePmBlockers, usePmBlockersFilters, type PmBlockerDto } from '../../api/pmBlockers';
import type { DateRange } from '../../api/teamLead';
import { todayISO as localTodayISO, toLocalISODate } from '../../lib/date';
import { readStoredDateFilter, resolveBlockersDateFilter, writeStoredDateFilter } from '../../lib/pmBlockersDateFilter';

// ── date helpers (mirrors pages/lead/Blockers.tsx's page-local formatting) ─────────

function fmtShortDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTimeParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
  };
}

function fmtRelativeDays(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d < 1) return 'today';
  if (d === 1) return '1d ago';
  return `${d}d ago`;
}

/** Row/panel "Duration" — hours since reported until resolved (or until now if still open). */
function blockerDurationHours(b: PmBlockerDto): number {
  if (b.status === 'RESOLVED' && b.resolvedAt && b.submittedAt) {
    return Math.max(0, Math.round((new Date(b.resolvedAt).getTime() - new Date(b.submittedAt).getTime()) / 3_600_000));
  }
  return b.openHours;
}

function fmtDuration(hours: number): string {
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h`;
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

// ── date filter (page-local, same picker UI as the Team Lead Blockers page) ────────

type DateMode = 'today' | 'yesterday' | 'range';

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalISODate(d);
}

function DateFilterButton({ mode, range, onChange }: {
  mode: DateMode;
  range: DateRange;
  onChange: (mode: DateMode, range: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const todayISO = localTodayISO();
  const [draftFrom, setDraftFrom] = useState(range.from);
  const [draftTo, setDraftTo] = useState(range.to);

  const label = mode === 'today' ? `Today, ${fmtShortDate(todayISO)}`
    : mode === 'yesterday' ? `Yesterday, ${fmtShortDate(range.from)}`
    : range.from === range.to ? fmtShortDate(range.from) : `${fmtShortDate(range.from)} – ${fmtShortDate(range.to)}`;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => { setDraftFrom(range.from); setDraftTo(range.to); setOpen(o => !o); }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px',
          fontSize: 12.5, fontWeight: 600, color: 'var(--txt)', background: 'var(--raised)',
          border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        <Calendar size={13} aria-hidden="true" />
        {label}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, minWidth: 260,
            background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 14,
            boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
          }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button
                onClick={() => { onChange('today', { from: todayISO, to: todayISO }); setOpen(false); }}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                  background: mode === 'today' ? 'var(--info)' : 'var(--raised2)',
                  color: mode === 'today' ? '#fff' : 'var(--txt)', border: '1px solid var(--line2)',
                }}
              >
                Today
              </button>
              <button
                onClick={() => { const y = yesterdayISO(); onChange('yesterday', { from: y, to: y }); setOpen(false); }}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                  background: mode === 'yesterday' ? 'var(--info)' : 'var(--raised2)',
                  color: mode === 'yesterday' ? '#fff' : 'var(--txt)', border: '1px solid var(--line2)',
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
                type="date" value={draftFrom} max={todayISO}
                onChange={(e) => setDraftFrom(e.target.value)}
                style={{ flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 12, borderRadius: 6, background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)' }}
              />
              <span style={{ fontSize: 11, color: 'var(--txt-dim)' }}>to</span>
              <input
                type="date" value={draftTo} max={todayISO}
                onChange={(e) => setDraftTo(e.target.value)}
                style={{ flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 12, borderRadius: 6, background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)' }}
              />
            </div>
            <button
              onClick={() => { if (draftFrom > draftTo) return; onChange('range', { from: draftFrom, to: draftTo }); setOpen(false); }}
              disabled={draftFrom > draftTo}
              style={{
                width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 600, borderRadius: 6,
                background: 'var(--brand)', border: '1px solid var(--brand)', color: '#fff',
                cursor: draftFrom > draftTo ? 'default' : 'pointer', opacity: draftFrom > draftTo ? 0.6 : 1,
              }}
            >
              Apply
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── KPI stat card (same shape as the Team Lead Blockers page's StatCard) ───────────

function StatCard({ icon, label, value, caption, accent }: {
  icon: React.ReactNode; label: string; value: string; caption: string; accent: string;
}) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8, flexShrink: 0,
          background: `color-mix(in srgb, ${accent} 18%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--txt-mut)', fontWeight: 600, marginBottom: 2 }}>{label}</div>
          <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 26, fontWeight: 700, color: 'var(--txt)', lineHeight: 1, marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>
            {value}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--txt-dim)' }}>{caption}</div>
        </div>
      </div>
    </Card>
  );
}

// ── status badge (same color coding as the Team Lead Blockers page) ────────────────

const STATUS_META: Record<PmBlockerDto['status'], { label: string; color: string }> = {
  NEEDS_RESPONSE: { label: 'Needs Response', color: 'var(--risk)' },
  ACKNOWLEDGED:   { label: 'Acknowledged',   color: 'var(--ok)' },
  RESOLVED:       { label: 'Resolved',       color: 'var(--info)' },
};

function StatusBadge({ status }: { status: PmBlockerDto['status'] }) {
  const { label, color } = STATUS_META[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, color,
      background: `color-mix(in srgb, ${color} 16%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

// ── main table row ────────────────────────────────────────────────────────────────

function BlockerRow({ b, index, selected, onClick }: {
  b: PmBlockerDto;
  index: number;
  selected: boolean;
  onClick: () => void;
}) {
  const { date: reportedDate, time: reportedTime } = fmtDateTimeParts(b.submittedAt ?? `${b.entryDate}T09:00:00`);
  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid', gridTemplateColumns: '32px 2fr 1.1fr 1.1fr 1fr 0.8fr 0.9fr', gap: 12,
        padding: '14px 20px', cursor: 'pointer', alignItems: 'center',
        borderBottom: '1px solid var(--line)',
        background: selected ? 'color-mix(in srgb, var(--info) 8%, transparent)' : 'transparent',
        borderLeft: selected ? '3px solid var(--info)' : '3px solid transparent',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--txt-dim)', fontWeight: 600 }}>{index}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 2 }}>
          {b.description ?? 'Blocked task'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--txt-mut)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {b.blockerReason ?? '—'}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--txt)', marginBottom: 1 }}>{b.teamName}</div>
        <div style={{ fontSize: 11.5, color: 'var(--txt-mut)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {b.projectName ?? b.projectCode ?? '—'}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Avatar name={b.employeeName} bg={avatarColor(b.employeeName)} size={26} />
        <span style={{ fontSize: 12.5, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {b.employeeName}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace' }}>
        {reportedDate}<br />{reportedTime}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--txt-mut)' }}>{fmtDuration(blockerDurationHours(b))}</div>
      <div><StatusBadge status={b.status} /></div>
    </div>
  );
}

// ── detail panel ──────────────────────────────────────────────────────────────────

function InfoField({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ color: 'var(--txt-dim)', marginTop: 2 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 12.5, color: 'var(--txt)', fontWeight: 600 }}>{children}</div>
      </div>
    </div>
  );
}

function DetailPanel({ b, onClose }: { b: PmBlockerDto; onClose: () => void }) {
  const { date: reportedDate, time: reportedTime } = fmtDateTimeParts(b.submittedAt ?? `${b.entryDate}T09:00:00`);

  return (
    <Card style={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar name={b.employeeName} bg={avatarColor(b.employeeName)} size={38} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>{b.description ?? 'Blocked task'}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--txt-mut)' }}>{b.employeeName} · {b.employeeCode}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusBadge status={b.status} />
            <button
              onClick={onClose}
              aria-label="Close"
              style={{ background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', display: 'flex', padding: 2 }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <InfoField icon={<Users size={14} aria-hidden="true" />} label="Team">
            {b.teamName}
          </InfoField>
          <InfoField icon={<Folder size={14} aria-hidden="true" />} label="Project">
            {b.projectName ?? b.projectCode ?? '—'}
          </InfoField>
          <InfoField icon={<Clock size={14} aria-hidden="true" />} label="Reported On">
            {reportedDate}, {reportedTime}
            {b.submittedAt && <span style={{ color: 'var(--txt-dim)', fontWeight: 400 }}> ({fmtRelativeDays(b.submittedAt)})</span>}
          </InfoField>
          <InfoField icon={<ListChecks size={14} aria-hidden="true" />} label="Duration">
            {fmtDuration(blockerDurationHours(b))} {b.status !== 'RESOLVED' && <span style={{ color: 'var(--txt-dim)', fontWeight: 400 }}>(open)</span>}
          </InfoField>
          <InfoField icon={<CalendarDays size={14} aria-hidden="true" />} label="Reported By">
            {b.employeeName}
          </InfoField>
          <InfoField icon={<AlertTriangle size={14} aria-hidden="true" />} label="Status">
            {STATUS_META[b.status].label}
          </InfoField>
        </div>
      </div>

      <div style={{ padding: '16px 20px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
          Description
        </div>
        <div style={{ fontSize: 13, color: 'var(--txt)', lineHeight: 1.5, marginBottom: 16 }}>
          {b.description ?? 'No description provided.'}
        </div>

        <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
          Blocker Reason
        </div>
        <div style={{ fontSize: 13, color: 'var(--txt)', lineHeight: 1.5, marginBottom: 20 }}>
          {b.blockerReason ?? 'No detail provided.'}
        </div>

        <div style={{
          display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 8,
          background: 'color-mix(in srgb, var(--info) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--info) 28%, transparent)',
        }}>
          <Info size={16} aria-hidden="true" style={{ color: 'var(--info)', flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: 'var(--txt-mut)', lineHeight: 1.5 }}>
            Project Managers can view all blockers across teams. For updates, please contact the respective Team Leads.
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── skeleton / error ──────────────────────────────────────────────────────────────

function Skel({ h = 14, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />;
}

const PAGE_SIZE = 8;

type SortOption = 'newest' | 'oldest' | 'employee';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'employee', label: 'Employee A–Z' },
];

// ── main ───────────────────────────────────────────────────────────────────────────

export default function PmBlockers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { mode: dateMode, range } = resolveBlockersDateFilter(searchParams);

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

  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [projectFilter, setProjectFilter] = useState<Set<string>>(new Set());
  const [teamFilter, setTeamFilter] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [page, setPage] = useState(1);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  const { data: filters } = usePmBlockersFilters();
  const projectByName = useMemo(() => new Map((filters?.projects ?? []).map(p => [p.name, p.id])), [filters]);
  const teamByName = useMemo(() => new Map((filters?.teams ?? []).map(t => [t.managerName, t.managerId])), [filters]);

  const { data: blockers, isPending, isError, refetch } = usePmBlockers({
    ...range,
    projectId: projectFilter.size === 1 ? projectByName.get([...projectFilter][0]) : undefined,
    teamManagerId: teamFilter.size === 1 ? teamByName.get([...teamFilter][0]) : undefined,
    status: statusFilter.size === 1 ? [...statusFilter][0] : undefined,
  });

  const filtered = useMemo(() => {
    let list = blockers ?? [];
    // Backend narrows by projectId/teamManagerId/status only when exactly one is selected —
    // when multiple are checked, OR them together client-side same as the Team Lead page does.
    if (projectFilter.size > 1) list = list.filter(b => projectFilter.has(b.projectName ?? b.projectCode ?? ''));
    if (teamFilter.size > 1) list = list.filter(b => teamFilter.has(b.teamName));
    if (statusFilter.size > 1) list = list.filter(b => statusFilter.has(b.status));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(b =>
        (b.description ?? '').toLowerCase().includes(q)
        || (b.blockerReason ?? '').toLowerCase().includes(q)
        || b.employeeName.toLowerCase().includes(q)
        || (b.projectName ?? '').toLowerCase().includes(q)
        || b.teamName.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'employee') return a.employeeName.localeCompare(b.employeeName);
      const diff = new Date(b.submittedAt ?? 0).getTime() - new Date(a.submittedAt ?? 0).getTime();
      return sortBy === 'oldest' ? -diff : diff;
    });
  }, [blockers, projectFilter, teamFilter, statusFilter, search, sortBy]);

  useEffect(() => { setPage(1); }, [search, projectFilter, teamFilter, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selectedBlocker = useMemo(
    () => (blockers ?? []).find(b => b.taskId === selectedTaskId) ?? null,
    [blockers, selectedTaskId],
  );

  // KPI tiles reflect the currently filtered set (date range + search/project/team/status),
  // not the raw range-fetched list — so the counts always match what's visible in the table.
  const total = filtered.length;
  const openBlockers = filtered.filter(b => b.status !== 'RESOLVED');
  const avgOpenHours = openBlockers.length
    ? Math.round(openBlockers.reduce((sum, b) => sum + b.openHours, 0) / openBlockers.length)
    : 0;
  const needsResponseCount = filtered.filter(b => b.status === 'NEEDS_RESPONSE').length;
  const acknowledgedCount = filtered.filter(b => b.status === 'ACKNOWLEDGED').length;
  const resolvedCount = filtered.filter(b => b.status === 'RESOLVED').length;

  const hasFilters = !!search.trim() || projectFilter.size > 0 || teamFilter.size > 0 || statusFilter.size > 0;
  const clearFilters = () => {
    setSearch('');
    setProjectFilter(new Set());
    setTeamFilter(new Set());
    setStatusFilter(new Set());
  };

  if (isPending) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}><Skel h={24} w={160} /><div style={{ marginTop: 8 }}><Skel h={14} w={280} /></div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[0, 1, 2, 3, 4].map(i => <Card key={i}><Skel h={60} /></Card>)}
        </div>
        <Card style={{ padding: 20 }}><Skel h={320} /></Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>All Blockers</h1>
        </div>
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load blockers.</div>
          <button
            onClick={() => refetch()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}
          >
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selectedBlocker ? '1.7fr 1fr' : '1fr', gap: 16, alignItems: 'start' }}>
      <div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
              All Blockers
            </h1>
            <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
              Monitor and track blockers across all teams and projects.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DateFilterButton
              mode={dateMode}
              range={range}
              onChange={(m, r) => {
                const next = new URLSearchParams(searchParams);
                next.set('mode', m);
                if (m === 'range') {
                  next.set('from', r.from);
                  next.set('to', r.to);
                } else {
                  next.delete('from');
                  next.delete('to');
                }
                setSearchParams(next, { replace: true });
                writeStoredDateFilter(m === 'range' ? { mode: m, from: r.from, to: r.to } : { mode: m });
              }}
            />
            {/* TODO(backend): no export endpoint exists yet — disabled until one does, same as
                the Team Lead Blockers page's Export Report control. */}
            <button
              disabled
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', fontSize: 12.5, fontWeight: 600,
                borderRadius: 8, background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt-dim)',
                cursor: 'not-allowed', whiteSpace: 'nowrap',
              }}
            >
              <Download size={14} aria-hidden="true" /> Export
            </button>
          </div>
        </div>

        {/* KPI row — 5 tiles; auto-fit wraps to fewer columns on narrower widths without
            leaving uneven gaps (unlike a fixed 5-column grid, which would strand a lone
            tile on its own row at in-between widths). */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
          <StatCard icon={<AlertTriangle size={18} aria-hidden="true" />} label="Total Blockers" value={String(total)} caption="Across all teams" accent="var(--warn)" />
          <StatCard icon={<Clock size={18} aria-hidden="true" />} label="Avg. Open Duration" value={fmtDuration(avgOpenHours)} caption="Across all open blockers" accent="var(--info)" />
          <StatCard icon={<UserX size={18} aria-hidden="true" />} label="Needs Response" value={String(needsResponseCount)} caption="Requires follow-up" accent={STATUS_META.NEEDS_RESPONSE.color} />
          <StatCard icon={<Users size={18} aria-hidden="true" />} label="Acknowledged" value={String(acknowledgedCount)} caption="Being worked on" accent={STATUS_META.ACKNOWLEDGED.color} />
          <StatCard icon={<CheckCircle2 size={18} aria-hidden="true" />} label="Resolved" value={String(resolvedCount)} caption="Closed out" accent={STATUS_META.RESOLVED.color} />
        </div>

        {/* Filter bar */}
        <Card style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
            <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-dim)' }} />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search blockers/employees..."
              style={{
                width: '100%', padding: '7px 28px 7px 32px', fontSize: 12.5, borderRadius: 8,
                background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)',
              }}
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => { setSearch(''); searchInputRef.current?.focus(); }}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer',
                  display: 'flex', padding: 2,
                }}
              >
                <X size={13} aria-hidden="true" />
              </button>
            )}
          </div>
          <FilterDropdown
            label="Projects" options={(filters?.projects ?? []).map(p => p.name)} selected={projectFilter}
            onToggle={v => toggleFilterVal(projectFilter, setProjectFilter, v)}
            onClear={() => setProjectFilter(new Set())}
          />
          <FilterDropdown
            label="Team Leads" options={(filters?.teams ?? []).map(t => t.managerName)} selected={teamFilter}
            onToggle={v => toggleFilterVal(teamFilter, setTeamFilter, v)}
            onClear={() => setTeamFilter(new Set())}
          />
          <FilterDropdown
            label="Status" options={['NEEDS_RESPONSE', 'ACKNOWLEDGED', 'RESOLVED']} selected={statusFilter}
            onToggle={v => toggleFilterVal(statusFilter, setStatusFilter, v)}
            onClear={() => setStatusFilter(new Set())}
            getLabel={(v) => STATUS_META[v as PmBlockerDto['status']].label}
          />
          <SortDropdown label="Sort" options={SORT_OPTIONS} value={sortBy} onChange={setSortBy} defaultValue="newest" />
          {hasFilters && (
            <button
              onClick={clearFilters}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8,
                fontSize: 12.5, fontWeight: 600, background: 'none', border: '1px solid var(--line2)',
                color: 'var(--txt-mut)', cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </Card>

        {/* Table */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '32px 2fr 1.1fr 1.1fr 1fr 0.8fr 0.9fr', gap: 12,
            padding: '10px 20px', borderBottom: '1px solid var(--line)', fontSize: 10, color: 'var(--txt-dim)',
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <span>S.No</span>
            <span>Blocker</span>
            <span>Team Lead / Project</span>
            <span>Reported By</span>
            <span>Reported On</span>
            <span>Duration</span>
            <span>Status</span>
          </div>

          {pageItems.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>
              No blockers match these filters.
            </div>
          ) : (
            pageItems.map((b, i) => (
              <BlockerRow
                key={b.taskId} b={b} index={(page - 1) * PAGE_SIZE + i + 1} selected={b.taskId === selectedTaskId}
                onClick={() => setSelectedTaskId(id => (id === b.taskId ? null : b.taskId))}
              />
            ))
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--line)' }}>
            <span style={{ fontSize: 12, color: 'var(--txt-dim)' }}>
              {filtered.length === 0
                ? 'Showing 0 of 0 blockers'
                : `Showing ${(page - 1) * PAGE_SIZE + 1} to ${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} blockers`}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{ display: 'flex', padding: 5, borderRadius: 6, background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)', cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}
              >
                <ChevronLeft size={14} aria-hidden="true" />
              </button>
              <span style={{
                minWidth: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, background: 'var(--info)', color: '#fff', fontSize: 12, fontWeight: 700,
              }}>
                {page}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{ display: 'flex', padding: 5, borderRadius: 6, background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)', cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? 0.5 : 1 }}
              >
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </Card>
      </div>

      {selectedBlocker && (
        <div style={{ position: 'sticky', top: 0 }}>
          <DetailPanel b={selectedBlocker} onClose={() => setSelectedTaskId(null)} />
        </div>
      )}
    </div>
  );
}
