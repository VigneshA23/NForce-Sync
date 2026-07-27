import { useState, useId, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserPlus, X, Pencil, Power, RotateCcw, Trash2,
  AlertTriangle, Copy, Check, RefreshCw, ChevronDown,
} from 'lucide-react';
import { api } from '../../api/client';
import {
  listUsers, createUser, updateUser, setUserStatus, resetPassword,
  extractApiError, extractFieldErrors, isHttpStatus,
  listDepartments, listDesignations, listLocations, createLocation,
} from '../../api/admin';
import type { UserDto, CreateUserPayload, UpdateUserPayload, DepartmentDto, DesignationDto, OrgLocationDto } from '../../api/admin';
import { toRole } from '../../api/auth';
import { ROLE_COLORS, ROLE_LABELS } from '../../lib/nav';
import { Modal } from '../../components/Modal';
import { useToast } from '../../lib/toast';

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { label: 'Employee',          value: 'EMPLOYEE' },
  { label: 'Team Lead',         value: 'MANAGER' },
  { label: 'Project Manager',   value: 'PM' },
  { label: 'Delivery Manager',  value: 'DM' },
  { label: 'HR Admin',          value: 'HR' },
  { label: 'Finance Admin',     value: 'FINANCE' },
  { label: 'Leadership Viewer', value: 'LEADERSHIP' },
  { label: 'Super Admin',       value: 'SUPERADMIN' },
];

const EMPLOYMENT_TYPES = [
  { value: 'FULL_TIME',  label: 'Full Time' },
  { value: 'PART_TIME',  label: 'Part Time' },
  { value: 'CONTRACT',   label: 'Contract' },
  { value: 'INTERN',     label: 'Intern' },
];

const WORK_MODES = [
  { value: 'ONSITE', label: 'Onsite' },
  { value: 'HYBRID', label: 'Hybrid' },
  { value: 'REMOTE', label: 'Remote' },
];

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--shell)', border: '1px solid var(--line2)',
  borderRadius: 6, padding: '9px 12px', color: 'var(--txt)', fontSize: 13,
  outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
};
const inputFocusStyle: React.CSSProperties = {
  ...inputStyle, borderColor: 'var(--brand-bright)',
  boxShadow: '0 0 0 3px rgba(228,55,61,.14)',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600,
  color: 'var(--txt-mut)', marginBottom: 5,
  textTransform: 'uppercase' as const, letterSpacing: '.06em',
};
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500,
};
const modalStyle: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12,
  width: '94vw', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto',
  boxShadow: '0 24px 64px rgba(0,0,0,.55)',
};

// ── Shared sub-components ─────────────────────────────────────────────────────

function RoleBadge({ backendRole }: { backendRole: string }) {
  const role = toRole(backendRole);
  const color = ROLE_COLORS[role] ?? '#6B7280';
  const label = ROLE_LABELS[role] ?? backendRole;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', borderRadius: 20,
      background: `${color}18`, border: `1px solid ${color}40`,
      fontSize: 11, fontWeight: 500, color, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const active = status === 'ACTIVE';
  return (
    <span style={{
      display: 'inline-block', padding: '3px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 500,
      background: active ? 'rgba(47,182,124,.12)' : 'rgba(107,114,128,.12)',
      border: `1px solid ${active ? 'rgba(47,182,124,.3)' : 'rgba(107,114,128,.3)'}`,
      color: active ? '#2FB67C' : '#9BA1AC',
    }}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <div style={{ fontSize: 11, color: '#f4a5a8', marginTop: 4 }} role="alert">{msg}</div>;
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

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '16px 20px', borderBottom: '1px solid var(--line)',
    }}>
      <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--txt)' }}>
        {title}
      </span>
      <button onClick={onClose} style={{
        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-dim)',
        padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center',
      }}>
        <X size={16} />
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

// ── Creatable Location Select ─────────────────────────────────────────────────

