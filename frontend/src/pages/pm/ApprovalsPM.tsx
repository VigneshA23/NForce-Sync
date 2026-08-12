import { useMemo, useState } from 'react';
import {
  ChevronDown, ChevronRight, Check, X, CheckCheck, RefreshCw,
  Search, AlertTriangle, Users,
} from 'lucide-react';
import {
  usePendingApprovals, useDecidedApprovals,
  useApprove, useReject, useBatchApprove,
} from '../../api/approvals';
import { Modal } from '../../components/Modal';
import { FilterDropdown, toggleFilterVal } from '../../components/FilterDropdown';
import { useToast } from '../../lib/toast';
import type { EodEntryDto } from '../../api/eod';
import {
  sumHours, hrs, entryProjects, entryCategories,
  daySummary, timeAdjustmentLabel, formatRelative, extractError, initials,
  Skel, Card, Btn, Chip, AuditTrail, SubmissionDetailModal,
} from '../approvals/shared';

// This page deliberately shares its billable-gate logic and submission detail modal with the
// Team Lead's Approvals page (../Approvals.tsx) via ../approvals/shared — see that module's
// header comment. What's PM-specific and stays local: Team-Lead grouping, the Escalated
// tab/banner/chip, and the "who decided" caption (a PM oversees every team on their projects,
// not just entries they personally acted on — see EodEntryRepository.findByProjectManagerIdAndStatus).

function formatInactivity(hoursSince: number | null | undefined): string {
  if (hoursSince == null) return '';
  if (hoursSince >= 24) return `${Math.floor(hoursSince / 24)}d`;
  return `${hoursSince}h`;
}

/** "Team Lead" / "Project Manager" / "Super Admin" from the backend's AppUser.Role literal. */
function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'TL':         return 'Team Lead';
    case 'PM':         return 'Project Manager';
    case 'SUPERADMIN': return 'Super Admin';
    default:           return role ?? '';
  }
}

