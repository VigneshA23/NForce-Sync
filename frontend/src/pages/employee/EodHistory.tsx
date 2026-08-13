import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle, Clock, XCircle, ChevronRight, AlertTriangle,
  Search, ArrowUpDown, ChevronLeft, Calendar as CalendarIcon,
} from 'lucide-react';
import { listEntries } from '../../api/eod';
import type { EodEntryDto } from '../../api/eod';
import { formatDate as formatDateDDMMYYYY, formatDateTime } from '../../lib/date';

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { color: string; label: string; Icon: React.FC<{ size: number }> }> = {
  DRAFT:             { color: '#9BA1AC', label: 'Draft',             Icon: Clock },
  SUBMITTED:         { color: '#4C8DD6', label: 'Submitted',         Icon: Clock },
  APPROVED:          { color: '#2FB67C', label: 'Approved',          Icon: CheckCircle },
  REJECTED:          { color: '#E4373D', label: 'Rejected',          Icon: XCircle },
  MISSED:            { color: '#6B7280', label: 'Missed',            Icon: AlertTriangle },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.DRAFT;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 20,
      background: `${m.color}18`, border: `1px solid ${m.color}40`,
      fontSize: 11, fontWeight: 500, color: m.color, whiteSpace: 'nowrap',
    }}>
      <m.Icon size={11} aria-hidden />
      {m.label}
    </span>
  );
}

// ── Filter options ─────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: '',                 label: 'All' },
  { value: 'SUBMITTED',        label: 'Submitted' },
  { value: 'APPROVED',         label: 'Approved' },
  { value: 'REJECTED',         label: 'Rejected' },
  { value: 'DRAFT',            label: 'Draft' },
];

const PAGE_SIZE = 10;

// ── Date filter validation ──────────────────────────────────────────────────────
// Root cause of the earlier bug: the From/To fields were native <input type="date">
// elements, whose manual-typing behavior (segmented day/month/year spinners, per-browser
// quirks in what `.value`/`validity.badInput` report while typing) is not something we
// control — some browsers silently normalize an impossible combination like 31 Feb into
// a different, "valid" date rather than reporting an unparsable value at all, so a
// malformed date could reach `.value` looking legitimate. Manual entry is now a plain text
// field in the visible DD-MM-YYYY format, validated by OUR OWN arithmetic (never by
// constructing a `Date` and reading back whatever it silently coerced to), so typing and the
// calendar picker both resolve through the exact same `parseStrictDDMMYYYY` below.
const MIN_ISO_DATE = '1900-01-01';
const MAX_ISO_DATE = '2099-12-31';
const MIN_YEAR = 1900;
const MAX_YEAR = 2099;

