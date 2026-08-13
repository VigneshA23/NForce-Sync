import { useEffect, useMemo, useState } from 'react';
import {
  FolderKanban, Users, Plus, RefreshCw, AlertTriangle, Trash2, Pencil, Search, X,
  ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import { Modal } from '../../components/Modal';
import { useToast } from '../../lib/toast';
import { todayISO } from '../../lib/date';
import { useQuery } from '@tanstack/react-query';
import { extractApiError, listBillingModels, listProjectTypes } from '../../api/admin';
import {
  useAllProjects, useAllocations, useAssignableEmployees,
  useCreateProject, useUpdateProject, useCreateAllocation, useUpdateAllocation, useDeleteAllocation,
  useAssignableLeads,
  useAssignableProjectManagers,
} from '../../api/projects';
import type { ProjectFullDto, AllocationDto } from '../../api/projects';

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--shell)',
  border: '1px solid var(--line2)',
  borderRadius: 6,
  padding: '9px 12px',
  color: 'var(--txt)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'Inter, sans-serif',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 550,
  color: 'var(--txt-mut)', marginBottom: 5, letterSpacing: '0.03em',
};

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--txt-dim)',
  textAlign: 'left',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  background: 'var(--raised)',
  borderBottom: '1px solid var(--line)',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  verticalAlign: 'middle',
  borderBottom: '1px solid var(--line)',
  fontSize: 13,
  color: 'var(--txt)',
};

type Tab = 'projects' | 'allocation';

const STATUS_CFG: Record<string, { color: string; label: string }> = {
  ACTIVE:    { color: '#2FB67C', label: 'Active' },
  ON_HOLD:   { color: '#E0A93B', label: 'On Hold' },
  COMPLETED: { color: '#4C8DD6', label: 'Completed' },
  INACTIVE:  { color: '#9BA1AC', label: 'Inactive' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { color: '#9BA1AC', label: status };
  return (
    <span style={{
      display: 'inline-block', padding: '3px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 500,
      background: `color-mix(in srgb, ${cfg.color} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${cfg.color} 30%, transparent)`,
      color: cfg.color,
    }}>
      {cfg.label}
    </span>
  );
}

type AllocationSortKey = 'employee' | 'project';

/**
 * Clickable column header: first click sorts A–Z, the next flips to Z–A. `dir` is null when this
 * column isn't the active sort, which shows a faint double arrow to advertise that it is sortable.
 */
function SortableTh({ label, dir, onToggle }: {
  label: string; dir: 'asc' | 'desc' | null; onToggle: () => void;
}) {
  return (
    <th
      style={{ ...thStyle, padding: 0 }}
      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
    >
      <button
        type="button"
        onClick={onToggle}
        title={dir === 'asc' ? 'Sorted A–Z — click for Z–A'
          : dir === 'desc' ? 'Sorted Z–A — click for A–Z'
            : `Sort by ${label.toLowerCase()} A–Z`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          width: '100%', padding: '10px 16px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          font: 'inherit', color: dir ? 'var(--txt)' : 'var(--txt-dim)',
          letterSpacing: 'inherit', textTransform: 'inherit', textAlign: 'left',
        }}
      >
        {label}
        {dir === 'asc' ? <ArrowUp size={12} aria-hidden="true" />
          : dir === 'desc' ? <ArrowDown size={12} aria-hidden="true" />
            : <ArrowUpDown size={12} aria-hidden="true" style={{ opacity: 0.55 }} />}
      </button>
    </th>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '10px 14px', borderRadius: 7, marginBottom: 14,
      background: 'rgba(228,55,61,.10)', border: '1px solid rgba(228,55,61,.25)',
      fontSize: 12, color: 'var(--risk)',
    }} role="alert">
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      {message}
    </div>
  );
}

function IconButton({ icon, label, danger, onClick, disabled }: {
  icon: React.ReactNode; label: string; danger?: boolean; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 10px', background: 'transparent',
        border: `1px solid ${danger ? 'rgba(228,55,61,.3)' : 'var(--line2)'}`,
        borderRadius: 6, color: danger ? '#E4373D' : 'var(--txt-mut)',
        fontSize: 11, fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {icon}
    </button>
  );
}

