import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FileText, Shield, Info, RefreshCw, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, ChevronsUpDown, X,
  ListChecks, PlusCircle, PencilLine, Trash2, PowerCircle, PauseCircle, MoreHorizontal,
} from 'lucide-react';
import { Card, KpiCard } from '../../components/KpiCard';
import { Avatar, avatarColor } from '../../components/BlockerThread';
import { DatePicker } from '../../components/DatePicker';
import { listAuditLog, getAuditSummary } from '../../api/admin';
import type { AuditLogDto, AuditFilters } from '../../api/admin';
import {
  formatAuditDate, auditActionDisplay, describeAuditEvent, entityTypeMeta,
  roleLabel, AUDIT_ACTION_OPTIONS, AUDIT_CATEGORY_LABELS,
} from '../../lib/auditLog';
import { GlobalLoader } from '../../components/GlobalLoader';

// The 3 entity types the backend actually writes today — see writeAudit call sites in
// UserService/ApprovalService/BusinessRuleService.
const ENTITY_TYPES = ['APP_USER', 'EOD_ENTRY', 'BUSINESS_RULE'];
const PAGE_SIZE = 25;

type DateRangePreset = '' | '7' | '30' | '90' | 'custom';

interface DraftFilters {
  entityType: string;
  actionKey: string;
  actorName: string;
  rangePreset: DateRangePreset;
  customFrom: string; // yyyy-MM-dd
  customTo: string;   // yyyy-MM-dd
  /** Set only when arriving via a deep link that already carries a precise ISO instant (e.g. the
   *  admin dashboard's "View all N →" link, which passes an exact now-minus-24h timestamp) —
   *  resolveFilters uses this exact value instead of reconstructing a day-boundary one from
   *  customFrom, so the count shown here matches what the dashboard showed. */
  rawFrom?: string;
}

const EMPTY_DRAFT: DraftFilters = { entityType: '', actionKey: '', actorName: '', rangePreset: '', customFrom: '', customTo: '' };

/** Turns a draft filter set into the actual query params the backend understands — resolves the
 *  Action dropdown's key into {action, afterStatus} (see AUDIT_ACTION_OPTIONS) and a date-range
 *  preset into concrete from/to instants. */
function resolveFilters(draft: DraftFilters): Pick<AuditFilters, 'entityType' | 'action' | 'afterStatus' | 'actorName' | 'from' | 'to'> {
  const option = AUDIT_ACTION_OPTIONS.find(o => o.key === draft.actionKey);
  let from: string | undefined;
  let to: string | undefined;
  if (draft.rawFrom) {
    from = draft.rawFrom;
  } else if (draft.rangePreset === 'custom') {
    from = draft.customFrom ? `${draft.customFrom}T00:00:00Z` : undefined;
    to = draft.customTo ? `${draft.customTo}T23:59:59Z` : undefined;
  } else if (draft.rangePreset) {
    const days = Number(draft.rangePreset);
    const since = new Date();
    since.setDate(since.getDate() - days);
    from = since.toISOString();
  }
  return {
    entityType: draft.entityType || undefined,
    action: option?.action,
    afterStatus: option?.afterStatus,
    actorName: draft.actorName.trim() || undefined,
    from,
    to,
  };
}

function EntityCell({ entityType }: { entityType: string }) {
  const meta = entityTypeMeta(entityType);
  const Icon = meta.icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--txt)' }}>
      <Icon size={13} aria-hidden="true" style={{ color: 'var(--txt-dim)', flexShrink: 0 }} /> {meta.label}
    </span>
  );
}

