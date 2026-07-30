import { useState, useId, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserPlus, X, Pencil, Power, PowerOff, RotateCcw, Trash2,
  AlertTriangle, Copy, Check, RefreshCw, ChevronDown,
  Calendar, ChevronLeft, ChevronRight,
  Search, Filter, ArrowUp, ArrowDown, Download,
} from 'lucide-react';
import { api } from '../../api/client';
import { formatDate, formatTime12h } from '../../lib/date';
import {
  listUsers, createUser, updateUser, setUserStatus, resetPassword,
  extractApiError, extractFieldErrors, isHttpStatus,
  listDepartments, listDesignations, listLocations,
  createDepartment, createDesignation, createLocation,
  listShifts,
  getAdminStats,
} from '../../api/admin';
import type { UserDto, CreateUserPayload, UpdateUserPayload, DepartmentDto, DesignationDto, OrgLocationDto, ShiftDefinitionDto } from '../../api/admin';
import { toRole } from '../../api/auth';
import { ROLE_COLORS, ROLE_LABELS } from '../../lib/nav';
import { Modal } from '../../components/Modal';
import { useToast } from '../../lib/toast';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';

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
  { value: 'FULL_TIME',   label: 'Full-time' },
  { value: 'CONTRACT',    label: 'Contractor' },
  { value: 'INTERN',      label: 'Intern' },
  { value: 'CONSULTANT',  label: 'Consultant' },
];