function CreatableLocationSelect({
  locations,
  value,
  onChange,
}: {
  locations: OrgLocationDto[];
  value: number | null | undefined;
  onChange: (id: number | null) => void;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const currentName = value != null ? (locations.find(l => l.id === value)?.name ?? '') : '';

  const filtered = query.trim()
    ? locations.filter(l => l.name.toLowerCase().includes(query.toLowerCase()))
    : locations;
  const exactMatch = locations.some(l => l.name.toLowerCase() === query.trim().toLowerCase());
  const showCreate = query.trim().length > 0 && !exactMatch;

  async function handleCreate() {
    setCreating(true);
    try {
      const newLoc = await createLocation(query.trim());
      queryClient.invalidateQueries({ queryKey: ['org', 'locations'] });
      onChange(newLoc.id);
      setOpen(false);
      setQuery('');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          style={{ ...inputStyle, paddingRight: 32 }}
          placeholder="Select or type a new location…"
          value={open ? query : currentName}
          onFocus={() => { setOpen(true); setQuery(currentName); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange(null); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        <ChevronDown size={14} style={{
          position: 'absolute', right: 10, top: '50%',
          transform: 'translateY(-50%)', color: 'var(--txt-dim)', pointerEvents: 'none',
        }} />
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 7,
          boxShadow: '0 8px 24px rgba(0,0,0,.3)', zIndex: 100, maxHeight: 200, overflowY: 'auto',
        }}>
          {filtered.length === 0 && !showCreate && (
            <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--txt-dim)' }}>No locations found</div>
          )}
          {filtered.map(l => (
            <div
              key={l.id}
              onMouseDown={() => { onChange(l.id); setOpen(false); setQuery(''); }}
              style={{
                padding: '9px 14px', fontSize: 13, cursor: 'pointer',
                color: value === l.id ? 'var(--brand-bright)' : 'var(--txt)',
                background: value === l.id ? 'rgba(176,17,22,.12)' : 'transparent',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--raised)')}
              onMouseLeave={e => (e.currentTarget.style.background = value === l.id ? 'rgba(176,17,22,.12)' : 'transparent')}
            >
              {l.name}
            </div>
          ))}
          {showCreate && (
            <div
              onMouseDown={creating ? undefined : handleCreate}
              style={{
                padding: '9px 14px', fontSize: 13, color: '#4C8DD6',
                borderTop: filtered.length > 0 ? '1px solid var(--line)' : 'none',
                cursor: creating ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <span style={{ fontWeight: 700 }}>+</span>
              {creating ? 'Creating…' : `Create "${query.trim()}"`}
            </div>
          )}
          <div
            onMouseDown={() => { onChange(null); setQuery(''); setOpen(false); }}
            style={{ padding: '9px 14px', fontSize: 12, color: 'var(--txt-dim)', borderTop: '1px solid var(--line)', cursor: 'pointer' }}
          >
            — Clear —
          </div>
        </div>
      )}
    </div>
  );
}

// ── Org data hook ─────────────────────────────────────────────────────────────

function useOrgData() {
  const depts = useQuery({ queryKey: ['org', 'departments'], queryFn: listDepartments });
  const desigs = useQuery({ queryKey: ['org', 'designations'], queryFn: listDesignations });
  const locs  = useQuery({ queryKey: ['org', 'locations'],    queryFn: listLocations });
  return {
    departments:  depts.data  ?? [],
    designations: desigs.data ?? [],
    locations:    locs.data   ?? [],
  };
}

// ── Add User Modal ────────────────────────────────────────────────────────────

interface CreateForm extends Omit<CreateUserPayload, 'role'> {
  role: string;
}

const EMPTY_CREATE: CreateForm = {
  fullName: '',
  email: '',
  role: 'EMPLOYEE',
  joiningDate: new Date().toISOString().slice(0, 10),
  workMode: 'ONSITE',
  employmentType: 'FULL_TIME',
  departmentId: null,
  designationId: null,
  locationId: null,
  managerId: null,
};

function AddModal({
  onClose,
  allUsers,
  onCreated,
}: {
  onClose: () => void;
  allUsers: UserDto[];
  onCreated: (tempPassword: string) => void;
}) {
  const toast = useToast();
  const { departments, designations, locations } = useOrgData();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [created, setCreated] = useState<{ user: UserDto; tempPassword: string } | null>(null);

  const managers = allUsers.filter(u => u.role === 'MANAGER');

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.showToast('success', `User ${result.user.fullName} created successfully`);
      setCreated(result);
    },
    onError: (err: unknown) => {
      const fieldErrs = extractFieldErrors(err);
      if (Object.keys(fieldErrs).length > 0) { setErrors(fieldErrs); return; }
      if (isHttpStatus(err, 409)) { setErrors({ email: 'An account with this email already exists.' }); return; }
      const msg = extractApiError(err, 'Failed to create user.');
      setErrors({ _general: msg });
      toast.showToast('error', msg);
    },
  });

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = 'Full name is required.';
    if (!form.email.trim()) e.email = 'Email is required.';
    else if (!form.email.endsWith('@nforceone.com')) e.email = 'Email must end with @nforceone.com.';
    if (!form.role) e.role = 'Role is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const payload: CreateUserPayload = {
      ...form,
      departmentId:  form.departmentId  ?? null,
      designationId: form.designationId ?? null,
      locationId:    form.locationId    ?? null,
      managerId:     form.managerId     ?? null,
    };
    mutation.mutate(payload);
  }

  const set = (key: keyof CreateForm, val: unknown) =>
    setForm(f => ({ ...f, [key]: val }));

  // Success screen
  if (created) {
    return (
      <div style={overlayStyle}>
        <div style={{ ...modalStyle, maxWidth: 460 }}>
          <ModalHeader title="User Created" onClose={() => { onCreated(created.tempPassword); onClose(); }} />
          <div style={{ padding: 24 }}>
            <div style={{
              background: 'rgba(47,182,124,.1)', border: '1px solid rgba(47,182,124,.25)',
              borderRadius: 8, padding: 16, marginBottom: 16,
            }}>
              <div style={{ color: '#2FB67C', fontWeight: 600, marginBottom: 8 }}>Account created successfully</div>
              <div style={{ fontSize: 13, color: 'var(--txt-mut)', lineHeight: 1.8 }}>
                <b style={{ color: 'var(--txt)' }}>Name:</b> {created.user.fullName}<br />
                <b style={{ color: 'var(--txt)' }}>Email:</b> {created.user.email}<br />
                <b style={{ color: 'var(--txt)' }}>Employee ID:</b> {created.user.employeeCode ?? '—'}<br />
                <b style={{ color: 'var(--txt)' }}>Role:</b> {created.user.role}
              </div>
            </div>
            <div style={{
              background: 'rgba(228,55,61,.08)', border: '1px solid rgba(228,55,61,.2)',
              borderRadius: 8, padding: 14,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--risk)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Temp password — share once, store nowhere
              </div>
              <code style={{ fontSize: 14, color: 'var(--txt)', fontFamily: 'monospace', userSelect: 'all' }}>
                {created.tempPassword}
              </code>
            </div>
            <button
              onClick={() => { onCreated(created.tempPassword); onClose(); }}
              style={{ marginTop: 20, width: '100%', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 7, padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 580 }}>
        <ModalHeader title="Add User" onClose={onClose} />
        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {errors._general && (
            <div style={{ gridColumn: '1/-1' }}>
              <ErrorBanner message={errors._general} />
            </div>
          )}

          {/* Full Name — full width */}
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Full Name *">
              <input
                style={inputStyle}
                value={form.fullName}
                placeholder="Jane Smith"
                onChange={e => set('fullName', e.target.value)}
                onFocus={e => Object.assign(e.target.style, inputFocusStyle)}
                onBlur={e => Object.assign(e.target.style, inputStyle)}
              />
              <FieldError msg={errors.fullName} />
            </Field>
          </div>

          {/* Company Email — full width */}
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Company Email *">
              <input
                type="email"
                style={inputStyle}
                value={form.email}
                placeholder="jane@nforceone.com"
                onChange={e => set('email', e.target.value)}
                onFocus={e => Object.assign(e.target.style, inputFocusStyle)}
                onBlur={e => Object.assign(e.target.style, inputStyle)}
              />
              <FieldError msg={errors.email} />
            </Field>
          </div>

          {/* Role */}
          <Field label="Role *">
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={form.role}
              onChange={e => set('role', e.target.value)}
            >
              {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <FieldError msg={errors.role} />
          </Field>

          {/* Employee ID (display only — auto-generated) */}
          <Field label="Employee ID (auto-generated)">
            <input
              style={{ ...inputStyle, color: 'var(--txt-dim)', cursor: 'not-allowed', opacity: 0.6 }}
              value="Auto-generated on save"
              readOnly
            />
          </Field>

          {/* Joining Date */}
          <Field label="Joining Date *">
            <input
              type="date"
              style={inputStyle}
              value={form.joiningDate ?? ''}
              onChange={e => set('joiningDate', e.target.value)}
            />
          </Field>

          {/* Employment Type */}
          <Field label="Employment Type">
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={form.employmentType ?? 'FULL_TIME'}
              onChange={e => set('employmentType', e.target.value)}
            >
              {EMPLOYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>

          {/* Work Mode */}
          <Field label="Work Mode">
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={form.workMode ?? 'ONSITE'}
              onChange={e => set('workMode', e.target.value)}
            >
              {WORK_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>

          {/* Department */}
          <Field label="Department">
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={form.departmentId ?? ''}
              onChange={e => set('departmentId', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— None —</option>
              {departments.map((d: DepartmentDto) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>

          {/* Designation */}
          <Field label="Designation">
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={form.designationId ?? ''}
              onChange={e => set('designationId', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— None —</option>
              {designations.map((d: DesignationDto) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </Field>

          {/* Location — full width, creatable */}
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Location">
              <CreatableLocationSelect
                locations={locations}
                value={form.locationId}
                onChange={id => set('locationId', id)}
              />
            </Field>
          </div>

          {/* Manager — full width */}
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Manager">
              <select
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={form.managerId ?? ''}
                onChange={e => set('managerId', e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— None —</option>
                {managers.map(m => (
                  <option key={m.id} value={m.id}>{m.fullName} ({m.email})</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Actions */}
          <div style={{ gridColumn: '1/-1', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'transparent', color: 'var(--txt-mut)', border: '1px solid var(--line2)', borderRadius: 7, padding: '9px 18px', fontSize: 13, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              style={{ background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: mutation.isPending ? 'not-allowed' : 'pointer', opacity: mutation.isPending ? 0.7 : 1 }}
            >
              {mutation.isPending ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditModal({
  user,
  open,
  onClose,
  allUsers,
}: {
  user: UserDto | null;
  open: boolean;
  onClose: () => void;
  allUsers: UserDto[];
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { departments, designations, locations } = useOrgData();

  const [form, setForm] = useState<UpdateUserPayload>({
    fullName: '', role: 'EMPLOYEE',
    departmentId: null, designationId: null, locationId: null,
    employmentType: 'FULL_TIME', workMode: 'ONSITE', managerId: null,
  });
  const [error, setError] = useState<string | null>(null);

  const fnId = useId(), roleId = useId();

  // Sync form when target user changes (each time a different user is opened)
  useEffect(() => {
    if (user) {
      setForm({
        fullName:       user.fullName,
        role:           user.role,
        departmentId:   user.departmentId  ?? null,
        designationId:  user.designationId ?? null,
        locationId:     user.locationId    ?? null,
        employmentType: user.employmentType ?? 'FULL_TIME',
        workMode:       user.workMode      ?? 'ONSITE',
        managerId:      user.managerId     ?? null,
      });
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const managers = allUsers.filter(u => u.role === 'MANAGER' && u.id !== user?.id);

  const mutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateUserPayload }) => updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.showToast('success', 'User updated successfully');
      onClose();
    },
    onError: (err) => {
      setError(extractApiError(err, 'Failed to update user.'));
    },
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!form.fullName.trim()) { setError('Full name is required.'); return; }
    setError(null);
    mutation.mutate({ id: user.id, data: form });
  }

  const set = (key: keyof UpdateUserPayload, val: unknown) =>
    setForm(f => ({ ...f, [key]: val }));

  // Fix 1: Use the real Modal component (AnimatePresence + backdrop click + Escape)
  // instead of a raw div with hidden attribute (display:flex overrides hidden, so X never worked)
  return (
    <Modal open={open} title={user ? `Edit — ${user.fullName}` : 'Edit User'} onClose={onClose} width={580}>
      {user && (
        <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {error && <div style={{ gridColumn: '1/-1' }}><ErrorBanner message={error} /></div>}

          {/* Full Name — full width */}
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Full Name *">
              <input
                id={fnId}
                style={inputStyle}
                value={form.fullName}
                onChange={e => set('fullName', e.target.value)}
                onFocus={e => Object.assign(e.target.style, inputFocusStyle)}
                onBlur={e => Object.assign(e.target.style, inputStyle)}
                autoFocus
              />
            </Field>
          </div>

          {/* Role */}
          <Field label="Role">
            <select
              id={roleId}
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={form.role}
              onChange={e => set('role', e.target.value)}
            >
              {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>

          {/* Employment Type */}
          <Field label="Employment Type">
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={form.employmentType ?? 'FULL_TIME'}
              onChange={e => set('employmentType', e.target.value)}
            >
              {EMPLOYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>

          {/* Work Mode */}
          <Field label="Work Mode">
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={form.workMode ?? 'ONSITE'}
              onChange={e => set('workMode', e.target.value)}
            >
              {WORK_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>

          {/* Department */}
          <Field label="Department">
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={form.departmentId ?? ''}
              onChange={e => set('departmentId', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— None —</option>
              {departments.map((d: DepartmentDto) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>

          {/* Designation */}
          <Field label="Designation">
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={form.designationId ?? ''}
              onChange={e => set('designationId', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— None —</option>
              {designations.map((d: DesignationDto) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </Field>

          {/* Location — full width, creatable */}
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Location">
              <CreatableLocationSelect
                locations={locations}
                value={form.locationId}
                onChange={id => set('locationId', id)}
              />
            </Field>
          </div>

          {/* Manager — full width */}
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Manager">
              <select
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={form.managerId ?? ''}
                onChange={e => set('managerId', e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— None —</option>
                {managers.map(m => (
                  <option key={m.id} value={m.id}>{m.fullName} ({m.email})</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Actions */}
          <div style={{ gridColumn: '1/-1', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'transparent', color: 'var(--txt-mut)', border: '1px solid var(--line2)', borderRadius: 7, padding: '9px 18px', fontSize: 13, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              style={{ background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: mutation.isPending ? 'not-allowed' : 'pointer', opacity: mutation.isPending ? 0.7 : 1 }}
            >
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ── Status Toggle Modal ───────────────────────────────────────────────────────

function StatusModal({
  user,
  open,
  onClose,
}: {
  user: UserDto | null;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const isDeactivating = user?.status === 'ACTIVE';
  const action = isDeactivating ? 'Deactivate' : 'Reactivate';

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'ACTIVE' | 'INACTIVE' }) =>
      setUserStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.showToast('success', `User ${isDeactivating ? 'deactivated' : 'reactivated'} successfully`);
      onClose();
    },
    onError: (err) => {
      const msg = extractApiError(err, `Failed to ${action.toLowerCase()} user.`);
      setError(msg);
      toast.showToast('error', msg);
    },
  });

  function handleConfirm() {
    if (!user) return;
    setError(null);
    mutation.mutate({ id: user.id, status: isDeactivating ? 'INACTIVE' : 'ACTIVE' });
  }

  return (
    <Modal open={open} title={`${action} User`} onClose={onClose} width={400}>
      {user && (
        <div>
          {error && <ErrorBanner message={error} />}
          {isDeactivating ? (
            <div style={{
              background: 'rgba(228,55,61,.08)', border: '1px solid rgba(228,55,61,.2)',
              borderRadius: 8, padding: 14, marginBottom: 20, fontSize: 13,
              color: 'var(--txt-mut)', lineHeight: 1.7,
            }}>
              Deactivating <b style={{ color: 'var(--txt)' }}>{user.fullName}</b> will block their login immediately. This can be reversed.
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--txt-mut)', marginBottom: 20 }}>
              Reactivate <b style={{ color: 'var(--txt)' }}>{user.fullName}</b>? They will be able to log in again.
            </p>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleConfirm}
              disabled={mutation.isPending}
              style={{
                padding: '9px 20px',
                background: isDeactivating ? 'rgba(228,55,61,.15)' : 'rgba(47,182,124,.15)',
                border: `1px solid ${isDeactivating ? 'rgba(228,55,61,.4)' : 'rgba(47,182,124,.4)'}`,
                borderRadius: 7,
                color: isDeactivating ? '#E4373D' : '#2FB67C',
                fontSize: 13, fontWeight: 600,
                cursor: mutation.isPending ? 'not-allowed' : 'pointer',
              }}
            >
              {mutation.isPending ? 'Working…' : action}
            </button>
            <button
              onClick={onClose}
              style={{ padding: '9px 16px', background: 'transparent', border: '1px solid var(--line2)', borderRadius: 7, color: 'var(--txt-mut)', fontSize: 13, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Temp Password Modal ───────────────────────────────────────────────────────

function TempPasswordModal({
  open,
  onClose,
  tempPassword,
  context,
}: {
  open: boolean;
  onClose: () => void;
  tempPassword: string;
  context: 'created' | 'reset';
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(tempPassword).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Modal open={open} title={context === 'created' ? 'User Created' : 'Password Reset'} onClose={onClose} width={440}>
      <div>
        <p style={{ fontSize: 12, color: 'var(--txt-mut)', marginBottom: 16, lineHeight: 1.6 }}>
          Share this temporary password with the user — it will not be shown again.
          The user will be required to change it on first login.
        </p>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 14px', background: 'var(--raised)',
          border: '1px solid var(--line2)', borderRadius: 8, marginBottom: 20,
        }}>
          <span style={{
            flex: 1, fontFamily: '"JetBrains Mono", monospace',
            fontSize: 15, fontWeight: 600, color: 'var(--txt)', letterSpacing: '0.04em',
          }}>
            {tempPassword}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy temporary password"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 10px',
              background: copied ? 'rgba(47,182,124,.12)' : 'var(--raised2)',
              border: `1px solid ${copied ? 'rgba(47,182,124,.3)' : 'var(--line2)'}`,
              borderRadius: 6, color: copied ? '#2FB67C' : 'var(--txt-mut)',
              fontSize: 11, fontWeight: 500, cursor: 'pointer', transition: 'all 0.14s',
            }}
          >
            {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ width: '100%', padding: '9px 0', background: 'var(--brand)', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Done
        </button>
      </div>
    </Modal>
  );
}

// ── Reset Password Modal ──────────────────────────────────────────────────────

function ResetPasswordModal({
  user,
  open,
  onClose,
}: {
  user: UserDto | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [tempResult, setTempResult] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ id }: { id: number }) => resetPassword(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setTempResult(result.tempPassword);
    },
    onError: (err) => setError(extractApiError(err, 'Failed to reset password.')),
  });

  function handleClose() {
    setTempResult(null);
    setError(null);
    onClose();
  }

  if (tempResult) {
    return (
      <TempPasswordModal open={open} onClose={handleClose} tempPassword={tempResult} context="reset" />
    );
  }

  return (
    <Modal open={open} title="Reset Password" onClose={handleClose} width={400}>
      {user && (
        <div>
          <p style={{ fontSize: 12, color: 'var(--txt-mut)', marginBottom: 16, lineHeight: 1.5 }}>
            This will generate a temporary password for{' '}
            <strong style={{ color: 'var(--txt)' }}>{user.fullName}</strong>.
            They will be required to change it on next login.
          </p>
          {error && <ErrorBanner message={error} />}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => { setError(null); mutation.mutate({ id: user.id }); }}
              disabled={mutation.isPending}
              style={{ padding: '9px 20px', background: mutation.isPending ? 'var(--brand-deep)' : 'var(--brand)', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600, cursor: mutation.isPending ? 'not-allowed' : 'pointer' }}
            >
              {mutation.isPending ? 'Resetting…' : 'Generate Temp Password'}
            </button>
            <button type="button" onClick={handleClose} style={{ padding: '9px 16px', background: 'transparent', border: '1px solid var(--line2)', borderRadius: 7, color: 'var(--txt-mut)', fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Delete (Soft-Delete) Modal ────────────────────────────────────────────────

function DeleteModal({
  user,
  open,
  onClose,
}: {
  user: UserDto | null;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  const match = user != null && typed.trim().toLowerCase() === user.email.toLowerCase();

  // Import softDelete — UserController doesn't expose DELETE yet, so we use status
  // Note: If softDelete endpoint is not available, this uses a DELETE call
  const mutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.showToast('success', `${user?.fullName ?? 'User'} deleted`);
      onClose();
    },
    onError: (err) => {
      const msg = extractApiError(err, 'Delete failed.');
      setError(msg);
      toast.showToast('error', msg);
    },
  });

  function handleConfirm() {
    if (!match || !user) return;
    setError(null);
    mutation.mutate(user.id);
  }

  return (
    <Modal open={open} title="Delete User" onClose={onClose} width={440}>
      {user && (
        <div>
          <div style={{
            background: 'rgba(228,55,61,.08)', border: '1px solid rgba(228,55,61,.25)',
            borderRadius: 8, padding: 14, marginBottom: 20,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--risk)', marginBottom: 8 }}>This action is permanent</div>
            <div style={{ fontSize: 13, color: 'var(--txt-mut)', lineHeight: 1.7 }}>
              Deleting <b style={{ color: 'var(--txt)' }}>{user.fullName}</b> ({user.email}) will immediately invalidate their session.
            </div>
          </div>
          <label style={{ ...labelStyle, marginBottom: 6 }}>Type the user's email to confirm</label>
          <input
            style={{ ...inputStyle, marginBottom: 4, border: `1px solid ${match ? 'rgba(228,55,61,.5)' : 'var(--line2)'}` }}
            placeholder={user.email}
            value={typed}
            onChange={e => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <p style={{ fontSize: 11, color: 'var(--txt-dim)', marginBottom: 20, marginTop: 4 }}>
            Must match exactly: <code style={{ fontFamily: 'monospace', color: 'var(--txt-mut)' }}>{user.email}</code>
          </p>
          {error && <div style={{ color: 'var(--risk)', marginBottom: 12, fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ background: 'transparent', color: 'var(--txt-mut)', border: '1px solid var(--line2)', borderRadius: 7, padding: '9px 18px', fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!match || mutation.isPending}
              style={{
                background: match ? '#C0392B' : 'var(--raised2)',
                color: match ? '#fff' : 'var(--txt-dim)',
                border: `1px solid ${match ? 'transparent' : 'var(--line2)'}`,
                borderRadius: 7, padding: '9px 20px', fontSize: 13, fontWeight: 600,
                cursor: !match || mutation.isPending ? 'not-allowed' : 'pointer',
                opacity: mutation.isPending ? 0.7 : 1,
              }}
            >
              {mutation.isPending ? 'Deleting…' : 'Delete Permanently'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Action Button ─────────────────────────────────────────────────────────────

function ActionBtn({
  icon, label, onClick, danger = false,
}: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30,
        background: danger ? 'rgba(228,55,61,.08)' : 'var(--raised2)',
        border: `1px solid ${danger ? 'rgba(228,55,61,.25)' : 'var(--line2)'}`,
        borderRadius: 6, cursor: 'pointer',
        color: danger ? '#E4373D' : 'var(--txt-dim)',
        transition: 'background 0.14s, color 0.14s, border-color 0.14s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = danger ? '#E4373D' : 'var(--txt)';
        e.currentTarget.style.borderColor = danger ? 'rgba(228,55,61,.5)' : 'var(--txt-dim)';
        e.currentTarget.style.background = danger ? 'rgba(228,55,61,.14)' : 'var(--raised)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = danger ? '#E4373D' : 'var(--txt-dim)';
        e.currentTarget.style.borderColor = danger ? 'rgba(228,55,61,.25)' : 'var(--line2)';
        e.currentTarget.style.background = danger ? 'rgba(228,55,61,.08)' : 'var(--raised2)';
      }}
    >
      {icon}
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UserManagement() {
  const { data: users, isPending, isError, refetch } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: listUsers,
  });

  // Org data pre-fetched for dropdowns (departments used for column display)
  const { departments } = useOrgData();

  const [showAdd,          setShowAdd]          = useState(false);
  const [editTarget,       setEditTarget]        = useState<UserDto | null>(null);
  const [statusTarget,     setStatusTarget]      = useState<UserDto | null>(null);
  const [resetTarget,      setResetTarget]       = useState<UserDto | null>(null);
  const [deleteTarget,     setDeleteTarget]      = useState<UserDto | null>(null);
  const [createTempPwd,    setCreateTempPwd]     = useState<string | null>(null);

  // Reset edit form state when modal closes
  const handleEditClose = () => setEditTarget(null);
  const handleEditOpen  = (u: UserDto) => {
    setEditTarget({ ...u }); // fresh copy so form sync works
  };

  const thStyle: React.CSSProperties = {
    padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--txt-dim)',
    textAlign: 'left', letterSpacing: '0.06em', textTransform: 'uppercase',
    background: 'var(--raised)', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    padding: '12px 16px', verticalAlign: 'middle', borderBottom: '1px solid var(--line)',
  };

  // Helper: resolve department/designation name from id
  function deptName(id: number | null): string {
    if (id == null) return '—';
    return departments.find(d => d.id === id)?.name ?? '—';
  }
  function managerName(managerId: number | null): string {
    if (managerId == null) return '—';
    return users?.find(u => u.id === managerId)?.fullName ?? '—';
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0, letterSpacing: '-0.01em' }}>
            User Management
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', marginTop: 4, margin: '4px 0 0' }}>
            All users across all roles. Manage access, roles, and account status.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          <UserPlus size={14} /> Add User
        </button>
      </div>

      {/* Users Table */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
            All Users {users && <span style={{ color: 'var(--txt-dim)', fontWeight: 400 }}>({users.length})</span>}
          </div>
          <button
            onClick={() => refetch()}
            aria-label="Refresh users list"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--txt-dim)', padding: 6, display: 'flex', alignItems: 'center', borderRadius: 5 }}
          >
            <RefreshCw size={14} aria-hidden="true" />
          </button>
        </div>

        {isPending && (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 52, borderRadius: 6 }} />
            ))}
          </div>
        )}

        {isError && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--risk)', marginBottom: 12 }}>Failed to load users.</div>
            <button onClick={() => refetch()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 12, cursor: 'pointer' }}>
              <RefreshCw size={13} aria-hidden="true" /> Retry
            </button>
          </div>
        )}

        {users && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Employee ID</th>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Department</th>
                  <th style={thStyle}>Manager</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '48px 20px', textAlign: 'center' }}>
                      <div style={{ fontSize: 15, color: 'var(--txt-mut)', marginBottom: 8 }}>No users yet</div>
                      <div style={{ fontSize: 13, color: 'var(--txt-dim)' }}>Click "Add User" to create the first account.</div>
                    </td>
                  </tr>
                ) : (
                  users.map(user => (
                    <tr
                      key={user.id}
                      style={{ opacity: user.status === 'ACTIVE' ? 1 : 0.65, transition: 'background 0.1s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--raised)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
                    >
                      <td style={tdStyle}>
                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: 'var(--txt-dim)', fontVariantNumeric: 'tabular-nums' }}>
                          {user.employeeCode != null ? `NF-${String(user.employeeCode).padStart(5, '0')}` : '—'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <span style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>{user.fullName}</span>
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 12, color: 'var(--txt-mut)' }}>{user.email}</span>
                      </td>
                      <td style={tdStyle}>
                        <RoleBadge backendRole={user.role} />
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 13, color: 'var(--txt-mut)' }}>
                          {deptName(user.departmentId)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 13, color: 'var(--txt-mut)' }}>
                          {managerName(user.managerId)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <StatusBadge status={user.status} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <ActionBtn icon={<Pencil size={13} />} label="Edit user" onClick={() => handleEditOpen(user)} />
                          <ActionBtn icon={<RotateCcw size={13} />} label="Reset password" onClick={() => setResetTarget(user)} />
                          <ActionBtn
                            icon={<Power size={13} />}
                            label={user.status === 'ACTIVE' ? 'Deactivate user' : 'Reactivate user'}
                            onClick={() => setStatusTarget(user)}
                            danger={user.status === 'ACTIVE'}
                          />
                          <ActionBtn icon={<Trash2 size={13} />} label="Delete user" onClick={() => setDeleteTarget(user)} danger />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdd && (
        <AddModal
          onClose={() => setShowAdd(false)}
          allUsers={users ?? []}
          onCreated={(pwd) => setCreateTempPwd(pwd)}
        />
      )}

      <EditModal
        user={editTarget}
        open={Boolean(editTarget)}
        onClose={handleEditClose}
        allUsers={users ?? []}
      />

      <StatusModal
        user={statusTarget}
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
      />

      <ResetPasswordModal
        user={resetTarget}
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
      />

      <DeleteModal
        user={deleteTarget}
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
      />

      <TempPasswordModal
        open={Boolean(createTempPwd)}
        onClose={() => setCreateTempPwd(null)}
        tempPassword={createTempPwd ?? ''}
        context="created"
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
