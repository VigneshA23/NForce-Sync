import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Phone, AlertCircle,
  Lock, Edit2, Save, X, Mail, Hash, Loader2, Info,
} from 'lucide-react';
import { fetchProfile, updateProfile, type ProfileDto } from '../api/profile';

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE:   'Employee',
  MANAGER:    'Team Lead',
  PM:         'Project Manager',
  DM:         'Delivery Manager',
  HR:         'HR Admin',
  FINANCE:    'Finance Admin',
  LEADERSHIP: 'Leadership Viewer',
  SUPERADMIN: 'Super Admin',
};

const WORK_MODE_LABELS: Record<string, string> = {
  ONSITE: 'On-site', REMOTE: 'Remote', HYBRID: 'Hybrid',
};

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: 'Full-time', PART_TIME: 'Part-time',
  CONTRACTOR: 'Contractor', CONTRACT: 'Contract', INTERN: 'Intern',
};

// ── Shared styles — pulled from UserManagement.tsx conventions ────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--txt-dim)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
};

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

// ── Sub-components ─────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
}

function StatusPill({ status }: { status: string }) {
  const active = status === 'ACTIVE';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, letterSpacing: '.04em',
      background: active ? 'rgba(47,182,124,.14)' : 'rgba(107,114,128,.14)',
      color: active ? 'var(--ok)' : 'var(--txt-mut)',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? 'var(--ok)' : 'var(--txt-mut)', display: 'inline-block' }} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function WorkModePill({ mode }: { mode: string | null }) {
  if (!mode) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, letterSpacing: '.04em',
      background: 'rgba(76,141,214,.14)', color: 'var(--info)',
    }}>
      {WORK_MODE_LABELS[mode] ?? mode}
    </span>
  );
}

function FieldView({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: value ? 500 : 400, color: value ? 'var(--txt)' : 'var(--txt-dim)' }}>
        {value || '—'}
      </div>
    </div>
  );
}

