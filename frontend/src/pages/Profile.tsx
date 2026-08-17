import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Lock, Shield, Loader2, AlertCircle } from 'lucide-react';
import { fetchProfile, updateProfile, uploadPhoto, type ProfileDto, type UpdateProfilePayload } from '../api/profile';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

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

const WORK_MODES = ['ONSITE', 'HYBRID', 'REMOTE'] as const;
const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FULL_TIME:  'Full-time',
  PART_TIME:  'Part-time',
  CONTRACTOR: 'Contractor',
  CONTRACT:   'Contract',
  INTERN:     'Intern',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ title, badge }: { title: string; badge?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
      <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--txt)', fontFamily: '"Space Grotesk", sans-serif', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {title}
      </h2>
      {badge && (
        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: 'rgba(107,114,128,.15)', color: 'var(--txt-dim)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
          {badge}
        </span>
      )}
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-mut)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: value ? 'var(--txt)' : 'var(--txt-dim)', minHeight: 20 }}>{value || '—'}</div>
    </div>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--raised)', border: '1px solid var(--line2)',
  borderRadius: 6, padding: '7px 10px', fontSize: 13, color: 'var(--txt)', outline: 'none',
  fontFamily: 'Inter, sans-serif',
};

function EditField({ label, value, onChange, type = 'text', placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--txt-mut)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={INPUT_STYLE} />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Profile() {
  const { user: authUser } = useAuth();
  const navigate    = useNavigate();
  const { showToast } = useToast();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState<UpdateProfilePayload>({});
  const [uploading, setUploading] = useState(false);

  // Query key includes user email to prevent stale cache across login sessions
  const { data: profile, isLoading, error } = useQuery<ProfileDto>({
    queryKey: ['profile', authUser?.email],
    queryFn: fetchProfile,
    staleTime: 300_000,
    enabled: !!authUser,
  });

  const saveMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (updated) => {
      qc.setQueryData(['profile', authUser?.email], updated);
      setEditing(false);
      showToast('success', 'Profile updated');
    },
    onError: (e) => {
      showToast('error', e instanceof Error ? e.message : 'Save failed');
    },
  });

  function toForm(p: ProfileDto): UpdateProfilePayload {
    return {
      phone: p.phone ?? '',
      dateOfBirth: p.dateOfBirth ?? '',
      gender: p.gender ?? '',
      personalEmail: p.personalEmail ?? '',
      address: p.address ?? '',
      emergencyContactName: p.emergencyContactName ?? '',
      emergencyContactPhone: p.emergencyContactPhone ?? '',
      workMode: p.workMode ?? 'ONSITE',
    };
  }

  function startEdit() {
    if (!profile) return;
    setForm(toForm(profile));
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    saveMutation.reset();
  }

  async function handleSave() {
    const cleaned: UpdateProfilePayload = {};
    if (form.phone !== undefined)               cleaned.phone = form.phone;
    if (form.dateOfBirth)                       cleaned.dateOfBirth = form.dateOfBirth;
    if (form.gender)                            cleaned.gender = form.gender;
    if (form.personalEmail)                     cleaned.personalEmail = form.personalEmail;
    if (form.address)                           cleaned.address = form.address;
    if (form.emergencyContactName !== undefined) cleaned.emergencyContactName = form.emergencyContactName;
    if (form.emergencyContactPhone !== undefined) cleaned.emergencyContactPhone = form.emergencyContactPhone;
    if (form.workMode)                          cleaned.workMode = form.workMode;
    saveMutation.mutate(cleaned);
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const updated = await uploadPhoto(file);
      qc.setQueryData(['profile', authUser?.email], updated);
      showToast('success', 'Photo updated');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }

  function field(key: keyof UpdateProfilePayload) {
    return String(form[key] ?? '');
  }
  function set(key: keyof UpdateProfilePayload) {
    return (v: string) => setForm(f => ({ ...f, [key]: v }));
  }

  // ── Loading / error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, gap: 10, color: 'var(--txt-mut)' }}>
        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
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

  const initials = profile.fullName
    ? profile.fullName.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : profile.email.slice(0, 2).toUpperCase();

  const saving = saveMutation.isPending;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>

      {/* Page header */}
      <div>
        <h1 style={{ margin: 0, marginBottom: 4, fontSize: 20, fontWeight: 700, color: 'var(--txt)', fontFamily: '"Space Grotesk", sans-serif' }}>My Profile</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--txt-mut)' }}>View and update your personal information.</p>
      </div>

      {/* Avatar + identity card */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* Avatar */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {profile.photoDataUrl ? (
            <img src={profile.photoDataUrl} alt="Profile" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--line2)' }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--brand)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 22, fontWeight: 700, border: '2px solid rgba(177,17,22,.4)', fontFamily: '"Space Grotesk", sans-serif' }}>
              {initials}
            </div>
          )}
          {uploading && (
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center' }}>
              <Loader2 size={16} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          )}
          {profile.hasEmployeeRecord && (
            <>
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={uploading}
                aria-label="Change photo"
                style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%', background: 'var(--brand)', border: '2px solid var(--panel)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
              >
                <Camera size={11} color="#fff" aria-hidden />
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
            </>
          )}
        </div>

        {/* Identity info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--txt)', fontFamily: '"Space Grotesk", sans-serif', marginBottom: 3 }}>{profile.fullName}</div>
          <div style={{ fontSize: 12, color: 'var(--txt-mut)', marginBottom: 6 }}>{profile.email}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(177,17,22,.18)', color: 'var(--brand-bright)' }}>
              {ROLE_LABELS[profile.role] ?? profile.role}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: profile.active ? 'rgba(47,182,124,.15)' : 'rgba(107,114,128,.15)', color: profile.active ? 'var(--ok)' : 'var(--txt-dim)' }}>
              {profile.active ? 'Active' : 'Inactive'}
            </span>
            <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: 'rgba(107,114,128,.15)', color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>
              {profile.employeeCode}
            </span>
          </div>
        </div>

        {/* Edit / Save buttons */}
        {profile.hasEmployeeRecord && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {editing ? (
              <>
                <button onClick={cancelEdit}
                  style={{ padding: '7px 14px', background: 'var(--raised)', border: '1px solid var(--line2)', borderRadius: 6, fontSize: 12.5, color: 'var(--txt-mut)', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: 'var(--brand)', border: 'none', borderRadius: 6, fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1 }}>
                  {saving && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </>
            ) : (
              <button onClick={startEdit}
                style={{ padding: '7px 16px', background: 'var(--brand)', border: 'none', borderRadius: 6, fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
                Edit Profile
              </button>
            )}
          </div>
        )}
      </div>

      {/* 2-column: Personal + Employment */}
      <div className="nf-r-stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Personal Information */}
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '20px 24px' }}>
          <SectionHeader title="Personal Information" />
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <EditField label="Phone" value={field('phone')} onChange={set('phone')} placeholder="+91 99999 99999" />
              <EditField label="Date of Birth" value={field('dateOfBirth')} onChange={set('dateOfBirth')} type="date" />
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--txt-mut)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Gender</label>
                <select value={field('gender')} onChange={e => set('gender')(e.target.value)} style={{ ...INPUT_STYLE }}>
                  <option value="">Select…</option>
                  {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <EditField label="Personal Email" value={field('personalEmail')} onChange={set('personalEmail')} type="email" placeholder="personal@email.com" />
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--txt-mut)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Address</label>
                <textarea value={field('address')} onChange={e => set('address')(e.target.value)}
                  placeholder="Your address…" rows={3}
                  style={{ ...INPUT_STYLE, resize: 'vertical' }} />
              </div>
            </div>
          ) : (
            <div className="nf-r-stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <ReadField label="Phone" value={profile.phone} />
              <ReadField label="Date of Birth" value={profile.dateOfBirth} />
              <ReadField label="Gender" value={profile.gender} />
              <ReadField label="Personal Email" value={profile.personalEmail} />
              <div style={{ gridColumn: '1/-1' }}>
                <ReadField label="Address" value={profile.address} />
              </div>
            </div>
          )}
        </div>

        {/* Employment — HR managed */}
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '20px 24px' }}>
          <SectionHeader title="Employment" badge="HR Managed" />
          <div className="nf-r-stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <ReadField label="Employee Code" value={profile.employeeCode} />
            <ReadField label="Department" value={profile.departmentName} />
            <ReadField label="Designation" value={profile.designationName} />
            <ReadField label="Location" value={profile.locationName} />
            <ReadField label="Employment Type" value={profile.employmentType ? (EMPLOYMENT_TYPE_LABELS[profile.employmentType] ?? profile.employmentType.replace('_', ' ')) : null} />
            <ReadField label="Joining Date" value={profile.joiningDate} />
            <ReadField label="Manager" value={profile.managerName} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-mut)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Work Mode</div>
              {editing ? (
                <select value={field('workMode')} onChange={e => set('workMode')(e.target.value)} style={{ ...INPUT_STYLE }}>
                  {WORK_MODES.map(m => <option key={m} value={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
                </select>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--txt)' }}>{profile.workMode ?? '—'}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Emergency Contact */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '20px 24px' }}>
        <SectionHeader title="Emergency Contact" />
        {editing ? (
          <div className="nf-r-stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <EditField label="Contact Name" value={field('emergencyContactName')} onChange={set('emergencyContactName')} placeholder="Full name" />
            <EditField label="Contact Phone" value={field('emergencyContactPhone')} onChange={set('emergencyContactPhone')} placeholder="+91 99999 99999" />
          </div>
        ) : (
          <div className="nf-r-stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <ReadField label="Contact Name" value={profile.emergencyContactName} />
            <ReadField label="Contact Phone" value={profile.emergencyContactPhone} />
          </div>
        )}
      </div>

      {/* Security */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '20px 24px' }}>
        <SectionHeader title="Security" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500, marginBottom: 3 }}>Password</div>
            <div style={{ fontSize: 12, color: 'var(--txt-mut)' }}>Change your account password at any time.</div>
          </div>
          <button
            onClick={() => navigate('/change-password')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--raised)', border: '1px solid var(--line2)', borderRadius: 6, fontSize: 12.5, color: 'var(--txt)', cursor: 'pointer' }}
          >
            <Lock size={13} aria-hidden />
            Change Password
          </button>
        </div>
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={14} color="var(--txt-dim)" aria-hidden />
          <span style={{ fontSize: 12, color: 'var(--txt-mut)' }}>
            Role: <strong style={{ color: 'var(--txt)' }}>{ROLE_LABELS[profile.role] ?? profile.role}</strong>
            {' · '}Account status: <strong style={{ color: profile.active ? 'var(--ok)' : 'var(--risk)' }}>{profile.active ? 'Active' : 'Inactive'}</strong>
          </span>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
