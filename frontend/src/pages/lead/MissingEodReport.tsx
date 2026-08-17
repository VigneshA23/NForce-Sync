import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, ChevronLeft, ChevronRight, Search, Users } from 'lucide-react';
import { DatePicker } from '../../components/DatePicker';
import { Modal } from '../../components/Modal';
import { formatDate } from '../../lib/date';
import { useToast } from '../../lib/toast';
import { useTeamReportFilters, useTeamMissingEodReport, useTeamRemindEmployee, useTeamRemindAll } from '../../api/teamReports';
import type { MissingEodDayDto, MissingEodRowDto } from '../../api/reports';

// ── helpers ────────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function firstDayOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function extractError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string; message?: string } } };
  return e?.response?.data?.error ?? e?.response?.data?.message ?? 'Something went wrong';
}

const DAY_STATUS_CFG: Record<MissingEodDayDto['status'], { color: string; label: string }> = {
  SUBMITTED: { color: 'var(--ok)', label: 'Submitted' },
  MISSED: { color: 'var(--risk)', label: 'Missed' },
  HOLIDAY: { color: 'var(--info)', label: 'Holiday' },
  WEEKEND: { color: 'var(--txt-dim)', label: 'Weekend' },
  LEAVE: { color: 'var(--warn)', label: 'Leave' },
};

const STATUS_CFG: Record<string, { color: string; label: string }> = {
  MISSING: { color: 'var(--warn)', label: 'Missing' },
  AT_RISK: { color: 'var(--risk)', label: 'At risk' },
};

// ── primitives ─────────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, ...style }}>
      {children}
    </div>
  );
}

function Skel({ h = 14, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />;
}

function Chip({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, color: 'var(--txt-dim)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600,
      color: cfg.color, background: `color-mix(in srgb, ${cfg.color} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${cfg.color} 30%, transparent)`,
    }}>
      {cfg.label}
    </span>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 8,
    color: 'var(--txt)', fontSize: 12.5, padding: '7px 10px', width: '100%', boxSizing: 'border-box',
  };
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--txt-dim)', textTransform: 'uppercase' }}>
      {children}
    </span>
  );
}

// ── filters ────────────────────────────────────────────────────────────────────

interface Filters {
  from: string;
  to: string;
  projectId: number | undefined;
  employeeQuery: string;
}

function defaultFilters(): Filters {
  return { from: firstDayOfMonthISO(), to: todayISO(), projectId: undefined, employeeQuery: '' };
}