const WORK_MODES = [
  { value: 'ONSITE', label: 'Onsite' },
  { value: 'OFFICE', label: 'Office' },
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
// The closed <select> box renders using the <select> element's OWN color (confirmed via
// computed styles — it does not pick up the currently-selected <option>'s style), so the
// muted placeholder look requires dimming the <select> itself while unselected. That color
// is inherited by every <option> in the popup though, which would mute real choices too
// (Employee, Full-time, …) — so real <option>s get their own explicit --txt override
// (realOptionStyle) to opt back out of the inherited dimming; only the placeholder
// <option> is left to inherit (or duplicate) the dim color.
function selectStyle(hasValue: boolean): React.CSSProperties {
  return { ...inputStyle, cursor: 'pointer', color: hasValue ? 'var(--txt)' : 'var(--txt-dim)' };
}
const placeholderOptionStyle: React.CSSProperties = { color: 'var(--txt-dim)' };
const realOptionStyle: React.CSSProperties = { color: 'var(--txt)' };
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
  return <div style={{ fontSize: 11, color: 'var(--risk)', marginTop: 4 }} role="alert">{msg}</div>;
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

// ── Creatable Select ───────────────────────────────────────────────────────────
// Generic hybrid combobox: pick an existing org-master value (department,
// designation, location, …) or type a new one that doesn't exist yet. The new
// value is created via the API immediately and becomes usable for this user
// right away, and shows up as an option for future user creation once the
// underlying list (React Query cache) refreshes.

interface CreatableItem { id: number }

function CreatableSelect<T extends CreatableItem>({
  items,
  getLabel,
  value,
  onChange,
  onCreate,
  invalidateKey,
  placeholder,
  noneLabel = 'No matches',
}: {
  items: T[];
  getLabel: (item: T) => string;
  value: number | null | undefined;
  onChange: (id: number | null) => void;
  onCreate: (name: string) => Promise<T>;
  invalidateKey: string[];
  placeholder: string;
  noneLabel?: string;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const currentName = value != null ? (items.find(i => i.id === value) != null ? getLabel(items.find(i => i.id === value)!) : '') : '';

  const filtered = query.trim()
    ? items.filter(i => getLabel(i).toLowerCase().includes(query.toLowerCase()))
    : items;
  const exactMatch = items.some(i => getLabel(i).toLowerCase() === query.trim().toLowerCase());
  const showCreate = query.trim().length > 0 && !exactMatch;

  async function handleCreate() {
    setCreating(true);
    try {
      const created = await onCreate(query.trim());
      queryClient.invalidateQueries({ queryKey: invalidateKey });
      onChange(created.id);
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
          placeholder={placeholder}
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
            <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--txt-dim)' }}>{noneLabel}</div>
          )}
          {filtered.map(i => (
            <div
              key={i.id}
              onMouseDown={() => { onChange(i.id); setOpen(false); setQuery(''); }}
              style={{
                padding: '9px 14px', fontSize: 13, cursor: 'pointer',
                color: value === i.id ? 'var(--brand-bright)' : 'var(--txt)',
                background: value === i.id ? 'rgba(176,17,22,.12)' : 'transparent',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--raised)')}
              onMouseLeave={e => (e.currentTarget.style.background = value === i.id ? 'rgba(176,17,22,.12)' : 'transparent')}
            >
              {getLabel(i)}
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

// ── Joining Date Picker ────────────────────────────────────────────────────────
// Custom picker (not a native <input type="date">) so the calendar icon can be a
// true toggle: click opens, click again on the same icon closes — native date
// inputs expose no such control (no hidePicker() API), which is what made the
// icon feel "stuck open" before.

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDateDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return formatDate(iso);
}

function JoiningDatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = value ? new Date(`${value}T00:00:00`) : new Date();
  const [viewYear, setViewYear]   = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());

  // Close on click outside — supplements select-to-close and icon-toggle-to-close.
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function toggleOpen() {
    setOpen(o => {
      const next = !o;
      if (next) {
        const base = value ? new Date(`${value}T00:00:00`) : new Date();
        setViewYear(base.getFullYear());
        setViewMonth(base.getMonth());
      }
      return next;
    });
  }

  function selectDay(day: number) {
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(iso);
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    else if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          readOnly
          style={{ ...inputStyle, paddingRight: 36, cursor: 'pointer' }}
          value={formatDateDisplay(value)}
          placeholder="Select date"
          onClick={toggleOpen}
        />
        <button
          type="button"
          aria-label={open ? 'Close date picker' : 'Open date picker'}
          onClick={toggleOpen}
          style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            display: 'flex', color: 'var(--txt-dim)', borderRadius: 4,
          }}
        >
          <Calendar size={15} />
        </button>
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, width: 260,
          background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,.3)', zIndex: 100, padding: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-dim)', display: 'flex', padding: 4 }}>
              <ChevronLeft size={15} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
              {MONTH_LABELS[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-dim)', display: 'flex', padding: 4 }}>
              <ChevronRight size={15} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {WEEKDAY_LABELS.map((w, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: 10, color: 'var(--txt-dim)', fontWeight: 600 }}>{w}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((day, i) => {
              if (day == null) return <div key={i} />;
              const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = iso === value;
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => selectDay(day)}
                  style={{
                    aspectRatio: '1', border: 'none', borderRadius: 5, cursor: 'pointer',
                    fontSize: 12, background: isSelected ? 'var(--brand)' : 'transparent',
                    color: isSelected ? '#fff' : 'var(--txt)',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--raised)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  {day}
                </button>
              );
            })}
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
  const shifts = useQuery({ queryKey: ['business-rules', 'shifts'], queryFn: listShifts });
  return {
    departments:  depts.data  ?? [],
    designations: desigs.data ?? [],
    locations:    locs.data   ?? [],
    shifts:       shifts.data ?? [],
  };
}

function formatShiftLabel(s: ShiftDefinitionDto): string {
  return `${s.name} (${formatTime12h(s.startTime)}–${formatTime12h(s.endTime)})`;
}

// ── Add User Modal ────────────────────────────────────────────────────────────

interface CreateForm extends Omit<CreateUserPayload, 'role'> {
  role: string;
}

const EMPLOYEE_ID_PATTERN = /^NF-\d{8}$/;

