import { useState, useId } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, AlertTriangle, RefreshCw, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import {
  listDepartments, createDepartment, toggleDepartment, deleteDepartment,
  listDesignations, createDesignation, toggleDesignation, deleteDesignation,
  listLocations, createLocation, toggleLocation, deleteLocation,
  listBillingModels, createBillingModel, toggleBillingModel, deleteBillingModel,
  extractApiError, isHttpStatus,
} from '../../api/admin';
import type { DepartmentDto, DesignationDto, OrgLocationDto, BillingModelDto } from '../../api/admin';
import { Modal } from '../../components/Modal';
import { useToast } from '../../lib/toast';

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

const inputFocus: React.CSSProperties = {
  ...inputStyle,
  borderColor: 'var(--brand-bright)',
  boxShadow: '0 0 0 3px rgba(228,55,61,.14)',
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
};

type Tab = 'departments' | 'designations' | 'locations' | 'billing-models';

// ── Status pill ────────────────────────────────────────────────────────────────

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 8px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 500,
      background: active ? 'rgba(47,182,124,.12)' : 'rgba(107,114,128,.12)',
      border: `1px solid ${active ? 'rgba(47,182,124,.3)' : 'rgba(107,114,128,.3)'}`,
      color: active ? 'var(--ok)' : 'var(--txt-dim)',
    }}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      padding: '10px 14px',
      borderRadius: 7,
      marginBottom: 14,
      background: 'rgba(228,55,61,.10)',
      border: '1px solid rgba(228,55,61,.25)',
      fontSize: 12,
      color: 'var(--risk)',
    }} role="alert">
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      {message}
    </div>
  );
}

// ── Fix 4: ConfirmModal — used before toggle (deactivate/activate) ─────────────

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  isPending?: boolean;
}

