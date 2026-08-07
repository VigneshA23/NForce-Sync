import { useEffect, useMemo, useState } from 'react';
import { FolderKanban, Plus, RefreshCw, AlertTriangle, Users, Calendar, Tag } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { useToast } from '../../lib/toast';
import { extractApiError } from '../../api/admin';
import {
  useMyLeadProjects, useMyCategories, useCreateProjectCategory,
} from '../../api/teamLeadProjects';
import type { ProjectFullDto, ProjectCategoryDto } from '../../api/teamLeadProjects';

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

const CATEGORY_COLORS = ['#4C8DD6', '#2FB67C', '#E0A93B', '#E4373D', '#9B6DFF', '#14B8A6'];

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

// ── Project card ───────────────────────────────────────────────────────────────

function ProjectCard({ project, selected, onSelect }: {
  project: ProjectFullDto; selected: boolean; onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        textAlign: 'left', cursor: 'pointer', width: '100%',
        background: 'var(--panel)',
        border: `1px solid ${selected ? 'var(--brand)' : 'var(--line)'}`,
        borderRadius: 10, padding: 16,
        display: 'flex', flexDirection: 'column', gap: 10,
        boxShadow: selected ? '0 0 0 1px var(--brand)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)' }}>{project.name}</div>
          <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace', marginTop: 2 }}>
            {project.code}
          </div>
        </div>
        <StatusBadge status={project.status} />
      </div>

      <div style={{ fontSize: 12, color: 'var(--txt-mut)' }}>
        {project.client ?? 'Internal'}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--txt-dim)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Calendar size={12} aria-hidden="true" />
          {fmtDateDMY(project.startDate)} → {project.endDate ? fmtDateDMY(project.endDate) : 'Ongoing'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Users size={12} aria-hidden="true" />
          {project.allocatedHeadcount} on team
        </span>
      </div>
    </button>
  );
}

// ── New Category modal ────────────────────────────────────────────────────────

interface CategoryFormState {
  projectId: string;
  name: string;
  code: string;
  description: string;
  color: string;
  status: 'ACTIVE' | 'INACTIVE';
}

function emptyForm(defaultProjectId: number | undefined): CategoryFormState {
  return {
    projectId: defaultProjectId != null ? String(defaultProjectId) : '',
    name: '', code: '', description: '', color: CATEGORY_COLORS[0], status: 'ACTIVE',
  };
}

function NewCategoryModal({ open, onClose, projects, defaultProjectId }: {
  open: boolean; onClose: () => void; projects: ProjectFullDto[]; defaultProjectId: number | undefined;
}) {
  const { showToast } = useToast();
  const createMutation = useCreateProjectCategory();
  const [form, setForm] = useState<CategoryFormState>(emptyForm(defaultProjectId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setForm(emptyForm(defaultProjectId));
    setError(null);
  }, [open, defaultProjectId]);

  const canSubmit = form.name.trim() !== '';

  function handleClose() {
    setForm(emptyForm(undefined));
    setError(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      await createMutation.mutateAsync({
        projectId: form.projectId !== '' ? Number(form.projectId) : null,
        name: form.name.trim(),
        code: form.code.trim() || null,
        description: form.description.trim() || null,
        color: form.color || null,
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>
              Associated Project<span style={{ fontWeight: 400, color: 'var(--txt-dim)' }}> (Optional)</span>
            </label>
            <select style={inputStyle} value={form.projectId}
              onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}>
              <option value="">None</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>
              Category Code<span style={{ fontWeight: 400, color: 'var(--txt-dim)' }}> (Optional)</span>
            </label>
            <input style={inputStyle} value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
          </div>
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>
              Color<span style={{ fontWeight: 400, color: 'var(--txt-dim)' }}> (Optional)</span>
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 4 }}>
              {CATEGORY_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  style={{
                    width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                    border: form.color === c ? '2px solid var(--txt)' : '2px solid transparent',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select style={inputStyle} value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value as CategoryFormState['status'] }))}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
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

function CategoryPanel({ projects, defaultProjectId }: {
  projects: ProjectFullDto[]; defaultProjectId: number | undefined;
}) {
  // Categories are generic master data owned by the Team Lead — always fetched, never gated
  // on whether any project is assigned.
  const { data, isPending, isError, refetch } = useMyCategories();
  const [modalOpen, setModalOpen] = useState(false);

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
            ) : (
              data.map((c: ProjectCategoryDto) => (
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
        projects={projects}
        defaultProjectId={defaultProjectId}
      />
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MyProjects() {
  const { data: projects, isPending, isError, refetch } = useMyLeadProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);

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
          My Projects
        </h1>
        <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
          View the projects assigned to you, and manage the categories you use to organize your work.
        </p>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--txt-dim)' }}>
          <FolderKanban size={14} aria-hidden="true" />
          {list.length} {list.length === 1 ? 'project' : 'projects'}
        </span>
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
      </div>

      {isPending && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, marginBottom: 24,
        }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 120, borderRadius: 10 }} />
          ))}
        </div>
      )}

      {isError && (
        <div style={{ padding: '40px 20px', textAlign: 'center', marginBottom: 24 }}>
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

      {projects && (
        list.length === 0 ? (
          <div style={{
            background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10,
            padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--txt-dim)', marginBottom: 24,
          }}>
            No projects are currently assigned to you.
          </div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, marginBottom: 24,
          }}>
            {list.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                selected={p.id === selectedProjectId}
                onSelect={() => setSelectedProjectId(p.id)}
              />
            ))}
          </div>
        )
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
        <Tag size={14} aria-hidden="true" /> Category Management
      </div>
      <CategoryPanel projects={list} defaultProjectId={selectedProjectId} />
    </div>
  );
}
