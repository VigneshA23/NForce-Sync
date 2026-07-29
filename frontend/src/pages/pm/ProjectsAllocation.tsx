import { useEffect, useMemo, useState } from 'react';
import {
  FolderKanban, Users, Plus, RefreshCw, AlertTriangle, Trash2, Pencil,
} from 'lucide-react';
import { Modal } from '../../components/Modal';
import { useToast } from '../../lib/toast';
import { extractApiError } from '../../api/admin';
import {
  useAllProjects, useAllocations, useAssignableEmployees,
  useCreateProject, useUpdateProject, useCreateAllocation, useUpdateAllocation, useDeleteAllocation,
} from '../../api/projects';
import type { ProjectFullDto, AllocationDto, AllocationType } from '../../api/projects';

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

function AllocationTypeBadge({ type }: { type: AllocationType }) {
  const primary = type === 'PRIMARY';
  const color = primary ? '#4C8DD6' : '#9BA1AC';
  return (
    <span style={{
      display: 'inline-block', padding: '3px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 500,
      background: `color-mix(in srgb, ${color} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      color,
    }}>
      {primary ? 'Primary' : 'Secondary'}
    </span>
  );
}

/**
 * Running allocation total for the employee: what they already hold on *other* rows plus
 * whatever the open dialog would apply. Shared by the create and edit dialogs. Purely a
 * hint — AllocationService enforces the 100% ceiling authoritatively.
 */
function TotalAllocationPanel({ existingPct, requestedPct }: { existingPct: number; requestedPct: number }) {
  const totalPct = existingPct + requestedPct;
  const remainingPct = 100 - totalPct;
  const overAllocated = totalPct > 100;
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      padding: '10px 14px', marginBottom: 14, borderRadius: 7,
      background: 'var(--raised)',
      border: `1px solid ${overAllocated ? 'var(--risk)' : 'var(--line2)'}`,
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-mut)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        Total Allocation
      </span>
      <span style={{ fontSize: 13, color: 'var(--txt-mut)' }}>
        <b style={{
          fontSize: 18, fontFamily: '"Space Grotesk", sans-serif',
          fontVariantNumeric: 'tabular-nums',
          color: overAllocated ? 'var(--risk)' : totalPct === 100 ? 'var(--warn)' : 'var(--ok)',
        }}>
          {totalPct}%
        </b>
        {existingPct > 0 && (
          <span style={{ fontSize: 11, color: 'var(--txt-dim)' }}> ({existingPct}% existing + {requestedPct}% new)</span>
        )}
        {overAllocated
          ? <span style={{ color: 'var(--risk)' }}> · {totalPct - 100}% over limit</span>
          : <span style={{ color: 'var(--txt-dim)' }}> · {remainingPct}% free</span>}
      </span>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '10px 14px', borderRadius: 7, marginBottom: 14,
      background: 'rgba(228,55,61,.10)', border: '1px solid rgba(228,55,61,.25)',
      fontSize: 12, color: '#f4a5a8',
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

function Toolbar({ count, noun, onRefetch, onAdd, addLabel }: {
  count: number | undefined; noun: string; onRefetch: () => void; onAdd: () => void; addLabel: string;
}) {
  return (
    <div style={{
      padding: '14px 20px', borderBottom: '1px solid var(--line)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
        {count != null && (
          <span style={{ color: 'var(--txt-dim)', fontWeight: 400 }}>
            {count} {count === 1 ? noun : `${noun}s`}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onRefetch}
          aria-label="Refresh"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--txt-dim)', padding: 6, display: 'flex', alignItems: 'center', borderRadius: 5,
          }}
        >
          <RefreshCw size={14} aria-hidden="true" />
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
  projectType: string;
  billingModel: string;
  status: ProjectFullDto['status'];
  startDate: string;
  endDate: string;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
  code: '', name: '', client: '', projectType: '', billingModel: '',
  status: 'ACTIVE', startDate: todayISO(), endDate: '',
};

function ProjectModal({ open, onClose, editing }: {
  open: boolean; onClose: () => void; editing: ProjectFullDto | null;
}) {
  const { showToast } = useToast();
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const [form, setForm] = useState<ProjectFormState>(EMPTY_PROJECT_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(editing ? {
      code: editing.code,
      name: editing.name,
      client: editing.client ?? '',
      projectType: editing.projectType ?? '',
      billingModel: editing.billingModel ?? '',
      status: editing.status,
      startDate: editing.startDate ?? '',
      endDate: editing.endDate ?? '',
    } : EMPTY_PROJECT_FORM);
  }, [open, editing]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  // Client Name only applies to client work; internal projects have no client by definition.
  const showClient = form.projectType === 'CLIENT';
  // End must be strictly after start — a project cannot begin and end on the same day.
  const badDateOrder = form.endDate !== '' && form.endDate <= form.startDate;
  // A completed project has to record when it finished. Status only appears when editing.
  const endDateRequired = editing != null && form.status === 'COMPLETED';
  const canSubmit = form.name.trim() !== ''
    && (editing || form.code.trim() !== '')
    && form.projectType !== ''
    && form.startDate !== ''
    && (!showClient || form.client.trim() !== '')
    && (!endDateRequired || form.endDate !== '')
    && !badDateOrder;

  function handleClose() {
    setForm(EMPTY_PROJECT_FORM);
    setError(null);
    onClose();
  }

  // Switching away from CLIENT clears the client name, so a value hidden from the form is
  // never submitted (the server also nulls it for INTERNAL).
  function handleProjectTypeChange(value: string) {
    setForm(f => ({ ...f, projectType: value, client: value === 'CLIENT' ? f.client : '' }));
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
            name: form.name.trim(),
            // Server also nulls this for INTERNAL; sent as null here so the two agree.
            client: showClient ? form.client.trim() : null,
            projectType: form.projectType,
            billingModel: form.billingModel.trim() || null,
            status: form.status,
            startDate: form.startDate,
            endDate: form.endDate || null,
          },
        });
        showToast('success', 'Project updated');
      } else {
        await createMutation.mutateAsync({
          code: form.code.trim(),
          name: form.name.trim(),
          client: showClient ? form.client.trim() : null,
          projectType: form.projectType,
          billingModel: form.billingModel.trim() || null,
          startDate: form.startDate,
          endDate: form.endDate || null,
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
        <div style={{ display: 'grid', gridTemplateColumns: editing ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
          {!editing && (
            <div>
              <label style={labelStyle}>Code *</label>
              <input style={inputStyle} value={form.code} autoFocus
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
            </div>
          )}
          <div>
            <label style={labelStyle}>Name *</label>
            <input style={inputStyle} value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
        </div>
        {/* Project Type leads, because whether Client Name is shown depends on it. */}
        <div style={{ display: 'grid', gridTemplateColumns: showClient ? '1fr 1fr' : '1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Project Type *</label>
            <select style={inputStyle} value={form.projectType}
              onChange={e => handleProjectTypeChange(e.target.value)}>
              <option value="">Select type…</option>
              <option value="CLIENT">Client</option>
              <option value="INTERNAL">Internal</option>
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
            <label style={labelStyle}>Billing Model</label>
            <select style={inputStyle} value={form.billingModel}
              onChange={e => setForm(f => ({ ...f, billingModel: e.target.value }))}>
              <option value="">—</option>
              <option value="T_AND_M">T &amp; M</option>
              <option value="FIXED_BID">Fixed Bid</option>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>Start Date *</label>
            <input type="date" style={inputStyle} value={form.startDate}
              onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>End Date{endDateRequired ? ' *' : ''}</label>
            <input type="date" style={inputStyle} value={form.endDate} min={dayAfterISO(form.startDate)}
              onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            <p style={{
              fontSize: 11, margin: '5px 0 0',
              color: badDateOrder || (endDateRequired && form.endDate === '') ? 'var(--risk)' : 'var(--txt-dim)',
            }}>
              {badDateOrder
                ? 'End Date must be after Start Date.'
                : endDateRequired
                  ? 'Required when status is Completed.'
                  : 'Leave blank if ongoing — no fixed end date.'}
            </p>
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
  const { data, isPending, isError, refetch } = useAllProjects();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectFullDto | null>(null);

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(p: ProjectFullDto) { setEditing(p); setModalOpen(true); }

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
      <Toolbar count={data?.length} noun="project" onRefetch={() => refetch()} onAdd={openCreate} addLabel="New Project" />

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
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Client</th>
              <th style={thStyle}>Timeline</th>
              <th style={thStyle}>PM</th>
              <th style={thStyle}>Headcount</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--txt-dim)' }}>
                  No projects yet. Create one above.
                </td>
              </tr>
            ) : (
              data.map(p => (
                <tr key={p.id}>
                  <td style={{ ...tdStyle, fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt-mut)' }}>{p.code}</td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{p.name}</td>
                  <td style={tdStyle}>{p.client ?? '—'}</td>
                  {/* Derived, never stored: a real end date when there is one, otherwise a word
                      taken from the status — a COMPLETED project must not read as "Ongoing". */}
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: 12 }}>
                    {p.startDate ?? '—'}
                    <span style={{ color: 'var(--txt-dim)' }}> → </span>
                    {p.endDate ?? (
                      <span style={{ color: 'var(--txt-mut)', fontStyle: 'italic' }}>
                        {p.status === 'COMPLETED' ? 'Completed' : 'Ongoing'}
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>{p.pmName ?? '—'}</td>
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
  const createMutation = useCreateAllocation();
  const [employeeId, setEmployeeId] = useState('');
  const [primaryProjectId, setPrimaryProjectId] = useState('');
  const [primaryPct, setPrimaryPct] = useState('100');
  const [secondaryProjectId, setSecondaryProjectId] = useState('');
  const [secondaryPct, setSecondaryPct] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const hasSecondary = secondaryProjectId !== '';

  // Totals are measured against what the employee already holds, so an over-commit is
  // visible before submitting rather than surfacing as a 409 afterwards.
  const selectedEmployee = employees?.find(e => String(e.id) === employeeId);
  const existingPct  = selectedEmployee?.currentAllocationPct ?? 0;
  const requestedPct = (Number(primaryPct) || 0) + (hasSecondary ? Number(secondaryPct) || 0 : 0);
  const overAllocated = existingPct + requestedPct > 100;

  const secondaryIncomplete = hasSecondary && !secondaryPct;

  function handleClose() {
    setEmployeeId('');
    setPrimaryProjectId(''); setPrimaryPct('100');
    setSecondaryProjectId(''); setSecondaryPct('');
    setEffectiveTo(''); setError(null);
    onClose();
  }

  // Clearing the secondary project must clear its % too, or a stale value would be
  // sent alongside a null project and rejected by the paired-fields check.
  function handleSecondaryProjectChange(value: string) {
    setSecondaryProjectId(value);
    if (value === '') setSecondaryPct('');
  }

  // Picking a primary that matches the current secondary would leave the secondary
  // holding a value that is no longer offered in its (filtered) list, so drop it.
  function handlePrimaryProjectChange(value: string) {
    setPrimaryProjectId(value);
    if (value !== '' && value === secondaryProjectId) {
      setSecondaryProjectId('');
      setSecondaryPct('');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !primaryProjectId || !effectiveFrom) return;
    if (overAllocated || secondaryIncomplete) return;
    setError(null);
    try {
      const created = await createMutation.mutateAsync({
        employeeId: Number(employeeId),
        primaryProjectId: Number(primaryProjectId),
        primaryPct: Number(primaryPct),
        secondaryProjectId: hasSecondary ? Number(secondaryProjectId) : null,
        secondaryPct: hasSecondary ? Number(secondaryPct) : null,
        effectiveFrom,
        effectiveTo: effectiveTo || null,
      });
      showToast('success', created.length > 1 ? 'Allocations created' : 'Allocation created');
      handleClose();
    } catch (err) {
      setError(extractApiError(err, 'Failed to create allocation'));
    }
  }

  return (
    <Modal open={open} title="New Allocation" onClose={handleClose} width={520}>
      <form onSubmit={handleSubmit} noValidate>
        {error && <ErrorBanner message={error} />}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Employee *</label>
          <select style={inputStyle} value={employeeId} onChange={e => setEmployeeId(e.target.value)} autoFocus>
            <option value="">Select employee…</option>
            {employees?.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.fullName} ({emp.employeeCode})
                {emp.currentAllocationPct > 0 ? ` — already ${emp.currentAllocationPct}%` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Primary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Primary Project *</label>
            <select style={inputStyle} value={primaryProjectId}
              onChange={e => handlePrimaryProjectChange(e.target.value)}>
              <option value="">Select project…</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Primary % *</label>
            <input type="number" min={1} max={100} style={inputStyle} value={primaryPct}
              onChange={e => setPrimaryPct(e.target.value)} />
          </div>
        </div>

        {/* Secondary — optional. The primary project is excluded from the list so the
            same project can't be picked twice. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Secondary Project</label>
            <select style={inputStyle} value={secondaryProjectId}
              onChange={e => handleSecondaryProjectChange(e.target.value)}>
              <option value="">— none —</option>
              {projects.filter(p => String(p.id) !== primaryProjectId).map(p => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Secondary %{hasSecondary ? ' *' : ''}</label>
            <input type="number" min={1} max={100} style={{ ...inputStyle, opacity: hasSecondary ? 1 : 0.5 }}
              value={secondaryPct} disabled={!hasSecondary} placeholder={hasSecondary ? '' : '—'}
              onChange={e => setSecondaryPct(e.target.value)} />
          </div>
        </div>

        <TotalAllocationPanel existingPct={existingPct} requestedPct={requestedPct} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>Effective From *</label>
            <input type="date" style={inputStyle} value={effectiveFrom}
              onChange={e => setEffectiveFrom(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Effective To</label>
            <input type="date" style={inputStyle} value={effectiveTo}
              onChange={e => setEffectiveTo(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="submit"
            disabled={createMutation.isPending || !employeeId || !primaryProjectId || !primaryPct
              || !effectiveFrom || overAllocated || secondaryIncomplete}
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
  const { data: employees } = useAssignableEmployees();
  const updateMutation = useUpdateAllocation();
  const [pct, setPct] = useState('');
  const [type, setType] = useState<AllocationType>('PRIMARY');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Re-seed whenever a different row is opened.
  useEffect(() => {
    if (!allocation) return;
    setPct(String(allocation.allocationPct));
    setType(allocation.allocationType);
    setEffectiveFrom(allocation.effectiveFrom);
    setEffectiveTo(allocation.effectiveTo ?? '');
    setError(null);
  }, [allocation]);

  // `currentAllocationPct` counts allocations active today and *includes this row*, so strip
  // this row's own contribution before adding the edited value — otherwise it double-counts
  // itself. Judged on the row's original dates: a future-dated or already-ended row was never
  // in that total, so subtracting it would under-report.
  const employee = employees?.find(e => e.id === allocation?.employeeId);
  const today = new Date().toISOString().slice(0, 10);
  const rowActiveToday = allocation != null
    && allocation.effectiveFrom <= today
    && (allocation.effectiveTo === null || allocation.effectiveTo >= today);
  const existingOtherPct = Math.max(
    0,
    (employee?.currentAllocationPct ?? 0) - (rowActiveToday ? allocation!.allocationPct : 0),
  );
  const requestedPct  = Number(pct) || 0;
  const overAllocated = existingOtherPct + requestedPct > 100;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allocation || !pct || !effectiveFrom || overAllocated) return;
    setError(null);
    try {
      await updateMutation.mutateAsync({
        id: allocation.id,
        data: {
          allocationPct: Number(pct),
          allocationType: type,
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
    <Modal open={allocation != null} title="Edit Allocation" onClose={onClose} width={520}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Allocation % *</label>
              <input type="number" min={1} max={100} style={inputStyle} value={pct} autoFocus
                onChange={e => setPct(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Type *</label>
              <select style={inputStyle} value={type}
                onChange={e => setType(e.target.value as AllocationType)}>
                <option value="PRIMARY">Primary</option>
                <option value="SECONDARY">Secondary</option>
              </select>
            </div>
          </div>

          <TotalAllocationPanel existingPct={existingOtherPct} requestedPct={requestedPct} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>Effective From *</label>
              <input type="date" style={inputStyle} value={effectiveFrom}
                onChange={e => setEffectiveFrom(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Effective To</label>
              <input type="date" style={inputStyle} value={effectiveTo}
                onChange={e => setEffectiveTo(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="submit"
              disabled={updateMutation.isPending || !pct || !effectiveFrom || overAllocated}
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
            Remove <b style={{ color: 'var(--txt)' }}>{allocation.employeeName}</b>'s {allocation.allocationPct}%
            allocation on <b style={{ color: 'var(--txt)' }}>{allocation.projectName}</b>?
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
  const { data, isPending, isError, refetch } = useAllocations(projectFilter ? Number(projectFilter) : undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [toEdit, setToEdit] = useState<AllocationDto | null>(null);
  const [toDelete, setToDelete] = useState<AllocationDto | null>(null);

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--txt-dim)' }}>
            {data?.length ?? 0} allocation{data?.length === 1 ? '' : 's'}
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
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => refetch()}
            aria-label="Refresh"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--txt-dim)', padding: 6, display: 'flex', alignItems: 'center', borderRadius: 5,
            }}
          >
            <RefreshCw size={14} aria-hidden="true" />
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
              <th style={thStyle}>Employee</th>
              <th style={thStyle}>Project</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Allocation</th>
              <th style={thStyle}>Effective From</th>
              <th style={thStyle}>Effective To</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--txt-dim)' }}>
                  No allocations yet. Create one above.
                </td>
              </tr>
            ) : (
              data.map(a => (
                <tr key={a.id}>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{a.employeeName} <span style={{ color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>{a.employeeCode}</span></td>
                  <td style={tdStyle}>{a.projectCode} — {a.projectName}</td>
                  <td style={tdStyle}><AllocationTypeBadge type={a.allocationType} /></td>
                  <td style={tdStyle}>{a.allocationPct}%</td>
                  <td style={tdStyle}>{a.effectiveFrom}</td>
                  <td style={tdStyle}>{a.effectiveTo ?? '—'}</td>
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
    </div>
  );
}