function EditableField({
  label, value, onChange, placeholder, maxLength,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; maxLength?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        style={{
          ...inputStyle,
          borderColor: focused ? 'var(--brand-bright)' : 'var(--line2)',
          boxShadow: focused ? '0 0 0 3px rgba(228,55,61,.14)' : 'none',
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Profile() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ phone: '', emergencyContactName: '', emergencyContactPhone: '' });

  const { data: profile, isLoading, error } = useQuery<ProfileDto>({
    queryKey: ['profile'],
    queryFn: fetchProfile,
    staleTime: 300_000,
  });

  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
      setEditing(false);
    },
  });

  function startEdit() {
    if (!profile) return;
    setForm({
      phone: profile.phone ?? '',
      emergencyContactName: profile.emergencyContactName ?? '',
      emergencyContactPhone: profile.emergencyContactPhone ?? '',
    });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    mutation.reset();
  }

  function save() {
    mutation.mutate({
      phone: form.phone || null,
      emergencyContactName: form.emergencyContactName || null,
      emergencyContactPhone: form.emergencyContactPhone || null,
    });
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 10, color: 'var(--txt-dim)' }}>
        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 13 }}>Loading profile…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--risk)', padding: 20, fontSize: 13 }}>
        <AlertCircle size={15} />
        Failed to load profile. Please refresh.
      </div>
    );
  }

  const initials = profile.fullName.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--brand-bright)', marginBottom: 6 }}>
            Employee Workspace
          </div>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 24, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            My Profile
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
            View your official employee record and update only permitted self-service details.
          </p>
        </div>

        {!editing && (
          <button
            onClick={startEdit}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', background: 'var(--brand)',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              color: '#fff', fontSize: 13, fontWeight: 600,
              fontFamily: 'Inter, sans-serif', flexShrink: 0,
              transition: 'background 120ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--brand-bright)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--brand)'; }}
          >
            <Edit2 size={13} />
            Update permitted details
          </button>
        )}
      </div>

      {/* Identity + Employment details card */}
      <div style={{
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 16,
        boxShadow: '0 1px 4px rgba(0,0,0,.06)',
      }}>
        <div style={{ display: 'flex' }}>

          {/* Left — identity */}
          <div style={{
            width: 220,
            flexShrink: 0,
            padding: '28px 24px',
            borderRight: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 12,
          }}>
            {/* Avatar */}
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'var(--brand)',
              border: '3px solid rgba(228,55,61,.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, fontWeight: 700, color: '#fff',
              fontFamily: '"Space Grotesk", sans-serif',
              flexShrink: 0,
            }}>
              {initials}
            </div>

            {/* Name + designation */}
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--txt)', fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1.3 }}>
                {profile.fullName}
              </div>
              {profile.designationName && (
                <div style={{ fontSize: 12, color: 'var(--txt-mut)', marginTop: 4 }}>
                  {profile.designationName}
                </div>
              )}
            </div>

            {/* Status pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              <StatusPill status={profile.status} />
              {profile.workMode && <WorkModePill mode={profile.workMode} />}
            </div>

            {/* Meta */}
            <div style={{ width: '100%', borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--txt-mut)' }}>
                <Hash size={11} style={{ flexShrink: 0, color: 'var(--txt-dim)' }} />
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>{profile.employeeCode}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--txt-mut)', wordBreak: 'break-all' }}>
                <Mail size={11} style={{ flexShrink: 0, color: 'var(--txt-dim)' }} />
                <span style={{ fontSize: 11 }}>{profile.email}</span>
              </div>
            </div>

            {/* Role badge */}
            <span style={{
              display: 'inline-block', padding: '3px 10px',
              background: 'rgba(177,17,22,.12)',
              border: '1px solid rgba(228,55,61,.2)',
              borderRadius: 6, fontSize: 10, fontWeight: 700,
              color: 'var(--brand-bright)', letterSpacing: '.06em',
            }}>
              {ROLE_LABELS[profile.role] ?? profile.role}
            </span>
          </div>

          {/* Right — employment details */}
          <div style={{ flex: 1, padding: '24px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <Building2 size={14} style={{ color: 'var(--txt-dim)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', fontFamily: '"Space Grotesk", sans-serif' }}>
                Employment details
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', background: 'var(--raised2)', borderRadius: 6 }}>
                <Lock size={10} style={{ color: 'var(--txt-dim)' }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--txt-dim)', letterSpacing: '.06em', textTransform: 'uppercase' }}>HR-managed</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 32px' }}>
              <FieldView label="Employee ID" value={profile.employeeCode} />
              <FieldView label="Work email" value={profile.email} />
              <FieldView label="Department" value={profile.departmentName} />
              <FieldView label="Designation" value={profile.designationName} />
              <FieldView label="Reporting manager" value={profile.managerName} />
              <FieldView label="Joining date" value={formatDate(profile.joiningDate)} />
              <FieldView label="Location" value={profile.locationName} />
              <FieldView
                label="Employment status"
                value={profile.status === 'ACTIVE' ? 'Active' : profile.status === 'INACTIVE' ? 'Inactive' : profile.status}
              />
              {profile.employmentType && (
                <FieldView label="Employment type" value={EMPLOYMENT_TYPE_LABELS[profile.employmentType] ?? profile.employmentType} />
              )}
              <FieldView label="Member since" value={formatDate(profile.createdAt)} />
            </div>
          </div>
        </div>
      </div>

      {/* Self-service contact card */}
      <div style={{
        background: 'var(--panel)',
        border: editing ? '1px solid rgba(228,55,61,.35)' : '1px solid var(--line)',
        borderRadius: 10,
        padding: '22px 28px',
        marginBottom: 12,
        transition: 'border-color 200ms',
        boxShadow: '0 1px 4px rgba(0,0,0,.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <Phone size={14} style={{ color: 'var(--txt-dim)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', fontFamily: '"Space Grotesk", sans-serif' }}>
            Self-service contact information
          </span>
          {editing && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                onClick={save}
                disabled={mutation.isPending}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', background: 'var(--brand)',
                  border: 'none', borderRadius: 7, cursor: mutation.isPending ? 'not-allowed' : 'pointer',
                  color: '#fff', fontSize: 12, fontWeight: 600, opacity: mutation.isPending ? 0.7 : 1,
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                {mutation.isPending ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
                {mutation.isPending ? 'Saving…' : 'Save changes'}
              </button>
              <button
                onClick={cancelEdit}
                disabled={mutation.isPending}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 12px', background: 'transparent',
                  border: '1px solid var(--line)', borderRadius: 7,
                  cursor: 'pointer', color: 'var(--txt-mut)', fontSize: 12,
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                <X size={12} />
                Cancel
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px 24px' }}>
              <EditableField
                label="Phone"
                value={form.phone}
                onChange={(v) => setForm(f => ({ ...f, phone: v }))}
                placeholder="+91 98765 43210"
                maxLength={30}
              />
              <EditableField
                label="Emergency contact name"
                value={form.emergencyContactName}
                onChange={(v) => setForm(f => ({ ...f, emergencyContactName: v }))}
                placeholder="Full name"
                maxLength={200}
              />
              <EditableField
                label="Emergency contact phone"
                value={form.emergencyContactPhone}
                onChange={(v) => setForm(f => ({ ...f, emergencyContactPhone: v }))}
                placeholder="+91 98765 43210"
                maxLength={30}
              />
            </div>
            {mutation.isError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--risk)', fontSize: 12, marginTop: 12 }}>
                <AlertCircle size={13} />
                Save failed. Please try again.
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 32px' }}>
            <FieldView label="Phone" value={profile.phone} />
            <FieldView label="Preferred work mode" value={profile.workMode ? (WORK_MODE_LABELS[profile.workMode] ?? profile.workMode) : null} />
            <FieldView label="Emergency contact" value={profile.emergencyContactName
              ? `${profile.emergencyContactName}${profile.emergencyContactPhone ? ` · ${profile.emergencyContactPhone}` : ''}`
              : null
            } />
          </div>
        )}
      </div>

      {/* HR info banner */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '12px 16px',
        background: 'rgba(76,141,214,.08)',
        border: '1px solid rgba(76,141,214,.18)',
        borderRadius: 8, fontSize: 12, color: 'var(--txt-mut)',
      }}>
        <Info size={14} style={{ color: 'var(--info)', flexShrink: 0, marginTop: 1 }} />
        To correct your legal name, employee ID, department, designation, manager, joining date or employment status, contact HR support.
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