function Toolbar({ count, noun, onRefetch, isRefreshing, onAdd, addLabel, filters }: {
  count: number | undefined; noun: string; onRefetch: () => void; isRefreshing?: boolean;
  onAdd: () => void; addLabel: string;
  /** Optional filter controls, rendered in the left group after the count. */
  filters?: React.ReactNode;
}) {
  return (
    <div style={{
      padding: '14px 20px', borderBottom: '1px solid var(--line)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        fontSize: 13, fontWeight: 600, color: 'var(--txt)',
      }}>
        {count != null && (
          <span style={{ color: 'var(--txt-dim)', fontWeight: 400, whiteSpace: 'nowrap' }}>
            {count} {count === 1 ? noun : `${noun}s`}
          </span>
        )}
        {filters}
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={onRefetch}
          disabled={isRefreshing}
          aria-label={isRefreshing ? 'Refreshing…' : 'Refresh'}
          title="Refresh"
          style={{
            background: 'transparent', border: 'none', cursor: isRefreshing ? 'default' : 'pointer',
            color: 'var(--txt-dim)', padding: 6, display: 'flex', alignItems: 'center', borderRadius: 5,
            opacity: isRefreshing ? 0.7 : 1,
          }}
        >
          <RefreshCw size={14} aria-hidden="true" style={isRefreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
        </button>
        <button
          onClick={onAdd}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', background: 'var(--brand)', border: 'none',
            borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={14} aria-hidden="true" /> {addLabel}
        </button>
      </div>
    </div>
  );
}

// ── Project create / edit modal ────────────────────────────────────────────────

interface ProjectFormState {
  code: string;
  name: string;
  client: string;
  /** Project Type id from the Organization Master, as a string for the <select>. */
  projectTypeId: string;
  /** Billing Model id from the Organization Master, as a string for the <select>. */
  billingModelId: string;
  status: ProjectFullDto['status'];
  startDate: string;
  endDate: string;
  /** The project's Team Lead, held as a string because it is bound to a <select>. */
  pmId: string;
  /** The overseeing PM — what scopes their Approvals queue, dashboard and reports. */
  projectManagerId: string;
}

/**
 * Trailing-edge debounce. Keeps a fast-typing search box from re-filtering on every keystroke.
 * Local because the repo has no debounce utility and no new dependency is warranted for it.
 */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}


/**
 * ISO `yyyy-MM-dd` → `DD-MM-YYYY` for display; a plain hyphen when absent.
 *
 * Splits the string rather than going through `new Date(iso)`, which parses a bare date as UTC
 * midnight and would render the previous day for anyone west of UTC.
 */