const EMPTY_CREATE: CreateForm = {
  fullName: '',
  email: '',
  employeeCode: '',
  role: '',
  joiningDate: '',
  workMode: '',
  employmentType: '',
  departmentId: undefined,
  designationId: undefined,
  locationId: undefined,
  shiftId: undefined,
  managerId: undefined,
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
  const { departments, designations, locations, shifts } = useOrgData();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [created, setCreated] = useState<{ user: UserDto; tempPassword: string } | null>(null);

  // AddModal is a raw overlay (not the shared Modal component), so it locks scroll
  // itself. Always true while mounted — the parent only renders this when open.
  useBodyScrollLock(true);

  const managers = allUsers.filter(u => u.role === 'MANAGER');

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.showToast('success', `User ${result.user.fullName} created successfully`);
      setCreated(result);
    },
    onError: (err: unknown) => {
      const fieldErrs = extractFieldErrors(err);
      if (Object.keys(fieldErrs).length > 0) { setErrors(fieldErrs); return; }
      if (isHttpStatus(err, 409)) {
        // Server-side authority on uniqueness — disambiguates which field conflicted
        // since both email and employeeCode can 409 (client pre-check narrows this
        // to races only: e.g. two admins picking the same ID at the same time).
        const msg = extractApiError(err, 'A conflict occurred.');
        if (msg.toLowerCase().includes('employee id')) { setErrors({ employeeCode: msg }); return; }
        setErrors({ email: msg || 'An account with this email already exists.' });
        return;
      }
      const msg = extractApiError(err, 'Failed to create user.');
      setErrors({ _general: msg });
      toast.showToast('error', msg);
    },
  });

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = 'Full name is required.';
    const normalizedEmail = form.email.trim().toLowerCase();
    if (!normalizedEmail) e.email = 'Email is required.';
    else if (!normalizedEmail.endsWith('@nforceone.com')) e.email = 'Email must end with @nforceone.com.';
    if (!form.role) e.role = 'Role is required.';
    if (!form.joiningDate) e.joiningDate = 'Joining date is required.';
    if (!form.employmentType) e.employmentType = 'Employment type is required.';
    if (!form.workMode) e.workMode = 'Work mode is required.';

    // Client-side pre-check only — fast feedback against the already-loaded user
    // list. The server re-validates format and uniqueness authoritatively on submit
    // (see UserService.createUser), since this list can be stale or race with
    // another admin creating a user concurrently.
    const empCode = form.employeeCode.trim();
    if (!empCode) e.employeeCode = 'Employee ID is required.';
    else if (!EMPLOYEE_ID_PATTERN.test(empCode)) e.employeeCode = 'Must match format NF-######## (e.g. NF-20240040).';
    else if (allUsers.some(u => u.employeeCode === empCode)) e.employeeCode = 'This Employee ID is already in use.';

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const payload: CreateUserPayload = {
      ...form,
      email:         form.email.trim().toLowerCase(),
      employeeCode:  form.employeeCode.trim(),
      departmentId:  form.departmentId  ?? null,
      designationId: form.designationId ?? null,
      locationId:    form.locationId    ?? null,
      shiftId:       form.shiftId       ?? null,
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
                placeholder="Enter name"
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
                placeholder="Enter email"
                onChange={e => set('email', e.target.value.toLowerCase())}
                onFocus={e => Object.assign(e.target.style, inputFocusStyle)}
                onBlur={e => { Object.assign(e.target.style, inputStyle); set('email', form.email.trim().toLowerCase()); }}
              />
              <FieldError msg={errors.email} />
            </Field>
          </div>

          {/* Role */}
          <Field label="Role *">
            <select
              style={selectStyle(!!form.role)}
              value={form.role}
              onChange={e => set('role', e.target.value)}
            >
              <option value="" disabled style={placeholderOptionStyle}>Select role</option>
              {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value} style={realOptionStyle}>{r.label}</option>)}
            </select>
            <FieldError msg={errors.role} />
          </Field>

          {/* Employee ID — manually entered, format NF-######## */}
          <Field label="Employee ID *">
            <input
              style={inputStyle}
              value={form.employeeCode}
              placeholder="Enter employee ID"
              onChange={e => set('employeeCode', e.target.value.toUpperCase())}
              onFocus={e => Object.assign(e.target.style, inputFocusStyle)}
              onBlur={e => Object.assign(e.target.style, inputStyle)}
            />
            <FieldError msg={errors.employeeCode} />
          </Field>

          {/* Joining Date */}
          <Field label="Joining Date *">
            <JoiningDatePicker
              value={form.joiningDate ?? ''}
              onChange={iso => set('joiningDate', iso)}
            />
            <FieldError msg={errors.joiningDate} />
          </Field>

          {/* Employment Type */}
          <Field label="Employment Type *">
            <select
              style={selectStyle(!!form.employmentType)}
              value={form.employmentType ?? ''}
              onChange={e => set('employmentType', e.target.value)}
            >
              <option value="" disabled style={placeholderOptionStyle}>Select employment type</option>
              {EMPLOYMENT_TYPES.map(t => <option key={t.value} value={t.value} style={realOptionStyle}>{t.label}</option>)}
            </select>
            <FieldError msg={errors.employmentType} />
          </Field>

          {/* Work Mode */}
          <Field label="Work Mode *">
            <select
              style={selectStyle(!!form.workMode)}
              value={form.workMode ?? ''}
              onChange={e => set('workMode', e.target.value)}
            >
              <option value="" disabled style={placeholderOptionStyle}>Select work mode</option>
              {WORK_MODES.map(m => <option key={m.value} value={m.value} style={realOptionStyle}>{m.label}</option>)}
            </select>
            <FieldError msg={errors.workMode} />
          </Field>

          {/* Department — plain fixed dropdown (no free-text entry). Optional:
              no-department is a genuinely valid state, so "No department" is a real,
              explicitly-chosen option — distinct from the untouched placeholder. */}
          <Field label="Department">
            <select
              style={selectStyle(form.departmentId !== undefined)}
              value={form.departmentId === undefined ? '' : form.departmentId === null ? 'none' : String(form.departmentId)}
              onChange={e => {
                const v = e.target.value;
                set('departmentId', v === 'none' ? null : v ? Number(v) : undefined);
              }}
            >
              <option value="" disabled style={placeholderOptionStyle}>Select department</option>
              <option value="none" style={realOptionStyle}>No department</option>
              {departments.map((d: DepartmentDto) => (
                <option key={d.id} value={d.id} style={realOptionStyle}>{d.name}</option>
              ))}
            </select>
          </Field>

          {/* Designation — plain fixed dropdown (no free-text entry). Optional:
              no-designation is a genuinely valid state, so "No designation" is a real,
              explicitly-chosen option — distinct from the untouched placeholder. */}
          <Field label="Designation">
            <select
              style={selectStyle(form.designationId !== undefined)}
              value={form.designationId === undefined ? '' : form.designationId === null ? 'none' : String(form.designationId)}
              onChange={e => {
                const v = e.target.value;
                set('designationId', v === 'none' ? null : v ? Number(v) : undefined);
              }}
            >
              <option value="" disabled style={placeholderOptionStyle}>Select designation</option>
              <option value="none" style={realOptionStyle}>No designation</option>
              {designations.map((d: DesignationDto) => (
                <option key={d.id} value={d.id} style={realOptionStyle}>{d.title}</option>
              ))}
            </select>
          </Field>

          {/* Shift — plain dropdown, managed centrally in Business Rules. Optional: a
              shift-less user is a genuinely valid state, so "No shift" is a real,
              explicitly-chosen option — distinct from the untouched placeholder. */}
          <Field label="Shift">
            <select
              style={selectStyle(form.shiftId !== undefined)}
              value={form.shiftId === undefined ? '' : form.shiftId === null ? 'none' : String(form.shiftId)}
              onChange={e => {
                const v = e.target.value;
                set('shiftId', v === 'none' ? null : v ? Number(v) : undefined);
              }}
            >
              <option value="" disabled style={placeholderOptionStyle}>Select shift</option>
              <option value="none" style={realOptionStyle}>No shift</option>
              {shifts.map((s: ShiftDefinitionDto) => <option key={s.id} value={s.id} style={realOptionStyle}>{formatShiftLabel(s)}</option>)}
            </select>
          </Field>

          {/* Location — full width. Plain fixed dropdown (no free-text entry, unlike
              Department/Designation) — locations are a controlled master list here.
              Optional: no-location is a genuinely valid state, so "No location" is a
              real, explicitly-chosen option — distinct from the untouched placeholder. */}
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Location">
              <select
                style={selectStyle(form.locationId !== undefined)}
                value={form.locationId === undefined ? '' : form.locationId === null ? 'none' : String(form.locationId)}
                onChange={e => {
                  const v = e.target.value;
                  set('locationId', v === 'none' ? null : v ? Number(v) : undefined);
                }}
              >
                <option value="" disabled style={placeholderOptionStyle}>Select location</option>
                <option value="none" style={realOptionStyle}>No location</option>
                {locations.map((l: OrgLocationDto) => (
                  <option key={l.id} value={l.id} style={realOptionStyle}>{l.name}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Manager — full width. Optional: no-manager is a genuinely valid state
              (e.g. top-level roles), so "No manager" is a real, explicitly-chosen
              option — distinct from the untouched placeholder. */}
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Manager">
              <select
                style={selectStyle(form.managerId !== undefined)}
                value={form.managerId === undefined ? '' : form.managerId === null ? 'none' : String(form.managerId)}
                onChange={e => {
                  const v = e.target.value;
                  set('managerId', v === 'none' ? null : v ? Number(v) : undefined);
                }}
              >
                <option value="" disabled style={placeholderOptionStyle}>Select manager</option>
                <option value="none" style={realOptionStyle}>No manager</option>
                {managers.map(m => (
                  <option key={m.id} value={m.id} style={realOptionStyle}>{m.fullName} ({m.email})</option>
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
  const { departments, designations, locations, shifts } = useOrgData();

  const [form, setForm] = useState<UpdateUserPayload>({
    fullName: '', role: 'EMPLOYEE',
    departmentId: null, designationId: null, locationId: null,
    employmentType: 'FULL_TIME', workMode: 'ONSITE', shiftId: null, managerId: null,
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
        shiftId:        user.shiftId       ?? null,
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

          {/* Department — creatable */}
          <Field label="Department">
            <CreatableSelect
              items={departments}
              getLabel={(d: DepartmentDto) => d.name}
              value={form.departmentId}
              onChange={id => set('departmentId', id)}
              onCreate={createDepartment}
              invalidateKey={['org', 'departments']}
              placeholder="Select or type a new department…"
              noneLabel="No departments found"
            />
          </Field>

          {/* Designation — creatable */}
          <Field label="Designation">
            <CreatableSelect
              items={designations}
              getLabel={(d: DesignationDto) => d.title}
              value={form.designationId}
              onChange={id => set('designationId', id)}
              onCreate={createDesignation}
              invalidateKey={['org', 'designations']}
              placeholder="Select or type a new designation…"
              noneLabel="No designations found"
            />
          </Field>

          {/* Shift — plain dropdown, managed centrally in Business Rules */}
          <Field label="Shift">
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={form.shiftId ?? ''}
              onChange={e => set('shiftId', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— None —</option>
              {shifts.map((s: ShiftDefinitionDto) => <option key={s.id} value={s.id}>{formatShiftLabel(s)}</option>)}
            </select>
          </Field>

          {/* Location — full width, creatable */}
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Location">
              <CreatableSelect
                items={locations}
                getLabel={(l: OrgLocationDto) => l.name}
                value={form.locationId}
                onChange={id => set('locationId', id)}
                onCreate={createLocation}
                invalidateKey={['org', 'locations']}
                placeholder="Select or type a new location…"
                noneLabel="No locations found"
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
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
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

  // Case-sensitive on purpose — user.email is always stored lowercase, so this is a
  // genuine "type exactly what you see" safety check, not a case-insensitive shortcut.
  const match = user != null && typed.trim() === user.email;

  // Import softDelete — UserController doesn't expose DELETE yet, so we use status
  // Note: If softDelete endpoint is not available, this uses a DELETE call
  const mutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
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

// ── Column filter dropdown ─────────────────────────────────────────────────────

interface FilterOption { value: string; label: string }

function ColumnFilterHeader({
  label, options, selected, onChange,
}: {
  label: string;
  options: FilterOption[];
  selected: string; // '' = All
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const active = selected !== '';

  // Rendered through a portal (see below) so the table's own overflow-x:auto
  // wrapper — which forces overflow-y to clip too, per CSS overflow coupling —
  // can't cut the dropdown off. Position is computed from the trigger's rect
  // rather than relying on normal-flow placement, since a portaled node is no
  // longer a DOM descendant of this header.
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 6, left: rect.left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    // Position isn't tracked continuously — close on scroll/resize rather than
    // let it drift out of alignment with the trigger. Scrolling *inside* the
    // panel's own option list must not close it — the capture-phase listener
    // sees that scroll too, so ignore anything whose target is inside panelRef.
    function onScrollOrResize(e: Event) {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  return (
    <div ref={triggerRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span>{label}</span>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`Filter by ${label}`}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer',
          background: active ? 'rgba(176,17,22,.16)' : 'transparent',
          color: active ? 'var(--brand-bright)' : 'var(--txt-dim)',
        }}
      >
        <Filter size={11} aria-hidden="true" />
      </button>
      {open && coords && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed', top: coords.top, left: coords.left, zIndex: 2000,
            minWidth: 170, maxHeight: 260, overflowY: 'auto', overscrollBehavior: 'contain',
            background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 7,
            boxShadow: '0 8px 24px rgba(0,0,0,.35)',
            textTransform: 'none', letterSpacing: 'normal', fontWeight: 400,
          }}
        >
          <div
            onClick={() => { onChange(''); setOpen(false); }}
            style={{
              padding: '8px 12px', fontSize: 12, cursor: 'pointer',
              color: selected === '' ? 'var(--brand-bright)' : 'var(--txt)',
              background: selected === '' ? 'rgba(176,17,22,.1)' : 'transparent',
            }}
          >
            All {label}
          </div>
          {options.map(opt => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                padding: '8px 12px', fontSize: 12, cursor: 'pointer',
                color: selected === opt.value ? 'var(--brand-bright)' : 'var(--txt)',
                background: selected === opt.value ? 'rgba(176,17,22,.1)' : 'transparent',
              }}
              onMouseEnter={e => { if (selected !== opt.value) e.currentTarget.style.background = 'var(--raised)'; }}
              onMouseLeave={e => { if (selected !== opt.value) e.currentTarget.style.background = 'transparent'; }}
            >
              {opt.label}
            </div>
          ))}
          {options.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--txt-dim)' }}>No values</div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

// Distinct values actually present among the current users, not the full org master
// list — e.g. Department filter only offers departments someone is actually in.
function distinctRoleOptions(list: UserDto[]): FilterOption[] {
  const roles = Array.from(new Set(list.map(u => u.role)));
  return roles
    .map(r => ({ value: r, label: ROLE_LABELS[toRole(r)] ?? r }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function distinctIdOptions(
  list: UserDto[],
  getId: (u: UserDto) => number | null,
  resolveName: (id: number) => string,
): FilterOption[] {
  const ids = new Set<number | null>();
  list.forEach(u => ids.add(getId(u)));
  const opts: FilterOption[] = Array.from(ids)
    .filter((id): id is number => id != null)
    .sort((a, b) => resolveName(a).localeCompare(resolveName(b)))
    .map(id => ({ value: String(id), label: resolveName(id) }));
  if (ids.has(null)) opts.push({ value: '__none__', label: '—' });
  return opts;
}

function exportUsersCsv(
  users: UserDto[],
  departments: { id: number; name: string }[],
  locations: { id: number; name: string }[],
  allUsers: UserDto[],
) {
  const deptName = (id: number | null) => departments.find(d => d.id === id)?.name ?? '';
  const locName  = (id: number | null) => locations.find(l => l.id === id)?.name ?? '';
  const mgrName  = (id: number | null) => allUsers.find(u => u.id === id)?.fullName ?? '';

  const rows: string[][] = [
    ['Employee Code', 'Full Name', 'Email', 'Role', 'Department', 'Location', 'Manager', 'Status', 'Work Mode', 'Employment Type', 'Joining Date'],
    ...users.map(u => [
      u.employeeCode,
      u.fullName,
      u.email,
      ROLE_LABELS[toRole(u.role)] ?? u.role,
      deptName(u.departmentId),
      locName(u.locationId),
      mgrName(u.managerId),
      u.status,
      u.workMode ?? '',
      u.employmentType ?? '',
      u.joiningDate ? formatDate(u.joiningDate) : '',
    ]),
  ];

  const csv = rows.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UserManagement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: users, isPending, isError, refetch } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: listUsers,
  });

  // Same source as the Admin Dashboard KPIs, so chip counts never drift from those numbers.
  const { data: stats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: getAdminStats,
  });

  // Org data pre-fetched for dropdowns (departments/locations also used for column display)
  const { departments, locations } = useOrgData();

  // ── Search / filters / sort ──────────────────────────────────────────────────
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [roleFilter,   setRoleFilter]   = useState(''); // '' = all
  const [deptFilter,   setDeptFilter]   = useState(''); // '' = all, '__none__' = unset
  const [locFilter,    setLocFilter]    = useState(''); // '' = all, '__none__' = unset
  const [sortDir,      setSortDir]      = useState<'asc' | 'desc'>('asc');

  const roleOptions = useMemo(() => distinctRoleOptions(users ?? []), [users]);
  const deptOptions = useMemo(() => distinctIdOptions(
    users ?? [], u => u.departmentId, id => departments.find(d => d.id === id)?.name ?? `#${id}`,
  ), [users, departments]);
  const locOptions = useMemo(() => distinctIdOptions(
    users ?? [], u => u.locationId, id => locations.find(l => l.id === id)?.name ?? `#${id}`,
  ), [users, locations]);

  const filteredUsers = useMemo(() => {
    if (!users) return undefined;
    let list = users;
    if (statusFilter !== 'ALL') list = list.filter(u => u.status === statusFilter);
    if (roleFilter) list = list.filter(u => u.role === roleFilter);
    if (deptFilter) {
      list = list.filter(u => deptFilter === '__none__' ? u.departmentId == null : String(u.departmentId) === deptFilter);
    }
    if (locFilter) {
      list = list.filter(u => locFilter === '__none__' ? u.locationId == null : String(u.locationId) === locFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(u =>
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.employeeCode.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) =>
      sortDir === 'asc' ? a.fullName.localeCompare(b.fullName) : b.fullName.localeCompare(a.fullName));
  }, [users, statusFilter, roleFilter, deptFilter, locFilter, search, sortDir]);

  const activeFilterCount =
    (statusFilter !== 'ALL' ? 1 : 0) +
    (roleFilter ? 1 : 0) +
    (deptFilter ? 1 : 0) +
    (locFilter ? 1 : 0) +
    (search.trim() ? 1 : 0);

  function clearAllFilters() {
    setSearch('');
    setStatusFilter('ALL');
    setRoleFilter('');
    setDeptFilter('');
    setLocFilter('');
  }

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

  // Deep link from the top-nav workspace search (?userId=…) — opens that
  // employee's edit view directly, since there's no standalone profile page.
  useEffect(() => {
    const userId = searchParams.get('userId');
    if (!userId || !users) return;
    const target = users.find((u) => u.id === Number(userId));
    if (target) setEditTarget({ ...target });
    setSearchParams((prev) => { prev.delete('userId'); return prev; }, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, searchParams]);

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
  function locationName(id: number | null): string {
    if (id == null) return '—';
    return locations.find((l: OrgLocationDto) => l.id === id)?.name ?? '—';
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
        <div style={{ display: 'flex', gap: 8 }}>
          {filteredUsers && filteredUsers.length > 0 && (
            <button
              onClick={() => exportUsersCsv(filteredUsers, departments, locations, users ?? [])}
              title={`Export ${filteredUsers.length} user${filteredUsers.length !== 1 ? 's' : ''} to CSV`}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: 'var(--txt-mut)', border: '1px solid var(--line2)', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--txt-dim)'; e.currentTarget.style.color = 'var(--txt)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line2)'; e.currentTarget.style.color = 'var(--txt-mut)'; }}
            >
              <Download size={13} aria-hidden="true" /> Export CSV
            </button>
          )}
          <button
            onClick={() => setShowAdd(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <UserPlus size={14} /> Add User
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
              All Users {users && (
                <span style={{ color: 'var(--txt-dim)', fontWeight: 400 }}>
                  ({filteredUsers?.length ?? 0}{activeFilterCount > 0 ? ` of ${users.length}` : ''})
                </span>
              )}
            </div>
            <button
              onClick={() => refetch()}
              aria-label="Refresh users list"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--txt-dim)', padding: 6, display: 'flex', alignItems: 'center', borderRadius: 5 }}
            >
              <RefreshCw size={14} aria-hidden="true" />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-dim)' }} aria-hidden="true" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter this list…"
                style={{
                  width: '100%', boxSizing: 'border-box', background: 'var(--shell)', border: '1px solid var(--line2)',
                  borderRadius: 6, padding: '7px 10px 7px 30px', color: 'var(--txt)', fontSize: 12, outline: 'none',
                  fontFamily: 'Inter, sans-serif',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map(s => {
                const isSelected = statusFilter === s;
                const label = s === 'ALL' ? 'All' : s === 'ACTIVE' ? 'Active' : 'Inactive';
                const count = stats && (
                  s === 'ALL' ? stats.totalUsers : s === 'ACTIVE' ? stats.activeUsers : stats.inactiveUsers
                );
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    style={{
                      padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      border: `1px solid ${isSelected ? 'var(--brand-bright)' : 'var(--line2)'}`,
                      background: isSelected ? 'rgba(176,17,22,.12)' : 'transparent',
                      color: isSelected ? 'var(--brand-bright)' : 'var(--txt-mut)',
                    }}
                  >
                    {label}{count != null ? ` (${count})` : ''}
                  </button>
                );
              })}
            </div>

            {activeFilterCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11, fontWeight: 600, color: 'var(--brand-bright)',
                  background: 'rgba(176,17,22,.12)', border: '1px solid rgba(176,17,22,.3)',
                  borderRadius: 20, padding: '3px 9px',
                }}>
                  <Filter size={10} aria-hidden="true" /> {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
                </span>
                <button
                  onClick={clearAllFilters}
                  style={{ background: 'none', border: 'none', color: 'var(--txt-mut)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
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

        {filteredUsers && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Employee ID</th>
                  <th style={thStyle}>
                    <button
                      type="button"
                      onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                      aria-label={`Sort by name, currently ${sortDir === 'asc' ? 'ascending' : 'descending'}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
                        padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit',
                        letterSpacing: 'inherit', textTransform: 'inherit',
                      }}
                    >
                      Name {sortDir === 'asc' ? <ArrowUp size={11} aria-hidden="true" /> : <ArrowDown size={11} aria-hidden="true" />}
                    </button>
                  </th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>
                    <ColumnFilterHeader label="Role" options={roleOptions} selected={roleFilter} onChange={setRoleFilter} />
                  </th>
                  <th style={thStyle}>
                    <ColumnFilterHeader label="Department" options={deptOptions} selected={deptFilter} onChange={setDeptFilter} />
                  </th>
                  <th style={thStyle}>
                    <ColumnFilterHeader label="Location" options={locOptions} selected={locFilter} onChange={setLocFilter} />
                  </th>
                  <th style={thStyle}>Manager</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '48px 20px', textAlign: 'center' }}>
                      {users && users.length === 0 ? (
                        <>
                          <div style={{ fontSize: 15, color: 'var(--txt-mut)', marginBottom: 8 }}>No users yet</div>
                          <div style={{ fontSize: 13, color: 'var(--txt-dim)' }}>Click "Add User" to create the first account.</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 15, color: 'var(--txt-mut)', marginBottom: 8 }}>No users match the current filters</div>
                          <button
                            onClick={clearAllFilters}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 12, cursor: 'pointer' }}
                          >
                            Clear all filters
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(user => (
                    <tr
                      key={user.id}
                      style={{ opacity: user.status === 'ACTIVE' ? 1 : 0.65, transition: 'background 0.1s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--raised)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
                    >
                      <td style={tdStyle}>
                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: 'var(--txt-dim)', fontVariantNumeric: 'tabular-nums' }}>
                          {user.employeeCode}
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
                          {locationName(user.locationId)}
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
                            icon={user.status === 'ACTIVE' ? <PowerOff size={13} /> : <Power size={13} />}
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
