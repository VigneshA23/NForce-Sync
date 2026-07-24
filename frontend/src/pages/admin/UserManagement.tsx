import { useState, useEffect, useId } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, RefreshCw, Pencil, Power, KeyRound, AlertTriangle } from 'lucide-react';
import {
  listUsers, createUser, updateUser, setUserStatus, resetPassword,
  extractApiError, extractFieldErrors, isHttpStatus,
} from '../../api/admin';
import type { UserDto } from '../../api/admin';
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

// ── Shared primitives ─────────────────────────────────────────────────────────

function empCode(user: UserDto): string {
  return user.employeeCode != null ? String(user.employeeCode) : '—';
}

function RoleBadge({ backendRole }: { backendRole: string }) {
  const role = toRole(backendRole);
  const color = ROLE_COLORS[role] ?? '#6B7280';
  const label = ROLE_LABELS[role] ?? backendRole;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', borderRadius: 20,
      background: `${color}18`, border: `1px solid ${color}40`,
      fontSize: 11, fontWeight: 500, color,
      whiteSpace: 'nowrap',
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
  return (
    <div style={{ fontSize: 11, color: '#f4a5a8', marginTop: 4 }} role="alert">
      {msg}
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

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--shell)', border: '1px solid var(--line2)',
  borderRadius: 6, padding: '9px 12px', color: 'var(--txt)', fontSize: 13,
  outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
};
const inputFocus: React.CSSProperties = {
  ...inputStyle, borderColor: 'var(--brand-bright)',
  boxShadow: '0 0 0 3px rgba(228,55,61,.14)',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 550,
  color: 'var(--txt-mut)', marginBottom: 5, letterSpacing: '0.03em',
};
const fieldWrap: React.CSSProperties = { marginBottom: 14 };

function FieldLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return <label htmlFor={id} style={labelStyle}>{children}</label>;
}

// ── Create User Form ──────────────────────────────────────────────────────────

interface CreateForm {
  fullName: string;
  email: string;
  password: string;
  role: string;
}