function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel, danger = false, isPending = false }: ConfirmModalProps) {
  return (
    <Modal open={open} title={title} onClose={onClose} width={420}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--txt-mut)', lineHeight: 1.7, marginBottom: 20 }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onConfirm}
            disabled={isPending}
            style={{
              padding: '9px 20px',
              background: danger ? 'rgba(228,55,61,.15)' : 'rgba(47,182,124,.15)',
              border: `1px solid ${danger ? 'rgba(228,55,61,.4)' : 'rgba(47,182,124,.4)'}`,
              borderRadius: 7,
              color: danger ? 'var(--risk)' : 'var(--ok)',
              fontSize: 13,
              fontWeight: 600,
              cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {isPending ? 'Working…' : confirmLabel}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '9px 16px',
              background: 'transparent',
              border: '1px solid var(--line2)',
              borderRadius: 7,
              color: 'var(--txt-mut)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Fix 2+4: DeleteConfirmModal — requires typing the name to unlock Delete ───

interface DeleteConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName: string;
  isPending?: boolean;
  error?: string | null;
}

function DeleteConfirmModal({ open, onClose, onConfirm, itemName, isPending = false, error }: DeleteConfirmModalProps) {
  const [typed, setTyped] = useState('');
  const match = typed.trim() === itemName.trim();

  function handleClose() {
    setTyped('');
    onClose();
  }

  return (
    <Modal open={open} title="Delete Permanently" onClose={handleClose} width={440}>
      <div>
        <div style={{
          background: 'rgba(228,55,61,.08)',
          border: '1px solid rgba(228,55,61,.25)',
          borderRadius: 8,
          padding: 14,
          marginBottom: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#E4373D', marginBottom: 8 }}>
            This action is permanent
          </div>
          <div style={{ fontSize: 13, color: 'var(--txt-mut)', lineHeight: 1.7 }}>
            Deleting <b style={{ color: 'var(--txt)' }}>{itemName}</b> cannot be undone.
            Any employees already assigned to it will retain the ID reference but
            see no name until reassigned.
          </div>
        </div>
        {error && <ErrorBanner message={error} />}
        <label style={{
          display: 'block', fontSize: 11, fontWeight: 600,
          color: 'var(--txt-mut)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em',
        }}>
          Type the name to confirm
        </label>
        <input
          style={{
            ...inputStyle,
            marginBottom: 4,
            border: `1px solid ${match ? 'rgba(228,55,61,.5)' : 'var(--line2)'}`,
          }}
          placeholder={itemName}
          value={typed}
          onChange={e => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <p style={{ fontSize: 11, color: 'var(--txt-dim)', marginBottom: 20, marginTop: 4 }}>
          Must match exactly: <code style={{ fontFamily: 'monospace', color: 'var(--txt-mut)' }}>{itemName}</code>
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={handleClose}
            style={{
              background: 'transparent', color: 'var(--txt-mut)',
              border: '1px solid var(--line2)', borderRadius: 7,
              padding: '9px 18px', fontSize: 13, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { if (match) onConfirm(); }}
            disabled={!match || isPending}
            style={{
              background: match ? '#C0392B' : 'var(--raised2)',
              color: match ? '#fff' : 'var(--txt-dim)',
              border: `1px solid ${match ? 'transparent' : 'var(--line2)'}`,
              borderRadius: 7, padding: '9px 20px', fontSize: 13, fontWeight: 600,
              cursor: !match || isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? 'Deleting…' : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Generic add modal ─────────────────────────────────────────────────────────

interface AddModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  fieldLabel: string;
  placeholder: string;
  onSubmit: (value: string) => Promise<unknown>;
  isPending: boolean;
  error: string | null;
}

function AddModal({ open, onClose, title, fieldLabel, placeholder, onSubmit, isPending, error }: AddModalProps) {
  const [value, setValue] = useState('');
  const fieldId = useId();

  function handleClose() {
    setValue('');
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    await onSubmit(value.trim());
    setValue('');
  }

  return (
    <Modal open={open} title={title} onClose={handleClose} width={420}>
      <form onSubmit={handleSubmit} noValidate>
        {error && <ErrorBanner message={error} />}
        <div style={{ marginBottom: 16 }}>
          <label htmlFor={fieldId} style={{
            display: 'block',
            fontSize: 11,
            fontWeight: 550,
            color: 'var(--txt-mut)',
            marginBottom: 5,
            letterSpacing: '0.03em',
          }}>
            {fieldLabel} *
          </label>
          <input
            id={fieldId}
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={inputStyle}
            onFocus={(e) => Object.assign(e.target.style, inputFocus)}
            onBlur={(e) => Object.assign(e.target.style, inputStyle)}
            autoFocus
          />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="submit"
            disabled={isPending || !value.trim()}
            style={{
              padding: '9px 20px',
              background: isPending ? 'var(--brand-deep)' : 'var(--brand)',
              border: 'none',
              borderRadius: 7,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: (isPending || !value.trim()) ? 'not-allowed' : 'pointer',
              transition: 'background 0.14s',
            }}
          >
            {isPending ? 'Adding…' : 'Add'}
          </button>
          <button
            type="button"
            onClick={handleClose}
            style={{
              padding: '9px 16px',
              background: 'transparent',
              border: '1px solid var(--line2)',
              borderRadius: 7,
              color: 'var(--txt-mut)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Generic org table ─────────────────────────────────────────────────────────

interface OrgTableProps<T extends { id: number; active: boolean }> {
  data: T[] | undefined;
  isPending: boolean;
  isError: boolean;
  onRefetch: () => void;
  nameKey: keyof T;
  onToggle: (item: T) => void;
  isTogglePending: boolean;
  onDelete: (item: T) => void;
  isDeletePending: boolean;
  /** Supply both to render an extra numeric column (used by Billing Models for its headcount). */
  countKey?: keyof T;
  countLabel?: string;
}

function OrgTable<T extends { id: number; active: boolean }>({
  data, isPending, isError, onRefetch, nameKey, onToggle, isTogglePending, onDelete, isDeletePending,
  countKey, countLabel,
}: OrgTableProps<T>) {
  const showCount = countKey != null && countLabel != null;
  const columnCount = showCount ? 4 : 3;
  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--line)',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
          {data != null && (
            <span style={{ color: 'var(--txt-dim)', fontWeight: 400 }}>
              {data.length} {data.length === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </div>
        <button
          onClick={onRefetch}
          aria-label="Refresh"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--txt-dim)',
            padding: 6,
            display: 'flex',
            alignItems: 'center',
            borderRadius: 5,
          }}
        >
          <RefreshCw size={14} aria-hidden="true" />
        </button>
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
          <div style={{ fontSize: 13, color: 'var(--risk)', marginBottom: 12 }}>Failed to load data.</div>
          <button onClick={onRefetch} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', background: 'var(--raised2)',
            border: '1px solid var(--line2)', borderRadius: 6,
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
              <th style={thStyle}>Name / Title</th>
              <th style={thStyle}>Status</th>
              {showCount && <th style={thStyle}>{countLabel}</th>}
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columnCount} style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--txt-dim)' }}>
                  No entries yet. Add one above.
                </td>
              </tr>
            ) : (
              data.map((item) => (
                <tr
                  key={item.id}
                  style={{ transition: 'background 0.1s' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--raised)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
                >
                  <td style={tdStyle}>
                    <span style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>
                      {String(item[nameKey])}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <ActiveBadge active={item.active} />
                  </td>
                  {showCount && (
                    <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>
                      {String(item[countKey!])}
                    </td>
                  )}
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {/* Fix 4: Toggle button triggers ConfirmModal (handled by parent) */}
                      <button
                        onClick={() => onToggle(item)}
                        disabled={isTogglePending}
                        aria-label={item.active ? 'Deactivate' : 'Activate'}
                        title={item.active ? 'Deactivate' : 'Activate'}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '5px 10px',
                          background: 'transparent',
                          border: `1px solid ${item.active ? 'rgba(228,55,61,.3)' : 'rgba(47,182,124,.3)'}`,
                          borderRadius: 6,
                          color: item.active ? 'var(--risk)' : 'var(--ok)',
                          fontSize: 11,
                          fontWeight: 500,
                          cursor: isTogglePending ? 'not-allowed' : 'pointer',
                          transition: 'background 0.14s',
                        }}
                        onMouseEnter={(e) => {
                          if (!isTogglePending) {
                            e.currentTarget.style.background = item.active
                              ? 'rgba(228,55,61,.08)'
                              : 'rgba(47,182,124,.08)';
                          }
                        }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        {item.active
                          ? <><ToggleLeft size={13} aria-hidden="true" /> Deactivate</>
                          : <><ToggleRight size={13} aria-hidden="true" /> Activate</>}
                      </button>

                      {/* Fix 2: Delete button */}
                      <button
                        onClick={() => onDelete(item)}
                        disabled={isDeletePending}
                        aria-label="Delete"
                        title="Delete permanently"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 30, height: 30,
                          background: 'rgba(228,55,61,.08)',
                          border: '1px solid rgba(228,55,61,.25)',
                          borderRadius: 6,
                          color: '#E4373D',
                          cursor: isDeletePending ? 'not-allowed' : 'pointer',
                          transition: 'background 0.14s',
                        }}
                        onMouseEnter={(e) => { if (!isDeletePending) e.currentTarget.style.background = 'rgba(228,55,61,.16)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(228,55,61,.08)'; }}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Departments tab ────────────────────────────────────────────────────────────

// ── Billing models tab ─────────────────────────────────────────────────────────

function BillingModelsTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [confirmToggleItem, setConfirmToggleItem] = useState<BillingModelDto | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<BillingModelDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['org', 'billing-models'],
    queryFn: listBillingModels,
  });

  const addMutation = useMutation({
    mutationFn: createBillingModel,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['org', 'billing-models'] });
      toast.showToast('success', `Billing model "${result.name}" added`);
      setAddOpen(false);
      setAddError(null);
    },
    onError: (err) => {
      if (isHttpStatus(err, 409)) {
        setAddError('A billing model with this name already exists.');
        return;
      }
      const msg = extractApiError(err, 'Failed to add billing model.');
      setAddError(msg);
      toast.showToast('error', msg);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleBillingModel,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['org', 'billing-models'] });
      toast.showToast('success', `"${result.name}" ${result.active ? 'activated' : 'deactivated'}`);
      setConfirmToggleItem(null);
    },
    onError: (err) => {
      const msg = extractApiError(err, 'Failed to update billing model.');
      toast.showToast('error', msg);
      setConfirmToggleItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBillingModel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', 'billing-models'] });
      toast.showToast('success', `Billing model "${confirmDeleteItem?.name}" deleted`);
      setConfirmDeleteItem(null);
      setDeleteError(null);
    },
    onError: (err) => {
      // The server returns 409 naming the project count when the model is still referenced.
      const msg = extractApiError(err, 'Failed to delete billing model.');
      setDeleteError(msg);
      toast.showToast('error', msg);
    },
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button
          onClick={() => { setAddError(null); setAddOpen(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', background: 'var(--brand)', border: 'none',
            borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={13} aria-hidden="true" />
          Add Billing Model
        </button>
      </div>

      <OrgTable<BillingModelDto>
        data={data}
        isPending={isPending}
        isError={isError}
        onRefetch={refetch}
        nameKey="name"
        countKey="employeeCount"
        countLabel="Employees"
        onToggle={(item) => setConfirmToggleItem(item)}
        isTogglePending={toggleMutation.isPending}
        onDelete={(item) => { setDeleteError(null); setConfirmDeleteItem(item); }}
        isDeletePending={deleteMutation.isPending}
      />

      <AddModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Billing Model"
        fieldLabel="Billing Model Name"
        placeholder="e.g. Retainer"
        onSubmit={(name) => addMutation.mutateAsync(name)}
        isPending={addMutation.isPending}
        error={addError}
      />

      <ConfirmModal
        open={confirmToggleItem != null}
        onClose={() => setConfirmToggleItem(null)}
        onConfirm={() => { if (confirmToggleItem) toggleMutation.mutate(confirmToggleItem.id); }}
        title={confirmToggleItem?.active ? 'Deactivate Billing Model' : 'Activate Billing Model'}
        message={confirmToggleItem?.active
          ? <>Deactivating <b style={{ color: 'var(--txt)' }}>{confirmToggleItem?.name}</b> hides it from the Project form. Projects already on it keep it and stay editable.</>
          : <>Reactivate <b style={{ color: 'var(--txt)' }}>{confirmToggleItem?.name}</b>?</>}
        confirmLabel={confirmToggleItem?.active ? 'Deactivate' : 'Activate'}
        danger={confirmToggleItem?.active}
        isPending={toggleMutation.isPending}
      />

      <DeleteConfirmModal
        open={confirmDeleteItem != null}
        onClose={() => { setConfirmDeleteItem(null); setDeleteError(null); }}
        onConfirm={() => { if (confirmDeleteItem) deleteMutation.mutate(confirmDeleteItem.id); }}
        itemName={confirmDeleteItem?.name ?? ''}
        isPending={deleteMutation.isPending}
        error={deleteError}
      />
    </div>
  );
}

function DepartmentsTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // Fix 4: confirm toggle state
  const [confirmToggleItem, setConfirmToggleItem] = useState<DepartmentDto | null>(null);
  // Fix 2: confirm delete state
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<DepartmentDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['org', 'departments'],
    queryFn: listDepartments,
  });

  const addMutation = useMutation({
    mutationFn: createDepartment,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['org', 'departments'] });
      toast.showToast('success', `Department "${result.name}" added`);
      setAddOpen(false);
      setAddError(null);
    },
    onError: (err) => {
      if (isHttpStatus(err, 409)) {
        setAddError('A department with this name already exists.');
        return;
      }
      const msg = extractApiError(err, 'Failed to add department.');
      setAddError(msg);
      toast.showToast('error', msg);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleDepartment,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['org', 'departments'] });
      toast.showToast('success', `"${result.name}" ${result.active ? 'activated' : 'deactivated'}`);
      setConfirmToggleItem(null);
    },
    onError: (err) => {
      const msg = extractApiError(err, 'Failed to update department.');
      toast.showToast('error', msg);
      setConfirmToggleItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDepartment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', 'departments'] });
      toast.showToast('success', `Department "${confirmDeleteItem?.name}" deleted`);
      setConfirmDeleteItem(null);
      setDeleteError(null);
    },
    onError: (err) => {
      const msg = extractApiError(err, 'Failed to delete department.');
      setDeleteError(msg);
      toast.showToast('error', msg);
    },
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button
          onClick={() => { setAddError(null); setAddOpen(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', background: 'var(--brand)', border: 'none',
            borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={13} aria-hidden="true" />
          Add Department
        </button>
      </div>

      <OrgTable<DepartmentDto>
        data={data}
        isPending={isPending}
        isError={isError}
        onRefetch={refetch}
        nameKey="name"
        onToggle={(item) => setConfirmToggleItem(item)}
        isTogglePending={toggleMutation.isPending}
        onDelete={(item) => { setDeleteError(null); setConfirmDeleteItem(item); }}
        isDeletePending={deleteMutation.isPending}
      />

      <AddModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Department"
        fieldLabel="Department Name"
        placeholder="e.g. Product"
        onSubmit={(name) => addMutation.mutateAsync(name)}
        isPending={addMutation.isPending}
        error={addError}
      />

      {/* Fix 4: Toggle confirmation */}
      <ConfirmModal
        open={confirmToggleItem != null}
        onClose={() => setConfirmToggleItem(null)}
        onConfirm={() => { if (confirmToggleItem) toggleMutation.mutate(confirmToggleItem.id); }}
        title={confirmToggleItem?.active ? 'Deactivate Department' : 'Activate Department'}
        message={confirmToggleItem?.active
          ? <>Deactivating <b style={{ color: 'var(--txt)' }}>{confirmToggleItem?.name}</b> will mark it inactive. Employees already assigned keep their current assignment.</>
          : <>Reactivate <b style={{ color: 'var(--txt)' }}>{confirmToggleItem?.name}</b>?</>}
        confirmLabel={confirmToggleItem?.active ? 'Deactivate' : 'Activate'}
        danger={confirmToggleItem?.active}
        isPending={toggleMutation.isPending}
      />

      {/* Fix 2+4: Delete confirmation (requires typing name) */}
      <DeleteConfirmModal
        open={confirmDeleteItem != null}
        onClose={() => { setConfirmDeleteItem(null); setDeleteError(null); }}
        onConfirm={() => { if (confirmDeleteItem) deleteMutation.mutate(confirmDeleteItem.id); }}
        itemName={confirmDeleteItem?.name ?? ''}
        isPending={deleteMutation.isPending}
        error={deleteError}
      />
    </div>
  );
}

// ── Designations tab ───────────────────────────────────────────────────────────

function DesignationsTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [confirmToggleItem, setConfirmToggleItem] = useState<DesignationDto | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<DesignationDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['org', 'designations'],
    queryFn: listDesignations,
  });

  const addMutation = useMutation({
    mutationFn: createDesignation,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['org', 'designations'] });
      toast.showToast('success', `Designation "${result.title}" added`);
      setAddOpen(false);
      setAddError(null);
    },
    onError: (err) => {
      if (isHttpStatus(err, 409)) {
        setAddError('A designation with this title already exists.');
        return;
      }
      const msg = extractApiError(err, 'Failed to add designation.');
      setAddError(msg);
      toast.showToast('error', msg);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleDesignation,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['org', 'designations'] });
      toast.showToast('success', `"${result.title}" ${result.active ? 'activated' : 'deactivated'}`);
      setConfirmToggleItem(null);
    },
    onError: (err) => {
      const msg = extractApiError(err, 'Failed to update designation.');
      toast.showToast('error', msg);
      setConfirmToggleItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDesignation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', 'designations'] });
      toast.showToast('success', `Designation "${confirmDeleteItem?.title}" deleted`);
      setConfirmDeleteItem(null);
      setDeleteError(null);
    },
    onError: (err) => {
      const msg = extractApiError(err, 'Failed to delete designation.');
      setDeleteError(msg);
      toast.showToast('error', msg);
    },
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button
          onClick={() => { setAddError(null); setAddOpen(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', background: 'var(--brand)', border: 'none',
            borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={13} aria-hidden="true" />
          Add Designation
        </button>
      </div>

      <OrgTable<DesignationDto>
        data={data}
        isPending={isPending}
        isError={isError}
        onRefetch={refetch}
        nameKey="title"
        onToggle={(item) => setConfirmToggleItem(item)}
        isTogglePending={toggleMutation.isPending}
        onDelete={(item) => { setDeleteError(null); setConfirmDeleteItem(item); }}
        isDeletePending={deleteMutation.isPending}
      />

      <AddModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Designation"
        fieldLabel="Designation Title"
        placeholder="e.g. Senior Engineer"
        onSubmit={(title) => addMutation.mutateAsync(title)}
        isPending={addMutation.isPending}
        error={addError}
      />

      <ConfirmModal
        open={confirmToggleItem != null}
        onClose={() => setConfirmToggleItem(null)}
        onConfirm={() => { if (confirmToggleItem) toggleMutation.mutate(confirmToggleItem.id); }}
        title={confirmToggleItem?.active ? 'Deactivate Designation' : 'Activate Designation'}
        message={confirmToggleItem?.active
          ? <>Deactivating <b style={{ color: 'var(--txt)' }}>{confirmToggleItem?.title}</b> will mark it inactive.</>
          : <>Reactivate <b style={{ color: 'var(--txt)' }}>{confirmToggleItem?.title}</b>?</>}
        confirmLabel={confirmToggleItem?.active ? 'Deactivate' : 'Activate'}
        danger={confirmToggleItem?.active}
        isPending={toggleMutation.isPending}
      />

      <DeleteConfirmModal
        open={confirmDeleteItem != null}
        onClose={() => { setConfirmDeleteItem(null); setDeleteError(null); }}
        onConfirm={() => { if (confirmDeleteItem) deleteMutation.mutate(confirmDeleteItem.id); }}
        itemName={confirmDeleteItem?.title ?? ''}
        isPending={deleteMutation.isPending}
        error={deleteError}
      />
    </div>
  );
}

// ── Locations tab ──────────────────────────────────────────────────────────────

function LocationsTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [confirmToggleItem, setConfirmToggleItem] = useState<OrgLocationDto | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<OrgLocationDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['org', 'locations'],
    queryFn: listLocations,
  });

  const addMutation = useMutation({
    mutationFn: createLocation,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['org', 'locations'] });
      toast.showToast('success', `Location "${result.name}" added`);
      setAddOpen(false);
      setAddError(null);
    },
    onError: (err) => {
      if (isHttpStatus(err, 409)) {
        setAddError('A location with this name already exists.');
        return;
      }
      const msg = extractApiError(err, 'Failed to add location.');
      setAddError(msg);
      toast.showToast('error', msg);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleLocation,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['org', 'locations'] });
      toast.showToast('success', `"${result.name}" ${result.active ? 'activated' : 'deactivated'}`);
      setConfirmToggleItem(null);
    },
    onError: (err) => {
      const msg = extractApiError(err, 'Failed to update location.');
      toast.showToast('error', msg);
      setConfirmToggleItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLocation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', 'locations'] });
      toast.showToast('success', `Location "${confirmDeleteItem?.name}" deleted`);
      setConfirmDeleteItem(null);
      setDeleteError(null);
    },
    onError: (err) => {
      const msg = extractApiError(err, 'Failed to delete location.');
      setDeleteError(msg);
      toast.showToast('error', msg);
    },
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button
          onClick={() => { setAddError(null); setAddOpen(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', background: 'var(--brand)', border: 'none',
            borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={13} aria-hidden="true" />
          Add Location
        </button>
      </div>

      <OrgTable<OrgLocationDto>
        data={data}
        isPending={isPending}
        isError={isError}
        onRefetch={refetch}
        nameKey="name"
        onToggle={(item) => setConfirmToggleItem(item)}
        isTogglePending={toggleMutation.isPending}
        onDelete={(item) => { setDeleteError(null); setConfirmDeleteItem(item); }}
        isDeletePending={deleteMutation.isPending}
      />

      <AddModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Location"
        fieldLabel="Location Name"
        placeholder="e.g. Pune"
        onSubmit={(name) => addMutation.mutateAsync(name)}
        isPending={addMutation.isPending}
        error={addError}
      />

      <ConfirmModal
        open={confirmToggleItem != null}
        onClose={() => setConfirmToggleItem(null)}
        onConfirm={() => { if (confirmToggleItem) toggleMutation.mutate(confirmToggleItem.id); }}
        title={confirmToggleItem?.active ? 'Deactivate Location' : 'Activate Location'}
        message={confirmToggleItem?.active
          ? <>Deactivating <b style={{ color: 'var(--txt)' }}>{confirmToggleItem?.name}</b> will mark it inactive.</>
          : <>Reactivate <b style={{ color: 'var(--txt)' }}>{confirmToggleItem?.name}</b>?</>}
        confirmLabel={confirmToggleItem?.active ? 'Deactivate' : 'Activate'}
        danger={confirmToggleItem?.active}
        isPending={toggleMutation.isPending}
      />

      <DeleteConfirmModal
        open={confirmDeleteItem != null}
        onClose={() => { setConfirmDeleteItem(null); setDeleteError(null); }}
        onConfirm={() => { if (confirmDeleteItem) deleteMutation.mutate(confirmDeleteItem.id); }}
        itemName={confirmDeleteItem?.name ?? ''}
        isPending={deleteMutation.isPending}
        error={deleteError}
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string }[] = [
  { key: 'departments',  label: 'Departments' },
  { key: 'designations', label: 'Designations' },
  { key: 'locations',    label: 'Locations' },
  { key: 'billing-models', label: 'Billing Models' },
];

export default function OrganizationMasters() {
  const [activeTab, setActiveTab] = useState<Tab>('departments');

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 24,
          fontWeight: 700,
          color: 'var(--txt)',
          margin: '0 0 4px',
          letterSpacing: '-0.01em',
        }}>
          Organization Masters
        </h1>
        <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
          Manage departments, designations, locations, and billing models used across the platform.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        gap: 2,
        borderBottom: '1px solid var(--line)',
        marginBottom: 20,
      }}>
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '9px 18px',
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--brand)' : '2px solid transparent',
                marginBottom: -1,
                color: isActive ? 'var(--brand)' : 'var(--txt-mut)',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                transition: 'color 0.14s',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'departments'  && <DepartmentsTab />}
      {activeTab === 'designations' && <DesignationsTab />}
      {activeTab === 'locations'    && <LocationsTab />}
      {activeTab === 'billing-models' && <BillingModelsTab />}
    </div>
  );
}