const DDMMYYYY_RE = /^(\d{2})-(\d{2})-(\d{4})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(month: number, year: number): number {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

/**
 * Strictly parses a two-digit-day / two-digit-month / four-digit-year `DD-MM-YYYY` string
 * into its `YYYY-MM-DD` equivalent — purely by digit-count regex plus arithmetic
 * range/leap-year checks, never by constructing a `Date` and seeing what it normalized to.
 * Rejects single/triple-digit day or month, 2-digit or 5+-digit years, out-of-range day/month,
 * and impossible day-for-month combinations (Feb 30, day 31 in a 30-day month, etc.). Returns
 * `null` for anything that isn't a genuine calendar date.
 */
function parseStrictDDMMYYYY(text: string): string | null {
  const m = DDMMYYYY_RE.exec(text.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  if (day < 1 || day > daysInMonth(month, year)) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** `YYYY-MM-DD` → `DD-MM-YYYY`, for mirroring a calendar-picker selection into the text field. */
function isoToDDMMYYYY(iso: string): string {
  const [y, mo, d] = iso.split('-');
  return `${d}-${mo}-${y}`;
}

/**
 * Restricts a From/To field's raw keystrokes to the DD-MM-YYYY structure itself, rather than
 * validating after the fact: strips every non-digit character (so letters/symbols/spaces can
 * never enter state at all), caps at 8 digits total (2+2+4), and auto-inserts the `-`
 * separators as digits accumulate. The result is always a syntactically-valid prefix of
 * DD-MM-YYYY — it just may not yet be a *complete* or calendar-valid date, which is checked
 * separately on blur/Enter by `parseStrictDDMMYYYY`.
 */
function maskDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 4) return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return digits;
}

// Both `from`/`to` are always fixed-width, zero-padded `YYYY-MM-DD` by this point (never the
// DD-MM-YYYY display string, which sorts nothing like calendar order), so a plain string
// comparison is chronologically correct — no Date object, no timezone risk.
function isRangeValid(from: string, to: string): boolean {
  if (from === '' || to === '') return true;
  return from <= to;
}

/** Today as a zero-padded `YYYY-MM-DD`, read from local date parts (never UTC/`toISOString`,
 * which can shift the calendar day depending on the browser's timezone offset). */
function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/**
 * Whether the EOD History table should show query results at all. `'none'` (both fields
 * empty) shows the normal unfiltered list; `'valid'` shows the date-filtered list; `'invalid'`
 * — bad format, an incomplete pair (only one side filled), a future To date, or From > To —
 * must never show records, filtered or not, so the table renders a validation state instead.
 */
type DateFilterStatus = 'none' | 'valid' | 'invalid';

// ── Main component ─────────────────────────────────────────────────────────────

export default function EodHistory() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  // Committed filter values (YYYY-MM-DD) — these, and only these, drive the history query.
  // They only ever change once `applyDateFilter` has confirmed both fields are individually
  // valid AND From <= To, so an invalid or incomplete manual entry can never reach the query.
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Raw text as displayed/typed in the two fields (DD-MM-YYYY) — independent of the committed
  // values above so the user can freely type without every keystroke being judged.
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);
  const [fromInvalid, setFromInvalid] = useState(false);
  const [toInvalid, setToInvalid] = useState(false);
  // Both empty at first, matching the unfiltered default — see `applyDateFilter` for every
  // transition. Gates the table render below: records are only ever shown for 'none' or
  // 'valid', never 'invalid', regardless of what `dateFrom`/`dateTo` last held.
  const [dateFilterStatus, setDateFilterStatus] = useState<DateFilterStatus>('none');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(0);

  const { data: entries = [], isLoading, isError } = useQuery({
    queryKey: ['eod-history', dateFrom, dateTo],
    queryFn:  () => listEntries(undefined, dateFrom || undefined, dateTo || undefined),
    // Never issue a request for an invalid/incomplete range — `dateFrom`/`dateTo` are only
    // ever committed (see `applyDateFilter`) once the full pair is valid, so this just blocks
    // a stray refetch (e.g. window refocus) while the fields sit in an invalid state.
    enabled: dateFilterStatus !== 'invalid',
  });

  const totalHours = (entry: EodEntryDto) =>
    entry.tasks.reduce((sum, t) => sum + (Number(t.hours) || 0), 0);

  const projectSummary = (entry: EodEntryDto): string => {
    const codes = Array.from(new Set(entry.tasks.map(t => t.projectCode).filter(Boolean))) as string[];
    if (codes.length === 0) return '—';
    return codes.length === 1 ? codes[0] : `${codes[0]} +${codes.length - 1}`;
  };

  const taskSummary = (entry: EodEntryDto): string => {
    if (entry.tasks.length === 0) return entry.dayType !== 'WORKING_DAY' ? entry.dayType.replace('_', ' ') : '—';
    const labels = entry.tasks.map(t => t.categoryName || t.description || 'Task');
    return labels.length === 1 ? labels[0] : `${labels[0]} +${labels.length - 1} more`;
  };

  const filtered = useMemo(() => {
    let rows = statusFilter ? entries.filter(e => e.status === statusFilter) : entries;
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(e => {
        const haystack = [
          e.entryDate,
          ...e.tasks.map(t => t.projectCode ?? ''),
          ...e.tasks.map(t => t.categoryName ?? ''),
          ...e.tasks.map(t => t.description ?? ''),
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    const sorted = [...rows].sort((a, b) =>
      sortDir === 'desc' ? b.entryDate.localeCompare(a.entryDate) : a.entryDate.localeCompare(b.entryDate)
    );
    return sorted;
  }, [entries, statusFilter, search, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount - 1);
  const paged = filtered.slice(pageSafe * PAGE_SIZE, (pageSafe + 1) * PAGE_SIZE);

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(0); };
  }

  // The single validation/commit path for BOTH manual typing (via onBlur/Enter) and the
  // calendar picker (via handlePickerChange below) — always re-validates the pair of raw
  // DD-MM-YYYY texts together so neither entry point can diverge from the other. Follows a
  // fixed order: format/day/month/year/calendar validity (parseStrictDDMMYYYY) → both-sides-
  // present → To not in the future → From <= To. Only commits to dateFrom/dateTo (and thus the
  // history query) once every step passes; any failure sets dateFilterStatus to 'invalid',
  // which alone controls whether the table renders records — never a fallback to whatever
  // dateFrom/dateTo last held.
  function applyDateFilter(nextFromText: string, nextToText: string) {
    const fromTrimmed = nextFromText.trim();
    const toTrimmed = nextToText.trim();
    const fromEmpty = fromTrimmed === '';
    const toEmpty = toTrimmed === '';

    if (fromEmpty && toEmpty) {
      setFromInvalid(false);
      setToInvalid(false);
      setDateError(null);
      setDateFilterStatus('none');
      setDateFrom('');
      setDateTo('');
      setPage(0);
      return;
    }

    const fromIso = fromEmpty ? null : parseStrictDDMMYYYY(fromTrimmed);
    const toIso = toEmpty ? null : parseStrictDDMMYYYY(toTrimmed);

    const fromBad = !fromEmpty && fromIso === null;
    const toBad = !toEmpty && toIso === null;
    setFromInvalid(fromBad);
    setToInvalid(toBad);

    if (fromBad || toBad) {
      setDateError('Invalid date. Please enter a valid date in DD-MM-YYYY format.');
      setDateFilterStatus('invalid');
      return;
    }

    // Both individually well-formed (or empty) at this point — an incomplete pair (only one
    // side filled in) must not filter, and must not fall back to showing unfiltered records.
    if (fromEmpty || toEmpty) {
      setDateError(null);
      setDateFilterStatus('invalid');
      return;
    }

    if (toIso! > todayIsoLocal()) {
      setToInvalid(true);
      setDateError('To date cannot be a future date.');
      setDateFilterStatus('invalid');
      return;
    }

    if (!isRangeValid(fromIso ?? '', toIso ?? '')) {
      setDateError('From date cannot be later than To date.');
      setDateFilterStatus('invalid');
      return;
    }

    setDateError(null);
    setDateFilterStatus('valid');
    setDateFrom(fromIso ?? '');
    setDateTo(toIso ?? '');
    setPage(0);
  }

  // The calendar picker's native <input type="date"> value is browser-guaranteed to be either
  // empty or a genuine valid date — but it still funnels through applyDateFilter (mirrored into
  // the text field first) so a picker selection and a manual entry are validated and committed
  // identically, and a picker pick can still be rejected by the From <= To check.
  function handlePickerChange(field: 'from' | 'to', e: React.ChangeEvent<HTMLInputElement>) {
    const iso = e.target.value;
    const ddmmyyyy = iso ? isoToDDMMYYYY(iso) : '';
    if (field === 'from') {
      setFromText(ddmmyyyy);
      applyDateFilter(ddmmyyyy, toText);
    } else {
      setToText(ddmmyyyy);
      applyDateFilter(fromText, ddmmyyyy);
    }
  }

  // Weekday kept (useful in a history list scanned day-by-day), date portion
  // standardized to DD-MM-YYYY.
  function formatDate(iso: string) {
    const weekday = new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' });
    return `${weekday}, ${formatDateDDMMYYYY(iso)}`;
  }

  function handleView(entry: EodEntryDto) {
    navigate(`/eod/submit?date=${entry.entryDate}`);
  }

  function clearAllFilters() {
    setStatusFilter(''); setSearch('');
    setDateFrom(''); setDateTo(''); setFromText(''); setToText('');
    setFromInvalid(false); setToInvalid(false); setDateError(null);
    setDateFilterStatus('none');
    setPage(0);
  }

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 10px', background: 'var(--raised2)', border: '1px solid var(--line2)',
          borderRadius: 20, marginBottom: 10,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4C8DD6', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--txt-mut)', letterSpacing: '0.04em' }}>Employee</span>
        </div>
        <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 26, fontWeight: 700, color: 'var(--txt)', margin: 0, letterSpacing: '-0.01em' }}>
          My EOD History
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--txt-mut)' }}>
          All your end-of-day reports, newest first.
        </p>
      </div>

      {/* Toolbar — native select, matching the working filter pattern in admin/AuditLog.tsx */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap',
        padding: '14px 16px', background: 'var(--panel)',
        border: '1px solid var(--line)', borderRadius: 10,
      }}>
        <div>
          <label style={labelStyle} htmlFor="eod-search">Search</label>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: 9, color: 'var(--txt-dim)' }} aria-hidden />
            <input
              id="eod-search"
              placeholder="Project, category, description…"
              value={search}
              onChange={e => resetPage(setSearch)(e.target.value)}
              style={{ ...selectStyle, paddingLeft: 28, width: 220, cursor: 'text' }}
            />
          </div>
        </div>
        <div>
          <label style={labelStyle} htmlFor="status-filter">Status</label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={e => resetPage(setStatusFilter)(e.target.value)}
            style={selectStyle}
          >
            {STATUS_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle} htmlFor="date-from">From</label>
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <input
              id="date-from" type="text" inputMode="numeric" placeholder="DD-MM-YYYY" maxLength={10}
              value={fromText}
              onChange={e => setFromText(maskDateInput(e.target.value))}
              onBlur={() => applyDateFilter(fromText, toText)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              aria-invalid={fromInvalid}
              style={{ ...selectStyle, cursor: 'text', width: 110, paddingRight: 26 }}
            />
            <div style={{
              position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--txt-dim)', display: 'flex', pointerEvents: 'none',
            }}>
              <CalendarIcon size={13} aria-hidden="true" />
            </div>
            <input
              type="date" min={MIN_ISO_DATE} max={MAX_ISO_DATE}
              value={dateFrom}
              onChange={e => handlePickerChange('from', e)}
              tabIndex={-1}
              aria-label="Pick From date from calendar"
              style={{ position: 'absolute', right: 0, top: 0, width: 24, height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 }}
            />
          </div>
        </div>
        <div>
          <label style={labelStyle} htmlFor="date-to">To</label>
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <input
              id="date-to" type="text" inputMode="numeric" placeholder="DD-MM-YYYY" maxLength={10}
              value={toText}
              onChange={e => setToText(maskDateInput(e.target.value))}
              onBlur={() => applyDateFilter(fromText, toText)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              aria-invalid={toInvalid}
              style={{ ...selectStyle, cursor: 'text', width: 110, paddingRight: 26 }}
            />
            <div style={{
              position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--txt-dim)', display: 'flex', pointerEvents: 'none',
            }}>
              <CalendarIcon size={13} aria-hidden="true" />
            </div>
            <input
              type="date" min={MIN_ISO_DATE} max={todayIsoLocal()}
              value={dateTo}
              onChange={e => handlePickerChange('to', e)}
              tabIndex={-1}
              aria-label="Pick To date from calendar"
              style={{ position: 'absolute', right: 0, top: 0, width: 24, height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 }}
            />
          </div>
        </div>
        <button
          onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
          title="Toggle sort order"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 10px', background: 'var(--shell)', border: '1px solid var(--line2)',
            borderRadius: 6, color: 'var(--txt-mut)', fontSize: 12, cursor: 'pointer',
          }}
        >
          <ArrowUpDown size={12} /> {sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
        </button>
        <span style={{ marginLeft: 'auto', fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: 'var(--txt-dim)' }}>
          {dateFilterStatus === 'invalid'
            ? '0 entries'
            : `${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}`}
        </span>
      </div>

      {dateError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 12px', borderRadius: 6, marginBottom: 16, marginTop: -6,
          background: 'rgba(228,55,61,.08)', border: '1px solid rgba(228,55,61,.2)',
          fontSize: 12, color: 'var(--risk)',
        }} role="alert">
          <AlertTriangle size={13} aria-hidden />
          {dateError}
        </div>
      )}

      {/* Table — a date filter in an 'invalid' state (bad format, incomplete pair, future
          To, or From > To) must never render records, so it takes precedence over the
          normal loading/error/empty/data states below. */}
      {dateFilterStatus === 'invalid' ? (
        <EmptyState
          message="Enter valid dates to view EOD history."
          hasFilter
          onClear={clearAllFilters}
        />
      ) : isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[100, 85, 90, 78].map((w, i) => (
            <div key={i} className="skeleton" style={{ height: 56, width: `${w}%`, borderRadius: 8 }} />
          ))}
        </div>
      ) : isError ? (
        <div style={{
          padding: '20px 24px', borderRadius: 8,
          background: 'rgba(228,55,61,.08)', border: '1px solid rgba(228,55,61,.2)',
          fontSize: 13, color: 'var(--risk)',
        }}>
          Failed to load history. Please refresh.
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          hasFilter={!!statusFilter || !!search || !!dateFrom || !!dateTo}
          onClear={clearAllFilters}
        />
      ) : (
        <div style={{
          background: 'var(--panel)', border: '1px solid var(--line)',
          borderRadius: 8, overflow: 'hidden',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1.3fr 0.8fr 1.5fr 70px 1fr 1fr 32px',
            padding: '8px 16px', borderBottom: '1px solid var(--line)',
            gap: 12,
          }}>
            {['Date', 'Project', 'Task Summary', 'Hours', 'Status', 'Submitted at', ''].map((h, i) => (
              <div key={i} style={{ fontSize: 10, fontWeight: 600, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          {paged.map((entry, i) => (
            <div
              key={entry.id}
              onClick={() => handleView(entry)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && handleView(entry)}
              style={{
                display: 'grid', gridTemplateColumns: '1.3fr 0.8fr 1.5fr 70px 1fr 1fr 32px',
                padding: '12px 16px', gap: 12, alignItems: 'center',
                borderBottom: i < paged.length - 1 ? '1px solid var(--line)' : 'none',
                cursor: 'pointer',
                transition: 'background 120ms',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--raised)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
            >
              <div>
                <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>
                  {formatDate(entry.entryDate)}
                </div>
                {entry.reviewerComment && (
                  <div style={{ fontSize: 11, color: '#E0A93B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                    "{entry.reviewerComment}"
                  </div>
                )}
              </div>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: 'var(--txt-mut)' }}>
                {projectSummary(entry)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--txt-mut)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {taskSummary(entry)}
              </div>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: 'var(--txt-mut)' }}>
                {totalHours(entry).toFixed(1)}h
              </div>
              <div><StatusBadge status={entry.status} /></div>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: 'var(--txt-dim)' }}>
                {entry.submittedAt ? formatDateTime(entry.submittedAt) : '—'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <ChevronRight size={14} style={{ color: 'var(--txt-dim)' }} aria-hidden />
              </div>
            </div>
          ))}

          {/* Pagination */}
          {pageCount > 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', borderTop: '1px solid var(--line)',
            }}>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={pageSafe === 0}
                style={pagerBtnStyle(pageSafe === 0)}
              >
                <ChevronLeft size={13} /> Prev
              </button>
              <span style={{ fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>
                Page {pageSafe + 1} of {pageCount}
              </span>
              <button
                onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                disabled={pageSafe >= pageCount - 1}
                style={pagerBtnStyle(pageSafe >= pageCount - 1)}
              >
                Next <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ hasFilter, onClear, message }: { hasFilter: boolean; onClear: () => void; message?: string }) {
  return (
    <div style={{
      padding: '40px 24px', borderRadius: 8,
      background: 'var(--panel)', border: '1px solid var(--line)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--txt)', marginBottom: 6 }}>
        {message ?? (hasFilter ? 'No entries match this filter' : 'No EOD reports yet')}
      </div>
      <div style={{ fontSize: 13, color: 'var(--txt-mut)', marginBottom: hasFilter ? 16 : 0 }}>
        {message
          ? 'Correct the highlighted date field to see your reports.'
          : hasFilter
            ? 'Try a different status filter to see more entries.'
            : 'Submit your first end-of-day report to get started.'}
      </div>
      {hasFilter && (
        <button
          onClick={onClear}
          style={{
            padding: '7px 16px', borderRadius: 6,
            background: 'var(--raised2)', border: '1px solid var(--line2)',
            color: 'var(--txt)', fontSize: 13, cursor: 'pointer',
          }}
        >
          Clear filter
        </button>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 550,
  color: 'var(--txt-dim)', marginBottom: 4, letterSpacing: '0.04em',
};

const selectStyle: React.CSSProperties = {
  padding: '7px 10px',
  background: 'var(--shell)',
  border: '1px solid var(--line2)',
  borderRadius: 6,
  color: 'var(--txt)',
  fontSize: 12,
  outline: 'none',
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
};

function pagerBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '5px 10px', borderRadius: 6,
    background: disabled ? 'transparent' : 'var(--raised2)',
    border: `1px solid ${disabled ? 'transparent' : 'var(--line2)'}`,
    color: disabled ? 'var(--line2)' : 'var(--txt-mut)',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 11, fontWeight: 600,
  };
}