function fmtDateDMY(iso: string | null | undefined): string {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}-${m}-${y}` : iso;
}

/** Blank or null end date = open-ended; mirrors Allocation.OPEN_ENDED and V54's 9999-12-31. */
const OPEN_ENDED_ISO = '9999-12-31';

/**
 * Whether two allocation windows overlap. Both are inclusive at each end, so windows that merely
 * touch — one ends 31-07, the next starts 01-08 — do not overlap and a re-assignment is allowed.
 *
 * ISO `yyyy-MM-dd` sorts lexicographically, so these are plain string compares: no Date parsing and
 * so no timezone shift. Advisory only — AllocationService enforces the same rule server-side.
 */
function windowsOverlap(aFrom: string, aTo: string | null, bFrom: string, bTo: string | null): boolean {
  return aFrom <= (bTo || OPEN_ENDED_ISO) && (aTo || OPEN_ENDED_ISO) >= bFrom;
}

/** Shared wording for the clash message, so both allocation modals read identically. */
function describeClash(a: AllocationDto): string {
  const window = a.effectiveTo
    ? `from ${fmtDateDMY(a.effectiveFrom)} to ${fmtDateDMY(a.effectiveTo)}`
    : `from ${fmtDateDMY(a.effectiveFrom)} onwards (no end date)`;
  return `${a.employeeName} is already allocated to ${a.projectCode} ${window}.`
    + ' Choose dates outside that window.';
}

/** Earliest selectable end date: the day after the start, since the two may not be equal. */
function dayAfterISO(iso: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const EMPTY_PROJECT_FORM: ProjectFormState = {
  code: '', name: '', client: '', projectTypeId: '', billingModelId: '',
  status: 'ACTIVE', startDate: todayISO(), endDate: '', pmId: '', projectManagerId: '',
};

function ProjectModal({ open, onClose, editing }: {
  open: boolean; onClose: () => void; editing: ProjectFullDto | null;
}) {
  const { showToast } = useToast();
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const { data: leads } = useAssignableLeads();
  const { data: projectManagers } = useAssignableProjectManagers();
  const { data: billingModels } = useQuery({
    queryKey: ['org', 'billing-models'],
    queryFn: listBillingModels,
  });
  const { data: projectTypes } = useQuery({
    queryKey: ['org', 'project-types'],
    queryFn: listProjectTypes,
  });
  const [form, setForm] = useState<ProjectFormState>(EMPTY_PROJECT_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(editing ? {
      code: editing.code,
      name: editing.name,
      client: editing.client ?? '',
      projectTypeId: editing.projectTypeId != null ? String(editing.projectTypeId) : '',
      billingModelId: editing.billingModelId != null ? String(editing.billingModelId) : '',
      status: editing.status,
      startDate: editing.startDate ?? '',
      endDate: editing.endDate ?? '',
      pmId: editing.pmId != null ? String(editing.pmId) : '',
      projectManagerId: editing.projectManagerId != null ? String(editing.projectManagerId) : '',
    } : EMPTY_PROJECT_FORM);
  }, [open, editing]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  // Several seeded projects are owned by a SUPERADMIN, who is not an eligible TL. Offer the current
  // holder as an extra option so editing an unrelated field can't silently reassign the project —
  // the server likewise accepts the unchanged holder.
  const leadOptions = leads ?? [];
  const currentLeadMissing = editing?.pmId != null
    && !leadOptions.some(l => l.id === editing.pmId);

  // Same grandfathering for the overseeing PM: a deactivated PM stays selectable on projects they
  // already hold, so an unrelated edit can't silently move oversight.
  const managerOptions = projectManagers ?? [];
  const currentManagerMissing = editing?.projectManagerId != null
    && !managerOptions.some(m => m.id === editing.projectManagerId);

  // Only active models are offered; a project already on a deactivated one keeps it (see the option
  // rendered below), which matches how the server grandfathers an unchanged value.
  const activeBillingModels = (billingModels ?? []).filter(b => b.active);
  const currentBillingModelMissing = editing?.billingModelId != null
    && !activeBillingModels.some(b => b.id === editing.billingModelId);

  // Project types come from the Organization Master; a project already on a deactivated one keeps
  // it (option rendered below), matching the server's grandfathering.
  const activeProjectTypes = (projectTypes ?? []).filter(t => t.active);
  const currentProjectTypeMissing = editing?.projectTypeId != null
    && !activeProjectTypes.some(t => t.id === editing.projectTypeId);

  // Whether a client is required is a property of the chosen type, not a hardcoded "CLIENT" — so a
  // Super Admin adding a client-bearing type gets the Client Name field with no code change.
  const selectedProjectType = (projectTypes ?? []).find(t => String(t.id) === form.projectTypeId);
  const showClient = selectedProjectType?.requiresClient === true;
  // End must be strictly after start — a project cannot begin and end on the same day.
  const badDateOrder = form.endDate !== '' && form.endDate <= form.startDate;
  // A completed project has to record when it finished. Status only appears when editing.
  const endDateRequired = editing != null && form.status === 'COMPLETED';
  const canSubmit = form.name.trim() !== ''
    && form.code.trim() !== ''
    && form.projectTypeId !== ''
    && form.billingModelId !== ''
    && form.startDate !== ''
    && (!showClient || form.client.trim() !== '')
    && (!endDateRequired || form.endDate !== '')
    && form.pmId !== ''
    && form.projectManagerId !== ''
    && !badDateOrder;

  function handleClose() {
    setForm(EMPTY_PROJECT_FORM);
    setError(null);
    onClose();
  }

  // Switching to a type that doesn't require a client clears the name, so a value hidden from the
  // form is never submitted (the server nulls it too).
  function handleProjectTypeChange(value: string) {
    const nextType = (projectTypes ?? []).find(t => String(t.id) === value);
    setForm(f => ({
      ...f,
      projectTypeId: value,
      client: nextType?.requiresClient ? f.client : '',
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          data: {
            code: form.code.trim(),
            name: form.name.trim(),
            // Server also nulls this for a type without requiresClient; sent as null so the two agree.
            client: showClient ? form.client.trim() : null,
            projectTypeId: Number(form.projectTypeId),
            billingModelId: Number(form.billingModelId),
            status: form.status,
            startDate: form.startDate,
            endDate: form.endDate || null,
            pmId: Number(form.pmId),
            projectManagerId: Number(form.projectManagerId),
          },
        });
        showToast('success', 'Project updated');
      } else {
        await createMutation.mutateAsync({
          code: form.code.trim(),
          name: form.name.trim(),
          client: showClient ? form.client.trim() : null,
          projectTypeId: Number(form.projectTypeId),
          billingModelId: Number(form.billingModelId),
          startDate: form.startDate,
          endDate: form.endDate || null,
          pmId: Number(form.pmId),
          projectManagerId: Number(form.projectManagerId),
        });
        showToast('success', 'Project created');
      }
      handleClose();
    } catch (err) {
      setError(extractApiError(err, editing ? 'Failed to update project' : 'Failed to create project'));
    }
  }

  return (
    <Modal open={open} title={editing ? 'Edit Project' : 'New Project'} onClose={handleClose} width={480}>
      <form onSubmit={handleSubmit} noValidate>
        {error && <ErrorBanner message={error} />}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          {/* Editable on both create and edit; the server keeps it unique across projects. */}
          <div>
            <label style={labelStyle}>Code *</label>
            <input style={inputStyle} value={form.code} autoFocus
              onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
          </div>
          <div>
            <label style={labelStyle}>Name *</label>
            <input style={inputStyle} value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
        </div>
        {/* Project Type leads, because whether Client Name is shown depends on it. */}
        <div style={{ display: 'grid', gridTemplateColumns: showClient ? '1fr 1fr' : '1fr', gap: 14, marginBottom: 14 }}>
          <div>
            {/* Maintained by a Super Admin in Organization Masters → Project Types. */}
            <label style={labelStyle}>Project Type *</label>
            <select style={inputStyle} value={form.projectTypeId}
              onChange={e => handleProjectTypeChange(e.target.value)}>
              <option value="">Select type…</option>
              {/* Inactive types are hidden, but keep this project's own so editing can't clear it. */}
              {currentProjectTypeMissing && (
                <option value={String(editing!.projectTypeId)}>{editing!.projectType} (inactive)</option>
              )}
              {activeProjectTypes.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          {showClient && (
            <div>
              <label style={labelStyle}>Client Name *</label>
              <input style={inputStyle} value={form.client} placeholder="e.g. Meridian Bank"
                onChange={e => setForm(f => ({ ...f, client: e.target.value }))} />
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: editing ? '1fr 1fr' : '1fr', gap: 14, marginBottom: 14 }}>
          <div>
            {/* Maintained by a Super Admin in Organization Masters → Billing Models. */}
            <label style={labelStyle}>Billing Model *</label>
            <select style={inputStyle} value={form.billingModelId}
              onChange={e => setForm(f => ({ ...f, billingModelId: e.target.value }))}>
              {/* Placeholder rather than a blank "no model" choice — mandatory since V53, but it
                  must not default to whichever model happens to sort first. */}
              <option value="">Select billing model…</option>
              {/* An inactive model is hidden, but keep the project's own so editing can't clear it. */}
              {currentBillingModelMissing && (
                <option value={String(editing!.billingModelId)}>{editing!.billingModel} (inactive)</option>
              )}
              {activeBillingModels.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          {editing && (
            <div>
              <label style={labelStyle}>Status</label>
              <select style={inputStyle} value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as ProjectFullDto['status'] }))}>
                <option value="ACTIVE">Active</option>
                <option value="ON_HOLD">On Hold</option>
                <option value="COMPLETED">Completed</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          )}
        </div>

        {/* Two distinct roles: the Team Lead decides this project's EOD entries, while the Project
            Manager oversees it — that is what puts the project in their Approvals queue, Project
            Dashboard and reports. Both are required. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Team Lead *</label>
            <select style={inputStyle} value={form.pmId}
              onChange={e => setForm(f => ({ ...f, pmId: e.target.value }))}>
              <option value="">Select Team Lead…</option>
              {currentLeadMissing && (
                <option value={String(editing!.pmId)}>{editing!.pmName} (current)</option>
              )}
              {leadOptions.map(l => (
                <option key={l.id} value={l.id}>{l.fullName} ({l.employeeCode})</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Project Manager *</label>
            <select style={inputStyle} value={form.projectManagerId}
              onChange={e => setForm(f => ({ ...f, projectManagerId: e.target.value }))}>
              <option value="">Select Project Manager…</option>
              {currentManagerMissing && (
                <option value={String(editing!.projectManagerId)}>
                  {editing!.projectManagerName} (current)
                </option>
              )}
              {managerOptions.map(m => (
                <option key={m.id} value={m.id}>{m.fullName} ({m.employeeCode})</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>Start Date *</label>
            <input type="date" lang="en-GB" style={inputStyle} value={form.startDate}
              onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
          </div>
          <div>
            {/* Optional in general, but mandatory once the status is Completed. */}
            <label style={labelStyle}>
              End Date{endDateRequired
                ? ' *'
                : <span style={{ fontWeight: 400, color: 'var(--txt-dim)' }}> (Optional)</span>}
            </label>
            <input type="date" lang="en-GB" style={inputStyle} value={form.endDate} min={dayAfterISO(form.startDate)}
              onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            {(badDateOrder || (endDateRequired && form.endDate === '')) && (
              <p style={{ fontSize: 11, margin: '5px 0 0', color: 'var(--risk)' }}>
                {badDateOrder
                  ? 'End Date must be after Start Date.'
                  : 'Required when status is Completed.'}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="submit"
            disabled={isPending || !canSubmit}
            style={{
              padding: '9px 20px', background: 'var(--brand)', border: 'none', borderRadius: 7,
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {isPending ? 'Saving…' : editing ? 'Save Changes' : 'Create Project'}
          </button>
          <button type="button" onClick={handleClose} style={{
            padding: '9px 16px', background: 'transparent', border: '1px solid var(--line2)',
            borderRadius: 7, color: 'var(--txt-mut)', fontSize: 13, cursor: 'pointer',
          }}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Projects tab ───────────────────────────────────────────────────────────────

function ProjectsTab() {
  const { data, isPending, isError, isFetching, refetch } = useAllProjects();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectFullDto | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [leadFilter, setLeadFilter] = useState('');

  // Only the free-text box is debounced; the selects apply immediately.
  const debouncedSearch = useDebouncedValue(search, 300);

  const filtered = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return (data ?? []).filter(p =>
      (term === '' || p.name.toLowerCase().includes(term))
      && (statusFilter === '' || p.status === statusFilter)
      && (leadFilter === '' || String(p.pmId) === leadFilter),
    );
  }, [data, debouncedSearch, statusFilter, leadFilter]);

  // Team Lead options come from the leads actually holding a project, not the full assignable
  // list — filtering by someone with no projects would only ever yield an empty table.
  const leadOptions = useMemo(() => {
    const byId = new Map<number, string>();
    for (const p of data ?? []) {
      if (p.pmId != null) byId.set(p.pmId, p.pmName ?? `#${p.pmId}`);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  // Drives the empty-state wording, so it tracks the debounced term the list was actually filtered by.
  const filtersActive = debouncedSearch.trim() !== '' || statusFilter !== '' || leadFilter !== '';
  // Drives the Clear button, which must appear the moment you type rather than 300ms later.
  const anyFilterSet = search !== '' || statusFilter !== '' || leadFilter !== '';

  function clearFilters() {
    setSearch('');
    setStatusFilter('');
    setLeadFilter('');
  }

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(p: ProjectFullDto) { setEditing(p); setModalOpen(true); }

  // Status options come from STATUS_CFG — the same map StatusBadge reads, so the labels and
  // colours stay in one place rather than being restated here.
  const projectFilters = (
    <>
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
        <Search
          size={13} aria-hidden="true"
          style={{ position: 'absolute', left: 10, color: 'var(--txt-dim)', pointerEvents: 'none' }}
        />
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search project"
          aria-label="Search project by name"
          style={{ ...inputStyle, width: 220, paddingLeft: 30, fontWeight: 400 }}
        />
      </div>
      <select
        value={statusFilter}
        onChange={e => setStatusFilter(e.target.value)}
        aria-label="Filter by status"
        style={{ ...inputStyle, width: 170, fontWeight: 400 }}
      >
        <option value="">Filter by status</option>
        {Object.entries(STATUS_CFG).map(([value, cfg]) => (
          <option key={value} value={value}>{cfg.label}</option>
        ))}
      </select>
      <select
        value={leadFilter}
        onChange={e => setLeadFilter(e.target.value)}
        aria-label="Filter by Team Lead"
        style={{ ...inputStyle, width: 190, fontWeight: 400 }}
      >
        <option value="">Filter by Team Lead</option>
        {leadOptions.map(l => (
          <option key={l.id} value={String(l.id)}>{l.name}</option>
        ))}
      </select>
      {/* Resets all three at once — with search, status and Team Lead set, clearing them one by one
          is three interactions. Only rendered while something is actually filtered. */}
      {anyFilterSet && (
        <button
          type="button"
          onClick={clearFilters}
          aria-label="Clear all filters"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 12px',
            background: 'transparent', border: '1px solid var(--line2)', borderRadius: 7,
            color: 'var(--txt-mut)', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--txt)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--txt-mut)'; }}
        >
          <X size={13} aria-hidden="true" /> Clear
        </button>
      )}
    </>
  );

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
      <Toolbar count={data ? filtered.length : undefined} noun="project" onRefetch={() => refetch()}
        isRefreshing={isFetching} onAdd={openCreate} addLabel="New Project" filters={projectFilters} />

      {isPending && (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 44, borderRadius: 6 }} />
          ))}
        </div>
      )}

      {isError && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--risk)', marginBottom: 12 }}>Failed to load projects.</div>
          <button onClick={() => refetch()} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
            background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6,
            color: 'var(--txt)', fontSize: 12, cursor: 'pointer',
          }}>
            <RefreshCw size={13} aria-hidden="true" /> Retry
          </button>
        </div>
      )}

      {data && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Code</th>
              <th style={thStyle}>Project Name</th>
              <th style={thStyle}>Project Type</th>
              <th style={thStyle}>Client</th>
              <th style={thStyle}>Billing Model</th>
              <th style={thStyle}>Timeline</th>
              <th style={thStyle}>Team Lead</th>
              <th style={thStyle}>Headcount</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--txt-dim)' }}>
                  {filtersActive
                    ? 'No projects match your search or filter.'
                    : 'No projects yet. Create one above.'}
                </td>
              </tr>
            ) : (
              filtered.map(p => (
                <tr key={p.id}>
                  <td style={{ ...tdStyle, fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt-mut)' }}>{p.code}</td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{p.name}</td>
                  {/* Master-managed (Organization Masters → Project Types); the DTO sends its name. */}
                  <td style={tdStyle}>{p.projectType ?? '-'}</td>
                  {/* A type without requiresClient has no client by design — the server forces it null. */}
                  <td style={tdStyle}>{p.client ?? '-'}</td>
                  {/* Optional on a project, so unset is normal rather than an error. */}
                  <td style={tdStyle}>{p.billingModel ?? '-'}</td>
                  {/* Derived, never stored: a recorded end date always wins; with none, the status
                      supplies the word. Labels come straight from STATUS_CFG, so this reads
                      "On Hold" rather than ON_HOLD and a new status needs no change here. */}
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: 12 }}>
                    {fmtDateDMY(p.startDate)}
                    <span style={{ color: 'var(--txt-dim)' }}> → </span>
                    {p.endDate ? fmtDateDMY(p.endDate) : (
                      <span style={{ color: 'var(--txt-mut)', fontStyle: 'italic' }}>
                        {STATUS_CFG[p.status]?.label ?? p.status}
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>{p.pmName ?? '-'}</td>
                  <td style={tdStyle}>{p.allocatedHeadcount}</td>
                  <td style={tdStyle}><StatusBadge status={p.status} /></td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <IconButton icon={<Pencil size={13} aria-hidden="true" />} label="Edit" onClick={() => openEdit(p)} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      <ProjectModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} />
    </div>
  );
}

// ── Allocation create modal ────────────────────────────────────────────────────

function AllocationModal({ open, onClose, projects }: {
  open: boolean; onClose: () => void; projects: ProjectFullDto[];
}) {
  const { showToast } = useToast();
  const { data: employees } = useAssignableEmployees();
  // Unfiltered on purpose: this form can pick any ACTIVE project, while the tab's own list is
  // narrowed server-side by its project filter — reusing that would miss clashes on other projects.
  // With no filter set it is the same cached query, so it costs no extra request.
  const { data: allAllocations } = useAllocations();
  const createMutation = useCreateAllocation();
  const [employeeId, setEmployeeId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(todayISO);
  const [effectiveTo, setEffectiveTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const badDateOrder = effectiveTo !== '' && effectiveTo < effectiveFrom;

  // Tells the PM the person is already on this project before they submit. The server repeats the
  // check and is the authority — this only saves a round trip.
  const clash = useMemo(() => {
    if (!employeeId || !projectId || !effectiveFrom || badDateOrder) return null;
    return (allAllocations ?? []).find(a =>
      a.employeeId === Number(employeeId)
      && a.projectId === Number(projectId)
      && windowsOverlap(a.effectiveFrom, a.effectiveTo, effectiveFrom, effectiveTo || null)) ?? null;
  }, [allAllocations, employeeId, projectId, effectiveFrom, effectiveTo, badDateOrder]);

  // Only ACTIVE projects are allocatable — you cannot staff someone onto work that is
  // completed, on hold, or inactive. It would also be invisible to them: the EOD Project
  // dropdown filters to ACTIVE, so such an allocation could never be booked against.
  const activeProjects = useMemo(
    () => projects.filter(p => p.status === 'ACTIVE'),
    [projects],
  );

  function handleClose() {
    setEmployeeId('');
    setProjectId('');
    setEffectiveTo(''); setError(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !projectId || !effectiveFrom || badDateOrder || clash) return;
    setError(null);
    try {
      await createMutation.mutateAsync({
        employeeId: Number(employeeId),
        projectId: Number(projectId),
        effectiveFrom,
        effectiveTo: effectiveTo || null,
      });
      showToast('success', 'Allocation created');
      handleClose();
    } catch (err) {
      setError(extractApiError(err, 'Failed to create allocation'));
    }
  }

  return (
    <Modal open={open} title="New Allocation" onClose={handleClose} width={480}>
      <form onSubmit={handleSubmit} noValidate>
        {error && <ErrorBanner message={error} />}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Employee *</label>
          <select style={inputStyle} value={employeeId} onChange={e => setEmployeeId(e.target.value)} autoFocus>
            <option value="">Select employee…</option>
            {employees?.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.employeeCode})</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Project *</label>
          <select style={inputStyle} value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">
              {activeProjects.length === 0 ? 'No active projects' : 'Select project…'}
            </option>
            {activeProjects.map(p => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Effective From *</label>
            <input type="date" lang="en-GB" style={inputStyle} value={effectiveFrom}
              onChange={e => setEffectiveFrom(e.target.value)} />
          </div>
          <div>
            {/* Blank means the assignment is open-ended. */}
            <label style={labelStyle}>
              Effective To
              <span style={{ fontWeight: 400, color: 'var(--txt-dim)' }}> (Optional)</span>
            </label>
            <input type="date" lang="en-GB" style={inputStyle} value={effectiveTo} min={effectiveFrom || undefined}
              onChange={e => setEffectiveTo(e.target.value)} />
            {badDateOrder && (
              <p style={{ fontSize: 11, color: 'var(--risk)', margin: '5px 0 0' }}>
                Effective To cannot be earlier than Effective From.
              </p>
            )}
          </div>
        </div>
        {clash && (
          <p style={{ fontSize: 11, color: 'var(--risk)', margin: '0 0 14px' }} role="alert">
            {describeClash(clash)}
          </p>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="submit"
            disabled={createMutation.isPending || !employeeId || !projectId
              || !effectiveFrom || badDateOrder || clash != null}
            style={{
              padding: '9px 20px', background: 'var(--brand)', border: 'none', borderRadius: 7,
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: createMutation.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {createMutation.isPending ? 'Saving…' : 'Create Allocation'}
          </button>
          <button type="button" onClick={handleClose} style={{
            padding: '9px 16px', background: 'transparent', border: '1px solid var(--line2)',
            borderRadius: 7, color: 'var(--txt-mut)', fontSize: 13, cursor: 'pointer',
          }}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditAllocationModal({ allocation, onClose }: { allocation: AllocationDto | null; onClose: () => void }) {
  const { showToast } = useToast();
  const updateMutation = useUpdateAllocation();
  const { data: allAllocations } = useAllocations();
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Re-seed whenever a different row is opened.
  useEffect(() => {
    if (!allocation) return;
    setEffectiveFrom(allocation.effectiveFrom);
    setEffectiveTo(allocation.effectiveTo ?? '');
    setError(null);
  }, [allocation]);

  const badDateOrder = effectiveTo !== '' && effectiveTo < effectiveFrom;

  // Widening a window can collide with another allocation of the same pair. Excludes this row, so
  // re-saving its own dates is never a conflict with itself.
  const clash = useMemo(() => {
    if (!allocation || !effectiveFrom || badDateOrder) return null;
    return (allAllocations ?? []).find(a =>
      a.id !== allocation.id
      && a.employeeId === allocation.employeeId
      && a.projectId === allocation.projectId
      && windowsOverlap(a.effectiveFrom, a.effectiveTo, effectiveFrom, effectiveTo || null)) ?? null;
  }, [allAllocations, allocation, effectiveFrom, effectiveTo, badDateOrder]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allocation || !effectiveFrom || badDateOrder || clash) return;
    setError(null);
    try {
      await updateMutation.mutateAsync({
        id: allocation.id,
        data: {
          effectiveFrom,
          effectiveTo: effectiveTo || null,
        },
      });
      showToast('success', 'Allocation updated');
      onClose();
    } catch (err) {
      setError(extractApiError(err, 'Failed to update allocation'));
    }
  }

  return (
    <Modal open={allocation != null} title="Edit Allocation" onClose={onClose} width={480}>
      {allocation && (
        <form onSubmit={handleSubmit} noValidate>
          {error && <ErrorBanner message={error} />}

          {/* Employee and project are fixed — reassigning either is a different allocation. */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14,
            padding: '10px 14px', borderRadius: 7,
            background: 'var(--raised)', border: '1px solid var(--line)',
          }}>
            <div>
              <div style={labelStyle}>Employee</div>
              <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>
                {allocation.employeeName}{' '}
                <span style={{ color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>
                  {allocation.employeeCode}
                </span>
              </div>
            </div>
            <div>
              <div style={labelStyle}>Project</div>
              <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>
                {allocation.projectCode} — {allocation.projectName}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Effective From *</label>
              <input type="date" lang="en-GB" style={inputStyle} value={effectiveFrom} autoFocus
                onChange={e => setEffectiveFrom(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Effective To</label>
              <input type="date" lang="en-GB" style={inputStyle} value={effectiveTo} min={effectiveFrom || undefined}
                onChange={e => setEffectiveTo(e.target.value)} />
              <p style={{ fontSize: 11, color: badDateOrder ? 'var(--risk)' : 'var(--txt-dim)', margin: '5px 0 0' }}>
                {badDateOrder
                  ? 'Effective To cannot be earlier than Effective From.'
                  : 'Leave blank for an open-ended assignment.'}
              </p>
            </div>
          </div>

          {clash && (
            <p style={{ fontSize: 11, color: 'var(--risk)', margin: '0 0 14px' }} role="alert">
              {describeClash(clash)}
            </p>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="submit"
              disabled={updateMutation.isPending || !effectiveFrom || badDateOrder || clash != null}
              style={{
                padding: '9px 20px', background: 'var(--brand)', border: 'none', borderRadius: 7,
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: updateMutation.isPending ? 'not-allowed' : 'pointer',
              }}
            >
              {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={onClose} style={{
              padding: '9px 16px', background: 'transparent', border: '1px solid var(--line2)',
              borderRadius: 7, color: 'var(--txt-mut)', fontSize: 13, cursor: 'pointer',
            }}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function DeleteAllocationModal({ allocation, onClose }: { allocation: AllocationDto | null; onClose: () => void }) {
  const { showToast } = useToast();
  const deleteMutation = useDeleteAllocation();
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!allocation) return;
    setError(null);
    try {
      await deleteMutation.mutateAsync(allocation.id);
      showToast('success', 'Allocation removed');
      onClose();
    } catch (err) {
      setError(extractApiError(err, 'Failed to remove allocation'));
    }
  }

  return (
    <Modal open={allocation != null} title="Remove Allocation" onClose={onClose} width={420}>
      {allocation && (
        <div>
          {error && <ErrorBanner message={error} />}
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', lineHeight: 1.7, marginBottom: 20 }}>
            Remove <b style={{ color: 'var(--txt)' }}>{allocation.employeeName}</b> from{' '}
            <b style={{ color: 'var(--txt)' }}>{allocation.projectName}</b>?
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleConfirm}
              disabled={deleteMutation.isPending}
              style={{
                padding: '9px 20px', background: 'rgba(228,55,61,.15)', border: '1px solid rgba(228,55,61,.4)',
                borderRadius: 7, color: '#E4373D', fontSize: 13, fontWeight: 600,
                cursor: deleteMutation.isPending ? 'not-allowed' : 'pointer',
              }}
            >
              {deleteMutation.isPending ? 'Removing…' : 'Remove'}
            </button>
            <button onClick={onClose} style={{
              padding: '9px 16px', background: 'transparent', border: '1px solid var(--line2)',
              borderRadius: 7, color: 'var(--txt-mut)', fontSize: 13, cursor: 'pointer',
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Allocation tab ─────────────────────────────────────────────────────────────

function AllocationTab() {
  const { data: projects } = useAllProjects();
  const [projectFilter, setProjectFilter] = useState('');
  const { data, isPending, isError, isFetching, refetch } = useAllocations(projectFilter ? Number(projectFilter) : undefined);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [toEdit, setToEdit] = useState<AllocationDto | null>(null);
  const [toDelete, setToDelete] = useState<AllocationDto | null>(null);

  // null = the order the API returned. Single-column sort: clicking a different header moves the
  // sort to it rather than layering a second one.
  const [sort, setSort] = useState<{ key: AllocationSortKey; dir: 'asc' | 'desc' } | null>(null);

  function toggleSort(key: AllocationSortKey) {
    setSort(prev => (prev?.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' }));
  }

  // The project filter is applied server-side by useAllocations; the employee search narrows the
  // rows it returns and the sort orders what's left, so all three combine.
  const debouncedEmployeeSearch = useDebouncedValue(employeeSearch, 300);
  const filtered = useMemo(() => {
    const term = debouncedEmployeeSearch.trim().toLowerCase();
    const rows = term === ''
      ? (data ?? [])
      : (data ?? []).filter(a =>
          a.employeeName.toLowerCase().includes(term) || a.employeeCode.toLowerCase().includes(term));
    if (sort === null) return rows;
    // Sort on the leading text of each cell, so the visible order matches what's read: the
    // Project column renders "CODE — Name". Copy first — the array belongs to React Query's cache.
    const valueOf = (a: AllocationDto) => (sort.key === 'employee' ? a.employeeName : a.projectCode);
    return [...rows].sort((a, b) => {
      const cmp = valueOf(a).localeCompare(valueOf(b), undefined, { sensitivity: 'base' });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [data, debouncedEmployeeSearch, sort]);

  const filtersActive = debouncedEmployeeSearch.trim() !== '';

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--txt-dim)', whiteSpace: 'nowrap' }}>
            {filtered.length} allocation{filtered.length === 1 ? '' : 's'}
          </span>
          <select
            style={{ ...inputStyle, width: 220 }}
            value={projectFilter}
            onChange={e => setProjectFilter(e.target.value)}
          >
            <option value="">All projects</option>
            {projects?.map(p => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <Search size={13} aria-hidden="true"
              style={{ position: 'absolute', left: 10, color: 'var(--txt-dim)', pointerEvents: 'none' }} />
            <input
              value={employeeSearch}
              onChange={e => setEmployeeSearch(e.target.value)}
              placeholder="Search employee"
              aria-label="Search employee by name or ID"
              style={{ ...inputStyle, width: 220, paddingLeft: 30, paddingRight: 30, fontWeight: 400 }}
            />
            {employeeSearch !== '' && (
              <button type="button" onClick={() => setEmployeeSearch('')} aria-label="Clear employee search"
                style={{
                  position: 'absolute', right: 8, background: 'transparent', border: 'none',
                  cursor: 'pointer', color: 'var(--txt-dim)', padding: 4, display: 'flex',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--txt)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--txt-dim)'; }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label={isFetching ? 'Refreshing…' : 'Refresh'}
            title="Refresh"
            style={{
              background: 'transparent', border: 'none', cursor: isFetching ? 'default' : 'pointer',
              color: 'var(--txt-dim)', padding: 6, display: 'flex', alignItems: 'center', borderRadius: 5,
              opacity: isFetching ? 0.7 : 1,
            }}
          >
            <RefreshCw size={14} aria-hidden="true" style={isFetching ? { animation: 'spin 1s linear infinite' } : undefined} />
          </button>
          <button
            onClick={() => setModalOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', background: 'var(--brand)', border: 'none',
              borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Plus size={14} aria-hidden="true" /> New Allocation
          </button>
        </div>
      </div>

      {isPending && (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 44, borderRadius: 6 }} />
          ))}
        </div>
      )}

      {isError && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--risk)', marginBottom: 12 }}>Failed to load allocations.</div>
          <button onClick={() => refetch()} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
            background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6,
            color: 'var(--txt)', fontSize: 12, cursor: 'pointer',
          }}>
            <RefreshCw size={13} aria-hidden="true" /> Retry
          </button>
        </div>
      )}

      {data && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <SortableTh label="Employee" dir={sort?.key === 'employee' ? sort.dir : null}
                onToggle={() => toggleSort('employee')} />
              <SortableTh label="Project" dir={sort?.key === 'project' ? sort.dir : null}
                onToggle={() => toggleSort('project')} />
              <th style={thStyle}>Effective From</th>
              <th style={thStyle}>Effective To</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--txt-dim)' }}>
                  {filtersActive
                    ? 'No allocations match that employee.'
                    : 'No allocations yet. Create one above.'}
                </td>
              </tr>
            ) : (
              filtered.map(a => (
                <tr key={a.id}>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{a.employeeName} <span style={{ color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>{a.employeeCode}</span></td>
                  <td style={tdStyle}>{a.projectCode} — {a.projectName}</td>
                  <td style={tdStyle}>{fmtDateDMY(a.effectiveFrom)}</td>
                  <td style={tdStyle}>{fmtDateDMY(a.effectiveTo)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <IconButton icon={<Pencil size={13} aria-hidden="true" />} label="Edit" onClick={() => setToEdit(a)} />
                      <IconButton icon={<Trash2 size={13} aria-hidden="true" />} label="Remove" danger onClick={() => setToDelete(a)} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      <AllocationModal open={modalOpen} onClose={() => setModalOpen(false)} projects={projects ?? []} />
      <EditAllocationModal allocation={toEdit} onClose={() => setToEdit(null)} />
      <DeleteAllocationModal allocation={toDelete} onClose={() => setToDelete(null)} />
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ProjectsAllocation() {
  const [tab, setTab] = useState<Tab>('projects');

  const tabs = useMemo(() => ([
    { key: 'projects' as const, label: 'Projects', icon: FolderKanban },
    { key: 'allocation' as const, label: 'Allocation', icon: Users },
  ]), []);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
          Projects & Allocation
        </h1>
        <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
          Manage projects and employee allocations across your portfolio.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--line)' }}>
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 16px', background: 'transparent', border: 'none',
                borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
                color: active ? 'var(--txt)' : 'var(--txt-mut)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: -1,
              }}
            >
              <Icon size={14} aria-hidden="true" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'projects' ? <ProjectsTab /> : <AllocationTab />}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
