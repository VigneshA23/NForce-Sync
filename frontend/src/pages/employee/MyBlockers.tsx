import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, UserX, CheckCircle2, Search, ChevronDown, ChevronLeft, ChevronRight, RefreshCw,
  X, Folder, Clock, CalendarDays, Calendar,
} from 'lucide-react';
import { Card } from '../../components/KpiCard';
import { BlockerThreadView } from '../../components/BlockerThread';
import { useEmployeeBlockers, useEmployeeBlocker, type BlockedTask } from '../../api/employee';
import type { DateRange } from '../../api/teamLead';
import { todayISO as localTodayISO, toLocalISODate } from '../../lib/date';

// Mirrors pages/lead/Blockers.tsx's list + side-panel layout, trimmed to the fields
// BlockedTask carries (this is always "my own" blockers — no employeeName/avatar/replyCount).

// ── date helpers (page-local, same convention as lead/Blockers.tsx) ────────────────

function fmtShortDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

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

// ── single-select project filter dropdown ───────────────────────────────────────

function SingleSelectDropdown({ label, value, options, onChange }: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
          borderRadius: 8, fontSize: 12.5, fontWeight: 500, color: 'var(--txt)',
          background: 'var(--raised2)', border: '1px solid var(--line2)', cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {label}: {value ?? 'All'}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, minWidth: 180,
            background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 6,
            boxShadow: '0 12px 28px rgba(0,0,0,0.35)', maxHeight: 260, overflowY: 'auto',
          }}>
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 6,
                background: value == null ? 'var(--raised2)' : 'transparent', border: 'none',
                color: 'var(--txt)', fontSize: 12.5, cursor: 'pointer',
              }}
            >
              All
            </button>
            {options.map(opt => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 6,
                  background: value === opt ? 'var(--raised2)' : 'transparent', border: 'none',
                  color: 'var(--txt)', fontSize: 12.5, cursor: 'pointer',
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── KPI stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, caption, accent }: {
  icon: React.ReactNode; label: string; value: number; caption: string; accent: string;
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

// ── status badge ─────────────────────────────────────────────────────────────────
// Same tri-state field and color coding as the Team Lead's Blockers page (STATUS_META
// in pages/lead/Blockers.tsx) — this reads BlockedTask.status directly, the literal
// value the Team Lead's status dropdown writes, not a derived "has replied" label.

const STATUS_META: Record<BlockedTask['status'], { label: string; color: string }> = {
  NEEDS_RESPONSE: { label: 'Needs Response', color: 'var(--risk)' },
  ACKNOWLEDGED:   { label: 'Acknowledged',   color: 'var(--ok)' },
  RESOLVED:       { label: 'Resolved',       color: 'var(--info)' },
};

function StatusBadge({ status }: { status: BlockedTask['status'] }) {
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

function BlockerRow({ b, selected, onClick }: {
  b: BlockedTask;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid', gridTemplateColumns: '2.2fr 1fr 1.2fr 1fr', gap: 12,
        padding: '14px 20px', cursor: 'pointer', alignItems: 'center',
        borderBottom: '1px solid var(--line)',
        background: selected ? 'color-mix(in srgb, var(--risk) 8%, transparent)' : 'transparent',
        borderLeft: selected ? '3px solid var(--risk)' : '3px solid transparent',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 2 }}>
          <span style={{ color: 'var(--txt-dim)', fontWeight: 500 }}>Category: </span>
          {b.description ?? 'Blocked task'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--txt-mut)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--txt-dim)' }}>Reason: </span>
          {b.blockerReason ?? '—'}
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--txt-mut)' }}>{b.projectName}</div>
      <div style={{ fontSize: 12.5, color: 'var(--txt-mut)' }}>{fmtShortDate(b.entryDate)}</div>
      <div><StatusBadge status={b.status} /></div>
    </div>
  );
}

// ── detail / conversation side panel ──────────────────────────────────────────────

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

function DetailPanel({ b, onClose }: { b: BlockedTask; onClose: () => void }) {
  return (
    <Card style={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
          <StatusBadge status={b.status} />
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', display: 'flex', padding: 2 }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)', marginBottom: 6 }}>
          <span style={{ color: 'var(--txt-dim)', fontWeight: 600 }}>Category: </span>
          {b.description ?? 'Blocked task'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--txt-mut)', lineHeight: 1.5, marginBottom: 16 }}>
          <span style={{ color: 'var(--txt-dim)', fontWeight: 600 }}>Reason: </span>
          {b.blockerReason ?? 'No detail provided.'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <InfoField icon={<Folder size={14} aria-hidden="true" />} label="Project">
            {b.projectName}
          </InfoField>
          <InfoField icon={<CalendarDays size={14} aria-hidden="true" />} label="Reported in EOD">
            {fmtShortDate(b.entryDate)}
          </InfoField>
          {b.acknowledged && (
            <InfoField icon={<Clock size={14} aria-hidden="true" />} label="Replied By">
              {b.acknowledgedByName ?? 'Your Team Lead'}
            </InfoField>
          )}
        </div>
      </div>

      <div style={{ padding: '16px 20px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', marginBottom: 12, paddingBottom: 6, borderBottom: '2px solid var(--risk)', display: 'inline-block', flexShrink: 0 }}>
          Conversation
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <BlockerThreadView
            taskId={b.taskId}
            scope="employee"
            replyToLabel="Reply to your Team Lead"
            visibilityNote="Replies are visible to your Team Lead"
            isLocked={b.status === 'RESOLVED'}
          />
        </div>
      </div>
    </Card>
  );
}

// ── skeleton / error ──────────────────────────────────────────────────────────────

