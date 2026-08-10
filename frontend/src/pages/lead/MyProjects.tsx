import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, AlertTriangle, Search, X } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { useToast } from '../../lib/toast';
import { extractApiError } from '../../api/admin';
import {
  useMyLeadProjects, useMyCategories, useCreateProjectCategory, useProjectDetail,
} from '../../api/teamLeadProjects';
import type { ProjectFullDto, ProjectCategoryDto } from '../../api/teamLeadProjects';

type ProjectStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'ON_HOLD';
type CategoryStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

// ── Shared styles (mirrors pages/pm/ProjectsAllocation.tsx for visual consistency) ────

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

/** ISO `yyyy-MM-dd` → `DD-MM-YYYY`; a plain hyphen when absent. */
function fmtDateDMY(iso: string | null | undefined): string {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}-${m}-${y}` : iso;
}

// ── Search box (mirrors pages/pm/ProjectsAllocation.tsx search pattern) ─────────

function SearchBox({ value, onChange, placeholder, ariaLabel }: {
  value: string; onChange: (v: string) => void; placeholder: string; ariaLabel: string;
}) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', width: '100%', maxWidth: 320 }}>
      <Search
        size={13} aria-hidden="true"
        style={{ position: 'absolute', left: 10, color: 'var(--txt-dim)', pointerEvents: 'none' }}
      />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        style={{ ...inputStyle, paddingLeft: 30, paddingRight: value !== '' ? 30 : 12, fontWeight: 400 }}
      />
      {value !== '' && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
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
  );
}

// ── Status filter select (toolbar, alongside search) ────────────────────────────

function StatusFilterSelect({ value, onChange, options, ariaLabel }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <label style={{ fontSize: 12, fontWeight: 550, color: 'var(--txt-mut)', whiteSpace: 'nowrap' }}>
        Status
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={ariaLabel}
        style={{ ...inputStyle, width: 'auto', minWidth: 130, fontWeight: 400 }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Projects panel ──────────────────────────────────────────────────────────────

function ProjectsPanel({ projects, isPending, isError, refetch, selectedProjectId, onSelect, onOpenDetails }: {
  projects: ProjectFullDto[];
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
  selectedProjectId: number | undefined;
  onSelect: (id: number) => void;
  onOpenDetails: (id: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>('ALL');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projects.filter(p => {
      const matchesSearch = term === ''
        || p.name.toLowerCase().includes(term)
        || p.code.toLowerCase().includes(term)
        || (p.client ?? '').toLowerCase().includes(term);
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, search, statusFilter]);

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
          Assigned Projects{projects.length > 0 ? ` (${projects.length})` : ''}
        </span>
        <button
          onClick={() => refetch()}
          aria-label="Refresh"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: '1px solid var(--line2)', cursor: 'pointer',
            color: 'var(--txt-mut)', padding: '7px 10px', borderRadius: 6, fontSize: 12,
          }}
        >
          <RefreshCw size={13} aria-hidden="true" />
        </button>
      </div>

      {!isPending && !isError && projects.length > 0 && (
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ flex: '1 1 260px', maxWidth: 320 }}>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Search assigned projects..."
              ariaLabel="Search assigned projects by name, client, or code"
            />
          </div>
          <StatusFilterSelect
            value={statusFilter}
            onChange={v => setStatusFilter(v as ProjectStatusFilter)}
            ariaLabel="Filter assigned projects by status"
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Inactive' },
              { value: 'ON_HOLD', label: 'On Hold' },
            ]}
          />
        </div>
      )}

      {isPending && (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 40, borderRadius: 6 }} />
          ))}
        </div>
      )}

      {isError && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--risk)', marginBottom: 12 }}>Failed to load your projects.</div>
          <button onClick={() => refetch()} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
            background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6,
            color: 'var(--txt)', fontSize: 12, cursor: 'pointer',
          }}>
            <RefreshCw size={13} aria-hidden="true" /> Retry
          </button>
        </div>
      )}

      {!isPending && !isError && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Project</th>
              <th style={thStyle}>Client</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Start Date</th>
              <th style={thStyle}>End Date</th>
              <th style={thStyle}>Team Size</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--txt-dim)' }}>
                  No projects are currently assigned to you.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--txt-dim)' }}>
                  No matching projects found.
                </td>
              </tr>
            ) : (
              filtered.map(p => (
                <tr
                  key={p.id}
                  onClick={() => onSelect(p.id)}
                  style={{
                    cursor: 'pointer',
                    background: p.id === selectedProjectId ? 'color-mix(in srgb, var(--brand) 8%, transparent)' : 'transparent',
                  }}
                >
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); onOpenDetails(p.id); }}
                      title="View project details"
                      style={{
                        background: 'none', border: 'none', padding: 0, margin: 0,
                        cursor: 'pointer', textAlign: 'left', font: 'inherit',
                        color: 'var(--brand)', fontWeight: 500,
                        textDecoration: 'underline',
                        textDecorationColor: 'color-mix(in srgb, var(--brand) 40%, transparent)',
                      }}
                    >
                      {p.name}
                    </button>
                    <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace', marginTop: 2 }}>
                      {p.code}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--txt-mut)' }}>{p.client ?? 'Internal'}</td>
                  <td style={tdStyle}><StatusBadge status={p.status} /></td>
                  <td style={{ ...tdStyle, color: 'var(--txt-mut)' }}>{fmtDateDMY(p.startDate)}</td>
                  <td style={{ ...tdStyle, color: 'var(--txt-mut)' }}>{p.endDate ? fmtDateDMY(p.endDate) : 'Ongoing'}</td>
                  <td style={{ ...tdStyle, color: 'var(--txt-mut)' }}>{p.allocatedHeadcount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── New Category modal ────────────────────────────────────────────────────────

interface CategoryFormState {
  name: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE';
}

function emptyForm(): CategoryFormState {
  return { name: '', description: '', status: 'ACTIVE' };
}

function NewCategoryModal({ open, onClose }: {
  open: boolean; onClose: () => void;
}) {
  const { showToast } = useToast();
  const createMutation = useCreateProjectCategory();
  const [form, setForm] = useState<CategoryFormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setForm(emptyForm());
    setError(null);
  }, [open]);

  const canSubmit = form.name.trim() !== '';

  function handleClose() {
    setForm(emptyForm());
    setError(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      await createMutation.mutateAsync({
        name: form.name.trim(),
        description: form.description.trim() || null,
        status: form.status,
      });
      showToast('success', 'Category created');
      handleClose();
    } catch (err) {
      setError(extractApiError(err, 'Failed to create category'));
    }
  }

  return (
    <Modal open={open} title="New Category" onClose={handleClose} width={480}>
      <form onSubmit={handleSubmit} noValidate>
        {error && <ErrorBanner message={error} />}

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Category Name *</label>
          <input style={inputStyle} value={form.name} autoFocus
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>
            Description<span style={{ fontWeight: 400, color: 'var(--txt-dim)' }}> (Optional)</span>
          </label>
          <textarea
            style={{ ...inputStyle, minHeight: 64, resize: 'vertical', fontFamily: 'Inter, sans-serif' }}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Status</label>
          <select style={inputStyle} value={form.status}
            onChange={e => setForm(f => ({ ...f, status: e.target.value as CategoryFormState['status'] }))}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="submit"
            disabled={createMutation.isPending || !canSubmit}
            style={{
              padding: '9px 20px', background: 'var(--brand)', border: 'none', borderRadius: 7,
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: createMutation.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {createMutation.isPending ? 'Saving…' : 'Create Category'}
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

// ── Category panel ─────────────────────────────────────────────────────────────

function CategoryPanel() {
  // Categories are generic master data owned by the Team Lead — always fetched, never gated
  // on whether any project is assigned.
  const { data, isPending, isError, refetch } = useMyCategories();
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CategoryStatusFilter>('ALL');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? []).filter(c => {
      const matchesSearch = term === ''
        || c.name.toLowerCase().includes(term)
        || (c.description ?? '').toLowerCase().includes(term);
      const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [data, search, statusFilter]);

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>Existing Categories</span>
        <button
          onClick={() => setModalOpen(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', background: 'var(--brand)', border: 'none',
            borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={14} aria-hidden="true" /> New Category
        </button>
      </div>

      {!isPending && !isError && (data ?? []).length > 0 && (
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ flex: '1 1 260px', maxWidth: 320 }}>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Search existing categories..."
              ariaLabel="Search existing categories by name or description"
            />
          </div>
          <StatusFilterSelect
            value={statusFilter}
            onChange={v => setStatusFilter(v as CategoryStatusFilter)}
            ariaLabel="Filter existing categories by status"
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Inactive' },
            ]}
          />
        </div>
      )}

      {isPending && (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 40, borderRadius: 6 }} />
          ))}
        </div>
      )}

      {isError && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--risk)', marginBottom: 12 }}>Failed to load categories.</div>
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
              <th style={thStyle}>Category Name</th>
              <th style={thStyle}>Description</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--txt-dim)' }}>
                  No categories yet. Create one above.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--txt-dim)' }}>
                  No matching categories found.
                </td>
              </tr>
            ) : (
              filtered.map((c: ProjectCategoryDto) => (
                <tr key={c.id}>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{c.name}</td>
                  <td style={{ ...tdStyle, color: 'var(--txt-mut)' }}>{c.description ?? '-'}</td>
                  <td style={tdStyle}><StatusBadge status={c.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      <NewCategoryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}

// ── Project details modal ───────────────────────────────────────────────────────

const detailLabelStyle: React.CSSProperties = { ...labelStyle, marginBottom: 0 };
const detailValueStyle: React.CSSProperties = { fontSize: 13, color: 'var(--txt)' };

function ProjectDetailsModal({ projectId, onClose }: { projectId: number | null; onClose: () => void }) {
  const { data, isPending, isError } = useProjectDetail(projectId);

  return (
    <Modal open={projectId != null} title={data ? data.name : 'Project Details'} onClose={onClose} width={560}>
      {isPending && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 18, borderRadius: 6 }} />
          ))}
        </div>
      )}

      {isError && <ErrorBanner message="Failed to load project details." />}

      {data && (
        <>
          <div style={{
            display: 'grid', gridTemplateColumns: '120px 1fr',
            rowGap: 10, columnGap: 12, marginBottom: 24,
          }}>
            <span style={detailLabelStyle}>Project Name</span>
            <span style={{ ...detailValueStyle, fontWeight: 500 }}>{data.name}</span>

            <span style={detailLabelStyle}>Client</span>
            <span style={{ ...detailValueStyle, color: 'var(--txt-mut)' }}>{data.client ?? 'Internal'}</span>

            <span style={detailLabelStyle}>Status</span>
            <span><StatusBadge status={data.status} /></span>

            <span style={detailLabelStyle}>Start Date</span>
            <span style={{ ...detailValueStyle, color: 'var(--txt-mut)' }}>{fmtDateDMY(data.startDate)}</span>

            <span style={detailLabelStyle}>End Date</span>
            <span style={{ ...detailValueStyle, color: 'var(--txt-mut)' }}>
              {data.endDate ? fmtDateDMY(data.endDate) : 'Ongoing'}
            </span>
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', marginBottom: 10, letterSpacing: '0.02em' }}>
            Assigned Employees{data.employees.length > 0 ? ` (${data.employees.length})` : ''}
          </div>

          <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 56 }}>S.No</th>
                  <th style={thStyle}>Employee Name</th>
                </tr>
              </thead>
              <tbody>
                {data.employees.length === 0 ? (
                  <tr>
                    <td colSpan={2} style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: 'var(--txt-dim)' }}>
                      No employees are currently assigned to this project.
                    </td>
                  </tr>
                ) : (
                  data.employees.map((emp, i) => (
                    <tr key={emp.id}>
                      <td style={{ ...tdStyle, color: 'var(--txt-mut)' }}>{i + 1}</td>
                      <td style={tdStyle}>{emp.fullName}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Section tabs ───────────────────────────────────────────────────────────────

type SectionTab = 'projects' | 'categories';

const SECTION_TABS: { key: SectionTab; label: string }[] = [
  { key: 'projects', label: 'My Projects' },
  { key: 'categories', label: 'Category Management' },
];

function SectionTabBar({ active, onChange }: { active: SectionTab; onChange: (tab: SectionTab) => void }) {
  return (
    <div
      role="tablist"
      style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}
    >
      {SECTION_TABS.map(tab => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            style={{
              padding: '8px 15px',
              borderRadius: 20,
              border: `1px solid ${isActive ? 'var(--brand)' : 'var(--line2)'}`,
              background: isActive ? 'var(--brand)' : 'var(--raised2)',
              color: isActive ? '#fff' : 'var(--txt-dim)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MyProjects() {
  const { data: projects, isPending, isError, refetch } = useMyLeadProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);
  const [activeSection, setActiveSection] = useState<SectionTab>('projects');
  const [detailsProjectId, setDetailsProjectId] = useState<number | null>(null);

  const list = useMemo(() => projects ?? [], [projects]);

  // Default the category panel to the first assigned project once the list loads.
  useEffect(() => {
    if (selectedProjectId == null && list.length > 0) {
      setSelectedProjectId(list[0].id);
    }
  }, [list, selectedProjectId]);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
          {activeSection === 'projects' ? 'My Projects' : 'Category Management'}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
          {activeSection === 'projects'
            ? 'View and track the projects assigned to you.'
            : 'View and manage the categories used to organize your work.'}
        </p>
      </div>

      <SectionTabBar active={activeSection} onChange={setActiveSection} />

      {activeSection === 'projects' && (
        <ProjectsPanel
          projects={list}
          isPending={isPending}
          isError={isError}
          refetch={refetch}
          selectedProjectId={selectedProjectId}
          onSelect={setSelectedProjectId}
          onOpenDetails={setDetailsProjectId}
        />
      )}

      {activeSection === 'categories' && <CategoryPanel />}

      <ProjectDetailsModal
        projectId={detailsProjectId}
        onClose={() => setDetailsProjectId(null)}
      />
    </div>
  );
}
