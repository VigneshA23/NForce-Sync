import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, X, CheckCheck, RefreshCw,
  Search, AlertTriangle, MessageCircleQuestion,
} from 'lucide-react';
import {
  usePendingApprovals, useDecidedApprovals,
  useApprove, useReject, type PendingApprovalsRange,
} from '../api/approvals';
import { useOpenClarification, useEodInbox } from '../api/eodClarification';
import { FilterDropdown } from '../components/FilterDropdown';
import { useToast } from '../lib/toast';
import {
  formatDate as fmtDate, todayISO as localTodayISO, yesterdayISO as localYesterdayISO,
  formatDateShort, formatDateRange,
} from '../lib/date';
import type { EodEntryDto } from '../api/eod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  sumHours, hrs, entryProjects, entryCategories,
  daySummary, timeAdjustmentLabel, formatRelative, extractError, initials,
  Card, Chip, AuditTrail, SubmissionDetailModal,
} from './approvals/shared';
import { GlobalLoader } from '../components/GlobalLoader';
import { Pagination } from '../components/Pagination';
import { DateRangeSelector, type QuickRangeMode } from '../components/DateRangeSelector';

// Matches the PM Approvals page's helper of the same name, so the two screens describe the same
// stretch of inactivity identically.
function formatInactivity(hoursSince: number | null | undefined): string {
  if (hoursSince == null) return '';
  if (hoursSince >= 24) return `${Math.floor(hoursSince / 24)}d`;
  return `${hoursSince}h`;
}

// ── entry row ─────────────────────────────────────────────────────────────────