const EMPTY_FORM: CreateForm = { fullName: '', email: '', password: '', role: 'EMPLOYEE' };

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof CreateForm | '_general', string>>>({});

  const fnId = useId(), emailId = useId(), passId = useId(), roleId = useId();

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setForm(EMPTY_FORM);
      setErrors({});
      toast.show('User created successfully');
      onCreated();
    },
    onError: (err: unknown) => {
      const fieldErrs = extractFieldErrors(err);
      if (Object.keys(fieldErrs).length > 0) {
        setErrors(fieldErrs);
        return;
      }
      if (isHttpStatus(err, 409)) {
        setErrors({ email: 'An account with this email already exists.' });
        return;
      }
      setErrors({ _general: extractApiError(err, 'Failed to create user.') });
    },
  });

  function validate(): boolean {
    const e: typeof errors = {};
    if (!form.fullName.trim()) e.fullName = 'Full name is required.';
    if (!form.email.trim()) e.email = 'Email is required.';
    else if (!form.email.endsWith('@nforceone.com')) e.email = 'Email must end with @nforceone.com.';
    if (!form.password) e.password = 'Password is required.';
    else if (form.password.length < 8) e.password = 'Password must be at least 8 characters.';
    if (!form.role) e.role = 'Role is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate(form);
  }

  function handleReset() {
    setForm(EMPTY_FORM);
    setErrors({});
    mutation.reset();
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {errors._general && <ErrorBanner message={errors._general} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
        {/* Full Name */}
        <div style={fieldWrap}>
          <FieldLabel id={fnId}>Full Name *</FieldLabel>
          <input
            id={fnId}
            type="text"
            autoComplete="off"
            placeholder="Aditya Kumar"
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            aria-invalid={Boolean(errors.fullName)}
            style={inputStyle}
            onFocus={(e) => Object.assign(e.target.style, inputFocus)}
            onBlur={(e) => Object.assign(e.target.style, inputStyle)}
          />
          <FieldError msg={errors.fullName} />
        </div>

        {/* Email */}
        <div style={fieldWrap}>
          <FieldLabel id={emailId}>Company Email *</FieldLabel>
          <input
            id={emailId}
            type="email"
            autoComplete="off"
            placeholder="aditya.kumar@nforceone.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            aria-invalid={Boolean(errors.email)}
            style={inputStyle}
            onFocus={(e) => Object.assign(e.target.style, inputFocus)}
            onBlur={(e) => Object.assign(e.target.style, inputStyle)}
          />
          <FieldError msg={errors.email} />
        </div>

        {/* Password */}
        <div style={fieldWrap}>
          <FieldLabel id={passId}>Password *</FieldLabel>
          <div style={{ position: 'relative' }}>
            <input
              id={passId}
              type={showPass ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Min 8 characters"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              aria-invalid={Boolean(errors.password)}
              style={{ ...inputStyle, paddingRight: 40 }}
              onFocus={(e) => Object.assign(e.target.style, { ...inputFocus, paddingRight: '40px' })}
              onBlur={(e) => Object.assign(e.target.style, { ...inputStyle, paddingRight: '40px' })}
            />
            <button
              type="button"
              aria-label={showPass ? 'Hide password' : 'Show password'}
              onClick={() => setShowPass((v) => !v)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-dim)', padding: 4, display: 'flex' }}
            >
              {showPass ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
            </button>
          </div>
          <FieldError msg={errors.password} />
        </div>

        {/* Role */}
        <div style={fieldWrap}>
          <FieldLabel id={roleId}>Role *</FieldLabel>
          <select
            id={roleId}
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <FieldError msg={errors.role} />
        </div>

        {/* Employee ID (read-only) */}
        <div style={fieldWrap}>
          <FieldLabel id="empid-field">Employee ID</FieldLabel>
          <input
            id="empid-field"
            type="text"
            value="Auto-generated on save"
            readOnly
            style={{ ...inputStyle, color: 'var(--txt-dim)', cursor: 'not-allowed', opacity: 0.6 }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button
          type="submit"
          disabled={mutation.isPending}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 20px',
            background: mutation.isPending ? 'var(--brand-deep)' : 'var(--brand)',
            border: 'none', borderRadius: 7,
            color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: mutation.isPending ? 'not-allowed' : 'pointer',
            transition: 'background 0.14s',
          }}
          onMouseEnter={(e) => { if (!mutation.isPending) e.currentTarget.style.background = 'var(--brand-bright)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = mutation.isPending ? 'var(--brand-deep)' : 'var(--brand)'; }}
        >
          {mutation.isPending && (
            <RefreshCw size={13} aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }} />
          )}
          {mutation.isPending ? 'Creating…' : 'Create User'}
        </button>
        <button
          type="button"
          onClick={handleReset}
          style={{
            padding: '9px 16px', background: 'transparent',
            border: '1px solid var(--line2)', borderRadius: 7,
            color: 'var(--txt-mut)', fontSize: 13, cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--txt-dim)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line2)'; }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Edit User Modal ───────────────────────────────────────────────────────────

const ROLES_WITH_MANAGER = new Set(['EMPLOYEE', 'MANAGER', 'PM', 'DM']);

function EditModal({
  user,
  open,
  onClose,
  managerOptions,
}: {
  user: UserDto | null;
  open: boolean;
  onClose: () => void;
  managerOptions: { id: number; fullName: string }[];
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{ fullName: string; role: string; managerId: number | null }>({
    fullName: '', role: '', managerId: null,
  });
  const [error, setError] = useState<string | null>(null);

  const fnId = useId(), roleId = useId(), mgrId = useId();

  // Sync form each time the target user changes (or modal opens for a user).
  // NOT on focus — focus-based resets caused managerId to be overwritten
  // with the old value every time the Save button was clicked.
  useEffect(() => {
    if (user) {
      setForm({ fullName: user.fullName, role: user.role, managerId: user.managerId ?? null });
      setError(null);
    }
  }, [user?.id]);

  const mutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { fullName: string; role: string; managerId: number | null } }) =>
      updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.show('User updated');
      onClose();
    },
    onError: (err) => setError(extractApiError(err, 'Failed to update user.')),
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!form.fullName.trim()) { setError('Full name is required.'); return; }
    mutation.mutate({ id: user.id, data: form });
  }

  const showManagerField = ROLES_WITH_MANAGER.has(form.role);

  return (
    <Modal open={open} title="Edit User" onClose={onClose} width={440}>
      {user && (
        <form onSubmit={handleSave} noValidate>
          {error && <ErrorBanner message={error} />}

          <div style={fieldWrap}>
            <FieldLabel id={fnId}>Full Name *</FieldLabel>
            <input
              id={fnId}
              type="text"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              style={inputStyle}
              onFocus={(e) => Object.assign(e.target.style, inputFocus)}
              onBlur={(e) => Object.assign(e.target.style, inputStyle)}
              autoFocus
            />
          </div>

          <div style={fieldWrap}>
            <FieldLabel id={roleId}>Role</FieldLabel>
            <select
              id={roleId}
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {showManagerField && (
            <div style={fieldWrap}>
              <FieldLabel id={mgrId}>Team Lead</FieldLabel>
              <select
                id={mgrId}
                value={form.managerId ?? ''}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  managerId: e.target.value === '' ? null : Number(e.target.value),
                }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">No Team Lead assigned</option>
                {managerOptions.map((m) => (
                  <option key={m.id} value={m.id}>{m.fullName}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="submit" disabled={mutation.isPending} style={{
              padding: '9px 20px', background: mutation.isPending ? 'var(--brand-deep)' : 'var(--brand)',
              border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: mutation.isPending ? 'not-allowed' : 'pointer',
            }}>
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
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

// ── Deactivate Confirmation Modal ─────────────────────────────────────────────

function DeactivateModal({ user, open, onClose }: { user: UserDto | null; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const targetStatus = user?.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  const isDeactivating = targetStatus === 'INACTIVE';

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'ACTIVE' | 'INACTIVE' }) =>
      setUserStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.show(`User ${isDeactivating ? 'deactivated' : 'reactivated'}`);
      onClose();
    },
    onError: (err) => {
      const msg = extractApiError(err, `Failed to ${isDeactivating ? 'deactivate' : 'reactivate'} user.`);
      setError(msg);
    },
  });

  function handleConfirm() {
    if (!user) return;
    setError(null);
    mutation.mutate({ id: user.id, status: targetStatus });
  }

  return (
    <Modal open={open} title={isDeactivating ? 'Deactivate User?' : 'Reactivate User?'} onClose={onClose} width={400}>
      {user && (
        <div>
          {error && <ErrorBanner message={error} />}

          {isDeactivating && (
            <div style={{
              display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 7, marginBottom: 16,
              background: 'rgba(224,169,59,.08)', border: '1px solid rgba(224,169,59,.25)',
              fontSize: 12, color: '#d4a032',
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
              Deactivated users cannot log in. This can be reversed.
            </div>
          )}

          <p style={{ fontSize: 13, color: 'var(--txt-mut)', marginBottom: 20, lineHeight: 1.6 }}>
            {isDeactivating
              ? `This will deactivate ${user.fullName} (${user.email}). They will be blocked from logging in immediately.`
              : `This will reactivate ${user.fullName} (${user.email}). They will be able to log in again.`}
          </p>

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
              {mutation.isPending ? 'Working…' : isDeactivating ? 'Deactivate' : 'Reactivate'}
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

// ── Reset Password Modal ──────────────────────────────────────────────────────

function ResetPasswordModal({ user, open, onClose }: { user: UserDto | null; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [newPassword, setNewPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passId = useId();

  const mutation = useMutation({
    mutationFn: ({ id, pw }: { id: number; pw: string }) => resetPassword(id, pw),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.show('Password reset successfully');
      setNewPassword('');
      onClose();
    },
    onError: (err) => setError(extractApiError(err, 'Failed to reset password.')),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setError(null);
    mutation.mutate({ id: user.id, pw: newPassword });
  }

  return (
    <Modal open={open} title="Reset Password" onClose={() => { setNewPassword(''); setError(null); onClose(); }} width={400}>
      {user && (
        <form onSubmit={handleSubmit} noValidate>
          <p style={{ fontSize: 12, color: 'var(--txt-mut)', marginBottom: 16, lineHeight: 1.5 }}>
            Set a new password for <strong style={{ color: 'var(--txt)' }}>{user.fullName}</strong>.
            They should change it on next login.
          </p>

          {error && <ErrorBanner message={error} />}

          <div style={{ marginBottom: 20 }}>
            <FieldLabel id={passId}>New Password *</FieldLabel>
            <div style={{ position: 'relative' }}>
              <input
                id={passId}
                type={showPass ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Min 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ ...inputStyle, paddingRight: 40 }}
                onFocus={(e) => Object.assign(e.target.style, { ...inputFocus, paddingRight: '40px' })}
                onBlur={(e) => Object.assign(e.target.style, { ...inputStyle, paddingRight: '40px' })}
                autoFocus
              />
              <button type="button" aria-label={showPass ? 'Hide' : 'Show'} onClick={() => setShowPass(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-dim)', padding: 4, display: 'flex' }}>
                {showPass ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" disabled={mutation.isPending} style={{
              padding: '9px 20px', background: mutation.isPending ? 'var(--brand-deep)' : 'var(--brand)',
              border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: mutation.isPending ? 'not-allowed' : 'pointer',
            }}>
              {mutation.isPending ? 'Resetting…' : 'Reset Password'}
            </button>
            <button type="button" onClick={() => { setNewPassword(''); setError(null); onClose(); }} style={{
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UserManagement() {
  const { data: users, isPending, isError, refetch } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: listUsers,
  });

  const [editTarget, setEditTarget]         = useState<UserDto | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<UserDto | null>(null);
  const [resetTarget, setResetTarget]       = useState<UserDto | null>(null);

  const thStyle: React.CSSProperties = {
    padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--txt-dim)',
    textAlign: 'left', letterSpacing: '0.06em', textTransform: 'uppercase',
    background: 'var(--raised)', borderBottom: '1px solid var(--line)',
    whiteSpace: 'nowrap',
  };

  const tdStyle2: React.CSSProperties = {
    padding: '12px 16px', verticalAlign: 'middle', borderBottom: '1px solid var(--line)',
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 24, fontWeight: 700, color: 'var(--txt)',
          margin: '0 0 4px', letterSpacing: '-0.01em',
        }}>
          User Management
        </h1>
        <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
          Create users, assign roles, manage access, and reset credentials.
        </p>
      </div>

      {/* Create User Form */}
      <div style={{
        background: 'var(--panel)', border: '1px solid var(--line)',
        borderRadius: 10, padding: '20px', marginBottom: 20,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 16 }}>
          Create New User
        </div>
        <CreateUserForm onCreated={() => {}} />
      </div>

      {/* Users Table */}
      <div style={{
        background: 'var(--panel)', border: '1px solid var(--line)',
        borderRadius: 10, overflow: 'hidden',
      }}>
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
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Emp ID</th>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--txt-dim)' }}>
                      No users yet. Create one above.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} style={{ transition: 'background 0.1s' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--raised)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
                    >
                      <td style={tdStyle2}>
                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: 'var(--txt-dim)', fontVariantNumeric: 'tabular-nums' }}>
                          {empCode(user)}
                        </span>
                      </td>
                      <td style={tdStyle2}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>{user.fullName}</span>
                          {user.managerId != null && (
                            <span style={{ fontSize: 11, color: 'var(--txt-dim)', fontStyle: 'italic' }}>
                              ↳ {users.find((u) => u.id === user.managerId)?.fullName ?? '—'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={tdStyle2}>
                        <span style={{ fontSize: 12, color: 'var(--txt-mut)' }}>{user.email}</span>
                      </td>
                      <td style={tdStyle2}>
                        <RoleBadge backendRole={user.role} />
                      </td>
                      <td style={tdStyle2}>
                        <StatusBadge status={user.status} />
                      </td>
                      <td style={{ ...tdStyle2, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <ActionBtn icon={<Pencil size={13} />} label="Edit user" onClick={() => setEditTarget(user)} />
                          <ActionBtn
                            icon={<Power size={13} />}
                            label={user.status === 'ACTIVE' ? 'Deactivate user' : 'Reactivate user'}
                            onClick={() => setDeactivateTarget(user)}
                            danger={user.status === 'ACTIVE'}
                          />
                          <ActionBtn icon={<KeyRound size={13} />} label="Reset password" onClick={() => setResetTarget(user)} />
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
      <EditModal
        user={editTarget}
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        managerOptions={(users ?? []).filter((u) => u.role === 'MANAGER').map((u) => ({ id: u.id, fullName: u.fullName }))}
      />
      <DeactivateModal
        user={deactivateTarget}
        open={Boolean(deactivateTarget)}
        onClose={() => setDeactivateTarget(null)}
      />
      <ResetPasswordModal
        user={resetTarget}
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
      />

      {/* Spin animation (reuses global keyframes if present, else adds inline) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
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
        background: 'var(--raised2)', border: '1px solid var(--line2)',
        borderRadius: 6, cursor: 'pointer',
        color: 'var(--txt-dim)', transition: 'background 0.14s, color 0.14s, border-color 0.14s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = danger ? '#E4373D' : 'var(--txt)';
        e.currentTarget.style.borderColor = danger ? 'rgba(228,55,61,.4)' : 'var(--txt-dim)';
        e.currentTarget.style.background = danger ? 'rgba(228,55,61,.08)' : 'var(--raised)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--txt-dim)';
        e.currentTarget.style.borderColor = 'var(--line2)';
        e.currentTarget.style.background = 'var(--raised2)';
      }}
    >
      {icon}
    </button>
  );
}
