import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Pencil, Trash2 } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { DropdownMenu } from '../../components/DropdownMenu';
import { useToast } from '../../lib/toast';
import { extractApiError } from '../../api/admin';
import {
  useMyLeadProjects, useMyCategories, useCreateProjectCategory, useUpdateProjectCategory,
  useDeleteProjectCategory, useProjectDetail,
} from '../../api/teamLeadProjects';
import type { ProjectCategoryDto } from '../../api/teamLeadProjects';
import {
  inputStyle, labelStyle, thStyle, tdStyle, detailLabelStyle, detailValueStyle,
  StatusBadge, ErrorBanner, fmtDateDMY, SearchBox, StatusFilterSelect, ProjectsPanel,
} from '../../components/projects/MyProjectsShared';

type CategoryStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

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

// ── Edit Category modal ──────────────────────────────────────────────────────

function EditCategoryModal({ category, onClose }: {
  category: ProjectCategoryDto | null; onClose: () => void;
}) {
  const { showToast } = useToast();
  const updateMutation = useUpdateProjectCategory();
  const [form, setForm] = useState<CategoryFormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (category) {
      setForm({
        name: category.name,
        description: category.description ?? '',
        status: category.status,
      });
      setError(null);
    }
  }, [category]);

  const canSubmit = form.name.trim() !== '';

  function handleClose() {
    setError(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category || !canSubmit) return;
    setError(null);
    try {
      await updateMutation.mutateAsync({
        id: category.id,
        data: {
          name: form.name.trim(),
          description: form.description.trim() || null,
          status: form.status,
        },
      });
      showToast('success', 'Category updated');
      handleClose();
    } catch (err) {
      setError(extractApiError(err, 'Failed to update category'));
    }
  }

  return (
    <Modal open={category != null} title="Edit Category" onClose={handleClose} width={480}>
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
            disabled={updateMutation.isPending || !canSubmit}
            style={{
              padding: '9px 20px', background: 'var(--brand)', border: 'none', borderRadius: 7,
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: updateMutation.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
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

// ── Delete Category modal ────────────────────────────────────────────────────

function DeleteCategoryModal({ category, onClose }: {
  category: ProjectCategoryDto | null; onClose: () => void;
}) {
  const { showToast } = useToast();
  const deleteMutation = useDeleteProjectCategory();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setError(null); }, [category]);

  async function handleConfirm() {
    if (!category) return;
    setError(null);
    try {
      const result = await deleteMutation.mutateAsync(category.id);
      showToast('success', result.deleted
        ? 'Category deleted'
        : 'Category has recorded EOD history — marked Inactive instead of deleted');
      onClose();
    } catch (err) {
      setError(extractApiError(err, 'Failed to delete category'));
    }
  }

  return (
    <Modal open={category != null} title="Delete Category?" onClose={onClose} width={420}>
      {category && (
        <div>
          {error && <ErrorBanner message={error} />}
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', lineHeight: 1.7, marginBottom: 20 }}>
            Are you sure you want to delete <b style={{ color: 'var(--txt)' }}>&lsquo;{category.name}&rsquo;</b>?
            If it has already been used in EOD submissions it will be marked Inactive instead of removed,
            so historical records are not affected.
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
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
            <button onClick={onClose} disabled={deleteMutation.isPending} style={{
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

// ── Category panel ─────────────────────────────────────────────────────────────

function CategoryPanel() {
  // Categories are generic master data owned by the Team Lead — always fetched, never gated
  // on whether any project is assigned.
  const { data, isPending, isError, refetch } = useMyCategories();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProjectCategoryDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectCategoryDto | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
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
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ flex: '0 1 320px', maxWidth: 320 }}>
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
              { value: 'ALL', label: 'Filter by status' },
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
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--txt-dim)' }}>
                  No categories yet. Create one above.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--txt-dim)' }}>
                  No matching categories found.
                </td>
              </tr>
            ) : (
              filtered.map((c: ProjectCategoryDto) => (
                <tr key={c.id}>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{c.name}</td>
                  <td style={{ ...tdStyle, color: 'var(--txt-mut)' }}>{c.description ?? '-'}</td>
                  <td style={tdStyle}><StatusBadge status={c.status} /></td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <DropdownMenu
                        ariaLabel={`Actions for ${c.name}`}
                        open={openMenuId === c.id}
                        onOpenChange={o => setOpenMenuId(o ? c.id : null)}
                        items={[
                          { key: 'edit', label: 'Edit', icon: Pencil, onSelect: () => setEditTarget(c) },
                          { key: 'delete', label: 'Delete', icon: Trash2, color: '#E4373D', onSelect: () => setDeleteTarget(c) },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      <EditCategoryModal category={editTarget} onClose={() => setEditTarget(null)} />
      <DeleteCategoryModal category={deleteTarget} onClose={() => setDeleteTarget(null)} />

      <NewCategoryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}

// ── Project details modal ───────────────────────────────────────────────────────

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
  const { data: projects, isPending, isError, isFetching, refetch } = useMyLeadProjects();
  const { showToast } = useToast();
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);
  const [activeSection, setActiveSection] = useState<SectionTab>('projects');
  const [detailsProjectId, setDetailsProjectId] = useState<number | null>(null);

  const list = useMemo(() => projects ?? [], [projects]);

  // Background refetch only — the initial load already renders its own skeleton via isPending,
  // so this only covers the icon-spin/disabled state on the Refresh button.
  const isRefreshing = !isPending && isFetching;

  // Pulls the latest projects/status/client/team-size data from the backend rather than
  // re-rendering whatever is already cached. A failed refresh keeps the currently displayed
  // data on screen (React Query never clears `data` on a background refetch error) and surfaces
  // the failure via a toast so the Team Lead can simply try again.
  async function handleRefresh() {
    if (isRefreshing) return;
    const result = await refetch();
    if (result.isError) {
      showToast('error', extractApiError(result.error, 'Failed to refresh projects'));
    }
  }

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
          isRefreshing={isRefreshing}
          onRefresh={handleRefresh}
          selectedProjectId={selectedProjectId}
          onSelect={setSelectedProjectId}
          onOpenDetails={setDetailsProjectId}
          boldNameLink
          compactToolbar
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