function ActionPill({ entry }: { entry: AuditLogDto }) {
  const { label, bg, color } = auditActionDisplay(entry);
  return (
    <span style={{
      display: 'inline-block', fontSize: 10.5, fontWeight: 600,
      padding: '3px 9px', borderRadius: 20,
      background: bg, color,
      letterSpacing: '0.03em', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function ActorCell({ entry }: { entry: AuditLogDto }) {
  const name = entry.actorName ?? 'System';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <Avatar name={name} bg={avatarColor(name)} size={26} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: 'var(--txt)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        {entry.actorRole && (
          <div style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>{roleLabel(entry.actorRole)}</div>
        )}
      </div>
    </div>
  );
}

// ── Before/After — a collapsible key/value comparison. Only changed fields matter for Update
// (the raw JSON already only carries the changed slice for most write paths); Create shows the
// full field set with an empty Before side; Delete shows an empty After side.
function ValueColumn({ label, raw, emptyNote }: { label: string; raw: string | null; emptyNote: string }) {
  let entries: [string, unknown][] | null = null;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        entries = Object.entries(parsed as Record<string, unknown>).filter(([k]) => k !== 'id' && k !== 'status');
      }
    } catch { /* fall through to raw text below */ }
  }

  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--txt-dim)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {!raw ? (
        <div style={{ fontSize: 11.5, color: 'var(--txt-dim)', fontStyle: 'italic' }}>{emptyNote}</div>
      ) : entries ? (
        <div style={{ display: 'grid', gap: 6 }}>
          {entries.map(([k, v]) => (
            <div key={k} style={{ background: 'var(--shell)', border: '1px solid var(--line)', borderRadius: 6, padding: '6px 8px' }}>
              <div style={{ fontSize: 10, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>{k}</div>
              <div style={{ fontSize: 11.5, color: 'var(--txt-mut)', wordBreak: 'break-word' }}>{String(v ?? '—')}</div>
            </div>
          ))}
        </div>
      ) : (
        <pre style={{ fontSize: 11, color: 'var(--txt-mut)', background: 'var(--shell)', padding: '8px', borderRadius: 6, border: '1px solid var(--line)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{raw}</pre>
      )}
    </div>
  );
}

function CollapsibleSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginTop: 14 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          fontSize: 12, fontWeight: 700, color: 'var(--txt)', textTransform: 'uppercase', letterSpacing: '0.04em',
        }}
        aria-expanded={open}
      >
        {title}
        {open ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: 'var(--txt)' }}>{value}</div>
    </div>
  );
}

function DetailDrawer({ entry, onClose }: { entry: AuditLogDto; onClose: () => void }) {
  const { label, bg, color } = auditActionDisplay(entry);
  const meta = entityTypeMeta(entry.entityType);
  const display = describeAuditEvent(entry);
  const actorName = entry.actorName ?? 'System';

  return (
    <div style={{ position: 'sticky', top: 72 }}>
      <Card style={{ padding: 0, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 88px)', overflow: 'hidden', width: 320 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: bg, color, letterSpacing: '0.03em' }}>
            {label}
          </span>
          <button onClick={onClose} aria-label="Close detail" style={{ background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', display: 'flex', padding: 2 }}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div style={{ padding: '14px 18px 18px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)', marginBottom: 2 }}>{meta.label}</div>
          <div style={{ fontSize: 11.5, color: 'var(--txt-dim)', marginBottom: 14 }}>{formatAuditDate(entry.occurredAt)}</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '10px 12px', background: 'var(--shell)', border: '1px solid var(--line)', borderRadius: 8 }}>
            <Avatar name={actorName} bg={avatarColor(actorName)} size={30} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--txt)' }}>{actorName}</div>
              {entry.actorRole && <div style={{ fontSize: 11, color: 'var(--txt-dim)' }}>{roleLabel(entry.actorRole)}</div>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
            <DetailField label="Entity ID" value={entry.entityId ?? '—'} />
            <DetailField label="Entity Type" value={meta.label} />
            <DetailField label="Action" value={label} />
          </div>
          <div style={{ marginTop: 10 }}>
            <DetailField label="Details" value={display.message} />
          </div>

          <CollapsibleSection title="Before & After Values">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <ValueColumn label="Before" raw={entry.beforeValue} emptyNote="— (No previous data)" />
              <ValueColumn label="After" raw={entry.afterValue} emptyNote="— (record removed)" />
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Related Information" defaultOpen={false}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
              <DetailField label="Module" value={AUDIT_CATEGORY_LABELS[display.category]} />
              <DetailField label="Reference" value={`${entry.entityType} #${entry.entityId ?? '—'}`} />
              <DetailField label="Created By" value={actorName} />
              <DetailField label="Created At" value={formatAuditDate(entry.occurredAt)} />
            </div>
          </CollapsibleSection>
        </div>

        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--line)', flexShrink: 0, fontSize: 10.5, color: 'var(--txt-dim)' }}>
          This record is read-only and cannot be edited or deleted.
        </div>
      </Card>
    </div>
  );
}