function groupByTL(entries: EodEntryDto[]): Map<string, EodEntryDto[]> {
  const map = new Map<string, EodEntryDto[]>();
  for (const e of entries) {
    const key = e.tlName ?? 'No Team Lead assigned';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return map;
}

// ── entry row ─────────────────────────────────────────────────────────────────

function EntryRow({
  entry, actionable, checked, onToggleCheck,
  expanded, onToggleExpand, onOpenDetails,
}: {
  entry: EodEntryDto;
  actionable: boolean;
  checked: boolean;
  onToggleCheck: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenDetails: () => void;
}) {
  const total = sumHours(entry.tasks);
  const overtime = entry.isOvertime && entry.overtimeHours != null ? Number(entry.overtimeHours) : 0;
  const undertime = entry.undertimeHours != null ? Number(entry.undertimeHours) : 0;
  const projects = entryProjects(entry);
  const padding = '9px 16px';

  const statusChip = entry.status === 'APPROVED'
    ? <Chip tone="ok">Approved</Chip>
    : entry.status === 'REJECTED'
      ? <Chip tone="risk">Rejected</Chip>
      : null;

  // Who currently stands where on this entry — awaiting the TL while still pending (unless
  // already escalated, whose chip already covers this), or who actually decided it once it's
  // resolved (may be the TL or a PM — see EodEntryEnrichment.decidedByName/decidedByRole).
  const tlStatusNote = entry.status === 'SUBMITTED'
    ? (!entry.escalated && entry.tlName ? `Awaiting ${entry.tlName}` : null)
    : (entry.decidedByName ? `${entry.status === 'APPROVED' ? 'Approved' : 'Rejected'} by ${entry.decidedByName} (${roleLabel(entry.decidedByRole)})` : null);


  return (
    <div style={{ borderBottom: '1px solid var(--line)', background: entry.escalated ? 'linear-gradient(90deg, color-mix(in srgb, var(--warn) 7%, transparent), transparent 45%)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding }}>
        {actionable && (
          <div style={{ marginTop: 2 }}>
            <input type="checkbox" checked={checked} onChange={onToggleCheck} style={{ width: 15, height: 15, accentColor: 'var(--brand-bright)', cursor: 'pointer' }} />
          </div>
        )}
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
            <span style={{ fontSize: 11.5, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>{entry.employeeCode}</span>
            {entry.escalated && (
              <span title={entry.tlName ? `${entry.tlName} hasn't reviewed since this was submitted.` : 'No Team Lead assigned.'}>
                <Chip tone="warn"><AlertTriangle size={11} aria-hidden="true" /> Escalated · Team Lead inactive {formatInactivity(entry.tlInactivityHours)}</Chip>
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--txt-dim)', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{new Date(entry.entryDate).toLocaleDateString()}</span>
            <span>·</span>
            <span>Submitted {formatRelative(entry.submittedAt)}</span>
            <span>·</span>
            <span>{entry.tasks.length} task{entry.tasks.length !== 1 ? 's' : ''} · {projects.length} project{projects.length !== 1 ? 's' : ''}</span>
            {tlStatusNote && (<><span>·</span><span>{tlStatusNote}</span></>)}
          </div>

          {entry.tasks.length > 0 && (
            <div
              onClick={onOpenDetails}
              title="View submission details"
              style={{ marginTop: 6, border: '1px solid var(--line)', borderRadius: 9, overflow: 'hidden', background: 'rgba(255,255,255,.02)', cursor: 'pointer' }}
            >
              {entry.tasks.map(t => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '4px 11px',
                  fontSize: 11, color: 'var(--txt-dim)',
                  borderBottom: '1px solid var(--line)',
                }}>
                  <span style={{ color: 'var(--txt)', fontWeight: 600, minWidth: 120, flexShrink: 0 }}>{t.projectCode ?? '—'}</span>
                  <span style={{ flex: 1 }}>{t.categoryName ?? '—'}</span>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.isBillable ? 'var(--ok)' : 'transparent', border: t.isBillable ? 'none' : '1.5px solid var(--txt-dim)', flexShrink: 0 }} title={t.isBillable ? 'Billable' : 'Non-billable'} />
                  <span style={{ color: 'var(--txt)', fontWeight: 700, minWidth: 36, textAlign: 'right', flexShrink: 0 }}>{t.hours != null ? `${hrs(Number(t.hours))}h` : '—'}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 9 }}>
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
            work first, so those actions live only in the submission detail modal. */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button
            onClick={onToggleExpand}
            title="View audit trail"
            style={{ background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
          >
            {expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {expanded && (
        <AuditTrail
          entry={entry}
          extraEntries={entry.escalated ? (
            <li style={{ position: 'relative', padding: '0 0 0 16px', fontSize: 12.5, color: 'var(--txt-mut)' }}>
              <span style={{ position: 'absolute', left: -5, top: 3, width: 8, height: 8, borderRadius: '50%', background: 'var(--warn)', border: '2px solid var(--raised)' }} />
              <b style={{ color: 'var(--warn)' }}>Escalated to you</b>
              <span style={{ display: 'block', color: 'var(--txt-dim)', fontSize: 11 }}>
                {entry.tlName ? `${entry.tlName} hasn't acted in ${formatInactivity(entry.tlInactivityHours)}` : 'No Team Lead assigned'}
              </span>
            </li>
          ) : undefined}
        />
      )}
    </div>
  );
}

// ── main ───────────────────────────────────────────────────────────────────────

type Tab = 'pending' | 'escalated' | 'approved' | 'rejected';
type SortMode = 'oldest' | 'latest' | 'hours' | 'name';

export default function ApprovalsPM() {
  const { data: pending, isPending: pendingLoading, isError: pendingError, refetch } = usePendingApprovals();
  const { data: approved, isPending: approvedLoading } = useDecidedApprovals('APPROVED');
  const { data: rejected, isPending: rejectedLoading } = useDecidedApprovals('REJECTED');
  const batchApprove = useBatchApprove();
  const reject = useReject();
  const { show } = useToast();

  const [tab, setTab] = useState<Tab>('pending');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('oldest');
  const [employeeFilter, setEmployeeFilter] = useState<Set<string>>(new Set());
  const [projectFilter, setProjectFilter] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [rejectTarget, setRejectTarget] = useState<'bulk' | number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [detailsEntryId, setDetailsEntryId] = useState<number | null>(null);

  const modalApprove = useApprove();

  const isLoading = pendingLoading
    || (tab === 'approved' && approvedLoading)
    || (tab === 'rejected' && rejectedLoading);

  const baseList: EodEntryDto[] = useMemo(() => {
    if (tab === 'pending') return pending ?? [];
    if (tab === 'escalated') return (pending ?? []).filter(e => e.escalated);
    if (tab === 'approved') return approved ?? [];
    return rejected ?? [];
  }, [tab, pending, approved, rejected]);

  const allProjects = useMemo(() => [...new Set(baseList.flatMap(entryProjects))].sort(), [baseList]);
  const allCategories = useMemo(() => [...new Set(baseList.flatMap(entryCategories))].sort(), [baseList]);
  // Now spans every team touching a PM-owned project, so an Employee filter is worth having —
  // scoped to whichever employees have entries in the current tab's already-fetched list, same
  // as Project/Category derive their options from.
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

  const grouped = useMemo(() => groupByTL(visible), [visible]);
  const actionable = tab === 'pending' || tab === 'escalated';

  const detailsEntry = baseList.find(e => e.id === detailsEntryId) ?? null;

  async function handleDetailApprove(entryId: number) {
    try {
      await modalApprove.mutateAsync({ entryId });
      show('Entry approved. Utilization recomputed.', 'success');
      setDetailsEntryId(null);
    } catch (err) {
      show(extractError(err), 'error');
    }
  }

  // Rejected in place from the detail modal, which supplies the reason — no separate dialog. The
  // bulk path below still uses one, since it spans entries and has no single entry to sit under.
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

  const pendingCount = pending?.length ?? 0;
  const escalatedCount = (pending ?? []).filter(e => e.escalated).length;
  const approvedCount = approved?.length ?? 0;
  const rejectedCount = rejected?.length ?? 0;

  const hasActiveFilters = employeeFilter.size > 0 || projectFilter.size > 0 || categoryFilter.size > 0;

  function clearAllFilters() {
    setEmployeeFilter(new Set());
    setProjectFilter(new Set());
    setCategoryFilter(new Set());
  }

  function toggleCheck(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  function toggleExpand(id: number) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  }

  function switchTab(t: Tab) {
    setTab(t);
    setSelected(new Set());
  }

  async function approveIds(ids: number[]) {
    if (ids.length === 0) return;
    try {
      const result = await batchApprove.mutateAsync(ids);
      // The backend silently skips entries not fully billable-decided (or no longer SUBMITTED),
      // so the response can be shorter than the request — report what actually happened.
      const approvedCount = result.length;
      const skipped = ids.length - approvedCount;
      show(
        `${approvedCount} entr${approvedCount !== 1 ? 'ies' : 'y'} approved.`
          + (skipped > 0 ? ` ${skipped} skipped (billable not yet decided).` : ' Utilization recomputed.'),
        'success',
      );
      setSelected(new Set());
    } catch (err) {
      show(extractError(err), 'error');
    }
  }

  async function confirmRejectSubmit() {
    const reason = rejectReason.trim();
    if (!reason) return;
    const ids = rejectTarget === 'bulk' ? [...selected] : rejectTarget != null ? [rejectTarget] : [];
    if (ids.length === 0) return;
    const results = await Promise.allSettled(ids.map(id => reject.mutateAsync({ entryId: id, comment: reason })));
    const failed = results.filter(r => r.status === 'rejected').length;
    const succeeded = ids.length - failed;
    if (failed === 0) show(`${succeeded} entr${succeeded !== 1 ? 'ies' : 'y'} rejected.`, 'success');
    else show(`${succeeded} of ${ids.length} rejected, ${failed} failed — please retry the rest.`, 'error');
    setSelected(new Set());
    setRejectTarget(null);
    setRejectReason('');
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
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            Approvals
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>Review and act on your projects' EOD submissions — across every team touching them</p>
        </div>
      </div>

      {/* Escalation banner */}
      {escalatedCount > 0 && tab !== 'escalated' && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
          background: 'color-mix(in srgb, var(--warn) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--warn) 40%, transparent)',
          borderRadius: 12, padding: '13px 18px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertTriangle size={18} style={{ color: 'var(--warn)' }} aria-hidden="true" />
            <div style={{ fontSize: 13, color: 'var(--txt)' }}>
              <strong>{escalatedCount} entr{escalatedCount !== 1 ? 'ies' : 'y'}</strong> need your review — assigned Team Lead hasn't responded within SLA.
            </div>
          </div>
          <Btn variant="warn" onClick={() => switchTab('escalated')}>Review now →</Btn>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {([
          ['pending', 'Pending', pendingCount],
          ['escalated', '⚠ Escalated', escalatedCount],
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', marginBottom: 14 }}>
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
          <option value="oldest">Sort: Oldest first</option>
          <option value="latest">Sort: Latest first</option>
          <option value="hours">Sort: Most hours</option>
          <option value="name">Sort: Employee A–Z</option>
        </select>
      </div>

      {/* Bulk bar */}
      {actionable && selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          background: 'var(--raised)', border: '1px solid rgba(177,17,22,.4)', borderRadius: 12,
          padding: '10px 16px', marginBottom: 14, position: 'sticky', top: 10, zIndex: 15,
        }}>
          <span style={{ fontSize: 13, color: 'var(--txt)' }}>{selected.size} selected</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={() => setSelected(new Set())}>Clear</Btn>
            <Btn variant="danger" onClick={() => { setRejectTarget('bulk'); setRejectReason(''); }}><X size={12} aria-hidden="true" /> Reject selected</Btn>
            <Btn variant="success" onClick={() => approveIds([...selected])} disabled={batchApprove.isPending}><Check size={12} aria-hidden="true" /> Approve selected</Btn>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <Card>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ padding: 16, borderBottom: '1px solid var(--line)', display: 'flex', gap: 12 }}>
              <Skel h={14} w="30%" /><Skel h={14} w="20%" /><Skel h={14} w="15%" />
            </div>
          ))}
        </Card>
      ) : visible.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '48px 20px' }}>
          <CheckCheck size={28} style={{ color: 'var(--ok)', marginBottom: 12 }} aria-hidden="true" />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--txt)', marginBottom: 6 }}>
            {tab === 'pending' && "You're all caught up"}
            {tab === 'escalated' && 'No escalated entries'}
            {tab === 'approved' && 'No approved entries yet'}
            {tab === 'rejected' && 'No rejected entries'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--txt-dim)' }}>
            {tab === 'pending' && 'No pending entries match your current filters.'}
            {tab === 'escalated' && 'All Team Leads are current — nothing has breached SLA.'}
            {tab === 'approved' && 'Entries you or a Team Lead approve will appear here.'}
            {tab === 'rejected' && 'Entries you or a Team Lead reject will appear here with the reason given.'}
          </div>
        </Card>
      ) : (
        <>
          {[...grouped.entries()].map(([tlName, rows]) => {
            const escInGroup = rows.filter(e => e.escalated).length;
            return (
              <Card key={tlName} style={{ marginBottom: 14, padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', background: 'var(--raised)', borderBottom: '1px solid var(--line)' }}>
                  <Users size={14} style={{ color: 'var(--txt-dim)' }} aria-hidden="true" />
                  <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--txt)' }}>{tlName}</span>
                  <span style={{ color: 'var(--txt-dim)', fontSize: 12 }}>{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</span>
                  {escInGroup > 0 && <span style={{ marginLeft: 'auto' }}><Chip tone="warn">⚠ {escInGroup} escalated</Chip></span>}
                </div>
                {rows.map(entry => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    actionable={actionable}
                    checked={selected.has(entry.id)}
                    onToggleCheck={() => toggleCheck(entry.id)}
                    expanded={expanded.has(entry.id)}
                    onToggleExpand={() => toggleExpand(entry.id)}
                    onOpenDetails={() => setDetailsEntryId(entry.id)}
                  />
                ))}
              </Card>
            );
          })}
        </>
      )}

      {/* Reject modal */}
      <Modal
        open={rejectTarget != null}
        title="Reject entry"
        onClose={() => setRejectTarget(null)}
        footer={
          <>
            <Btn onClick={() => setRejectTarget(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={confirmRejectSubmit} disabled={!rejectReason.trim() || reject.isPending}>
              {reject.isPending ? 'Rejecting…' : 'Confirm reject'}
            </Btn>
          </>
        }
      >
        <p style={{ margin: '0 0 12px', color: 'var(--txt-mut)', fontSize: 12.5 }}>This reason is shared with the employee.</p>
        <textarea
          rows={4}
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
          placeholder="e.g. Missing task description for the overtime hours logged"
          style={{ width: '100%', resize: 'vertical', padding: 10, background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 8, color: 'var(--txt)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
        />
      </Modal>

      <SubmissionDetailModal
        entry={detailsEntry}
        onClose={() => setDetailsEntryId(null)}
        onApprove={handleDetailApprove}
        onReject={handleDetailReject}
        approveBusy={modalApprove.isPending}
        rejectBusy={reject.isPending}
      />
    </div>
  );
}