function FilterBar({ filters, onChange, onReset }: {
  filters: Filters;
  onChange: (next: Filters) => void;
  onReset: () => void;
}) {
  const { data: filterOptions } = useTeamReportFilters();

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <Card style={{ padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>From</FieldLabel>
          <DatePicker value={filters.from} onChange={v => set('from', v)} max={filters.to} inputStyle={inputStyle()} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>To</FieldLabel>
          <DatePicker value={filters.to} onChange={v => set('to', v)} min={filters.from} inputStyle={inputStyle()} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>Project</FieldLabel>
          <select style={inputStyle()} value={filters.projectId ?? ''} onChange={e => set('projectId', e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">All projects</option>
            {(filterOptions?.projects ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>Employee</FieldLabel>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-dim)' }} aria-hidden="true" />
            <input
              value={filters.employeeQuery}
              onChange={e => set('employeeQuery', e.target.value)}
              placeholder="Name or ID"
              style={{ ...inputStyle(), paddingLeft: 28 }}
            />
          </div>
        </label>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
        <button
          onClick={onReset}
          style={{ background: 'none', border: '1px solid var(--line2)', borderRadius: 8, color: 'var(--brand-bright)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '7px 12px' }}
        >
          Clear filters
        </button>
      </div>
    </Card>
  );
}

// ── gaps calendar ──────────────────────────────────────────────────────────────

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CELL_PX = 38;
const CELL_GAP = 4;

function monthKey(iso: string): string { return iso.slice(0, 7); }
function monthLabel(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
function leadingEmptyCount(firstIso: string): number {
  const dow = new Date(firstIso + 'T12:00:00').getDay();
  return dow === 0 ? 6 : dow - 1;
}

function GapsCalendar({ days, selected, onToggle }: {
  days: MissingEodDayDto[];
  selected: Set<string>;
  onToggle: (date: string) => void;
}) {
  const months = useMemo(() => {
    const map = new Map<string, MissingEodDayDto[]>();
    for (const d of days) {
      const key = monthKey(d.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return [...map.entries()];
  }, [days]);

  const gridWidth = CELL_PX * 7 + CELL_GAP * 6;

  return (
    <div>
      {months.map(([key, monthDays]) => (
        <div key={key} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--txt)', marginBottom: 8, textAlign: 'center' }}>
            {monthLabel(monthDays[0].date)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, ${CELL_PX}px)`, gap: CELL_GAP, marginBottom: CELL_GAP, width: gridWidth, marginInline: 'auto' }}>
            {DAY_HEADERS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 8.5, color: 'var(--txt-dim)', fontWeight: 700, textTransform: 'uppercase' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, ${CELL_PX}px)`, gap: CELL_GAP, width: gridWidth, marginInline: 'auto' }}>
            {Array.from({ length: leadingEmptyCount(monthDays[0].date) }).map((_, i) => (
              <div key={`pad-${i}`} style={{ width: CELL_PX, height: CELL_PX }} />
            ))}
            {monthDays.map(day => {
              const cfg = DAY_STATUS_CFG[day.status];
              const clickable = day.status === 'MISSED';
              const isSelected = selected.has(day.date);
              const dayNum = new Date(day.date + 'T12:00:00').getDate();
              return (
                <div
                  key={day.date}
                  title={`${formatDate(day.date)} — ${cfg.label}`}
                  onClick={() => clickable && onToggle(day.date)}
                  style={{
                    width: CELL_PX, height: CELL_PX, borderRadius: 6,
                    background: `color-mix(in srgb, ${cfg.color} ${isSelected ? 45 : 22}%, var(--raised2))`,
                    border: isSelected ? `1.5px solid ${cfg.color}` : '1.5px solid transparent',
                    boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600, color: 'var(--txt)',
                    cursor: clickable ? 'pointer' : 'default',
                  }}
                >
                  {dayNum}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', fontSize: 10, color: 'var(--txt-dim)' }}>
        {(Object.entries(DAY_STATUS_CFG) as [MissingEodDayDto['status'], { color: string; label: string }][]).map(([key, cfg]) => (
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: `color-mix(in srgb, ${cfg.color} 45%, var(--raised2))`, flexShrink: 0 }} />
            {cfg.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── gaps modal ─────────────────────────────────────────────────────────────────

function GapsModal({ row, onClose, filters }: {
  row: MissingEodRowDto | null;
  onClose: () => void;
  filters: Filters;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const remind = useTeamRemindEmployee();
  const { show } = useToast();

  useEffect(() => { setSelected(new Set()); setConfirmOpen(false); }, [row?.employeeId]);

  if (!row) return null;
  const emp = row;
  const missingDates = emp.days.filter(d => d.status === 'MISSED').map(d => d.date);
  const targetDates = selected.size > 0 ? [...selected].sort() : missingDates;

  function toggle(date: string) {
    const next = new Set(selected);
    if (next.has(date)) next.delete(date); else next.add(date);
    setSelected(next);
  }

  async function confirmSendReminder() {
    try {
      const dates = selected.size > 0 ? [...selected] : undefined;
      const res = await remind.mutateAsync({ employeeId: emp.employeeId, filters, dates });
      show(`Reminder sent for ${res.remindedDays} missing day${res.remindedDays !== 1 ? 's' : ''}.`, 'success');
      setConfirmOpen(false);
      onClose();
    } catch (err) {
      show(extractError(err), 'error');
    }
  }

  return (
    <>
      <Modal open title={`${emp.employeeName} — missing EOD gaps`} onClose={onClose} width={420}>
        <div style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--txt-mut)' }}>
          {emp.missingCount} missing of {emp.totalWorkingDays} working days ({emp.missingPct.toFixed(0)}%). Click a red day to select it, or leave none selected to remind about all of them.
        </div>
        <GapsCalendar days={emp.days} selected={selected} onToggle={toggle} />
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={() => setSelected(new Set(missingDates))}
            style={{ background: 'none', border: '1px solid var(--line2)', borderRadius: 8, color: 'var(--brand-bright)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '8px 12px' }}
          >
            Select all missing
          </button>
          {selected.size > 0 && (
            <button
              onClick={() => setSelected(new Set())}
              style={{ background: 'none', border: '1px solid var(--line2)', borderRadius: 8, color: 'var(--txt-mut)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '8px 12px' }}
            >
              Clear
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setConfirmOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--brand)', border: '1px solid var(--brand)',
              borderRadius: 8, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '8px 14px',
            }}
          >
            <Bell size={13} aria-hidden="true" /> {selected.size > 0 ? `Send reminder (${selected.size})` : 'Send reminder'}
          </button>
        </div>
      </Modal>

      <Modal
        open={confirmOpen}
        title="Send reminder?"
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <button onClick={() => setConfirmOpen(false)} style={{ background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer', padding: '8px 16px' }}>Cancel</button>
            <button onClick={confirmSendReminder} disabled={remind.isPending} style={{ background: 'var(--brand)', border: '1px solid var(--brand)', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, cursor: remind.isPending ? 'not-allowed' : 'pointer', padding: '8px 16px' }}>
              {remind.isPending ? 'Sending…' : 'Confirm'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <AlertTriangle size={16} style={{ color: 'var(--warn)', marginTop: 1, flexShrink: 0 }} aria-hidden="true" />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--txt)' }}>
            Send a reminder to <strong>{emp.employeeName}</strong> about {targetDates.length} missing day{targetDates.length !== 1 ? 's' : ''}
            {targetDates.length <= 5 ? `: ${targetDates.map(formatDate).join(', ')}` : ''}?
          </p>
        </div>
      </Modal>
    </>
  );
}

// ── main ───────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

// Header row and body rows must share one template or the columns desync.
const MISSING_TABLE_COLUMNS = '1.6fr 1fr 1fr 90px 160px';
const MISSING_TABLE_MIN_WIDTH = 780;

export default function LeadMissingEodReport() {
  const [filters, setFilters] = useState<Filters>(defaultFilters());
  const [page, setPage] = useState(0);
  const [gapsFor, setGapsFor] = useState<MissingEodRowDto | null>(null);
  const [confirmRemindAll, setConfirmRemindAll] = useState(false);
  const [confirmRemindRow, setConfirmRemindRow] = useState<MissingEodRowDto | null>(null);

  const { data, isLoading, isError, refetch } = useTeamMissingEodReport({
    from: filters.from,
    to: filters.to,
    projectId: filters.projectId,
    employeeQuery: filters.employeeQuery || undefined,
  });

  const remindOne = useTeamRemindEmployee();
  const remindAll = useTeamRemindAll();
  const { show } = useToast();

  const employees = useMemo(() => data?.employees ?? [], [data]);
  useEffect(() => { setPage(0); }, [employees.length]);

  const pageCount = Math.max(1, Math.ceil(employees.length / PAGE_SIZE));
  const pageRows = employees.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function confirmedQuickRemind() {
    if (!confirmRemindRow) return;
    const row = confirmRemindRow;
    setConfirmRemindRow(null);
    try {
      const res = await remindOne.mutateAsync({ employeeId: row.employeeId, filters });
      show(`Reminder sent for ${res.remindedDays} missing day${res.remindedDays !== 1 ? 's' : ''}.`, 'success');
    } catch (err) {
      show(extractError(err), 'error');
    }
  }

  async function confirmedRemindAll() {
    setConfirmRemindAll(false);
    try {
      const res = await remindAll.mutateAsync(filters);
      show(`Reminded ${res.remindedCount} employee${res.remindedCount !== 1 ? 's' : ''}.`, 'success');
    } catch (err) {
      show(extractError(err), 'error');
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, color: 'var(--txt-mut)' }}>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--brand-bright)', fontWeight: 700 }}>{data?.employeeCount ?? 0}</span> employees ·{' '}
          <span style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--brand-bright)', fontWeight: 700 }}>{data?.totalMissingDays ?? 0}</span> missing days in range
        </div>
        {employees.length > 0 && (
          <button
            onClick={() => setConfirmRemindAll(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--brand)', border: '1px solid var(--brand)', borderRadius: 8, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '8px 14px' }}
          >
            <Bell size={13} aria-hidden="true" /> Send reminder to everyone
          </button>
        )}
      </div>

      <FilterBar filters={filters} onChange={setFilters} onReset={() => setFilters(defaultFilters())} />

      {isError ? (
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load the missing-EOD report.</div>
          <button onClick={() => refetch()} style={{ padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}>
            Retry
          </button>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header and rows share one scroll region so columns stay aligned
              while swiping; the pager below sits outside it. */}
          <div className="nf-r-scroll">
          <div className="nf-r-scroll-inner" style={{ '--nf-r-min': MISSING_TABLE_MIN_WIDTH + 'px' } as React.CSSProperties}>
          <div style={{ display: 'grid', gridTemplateColumns: MISSING_TABLE_COLUMNS, padding: '10px 16px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--txt-dim)', textTransform: 'uppercase', borderBottom: '1px solid var(--line)', background: 'var(--raised)' }}>
            <div>Employee</div><div>Project</div><div>Missing</div><div>Status</div><div />
          </div>
          {isLoading ? (
            <div style={{ padding: 16 }}>{[0, 1, 2].map(i => <div key={i} style={{ marginBottom: 10 }}><Skel h={14} /></div>)}</div>
          ) : pageRows.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--txt-dim)' }}>No missing EOD entries match these filters.</div>
          ) : (
            pageRows.map(row => (
              <div key={row.employeeId} style={{ display: 'grid', gridTemplateColumns: MISSING_TABLE_COLUMNS, padding: '10px 16px', alignItems: 'center', borderBottom: '1px solid var(--line)', fontSize: 12.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                    background: 'var(--raised2)', color: 'var(--txt)', border: '1px solid var(--line2)',
                  }}>
                    {initials(row.employeeName)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.employeeName}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>
                      {[row.designationName, row.employeeCode].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
                <div style={{ color: 'var(--txt-mut)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.projectName ?? '—'}</div>
                <div style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt)' }}>{row.missingCount}/{row.totalWorkingDays} ({row.missingPct.toFixed(0)}%)</div>
                <div><Chip status={row.status} /></div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setGapsFor(row)}
                    style={{ background: 'none', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: '5px 10px' }}
                  >
                    Gaps
                  </button>
                  <button
                    onClick={() => setConfirmRemindRow(row)}
                    disabled={remindOne.isPending}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--brand-bright)', fontSize: 11.5, fontWeight: 600, cursor: remindOne.isPending ? 'not-allowed' : 'pointer', padding: '5px 10px' }}
                  >
                    <Bell size={11} aria-hidden="true" /> Remind
                  </button>
                </div>
              </div>
            ))
          )}
          </div>
          </div>
          {employees.length > PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '10px 16px', borderTop: '1px solid var(--line)' }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ background: 'none', border: 'none', color: page === 0 ? 'var(--txt-dim)' : 'var(--brand-bright)', cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <ChevronLeft size={13} aria-hidden="true" /> Prev
              </button>
              <span style={{ fontSize: 11.5, color: 'var(--txt-dim)' }}>Page {page + 1} / {pageCount}</span>
              <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} style={{ background: 'none', border: 'none', color: page >= pageCount - 1 ? 'var(--txt-dim)' : 'var(--brand-bright)', cursor: page >= pageCount - 1 ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                Next <ChevronRight size={13} aria-hidden="true" />
              </button>
            </div>
          )}
        </Card>
      )}

      <GapsModal row={gapsFor} onClose={() => setGapsFor(null)} filters={filters} />

      <Modal
        open={confirmRemindRow != null}
        title="Send reminder?"
        onClose={() => setConfirmRemindRow(null)}
        footer={
          <>
            <button onClick={() => setConfirmRemindRow(null)} style={{ background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer', padding: '8px 16px' }}>Cancel</button>
            <button onClick={confirmedQuickRemind} disabled={remindOne.isPending} style={{ background: 'var(--brand)', border: '1px solid var(--brand)', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, cursor: remindOne.isPending ? 'not-allowed' : 'pointer', padding: '8px 16px' }}>
              {remindOne.isPending ? 'Sending…' : 'Confirm'}
            </button>
          </>
        }
      >
        {confirmRemindRow && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <AlertTriangle size={16} style={{ color: 'var(--warn)', marginTop: 1, flexShrink: 0 }} aria-hidden="true" />
            <p style={{ margin: 0, fontSize: 13, color: 'var(--txt)' }}>
              Send a reminder to <strong>{confirmRemindRow.employeeName}</strong> about all {confirmRemindRow.missingCount} missing day{confirmRemindRow.missingCount !== 1 ? 's' : ''}?
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={confirmRemindAll}
        title="Send reminder to everyone?"
        onClose={() => setConfirmRemindAll(false)}
        footer={
          <>
            <button onClick={() => setConfirmRemindAll(false)} style={{ background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer', padding: '8px 16px' }}>Cancel</button>
            <button onClick={confirmedRemindAll} disabled={remindAll.isPending} style={{ background: 'var(--brand)', border: '1px solid var(--brand)', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, cursor: remindAll.isPending ? 'not-allowed' : 'pointer', padding: '8px 16px' }}>
              {remindAll.isPending ? 'Sending…' : `Remind ${employees.length}`}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <AlertTriangle size={16} style={{ color: 'var(--warn)', marginTop: 1, flexShrink: 0 }} aria-hidden="true" />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--txt)' }}>
            Send a reminder to all {employees.length} team members currently listed, each about their own missing days.
          </p>
        </div>
      </Modal>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 11.5, color: 'var(--txt-dim)' }}>
        <Users size={13} aria-hidden="true" />
        Scoped to your direct reports.
      </div>
    </div>
  );
}