export default function AuditLog() {
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<'asc' | 'desc'>('desc');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);

  // Seeds the date-range preset when arriving via the dashboard's "View all N →" link, so the
  // count shown there matches what's displayed here on first load.
  const [draft, setDraft] = useState<DraftFilters>(() => {
    const from = searchParams.get('from');
    return from ? { ...EMPTY_DRAFT, rangePreset: 'custom', customFrom: from.slice(0, 10), rawFrom: from } : EMPTY_DRAFT;
  });
  const [applied, setApplied] = useState<DraftFilters>(draft);

  const resolvedApplied = useMemo(() => resolveFilters(applied), [applied]);
  const listFilters: AuditFilters = { ...resolvedApplied, page, size: PAGE_SIZE, sort };

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['admin', 'audit', listFilters],
    queryFn: () => listAuditLog(listFilters),
    placeholderData: (prev) => prev,
  });

  const { data: summary } = useQuery({
    queryKey: ['admin', 'audit-summary', resolvedApplied],
    queryFn: () => getAuditSummary(resolvedApplied),
  });

  const selectedEntry = data?.content.find(e => e.id === selectedId) ?? null;

  function applyFilters() {
    setApplied(draft);
    setPage(0);
  }

  function clearFilters() {
    setDraft(EMPTY_DRAFT);
    setApplied(EMPTY_DRAFT);
    setPage(0);
  }

  function selectRow(entry: AuditLogDto) {
    setSelectedId(id => (id === entry.id ? null : entry.id));
  }

  const kpis: { key: string; label: string; value: number; accent: string; icon: React.ReactNode }[] = summary ? [
    { key: 'total',      label: 'Total Logs',  value: summary.total,      accent: 'var(--txt)', icon: <ListChecks size={17} aria-hidden="true" /> },
    { key: 'create',     label: 'Create',      value: summary.create,     accent: '#2FB67C',    icon: <PlusCircle size={17} aria-hidden="true" /> },
    { key: 'update',     label: 'Update',      value: summary.update,     accent: '#4C8DD6',    icon: <PencilLine size={17} aria-hidden="true" /> },
    { key: 'delete',     label: 'Delete',      value: summary.delete,     accent: '#E4373D',    icon: <Trash2 size={17} aria-hidden="true" /> },
    { key: 'activate',   label: 'Activate',    value: summary.activate,   accent: '#2FB67C',    icon: <PowerCircle size={17} aria-hidden="true" /> },
    { key: 'deactivate', label: 'Deactivate',  value: summary.deactivate, accent: '#E0A93B',    icon: <PauseCircle size={17} aria-hidden="true" /> },
    { key: 'other',      label: 'Other',       value: summary.other,      accent: '#9B6DFF',    icon: <MoreHorizontal size={17} aria-hidden="true" /> },
  ] : [];

  const showingFrom = data && data.totalElements > 0 ? data.number * data.size + 1 : 0;
  const showingTo = data ? Math.min((data.number + 1) * data.size, data.totalElements) : 0;

  // Windowed page numbers — up to 5 around the current page, always showing first/last.
  const pageNumbers = useMemo(() => {
    if (!data || data.totalPages <= 1) return [];
    const total = data.totalPages;
    const current = data.number;
    const window = 2;
    const nums = new Set<number>([0, total - 1]);
    for (let i = current - window; i <= current + window; i++) if (i >= 0 && i < total) nums.add(i);
    return [...nums].sort((a, b) => a - b);
  }, [data]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selectedEntry ? '1fr 320px' : '1fr', gap: 16, alignItems: 'start' }}>
      <div style={{ minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, background: 'rgba(99,102,241,.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <FileText size={19} style={{ color: '#818CF8' }} aria-hidden="true" />
            </div>
            <div>
              <h1 style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
                Audit Log
              </h1>
              <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0, maxWidth: 520 }}>
                Track and monitor system activities for compliance, troubleshooting and accountability.
              </p>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
              background: 'rgba(224,169,59,.08)', border: '1px solid rgba(224,169,59,.25)', borderRadius: 8,
              fontSize: 11.5, color: 'var(--txt-mut)', maxWidth: 360,
            }}>
              <Shield size={14} style={{ color: '#E0A93B', flexShrink: 0 }} aria-hidden="true" />
              <span>Audit logs are restricted to authorized roles only and cannot be edited or deleted.</span>
              <button
                onMouseEnter={() => setNoticeOpen(true)}
                onMouseLeave={() => setNoticeOpen(false)}
                onClick={() => setNoticeOpen(o => !o)}
                aria-label="More detail"
                style={{ background: 'none', border: 'none', padding: 0, display: 'flex', color: 'var(--txt-dim)', cursor: 'pointer', flexShrink: 0 }}
              >
                <Info size={13} aria-hidden="true" />
              </button>
            </div>
            {noticeOpen && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 6, width: 280, zIndex: 10,
                background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8,
                padding: '10px 12px', fontSize: 11.5, color: 'var(--txt-mut)', boxShadow: '0 8px 24px rgba(0,0,0,.3)',
              }}>
                Only Admin accounts can view this page. Every record is written automatically when a
                tracked action occurs and is append-only — there is no update or delete endpoint for
                audit entries, by design, to preserve their integrity for compliance review.
              </div>
            )}
          </div>
        </div>

        {/* KPI strip */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, marginBottom: 16 }}>
            {kpis.map(k => (
              <KpiCard key={k.key} icon={k.icon} label={k.label} value={k.value} accent={k.accent} />
            ))}
          </div>
        )}

        {isPending && (
          <GlobalLoader fullScreen={false} compact label="Loading audit log..." />
        )}

        {/* Filter bar */}
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end',
          padding: '14px 16px', background: 'var(--panel)',
          border: '1px solid var(--line)', borderRadius: 10,
        }}>
          <div>
            <label style={labelStyle} htmlFor="et-filter">Entity Type</label>
            <select id="et-filter" value={draft.entityType} onChange={e => setDraft(d => ({ ...d, entityType: e.target.value }))} style={selectStyle}>
              <option value="">All Entities</option>
              {ENTITY_TYPES.map(et => <option key={et} value={et}>{entityTypeMeta(et).label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="action-filter">Action</label>
            <select id="action-filter" value={draft.actionKey} onChange={e => setDraft(d => ({ ...d, actionKey: e.target.value }))} style={selectStyle}>
              <option value="">All Actions</option>
              {AUDIT_ACTION_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="actor-filter">Actor Name</label>
            <input
              id="actor-filter" type="text" placeholder="Enter user name"
              value={draft.actorName} onChange={e => setDraft(d => ({ ...d, actorName: e.target.value }))}
              style={{ ...selectStyle, minWidth: 160 }}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="range-filter">Date Range</label>
            <select
              id="range-filter" value={draft.rangePreset}
              onChange={e => setDraft(d => ({ ...d, rangePreset: e.target.value as DateRangePreset, rawFrom: undefined }))}
              style={selectStyle}
            >
              <option value="">All time</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="custom">Custom range</option>
            </select>
          </div>
          {draft.rangePreset === 'custom' && (
            <>
              <div>
                <label style={labelStyle}>From</label>
                <DatePicker value={draft.customFrom} onChange={v => setDraft(d => ({ ...d, customFrom: v, rawFrom: undefined }))} clearable inputStyle={selectStyle} />
              </div>
              <div>
                <label style={labelStyle}>To</label>
                <DatePicker value={draft.customTo} onChange={v => setDraft(d => ({ ...d, customTo: v, rawFrom: undefined }))} clearable inputStyle={selectStyle} />
              </div>
            </>
          )}
          <button onClick={clearFilters} style={{ ...selectStyle, cursor: 'pointer', color: 'var(--txt-mut)', border: '1px solid var(--line2)', background: 'transparent' }}>
            Clear Filters
          </button>
          <button
            onClick={applyFilters}
            style={{ ...selectStyle, cursor: 'pointer', color: '#fff', background: 'var(--brand)', border: '1px solid var(--brand)', fontWeight: 600 }}
          >
            Apply Filters
          </button>
        </div>

        {/* Table */}
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
          {isPending && (
            <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[...Array(8)].map((_, i) => <div key={i} className="skeleton" style={{ height: 44, borderRadius: 6 }} />)}
            </div>
          )}

          {isError && (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--risk)', marginBottom: 12 }}>Failed to load audit log.</div>
              <button onClick={() => refetch()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 12, cursor: 'pointer' }}>
                <RefreshCw size={13} aria-hidden="true" /> Retry
              </button>
            </div>
          )}

          {data && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr style={{ background: 'var(--raised)', borderBottom: '1px solid var(--line)' }}>
                    <th style={thStyle}>
                      <button
                        onClick={() => setSort(s => (s === 'desc' ? 'asc' : 'desc'))}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', textTransform: 'inherit', letterSpacing: 'inherit' }}
                      >
                        Timestamp <ChevronsUpDown size={11} aria-hidden="true" />
                      </button>
                    </th>
                    <th style={thStyle}>Actor</th>
                    <th style={thStyle}>Action</th>
                    <th style={thStyle}>Entity</th>
                    <th style={thStyle}>Entity ID</th>
                    <th style={thStyle}>Details</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {data.content.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--txt-dim)' }}>
                        No audit events match your filters.
                      </td>
                    </tr>
                  ) : (
                    data.content.map(entry => {
                      const selected = entry.id === selectedId;
                      const display = describeAuditEvent(entry);
                      return (
                        <tr
                          key={entry.id}
                          onClick={() => selectRow(entry)}
                          style={{
                            borderBottom: '1px solid var(--line)', cursor: 'pointer',
                            background: selected ? 'color-mix(in srgb, var(--brand) 8%, transparent)' : 'transparent',
                          }}
                        >
                          <td style={tdStyle}>
                            <span style={{ fontSize: 11, color: 'var(--txt-dim)', whiteSpace: 'nowrap' }}>
                              {formatAuditDate(entry.occurredAt)}
                            </span>
                          </td>
                          <td style={tdStyle}><ActorCell entry={entry} /></td>
                          <td style={tdStyle}><ActionPill entry={entry} /></td>
                          <td style={tdStyle}><EntityCell entityType={entry.entityType} /></td>
                          <td style={tdStyle}>
                            <span style={{ fontSize: 11.5, color: 'var(--txt-dim)' }}>
                              {entry.entityId ?? '—'}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, maxWidth: 260 }}>
                            <span style={{ fontSize: 12, color: 'var(--txt-mut)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title={display.message}>
                              {display.message}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            {selected ? <ChevronUp size={14} aria-hidden="true" style={{ color: 'var(--txt-dim)' }} /> : <ChevronDown size={14} aria-hidden="true" style={{ color: 'var(--txt-dim)' }} />}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--line)', flexWrap: 'wrap', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--txt-dim)', fontVariantNumeric: 'tabular-nums' }}>
                Showing {showingFrom} – {showingTo} of {data.totalElements} logs
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button onClick={() => setPage(p => p - 1)} disabled={data.number === 0} style={pageBtnStyle(data.number === 0)} aria-label="Previous page">
                  <ChevronLeft size={14} aria-hidden="true" />
                </button>
                {pageNumbers.map((n, i) => (
                  <span key={n} style={{ display: 'flex', alignItems: 'center' }}>
                    {i > 0 && pageNumbers[i - 1] !== n - 1 && <span style={{ padding: '0 4px', color: 'var(--txt-dim)', fontSize: 12 }}>…</span>}
                    <button
                      onClick={() => setPage(n)}
                      style={{
                        minWidth: 28, height: 28, padding: '0 6px', borderRadius: 6,
                        background: n === data.number ? 'var(--brand)' : 'var(--raised2)',
                        border: '1px solid var(--line2)',
                        color: n === data.number ? '#fff' : 'var(--txt)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {n + 1}
                    </button>
                  </span>
                ))}
                <button onClick={() => setPage(p => p + 1)} disabled={data.number >= data.totalPages - 1} style={pageBtnStyle(data.number >= data.totalPages - 1)} aria-label="Next page">
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedEntry && <DetailDrawer entry={selectedEntry} onClose={() => setSelectedId(null)} />}
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
  fontFamily: 'Inter, sans-serif',
};

const thStyle: React.CSSProperties = {
  padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--txt-dim)',
  textAlign: 'left', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 12,
  verticalAlign: 'top',
};

const pageBtnStyle = (disabled: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28,
  background: disabled ? 'var(--raised)' : 'var(--raised2)',
  border: '1px solid var(--line2)',
  borderRadius: 6,
  color: disabled ? 'var(--txt-dim)' : 'var(--txt)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
});