function Skel({ h = 14, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />;
}

const PAGE_SIZE = 10;

// ── main ───────────────────────────────────────────────────────────────────────────

export default function MyBlockers() {
  const [searchParams] = useSearchParams();
  const highlightParam = searchParams.get('highlight');
  const highlightId = highlightParam ? Number(highlightParam) : null;

  const todayISO = localTodayISO();
  const [dateMode, setDateMode] = useState<DateMode>('today');
  const [range, setRange] = useState<DateRange>({ from: todayISO, to: todayISO });

  const { data: blockers, isPending, isError, refetch } = useEmployeeBlockers(range);

  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const appliedHighlightRef = useRef<number | null>(null);

  useEffect(() => {
    if (highlightId != null) setSelectedTaskId(highlightId);
  }, [highlightId]);

  const projectOptions = useMemo(
    () => [...new Set((blockers ?? []).map(b => b.projectName).filter(Boolean))].sort(),
    [blockers],
  );

  const filtered = useMemo(() => {
    let list = blockers ?? [];
    if (projectFilter) list = list.filter(b => b.projectName === projectFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(b =>
        b.description.toLowerCase().includes(q)
        || (b.blockerReason ?? '').toLowerCase().includes(q)
        || b.projectName.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      const aT = new Date(a.entryDate).getTime();
      const bT = new Date(b.entryDate).getTime();
      return sortDir === 'desc' ? bT - aT : aT - bT;
    });
  }, [blockers, projectFilter, search, sortDir]);

  useEffect(() => { setPage(1); }, [search, projectFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const matchedBlocker = useMemo(
    () => (blockers ?? []).find(b => b.taskId === selectedTaskId) ?? null,
    [blockers, selectedTaskId],
  );
  // The selected blocker can fall outside the currently selected date range (e.g. arriving
  // via a notification's ?highlight= link) — fetch it directly rather than showing an empty panel.
  const needsFallback = selectedTaskId != null && blockers != null && matchedBlocker == null;
  const { data: fallbackBlocker } = useEmployeeBlocker(needsFallback ? selectedTaskId : undefined);
  const selectedBlocker = matchedBlocker ?? fallbackBlocker ?? null;

  // Once the highlighted blocker's data resolves, jump the date filter to the day it was
  // reported on — the notification link only carries the blocker id, not its date, so
  // without this the page silently stays on "today" even when the blocker is from another day.
  useEffect(() => {
    if (
      highlightId != null
      && appliedHighlightRef.current !== highlightId
      && selectedBlocker != null
      && selectedBlocker.taskId === highlightId
    ) {
      appliedHighlightRef.current = highlightId;
      setDateMode('range');
      setRange({ from: selectedBlocker.entryDate, to: selectedBlocker.entryDate });
    }
  }, [highlightId, selectedBlocker]);

  const total = blockers?.length ?? 0;
  const needsResponse = (blockers ?? []).filter(b => !b.acknowledged).length;
  const acknowledgedCount = (blockers ?? []).filter(b => b.acknowledged).length;

  if (isPending) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}><Skel h={24} w={160} /><div style={{ marginTop: 8 }}><Skel h={14} w={280} /></div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
          {[0, 1, 2].map(i => <Card key={i}><Skel h={60} /></Card>)}
        </div>
        <Card style={{ padding: 20 }}><Skel h={320} /></Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>My Blockers</h1>
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
              My Blockers
            </h1>
            <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
              Blockers you've reported and your Team Lead's replies.
            </p>
          </div>
          <DateFilterButton mode={dateMode} range={range} onChange={(m, r) => { setDateMode(m); setRange(r); }} />
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
          <StatCard icon={<AlertTriangle size={18} aria-hidden="true" />} label="Total Blockers" value={total} caption="In the selected range" accent="var(--warn)" />
          <StatCard icon={<UserX size={18} aria-hidden="true" />} label="Needs Response" value={needsResponse} caption="No reply from Team Lead" accent="var(--risk)" />
          <StatCard icon={<CheckCircle2 size={18} aria-hidden="true" />} label="Team Lead Replied" value={acknowledgedCount} caption="Awaiting your follow-up" accent="var(--info)" />
        </div>

        {/* Filter bar */}
        <Card style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
            <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-dim)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search blockers..."
              style={{
                width: '100%', padding: '7px 10px 7px 32px', fontSize: 12.5, borderRadius: 8,
                background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)',
              }}
            />
          </div>
          <SingleSelectDropdown label="Project" value={projectFilter} options={projectOptions} onChange={setProjectFilter} />
        </Card>

        {/* Table */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '2.2fr 1fr 1.2fr 1fr', gap: 12,
            padding: '10px 20px', borderBottom: '1px solid var(--line)', fontSize: 10, color: 'var(--txt-dim)',
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <span>Blocker</span>
            <span>Project</span>
            <button
              onClick={() => setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--risk)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: 0 }}
            >
              Reported On
            </button>
            <span>Status</span>
          </div>

          {pageItems.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>
              No blockers match these filters.
            </div>
          ) : (
            pageItems.map(b => (
              <BlockerRow
                key={b.taskId} b={b} selected={b.taskId === selectedTaskId}
                onClick={() => setSelectedTaskId(id => (id === b.taskId ? null : b.taskId))}
              />
            ))
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--line)' }}>
            <span style={{ fontSize: 12, color: 'var(--txt-dim)' }}>
              {filtered.length === 0
                ? 'Showing 0 of 0 results'
                : `Showing ${(page - 1) * PAGE_SIZE + 1} to ${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} results`}
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
                borderRadius: 6, background: 'var(--risk)', color: '#fff', fontSize: 12, fontWeight: 700,
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
