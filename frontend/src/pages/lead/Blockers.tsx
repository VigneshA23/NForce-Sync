import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, UserX, Users, CheckCircle2, Search, ChevronDown, RefreshCw, List as ListIcon, LayoutGrid,
  MessageCircle, X, Folder, Clock, CalendarDays,
  ChevronLeft, ChevronRight, Calendar, Check,
} from 'lucide-react';
import { Card } from '../../components/KpiCard';
import { Avatar, avatarColor, TL_AVATAR_BG, BlockerThreadView } from '../../components/BlockerThread';
import { FilterDropdown, toggleFilterVal } from '../../components/FilterDropdown';
import { ConfirmModal } from '../../components/ConfirmModal';
import {
  useTeamLeadBlockers, useTeamLeadBlocker, useSetBlockerStatus, type TeamBlockerDto, type DateRange,
} from '../../api/teamLead';
import { todayISO as localTodayISO, toLocalISODate } from '../../lib/date';
import { readStoredDateFilter, resolveBlockersDateFilter, writeStoredDateFilter } from '../../lib/blockersDateFilter';

// ── Table layout ───────────────────────────────────────────────────────────────
// Header row and body rows must share one template or the columns desync.
const BLOCKER_TABLE_COLUMNS = '32px 2.2fr 1fr 1.1fr 1fr 0.7fr 1.3fr 1fr';
// Under the 1074px desktop content width, so this never scrolls on desktop.
const BLOCKER_TABLE_MIN_WIDTH = 1040;

// ── date helpers (page-local — reference shows "31 Jul 2026, 10:24 AM" / "4d ago" /
// "Yesterday" formats distinct from the app's DD-MM-YYYY convention used elsewhere) ──

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

/** Table "Last Reply" cell: recent -> relative hours, yesterday -> "Yesterday", else absolute date. */
function fmtLastReply(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  if (d === 1) return 'Yesterday';
  return fmtShortDate(toLocalISODate(new Date(iso)));
}

// ── date filter (page-local — mirrors Team Dashboard's Today/Yesterday/range picker,
// kept independent rather than sharing its sessionStorage key so picking a date here
// doesn't silently change what the dashboard shows) ─────────────────────────────────

type DateMode = 'today' | 'yesterday' | 'range';

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalISODate(d);
}

// Mode-aware wording for the "Total Blockers" tile — independent implementation of the same
// pattern used by PM Blockers' getBlockerRangeSubtitle, kept page-local per no-shared-component
// scoping (this page has no equivalent "Average Open Duration" tile to share it with anyway).
function totalBlockersCaption(mode: DateMode, from: string, to: string): string {
  if (mode === 'today') return 'Across blockers today';
  if (mode === 'yesterday') return `Across blockers yesterday, ${fmtShortDate(from)}`;
  return from === to
    ? `Across blockers on ${fmtShortDate(from)}`
    : `Across blockers from ${fmtShortDate(from)} to ${fmtShortDate(to)}`;
}