function EntryRow({
  entry,
  expanded, onToggleExpand, onOpenDetails, highlighted, clarificationRequested,
}: {
  entry: EodEntryDto;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenDetails: () => void;
  highlighted?: boolean;
  /** True while a Team Lead has an open (NEEDS_RESPONSE/ACKNOWLEDGED) clarification round on
   *  this entry — the entry stays right here in Approvals, just flagged, rather than moving to
   *  a separate tab or list. */
  clarificationRequested?: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const total = sumHours(entry.tasks);
  const overtime = entry.isOvertime && entry.overtimeHours != null ? Number(entry.overtimeHours) : 0;
  const undertime = entry.undertimeHours != null ? Number(entry.undertimeHours) : 0;
  const projects = entryProjects(entry);
  const padding = '9px 16px';

  // Arrived here via "Team Status" on the dashboard, which links a specific pending entry —
  // scroll it into view and expand it so it's unmistakable which employee/entry was clicked.
  useEffect(() => {
    if (!highlighted) return;
    rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlighted]);

  const statusChip = entry.status === 'APPROVED'
    ? <Chip tone="ok">Approved</Chip>
    : entry.status === 'REJECTED'
      ? <Chip tone="risk">Rejected</Chip>
      : null;

  return (
    <div
      ref={rowRef}
      style={{
        borderBottom: '1px solid var(--line)',
        // A deep-linked row keeps its blue highlight — that one was clicked deliberately and must
        // stay unmistakable. The amber escalation wash is the fallback, matching the PM's page.
        background: highlighted
          ? 'color-mix(in srgb, var(--info) 12%, transparent)'
          : entry.escalated
            ? 'linear-gradient(90deg, color-mix(in srgb, var(--warn) 7%, transparent), transparent 45%)'
            : undefined,
        boxShadow: highlighted ? 'inset 3px 0 0 var(--info)' : undefined,
        transition: 'background 0.3s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
          background: 'var(--raised2)', color: 'var(--txt)', border: '1px solid var(--line2)',
        }}>
          {initials(entry.employeeName)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--txt)' }}>{entry.employeeName}</span>
            <span style={{ fontSize: 11.5, color: 'var(--txt-dim)' }}>{entry.employeeCode}</span>
            {/* The escalation is only ever computed for a SUBMITTED entry, so this can never
                appear on the Approved/Rejected tabs. It is informational, not a lock: the entry
                is still the Team Lead's to decide — see the tooltip. */}
            {entry.escalated && (
              <span title="This entry passed the review SLA, so the Project Manager can now see and act on it too. You can still approve or reject it yourself. Whoever acts first decides it.">
                <Chip tone="warn"><AlertTriangle size={11} aria-hidden="true" /> Escalated to Project Manager</Chip>
              </span>
            )}
            {clarificationRequested && (
              <span title="A clarification is open on this entry — Approve/Reject are disabled until it's resolved. Open it from EOD Inbox, or from here.">
                <Chip tone="warn"><MessageCircleQuestion size={11} aria-hidden="true" /> Clarification Requested</Chip>
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--txt-dim)', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{fmtDate(entry.entryDate)}</span>
            <span>·</span>
            <span>Submitted {formatRelative(entry.submittedAt)}</span>
            <span>·</span>
            <span>{entry.tasks.length} task{entry.tasks.length !== 1 ? 's' : ''} · {projects.length} project{projects.length !== 1 ? 's' : ''}</span>
            {entry.escalated && entry.tlInactivityHours != null && (
              <><span>·</span><span style={{ color: 'var(--warn)' }}>Awaiting your review for {formatInactivity(entry.tlInactivityHours)}</span></>
            )}
          </div>

          {/* A task-less full-day Leave still renders this box too — it's no longer clickable
              itself (see the explicit Review button below), just the task/leave summary. */}
          {(entry.tasks.length > 0 || entry.dayType === 'LEAVE') && (
            <div
              style={{ marginTop: 6, border: '1px solid var(--line)', borderRadius: 9, overflow: 'hidden', background: 'rgba(255,255,255,.02)' }}
            >
              {entry.tasks.length > 0 ? entry.tasks.map(t => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '4px 11px',
                  fontSize: 11, color: 'var(--txt-dim)',
                  borderBottom: '1px solid var(--line)',
                }}>
                  <span style={{ color: 'var(--txt)', fontWeight: 600, minWidth: 120, flexShrink: 0 }}>{t.projectCode ?? '—'}</span>
                  <span style={{ flex: 1 }}>{t.categoryName ?? '—'}</span>
                  <span style={{ color: 'var(--txt)', fontWeight: 700, minWidth: 36, textAlign: 'right', flexShrink: 0 }}>{t.hours != null ? `${hrs(Number(t.hours))}h` : '—'}</span>
                </div>
              )) : (
                <div style={{ padding: '4px 11px', fontSize: 11, color: 'var(--txt-dim)' }}>
                  Full-day leave, no tasks
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 9 }}>
            {/* "logged" not "total": this counts leave hours too, so it is not the amount worked.
                daySummary below carries the worked/OT split and replaces the old separate
                leave and OT chips, which together read as if they summed. */}
            <Chip tone="neutral">{hrs(total)}h logged</Chip>
            {statusChip}
            {daySummary(entry) && (
              <Chip tone={overtime > 0 ? 'warn' : 'neutral'} dashed={overtime === 0}>
                {daySummary(entry)}
              </Chip>
            )}
            {undertime > 0 && <Chip tone="info">Under −{hrs(undertime)}h</Chip>}
            {timeAdjustmentLabel(entry) && <Chip tone="neutral" dashed>{timeAdjustmentLabel(entry)}</Chip>}
            {entry.isResubmission && <Chip tone="neutral" dashed>Resubmitted after rejection</Chip>}
          </div>
        </div>

        {/* No Approve/Reject here by design — deciding an entry means opening it and reading the
            work first, so those actions live only in the submission detail modal, reached via
            this explicit Review button (not a whole-card click, which risked opening the modal
            on an accidental tap anywhere in the row). */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button
            onClick={onOpenDetails}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
              padding: '6px 13px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: 'var(--brand)', border: '1px solid var(--brand)', color: '#fff', cursor: 'pointer',
            }}
          >
            Review
          </button>
          <button
            onClick={onToggleExpand}
            title="View audit trail"
            style={{ background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
          >
            {expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {expanded && <AuditTrail entry={entry} />}
    </div>
  );
}

// ── main ───────────────────────────────────────────────────────────────────────

type Tab = 'pending' | 'approved' | 'rejected';
type SortMode = 'oldest' | 'latest' | 'hours' | 'name';

const PAGE_SIZE = 10;

export default function Approvals() {
  // Arriving from the Team Dashboard's "Review approvals" button carries the dashboard's
  // selected date/range as ?from=&to= so the count seen there matches what's shown here —
  // both `from` and `to` must be present to apply the filter (a partial pair is ignored).
  // With no params (direct nav via sidebar), the Pending tab shows every pending entry
  // regardless of any dashboard date filter.
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const range: PendingApprovalsRange | undefined = fromParam && toParam ? { from: fromParam, to: toParam } : undefined;

  // Same Today/Yesterday/Custom-range picker as the Team Dashboard, writing the exact ?from=&to=
  // pair it already reads above — "no params" (the default, direct-nav view) has no Today/
  // Yesterday/Range mode of its own, so it's represented as its own "All dates" label rather than
  // forcing an arbitrary default range onto a view that previously showed everything.
  const todayISO = localTodayISO();
  const yesterdayISO = localYesterdayISO();
  const dateMode: QuickRangeMode = !range ? 'range'
    : range.from === todayISO && range.to === todayISO ? 'today'
      : range.from === yesterdayISO && range.to === yesterdayISO ? 'yesterday'
        : 'range';
  const dateLabel = !range ? 'All dates'
    : dateMode === 'today' ? `Today, ${formatDateShort(todayISO)}`
      : dateMode === 'yesterday' ? `Yesterday, ${formatDateShort(range.from)}`
        : formatDateRange(range);

  function setDateRange(from: string, to: string) {
    const next = new URLSearchParams(searchParams);
    next.set('from', from);
    next.set('to', to);
    setSearchParams(next, { replace: true });
    setPage(1);
  }

  function clearDateRange() {
    const next = new URLSearchParams(searchParams);
    next.delete('from');
    next.delete('to');
    setSearchParams(next, { replace: true });
    setPage(1);
  }

  // Set by the Team Status table's "Pending" click — identifies which entry to scroll to
  // and highlight, so it's unmistakable which one was clicked.
  const highlightParam = searchParams.get('highlight');
  const highlightId = highlightParam ? Number(highlightParam) : null;

  const { data: pending, isPending: pendingLoading, isError: pendingError, refetch } = usePendingApprovals(true, range);
  const { data: approved, isPending: approvedLoading } = useDecidedApprovals('APPROVED');
  const { data: rejected, isPending: rejectedLoading } = useDecidedApprovals('REJECTED');
  const reject = useReject();
  const requestClarification = useOpenClarification();
  const { show } = useToast();

  // Entries with an open clarification stay in this list (see EodEntryRepository — no longer
  // excluded) — this just flags which rows to badge. Cheap: a Team Lead has at most a handful
  // open at once.
  const { data: openClarifications } = useEodInbox('lead', true);
  const clarifiedEntryIds = useMemo(
    () => new Set((openClarifications ?? []).map(c => c.eodEntryId)),
    [openClarifications],
  );

  const [tab, setTab] = useState<Tab>('pending');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('latest');
  const [employeeFilter, setEmployeeFilter] = useState<Set<string>>(new Set());
  const [projectFilter, setProjectFilter] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [detailsEntryId, setDetailsEntryId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  // A `?highlight=` link — the Team Status table's "Pending" click, or an "EOD submitted"
  // notification — means "go straight to this one": EntryRow's own effect scrolls/highlights the
  // row, and this opens its detail modal directly so the full task/attachment view a notification
  // promised doesn't need a second click to find and open the row by hand.
  useEffect(() => {
    if (highlightId != null) setDetailsEntryId(highlightId);
  }, [highlightId]);

  const modalApprove = useApprove();

  const isLoading = pendingLoading
    || (tab === 'approved' && approvedLoading)
    || (tab === 'rejected' && rejectedLoading);

  const baseList: EodEntryDto[] = useMemo(() => {
    if (tab === 'pending') return pending ?? [];
    if (tab === 'approved') return approved ?? [];
    return rejected ?? [];
  }, [tab, pending, approved, rejected]);

  const allProjects = useMemo(() => [...new Set(baseList.flatMap(entryProjects))].sort(), [baseList]);
  const allCategories = useMemo(() => [...new Set(baseList.flatMap(entryCategories))].sort(), [baseList]);
  // Scoped to whichever employees have entries in the current tab's already-fetched,
  // already-team-scoped list — same source Project/Category derive their options from,
  // so this never needs its own request or a separate "direct reports" lookup.
  const employeeNameByCode = useMemo(() => {
    const byCode = new Map<string, string>();
    for (const e of baseList) byCode.set(e.employeeCode, e.employeeName);
    return byCode;
  }, [baseList]);
  const allEmployeeCodes = useMemo(
    () => [...employeeNameByCode.keys()].sort((a, b) => employeeNameByCode.get(a)!.localeCompare(employeeNameByCode.get(b)!)),
    [employeeNameByCode],
  );

  const visible = useMemo(() => {
    let list = baseList;
    if (employeeFilter.size) list = list.filter(e => employeeFilter.has(e.employeeCode));
    if (projectFilter.size) list = list.filter(e => entryProjects(e).some(p => projectFilter.has(p)));
    if (categoryFilter.size) list = list.filter(e => entryCategories(e).some(c => categoryFilter.has(c)));
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(e => e.employeeName.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q));

    const sorted = [...list];
    if (sort === 'hours') sorted.sort((a, b) => sumHours(b.tasks) - sumHours(a.tasks));
    else if (sort === 'name') sorted.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    else if (sort === 'latest') sorted.sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));
    else sorted.sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));
    return sorted;
  }, [baseList, employeeFilter, projectFilter, categoryFilter, search, sort]);

  // Looked up from baseList (not `visible`) so the modal survives a filter change while open.
  const detailsEntry = baseList.find(e => e.id === detailsEntryId) ?? null;

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = visible.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  async function handleDetailApprove(entryId: number) {
    try {
      await modalApprove.mutateAsync({ entryId });
      show('Entry approved. Utilization recomputed.', 'success');
      setDetailsEntryId(null);
    } catch (err) {
      show(extractError(err), 'error');
    }
  }

  // Rejected in place from the detail modal, which supplies the reason — no separate dialog.
  // Every decision is made on one opened entry, so there is no cross-entry path needing its own.
  async function handleDetailReject(entryId: number, reason: string) {
    if (!reason) return;
    try {
      await reject.mutateAsync({ entryId, comment: reason });
      show('Entry rejected.', 'success');
      setDetailsEntryId(null);
    } catch (err) {
      show(extractError(err), 'error');
    }
  }

  // Opens an empty clarification round with no reason prompt — same open-then-navigate pattern
  // as jumping to a Blocker's conversation — then sends the TL straight to EOD Inbox with this
  // entry's thread open, where they type the actual question as the first message.
  async function handleRequestClarification(entryId: number) {
    try {
      await requestClarification.mutateAsync({ entryId });
      setDetailsEntryId(null);
      navigate(`/team/eod-inbox?highlight=${entryId}`);
    } catch (err) {
      show(extractError(err), 'error');
    }
  }

  const pendingCount = pending?.length ?? 0;
  const approvedCount = approved?.length ?? 0;
  const rejectedCount = rejected?.length ?? 0;

  function toggleFilterVal(set: Set<string>, setFn: (s: Set<string>) => void, val: string) {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    setFn(next);
  }

  const hasActiveFilters = employeeFilter.size > 0 || projectFilter.size > 0 || categoryFilter.size > 0;

  function clearAllFilters() {
    setEmployeeFilter(new Set());
    setProjectFilter(new Set());
    setCategoryFilter(new Set());
  }

  function toggleExpand(id: number) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  }

  function switchTab(t: Tab) {
    setTab(t);
    setPage(1);
  }

  if (pendingError) {
    return (
      <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load pending entries.</div>
        <button onClick={() => refetch()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}>
          <RefreshCw size={14} aria-hidden="true" /> Retry
        </button>
      </Card>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            Approvals
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>Review and act on your team's EOD submissions</p>
        </div>
        {/* Date filter only ever affects the Pending query (see usePendingApprovals above) —
            Approved/Rejected have no date param to filter by, so the picker stays hidden there
            rather than showing a control that would silently do nothing. */}
        {tab === 'pending' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DateRangeSelector
              mode={dateMode} range={range ?? { from: todayISO, to: todayISO }} todayISO={todayISO}
              label={dateLabel} onSelectQuick={kind => setDateRange(kind === 'today' ? todayISO : yesterdayISO, kind === 'today' ? todayISO : yesterdayISO)}
              onApplyRange={setDateRange}
            />
            {range && (
              <button
                type="button"
                onClick={clearDateRange}
                aria-label="Clear date filter"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '9px 12px',
                  background: 'transparent', border: '1px solid var(--line2)', borderRadius: 8,
                  color: 'var(--txt-mut)', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--txt)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--txt-mut)'; }}
              >
                <X size={13} aria-hidden="true" /> Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {([
          ['pending', 'Pending', pendingCount],
          ['approved', 'Approved', approvedCount],
          ['rejected', 'Rejected', rejectedCount],
        ] as [Tab, string, number][]).map(([key, label, count]) => (
          <button key={key} onClick={() => switchTab(key)} style={{
            padding: '8px 15px', borderRadius: 20, border: `1px solid ${tab === key ? 'var(--brand)' : 'var(--line2)'}`,
            background: tab === key ? 'var(--brand)' : 'var(--raised2)', color: tab === key ? '#fff' : 'var(--txt-dim)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
          }}>
            {label}
            <span style={{ background: tab === key ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.1)', padding: '1px 7px', borderRadius: 20, fontSize: 11.5 }}>{count}</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="nf-r-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', marginBottom: 14 }}>
        <div style={{ width: 220, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 12px', marginRight: 14 }}>
          <Search size={13} style={{ color: 'var(--txt-dim)' }} aria-hidden="true" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employee…"
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--txt)', fontSize: 12.5, width: '100%' }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              style={{ background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', flexShrink: 0 }}
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <FilterDropdown
            label="Employee"
            options={allEmployeeCodes}
            selected={employeeFilter}
            onToggle={v => toggleFilterVal(employeeFilter, setEmployeeFilter, v)}
            onClear={() => setEmployeeFilter(new Set())}
            getLabel={code => employeeNameByCode.get(code) ?? code}
          />
          <FilterDropdown label="Project" options={allProjects} selected={projectFilter} onToggle={v => toggleFilterVal(projectFilter, setProjectFilter, v)} onClear={() => setProjectFilter(new Set())} />
          <FilterDropdown label="Category" options={allCategories} selected={categoryFilter} onToggle={v => toggleFilterVal(categoryFilter, setCategoryFilter, v)} onClear={() => setCategoryFilter(new Set())} />
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              style={{ background: 'none', border: '1px solid var(--line2)', borderRadius: 8, color: 'var(--brand-bright)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '7px 12px' }}
            >
              Clear all filters
            </button>
          )}
        </div>
        <select value={sort} onChange={e => setSort(e.target.value as SortMode)} style={{ background: 'var(--raised2)', color: 'var(--txt)', border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }}>
          <option value="latest">Sort: Latest first</option>
          <option value="oldest">Sort: Oldest first</option>
          <option value="hours">Sort: Most hours</option>
          <option value="name">Sort: Employee A–Z</option>
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <Card>
          <GlobalLoader fullScreen={false} compact label="Loading approvals..." />
        </Card>
      ) : visible.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '48px 20px' }}>
          <CheckCheck size={28} style={{ color: 'var(--ok)', marginBottom: 12 }} aria-hidden="true" />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--txt)', marginBottom: 6 }}>
            {tab === 'pending' && "You're all caught up"}
            {tab === 'approved' && 'No approved entries yet'}
            {tab === 'rejected' && 'No rejected entries'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--txt-dim)' }}>
            {tab === 'pending' && 'No pending entries match your current filters.'}
            {tab === 'approved' && 'Entries you approve will appear here.'}
            {tab === 'rejected' && 'Entries you reject will appear here with the reason given.'}
          </div>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {paged.map(entry => (
            <EntryRow
              key={entry.id}
              entry={entry}
              expanded={expanded.has(entry.id)}
              onToggleExpand={() => toggleExpand(entry.id)}
              onOpenDetails={() => setDetailsEntryId(entry.id)}
              highlighted={highlightId != null && entry.id === highlightId}
              clarificationRequested={clarifiedEntryIds.has(entry.id)}
            />
          ))}
          <Pagination
            page={pageSafe} totalPages={totalPages} totalItems={visible.length} pageSize={PAGE_SIZE}
            onPageChange={setPage} itemLabel="entries"
          />
        </Card>
      )}

      <SubmissionDetailModal
        entry={detailsEntry}
        onClose={() => setDetailsEntryId(null)}
        onApprove={handleDetailApprove}
        onReject={handleDetailReject}
        approveBusy={modalApprove.isPending}
        rejectBusy={reject.isPending}
        onRequestClarification={handleRequestClarification}
        clarifyBusy={requestClarification.isPending}
      />
    </div>
  );
}