function DateFilterButton({ mode, range, onChange, loading }: {
  mode: DateMode;
  range: DateRange;
  onChange: (mode: DateMode, range: DateRange) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const todayISO = localTodayISO();
  const [draftFrom, setDraftFrom] = useState(range.from);
  const [draftTo, setDraftTo] = useState(range.to);

  // Native <input type="date"> min/max constraints trigger the browser's own validation
  // bubble (e.g. "Value must be 26-08-2026 or earlier") on top of our inline error message —
  // so min/max is intentionally omitted from the inputs below and enforced here in JS instead,
  // keeping the inline message as the single source of validation feedback.
  const orderInvalid = draftFrom !== '' && draftTo !== '' && draftFrom > draftTo;
  const futureInvalid = (draftFrom !== '' && draftFrom > todayISO) || (draftTo !== '' && draftTo > todayISO);
  const rangeInvalid = orderInvalid || futureInvalid;

  const label = mode === 'today' ? `Today, ${fmtShortDate(todayISO)}`
    : mode === 'yesterday' ? `Yesterday, ${fmtShortDate(range.from)}`
    : range.from === range.to ? fmtShortDate(range.from) : `${fmtShortDate(range.from)} – ${fmtShortDate(range.to)}`;

  return (
    <div style={{ position: 'relative' }}>
      <button
        // Disabled while the previous selection's data is still loading — closing the trigger
        // is what stops a user from firing a second, overlapping request before the first
        // settles (there's nowhere else to reopen the picker from).
        disabled={loading}
        onClick={() => { setDraftFrom(range.from); setDraftTo(range.to); setOpen(o => !o); }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px',
          fontSize: 12.5, fontWeight: 600, color: 'var(--txt)', background: 'var(--raised)',
          border: '1px solid var(--line)', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap', opacity: loading ? 0.7 : 1,
        }}
      >
        {loading
          ? <RefreshCw size={13} aria-hidden="true" className="nf-r-spin" />
          : <Calendar size={13} aria-hidden="true" />}
        {label}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && !loading && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div className="nf-r-popover" style={{
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
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginBottom: 6, textAlign: 'center' }}>From</div>
                <div style={{ position: 'relative' }}>
                  <input
                    type="date" value={draftFrom}
                    onChange={(e) => setDraftFrom(e.target.value)}
                    onInvalid={(e) => e.preventDefault()}
                    style={{
                      width: '100%', minWidth: 0, padding: '6px 8px', fontSize: 12, borderRadius: 6,
                      background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)',
                      boxSizing: 'border-box', paddingRight: draftFrom ? 40 : 8,
                    }}
                  />
                  {draftFrom && (
                    <button
                      type="button"
                      aria-label="Clear from date"
                      onClick={() => setDraftFrom('')}
                      style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer',
                        display: 'flex', padding: 4, borderRadius: 4,
                      }}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginBottom: 6, textAlign: 'center' }}>To</div>
                <div style={{ position: 'relative' }}>
                  <input
                    type="date" value={draftTo}
                    onChange={(e) => setDraftTo(e.target.value)}
                    onInvalid={(e) => e.preventDefault()}
                    style={{
                      width: '100%', minWidth: 0, padding: '6px 8px', fontSize: 12, borderRadius: 6,
                      background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)',
                      boxSizing: 'border-box', paddingRight: draftTo ? 40 : 8,
                    }}
                  />
                  {draftTo && (
                    <button
                      type="button"
                      aria-label="Clear to date"
                      onClick={() => setDraftTo('')}
                      style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer',
                        display: 'flex', padding: 4, borderRadius: 4,
                      }}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            {orderInvalid && (
              <div style={{ fontSize: 11, color: 'var(--risk)', fontWeight: 600, marginBottom: 10 }} role="alert">
                From date cannot be later than To date.
              </div>
            )}
            {!orderInvalid && futureInvalid && (
              <div style={{ fontSize: 11, color: 'var(--risk)', fontWeight: 600, marginBottom: 10 }} role="alert">
                Date cannot be later than today.
              </div>
            )}
            <button
              onClick={() => {
                if (rangeInvalid) return;
                // Either side can be cleared independently (see From/To "X" buttons above) —
                // an empty side falls back to the other so a single-ended selection still
                // resolves to a real range; clearing both reverts to the Today default.
                if (draftFrom === '' && draftTo === '') { onChange('today', { from: todayISO, to: todayISO }); setOpen(false); return; }
                const from = draftFrom || draftTo;
                const to = draftTo || draftFrom;
                onChange('range', { from, to });
                setOpen(false);
              }}
              disabled={rangeInvalid}
              style={{
                width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 600, borderRadius: 6,
                background: 'var(--brand)', border: '1px solid var(--brand)', color: '#fff',
                cursor: rangeInvalid ? 'not-allowed' : 'pointer', opacity: rangeInvalid ? 0.6 : 1,
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

// ── KPI stat card (colored icon box, per reference — distinct from the neutral-box KpiCard) ──

function StatCard({ icon, label, value, caption, accent, loading }: {
  icon: React.ReactNode; label: string; value: number; caption: string; accent: string; loading?: boolean;
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
          {loading ? (
            <>
              <div style={{ marginBottom: 6 }}><Skel h={26} w={48} /></div>
              <Skel h={11} w={110} />
            </>
          ) : (
            <>
              <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 26, fontWeight: 700, color: 'var(--txt)', lineHeight: 1, marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>
                {value}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--txt-dim)' }}>{caption}</div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── status badge ─────────────────────────────────────────────────────────────────

const STATUS_META: Record<TeamBlockerDto['status'], { label: string; color: string }> = {
  NEEDS_RESPONSE: { label: 'Needs Response', color: 'var(--risk)' },
  ACKNOWLEDGED:   { label: 'Acknowledged',   color: 'var(--ok)' },
  RESOLVED:       { label: 'Resolved',       color: 'var(--info)' },
};

function StatusBadge({ status }: { status: TeamBlockerDto['status'] }) {
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

// Interactive counterpart used only in the DetailPanel — same color coding as StatusBadge,
// but a custom open/close panel (matching FilterDropdown's pattern) so the selected option
// can be reliably highlighted, which a native <select>'s option list can't do cross-browser.
function StatusDropdown({ status, onChange, disabled }: {
  status: TeamBlockerDto['status'];
  onChange: (status: TeamBlockerDto['status']) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { label, color } = STATUS_META[status];
  const options: TeamBlockerDto['status'][] = ['NEEDS_RESPONSE', 'ACKNOWLEDGED', 'RESOLVED'];
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        aria-label="Blocker status"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 12px 5px 10px', borderRadius: 20,
          fontSize: 12, fontWeight: 700, letterSpacing: '0.01em', color,
          background: `color-mix(in srgb, ${color} 16%, transparent)`,
          border: `1px solid color-mix(in srgb, ${color} 34%, transparent)`,
          whiteSpace: 'nowrap', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.7 : 1,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
        {label}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div className="nf-r-popover" style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, minWidth: 170,
            background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 6,
            boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
          }}>
            {options.map(opt => {
              const meta = STATUS_META[opt];
              const isSelected = opt === status;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => { onChange(opt); setOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                    padding: '7px 8px', borderRadius: 6, border: 'none',
                    background: isSelected ? `color-mix(in srgb, ${meta.color} 14%, transparent)` : 'transparent',
                    color: isSelected ? meta.color : 'var(--txt)',
                    fontSize: 12.5, fontWeight: isSelected ? 700 : 500, cursor: 'pointer',
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{meta.label}</span>
                  {isSelected && <Check size={13} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── main table row ────────────────────────────────────────────────────────────────

function BlockerRow({ b, index, selected, onClick }: {
  b: TeamBlockerDto;
  index: number;
  selected: boolean;
  onClick: () => void;
}) {
  const { date: reportedDate, time: reportedTime } = fmtDateTimeParts(b.submittedAt ?? `${b.entryDate}T09:00:00`);
  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid', gridTemplateColumns: BLOCKER_TABLE_COLUMNS, gap: 12,
        padding: '14px 20px', cursor: 'pointer', alignItems: 'center',
        borderBottom: '1px solid var(--line)',
        background: selected ? 'color-mix(in srgb, var(--risk) 8%, transparent)' : 'transparent',
        borderLeft: selected ? '3px solid var(--risk)' : '3px solid transparent',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--txt-dim)', fontWeight: 600 }}>{index}</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
        <Avatar name={b.employeeName} bg={avatarColor(b.employeeName)} size={30} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 2 }}>
            <span style={{ color: 'var(--txt-dim)', fontWeight: 500 }}>Category: </span>
            {b.categoryName ?? 'Blocked task'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--txt-mut)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
            <span style={{ color: 'var(--txt-dim)' }}>Description: </span>
            {b.description || '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--txt-mut)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--txt-dim)' }}>Reason: </span>
            {b.blockerReason ?? '—'}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--txt-mut)' }}>{b.projectName ?? b.projectCode ?? '—'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Avatar name={b.employeeName} bg={avatarColor(b.employeeName)} size={26} />
        <span style={{ fontSize: 12.5, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {b.employeeName}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace' }}>
        {reportedDate}<br />{reportedTime}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--txt-mut)' }}>
        <MessageCircle size={13} aria-hidden="true" /> {b.replyCount}
      </div>
      <div>
        {b.lastReplyAt && b.lastReplySenderName ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar
              name={b.lastReplySenderName}
              bg={b.lastReplySenderRole === 'EMPLOYEE' ? avatarColor(b.lastReplySenderName) : TL_AVATAR_BG}
              size={24}
            />
            <div>
              <div style={{ fontSize: 12.5, color: 'var(--txt)', fontWeight: 500 }}>{b.lastReplySenderName}</div>
              <div style={{ fontSize: 11, color: 'var(--txt-dim)' }}>{fmtLastReply(b.lastReplyAt)}</div>
            </div>
          </div>
        ) : (
          <span style={{ color: 'var(--txt-dim)', fontSize: 13 }}>—</span>
        )}
      </div>
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

function DetailPanel({ b, range, onClose }: { b: TeamBlockerDto; range: DateRange; onClose: () => void }) {
  const { date: reportedDate, time: reportedTime } = fmtDateTimeParts(b.submittedAt ?? `${b.entryDate}T09:00:00`);
  const setStatus = useSetBlockerStatus(range);
  const [confirmResolve, setConfirmResolve] = useState(false);

  return (
    <Card style={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar name={b.employeeName} bg={avatarColor(b.employeeName)} size={38} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>{b.employeeName}</div>
                <span style={{ fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>
                  {b.employeeCode}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--txt-mut)' }}>{b.projectName ?? b.projectCode ?? '—'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {b.status === 'RESOLVED' ? (
              <StatusBadge status={b.status} />
            ) : (
              <StatusDropdown
                status={b.status}
                disabled={setStatus.isPending}
                onChange={(status) => {
                  if (status === 'RESOLVED') setConfirmResolve(true);
                  else setStatus.mutate({ taskId: b.taskId, status });
                }}
              />
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              style={{ background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', display: 'flex', padding: 2 }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)', marginBottom: 6 }}>
          <span style={{ color: 'var(--txt-dim)', fontWeight: 600 }}>Category: </span>
          {b.categoryName ?? 'Blocked task'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--txt-mut)', lineHeight: 1.5, marginBottom: 10 }}>
          <span style={{ color: 'var(--txt-dim)', fontWeight: 600 }}>Description: </span>
          {b.description || 'No description provided.'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--txt-mut)', lineHeight: 1.5, marginBottom: 16 }}>
          <span style={{ color: 'var(--txt-dim)', fontWeight: 600 }}>Reason: </span>
          {b.blockerReason ?? 'No detail provided.'}
        </div>

        <div className="nf-r-stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <InfoField icon={<Folder size={14} aria-hidden="true" />} label="Project">
            {b.projectName ?? b.projectCode ?? '—'}
          </InfoField>
          <InfoField icon={<Clock size={14} aria-hidden="true" />} label="Reported On">
            {reportedDate}, {reportedTime}
            {b.submittedAt && <span style={{ color: 'var(--txt-dim)', fontWeight: 400 }}> ({fmtRelativeDays(b.submittedAt)})</span>}
          </InfoField>
          <InfoField icon={<CalendarDays size={14} aria-hidden="true" />} label="Reported in EOD">
            {fmtShortDate(b.entryDate)}
          </InfoField>
        </div>
      </div>

      <div style={{ padding: '16px 20px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', marginBottom: 12, paddingBottom: 6, borderBottom: '2px solid var(--risk)', display: 'inline-block', flexShrink: 0 }}>
          Conversation
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <BlockerThreadView
            taskId={b.taskId}
            scope="lead"
            range={range}
            replyToLabel={`Reply to ${b.employeeName}`}
            visibilityNote={`Replies are visible to ${b.employeeName} and other team leads`}
            isLocked={b.status === 'RESOLVED'}
          />
        </div>
      </div>

      <ConfirmModal
        open={confirmResolve}
        onClose={() => setConfirmResolve(false)}
        onConfirm={() => {
          setStatus.mutate({ taskId: b.taskId, status: 'RESOLVED' }, {
            onSuccess: () => setConfirmResolve(false),
          });
        }}
        title="Resolve this blocker?"
        message={`This will mark the blocker as resolved and notify ${b.employeeName}. This cannot be undone.`}
        confirmLabel="Yes, Resolve"
        isPending={setStatus.isPending}
      />
    </Card>
  );
}

// ── skeleton / error ──────────────────────────────────────────────────────────────

function Skel({ h = 14, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />;
}

const PAGE_SIZE = 8;

// ── main ───────────────────────────────────────────────────────────────────────────

export default function Blockers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightParam = searchParams.get('highlight');
  const highlightId = highlightParam ? Number(highlightParam) : null;

  // Selected date/range lives in the URL (?mode=today|yesterday|range&from=&to=), with a
  // sessionStorage fallback for navigation that drops the query string entirely — same
  // approach as the Team Dashboard's date filter (lib/teamDashboardDateFilter.ts), so
  // picking a date here and navigating away and back no longer resets it to "Today".
  const { mode: dateMode, range, isToday } = resolveBlockersDateFilter(searchParams);

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

  const { data: blockers, isPending, isFetching, isError, refetch } = useTeamLeadBlockers(range, isToday, true);

  // "Today" live-polls in the background (see useTeamLeadBlockers' refetchInterval), so raw
  // isFetching can't drive the date-filter loading UI directly — every silent poll would flip
  // it too and flash the trigger/tiles/table for a fetch the user never asked for. Track only
  // the range/mode the user explicitly applied via the picker, and treat isFetching as "loading"
  // solely while it's still catching up to that pending selection.
  const [pendingDateKey, setPendingDateKey] = useState<string | null>(null);
  const currentDateKey = `${dateMode}:${range.from}:${range.to}`;
  const isApplyingDateFilter = pendingDateKey === currentDateKey && isFetching;
  useEffect(() => {
    if (pendingDateKey === currentDateKey && !isFetching) setPendingDateKey(null);
  }, [isFetching, pendingDateKey, currentDateKey]);

  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [projectFilter, setProjectFilter] = useState<Set<string>>(new Set());
  const [assigneeFilter, setAssigneeFilter] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'list' | 'group'>('list');
  const [page, setPage] = useState(1);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const appliedHighlightRef = useRef<number | null>(null);

  useEffect(() => {
    if (highlightId != null) setSelectedTaskId(highlightId);
  }, [highlightId]);

  const projectOptions = useMemo(
    () => [...new Set((blockers ?? []).map(b => b.projectName ?? b.projectCode).filter((v): v is string => !!v))].sort(),
    [blockers],
  );
  const assigneeOptions = useMemo(
    () => [...new Set((blockers ?? []).map(b => b.employeeName))].sort(),
    [blockers],
  );

  const filtered = useMemo(() => {
    let list = blockers ?? [];
    if (projectFilter.size) list = list.filter(b => projectFilter.has(b.projectName ?? b.projectCode ?? ''));
    if (assigneeFilter.size) list = list.filter(b => assigneeFilter.has(b.employeeName));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(b => b.employeeName.toLowerCase().split(/\s+/).some(w => w.startsWith(q)));
    }
    return [...list].sort((a, b) => {
      const aT = a.acknowledged ? new Date(a.acknowledgedAt ?? 0).getTime() : 0;
      const bT = b.acknowledged ? new Date(b.acknowledgedAt ?? 0).getTime() : 0;
      return bT - aT;
    });
  }, [blockers, projectFilter, assigneeFilter, search]);

  useEffect(() => { setPage(1); }, [search, projectFilter, assigneeFilter, view]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // Grouped view splits pageItems by project, so each row needs its position within the
  // whole page (not its position within its own group) to keep numbering continuous.
  const rowIndexByTaskId = new Map(pageItems.map((b, i) => [b.taskId, (page - 1) * PAGE_SIZE + i + 1]));

  const matchedBlocker = useMemo(
    () => (blockers ?? []).find(b => b.taskId === selectedTaskId) ?? null,
    [blockers, selectedTaskId],
  );
  // The selected blocker can fall outside the currently selected date range (e.g. arriving via
  // a notification's ?highlight= link) — fetch it directly rather than showing an empty panel.
  const needsFallback = selectedTaskId != null && blockers != null && matchedBlocker == null;
  const { data: fallbackBlocker } = useTeamLeadBlocker(needsFallback ? selectedTaskId : undefined);
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
      const next = new URLSearchParams(searchParams);
      next.set('mode', 'range');
      next.set('from', selectedBlocker.entryDate);
      next.set('to', selectedBlocker.entryDate);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, selectedBlocker]);

  const total = blockers?.length ?? 0;
  const needsResponse = (blockers ?? []).filter(b => b.status === 'NEEDS_RESPONSE').length;
  const acknowledgedCount = (blockers ?? []).filter(b => b.status === 'ACKNOWLEDGED').length;
  const resolvedCount = (blockers ?? []).filter(b => b.status === 'RESOLVED').length;

  if (isPending) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}><Skel h={24} w={160} /><div style={{ marginTop: 8 }}><Skel h={14} w={280} /></div></div>
        <div className="nf-r-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[0, 1, 2, 3].map(i => <Card key={i}><Skel h={60} /></Card>)}
        </div>
        <Card style={{ padding: 20 }}><Skel h={320} /></Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>Blockers</h1>
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

  const groups = view === 'group'
    ? Array.from(pageItems.reduce((map, b) => {
        const key = b.projectName ?? b.projectCode ?? 'Unassigned Project';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(b);
        return map;
      }, new Map<string, TeamBlockerDto[]>()))
    : null;

  return (
    <div className="nf-r-stack" style={{ display: 'grid', gridTemplateColumns: selectedBlocker ? '1.7fr 1fr' : '1fr', gap: 16, alignItems: 'start' }}>
      <div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
              Blockers
            </h1>
            <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
              View and respond to blockers raised by your team.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DateFilterButton
              mode={dateMode}
              range={range}
              loading={isApplyingDateFilter}
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
                setPendingDateKey(`${m}:${r.from}:${r.to}`);
              }}
            />
          </div>
        </div>

        {/* KPI row */}
        <div className="nf-r-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
          <StatCard icon={<AlertTriangle size={18} aria-hidden="true" />} label="Total Blockers" value={total} caption={totalBlockersCaption(dateMode, range.from, range.to)} accent="var(--warn)" loading={isApplyingDateFilter} />
          <StatCard icon={<UserX size={18} aria-hidden="true" />} label="Needs Response" value={needsResponse} caption="No reply from Team Lead" accent="var(--risk)" loading={isApplyingDateFilter} />
          <StatCard icon={<Users size={18} aria-hidden="true" />} label="Acknowledged" value={acknowledgedCount} caption="Replied by Team Lead" accent="var(--info)" loading={isApplyingDateFilter} />
          <StatCard icon={<CheckCircle2 size={18} aria-hidden="true" />} label="Resolved" value={resolvedCount} caption="Marked resolved by Team Lead" accent="var(--ok)" loading={isApplyingDateFilter} />
        </div>

        {/* Filter bar */}
        <Card style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
            <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-dim)' }} />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by employee name..."
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
            label="Project" options={projectOptions} selected={projectFilter}
            onToggle={v => toggleFilterVal(projectFilter, setProjectFilter, v)}
            onClear={() => setProjectFilter(new Set())}
          />
          <FilterDropdown
            label="Assignee" options={assigneeOptions} selected={assigneeFilter}
            onToggle={v => toggleFilterVal(assigneeFilter, setAssigneeFilter, v)}
            onClear={() => setAssigneeFilter(new Set())}
          />

          <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4, background: 'var(--raised2)', borderRadius: 8, padding: 3 }}>
            <button
              onClick={() => { if (view !== 'list') setView('list'); }}
              aria-pressed={view === 'list'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6,
                fontSize: 12, fontWeight: 600, border: 'none', cursor: view === 'list' ? 'default' : 'pointer',
                background: view === 'list' ? 'var(--risk)' : 'transparent',
                color: view === 'list' ? '#fff' : 'var(--txt-mut)',
              }}
            >
              <ListIcon size={13} aria-hidden="true" /> List
            </button>
            <button
              onClick={() => { if (view !== 'group') setView('group'); }}
              aria-pressed={view === 'group'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6,
                fontSize: 12, fontWeight: 600, border: 'none', cursor: view === 'group' ? 'default' : 'pointer',
                background: view === 'group' ? 'var(--risk)' : 'transparent',
                color: view === 'group' ? '#fff' : 'var(--txt-mut)',
              }}
            >
              <LayoutGrid size={13} aria-hidden="true" /> Group by Project
            </button>
          </div>
        </Card>

        {/* Table */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header and rows share one scroll region so columns stay aligned
              while swiping; the pager below sits outside it. */}
          <div className="nf-r-scroll">
          <div className="nf-r-scroll-inner" style={{ '--nf-r-min': BLOCKER_TABLE_MIN_WIDTH + 'px' } as React.CSSProperties}>
          <div style={{
            display: 'grid', gridTemplateColumns: BLOCKER_TABLE_COLUMNS, gap: 12,
            padding: '10px 20px', borderBottom: '1px solid var(--line)', fontSize: 10, color: 'var(--txt-dim)',
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <span>S.NO</span>
            <span>Blocker</span>
            <span>Project</span>
            <span>Reported By</span>
            <span>Reported On</span>
            <span>Replies</span>
            <span>Last Reply</span>
            <span>Status</span>
          </div>

          {isApplyingDateFilter ? (
            // A new date range is loading — show row placeholders instead of the stale (or
            // now-mismatched) rows underneath, so the table never sits there looking frozen.
            [0, 1, 2, 3].map(i => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: BLOCKER_TABLE_COLUMNS, gap: 12,
                padding: '14px 20px', alignItems: 'center', borderBottom: '1px solid var(--line)',
              }}>
                <Skel h={12} w={16} />
                <Skel h={14} w="80%" />
                <Skel h={14} w="60%" />
                <Skel h={14} w="60%" />
                <Skel h={14} w="60%" />
                <Skel h={14} w="40%" />
                <Skel h={14} w="60%" />
                <Skel h={20} w={80} />
              </div>
            ))
          ) : pageItems.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>
              No blockers match these filters.
            </div>
          ) : view === 'list' ? (
            pageItems.map((b, i) => (
              <BlockerRow
                key={b.taskId} b={b} index={(page - 1) * PAGE_SIZE + i + 1} selected={b.taskId === selectedTaskId}
                onClick={() => setSelectedTaskId(id => (id === b.taskId ? null : b.taskId))}
              />
            ))
          ) : (
            groups!.map(([name, items]) => (
              <div key={name}>
                <div style={{ padding: '8px 20px', background: 'var(--raised2)', fontSize: 11.5, fontWeight: 700, color: 'var(--txt)' }}>
                  {name}
                </div>
                {items.map(b => (
                  <BlockerRow
                    key={b.taskId} b={b} index={rowIndexByTaskId.get(b.taskId) ?? 0} selected={b.taskId === selectedTaskId}
                    onClick={() => setSelectedTaskId(id => (id === b.taskId ? null : b.taskId))}
                  />
                ))}
              </div>
            ))
          )}
          </div>
          </div>

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
          <DetailPanel b={selectedBlocker} range={range} onClose={() => setSelectedTaskId(null)} />
        </div>
      )}
    </div>
  );
}
