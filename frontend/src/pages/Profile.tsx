import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Lock, Shield, Loader2, AlertCircle, Trash2, Mail, Phone, MapPin, Hash, Building2, UserCircle2, ImagePlus } from 'lucide-react';
import { fetchProfile, updateProfile, uploadPhoto, deletePhoto, uploadBanner, deleteBanner, type ProfileDto, type UpdateProfilePayload } from '../api/profile';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { Modal } from '../components/Modal';
import { ImageCropper } from '../components/ImageCropper';
import { Card } from '../components/KpiCard';
import { useHashScroll } from '../lib/useHashScroll';
import { GlobalLoader } from '../components/GlobalLoader';

// Shared card shadow — a bit more "lift" than a flat border on its own, barely visible on dark
// panels and a gentle depth cue on light ones.
const CARD_SHADOW = '0 1px 3px rgba(0,0,0,.08)';

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE:   'Employee',
  MANAGER:    'Team Lead',
  PM:         'Project Manager',
  DM:         'Delivery Manager',
  FINANCE:    'Finance Admin',
  LEADERSHIP: 'Leadership Viewer',
  ADMIN:      'Admin',
  SUPERADMIN: 'Super Admin',
};

// Matches the server-side check in ProfileController.uploadBanner, which is the real boundary;
// this is just a fast client-side error before the round trip.
const BANNER_MAX_BYTES = 2 * 1024 * 1024;
const BANNER_ACCEPTED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);

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

// Matches nav.ts's employee "Profile" subItem anchors exactly (personal-information, employment,
// emergency-contact, security) — deriving the id from the title keeps them in sync automatically
// instead of needing a parallel id passed at every call site.
function sectionId(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function SectionHeader({ title, badge }: { title: string; badge?: string }) {
  return (
    <div id={sectionId(title)} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, scrollMarginTop: 72 }}>
      <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--txt)', fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', textTransform: 'uppercase', letterSpacing: '.06em' }}>
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

// One consistent brand-red accent for every chip (matching the reference's uniformly-red icon
// chips), reusing the color-mix tint recipe StatCard (pages/lead/Blockers.tsx) already applies.
function ContactChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: 'color-mix(in srgb, var(--brand-bright) 15%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-bright)',
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-mut)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 13, color: value ? 'var(--txt)' : 'var(--txt-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || '-'}</div>
      </div>
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-mut)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: value ? 'var(--txt)' : 'var(--txt-dim)', minHeight: 20 }}>{value || '-'}</div>
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
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState<UpdateProfilePayload>({});
  const [uploading, setUploading] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerViewerOpen, setBannerViewerOpen] = useState(false);
  const [bannerCropFile, setBannerCropFile] = useState<File | null>(null);

  // Query key includes user email to prevent stale cache across login sessions
  const { data: profile, isLoading, error } = useQuery<ProfileDto>({
    queryKey: ['profile', authUser?.email],
    queryFn: fetchProfile,
    staleTime: 300_000,
    enabled: !!authUser,
  });
  useHashScroll(!isLoading);

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

  // Writes the same ['profile', email] cache entry the upload path does, which is what the
  // Shell's avatars read — so the header, dropdown and sidebar drop back to initials at once.
  async function handlePhotoRemove() {
    setUploading(true);
    try {
      const updated = await deletePhoto();
      qc.setQueryData(['profile', authUser?.email], updated);
      showToast('success', 'Photo removed');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not remove photo');
    } finally {
      setUploading(false);
    }
  }

  // Opens the crop step rather than uploading directly — the file's own size doesn't matter yet
  // since cropping re-encodes it; only the cropped OUTPUT is checked against the 2 MB limit
  // (handleBannerCropApply), matching the server-side check in ProfileController.uploadBanner.
  function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!BANNER_ACCEPTED_TYPES.has(file.type)) {
      showToast('error', 'Banner must be a JPEG (.jpg/.jpeg) or PNG (.png) image');
    } else {
      setBannerCropFile(file);
    }
    // Reset now (not after crop) so cancelling and re-picking the exact same file still fires
    // a change event — the browser won't fire one for an unchanged input value.
    if (bannerInputRef.current) bannerInputRef.current.value = '';
  }

  async function handleBannerCropApply(croppedFile: File) {
    if (croppedFile.size > BANNER_MAX_BYTES) {
      showToast('error', 'Cropped banner is still over 2 MB — try zooming out a little');
      return;
    }
    setUploadingBanner(true);
    try {
      const updated = await uploadBanner(croppedFile);
      qc.setQueryData(['profile', authUser?.email], updated);
      setBannerCropFile(null);
      setBannerViewerOpen(false);
      showToast('success', 'Banner updated');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingBanner(false);
    }
  }

  function handleBannerCropCancel() {
    setBannerCropFile(null);
  }

  async function handleBannerRemove() {
    setUploadingBanner(true);
    try {
      const updated = await deleteBanner();
      qc.setQueryData(['profile', authUser?.email], updated);
      showToast('success', 'Banner removed');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not remove banner');
    } finally {
      setUploadingBanner(false);
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
    return <GlobalLoader fullScreen={false} />;
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>

      {/* Page header */}
      <div>
        <h1 style={{ margin: 0, marginBottom: 4, fontSize: 20, fontWeight: 700, color: 'var(--txt)', fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif' }}>My Profile</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--txt-mut)' }}>View and update your personal information.</p>
      </div>

      {/* Banner + avatar + identity card — LinkedIn-style: avatar overlaps the banner's
          bottom-left corner, and the identity details sit below it (not beside it). */}
      <Card style={{ padding: 0, overflow: 'hidden', boxShadow: CARD_SHADOW }}>
        {/* Cover banner — the user's own uploaded image if set, otherwise a brand-red gradient
            with a diagonal glossy highlight (theme-independent, same recipe as the topbar's
            always-brand gradient in Shell.tsx). */}
        <div
          className="nf-r-profile-banner"
          style={{
            position: 'relative', height: 120,
            background: profile.bannerDataUrl
              ? `center / cover no-repeat url(${profile.bannerDataUrl})`
              : 'linear-gradient(135deg, var(--brand-deep) 0%, var(--brand) 55%, var(--brand-bright) 100%)',
          }}
        >
          {!profile.bannerDataUrl && (
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, transparent 40%, rgba(255,255,255,.14) 50%, transparent 60%)' }} />
          )}
          {profile.hasEmployeeRecord && (
            <button
              type="button"
              onClick={() => setBannerViewerOpen(true)}
              aria-label={profile.bannerDataUrl ? 'Change cover banner' : 'Add a cover banner'}
              title={profile.bannerDataUrl ? 'Change cover banner' : 'Add a cover banner'}
              style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(2px)', border: '1px solid rgba(255,255,255,.35)', borderRadius: 20, fontSize: 11.5, fontWeight: 600, color: '#fff', cursor: 'pointer' }}
            >
              <ImagePlus size={13} aria-hidden />
              {profile.bannerDataUrl ? 'Change cover' : 'Add cover'}
            </button>
          )}
          {uploadingBanner && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center' }}>
              <Loader2 size={20} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          )}
        </div>

        {/* Avatar — overlaps the banner's bottom-left corner. Clicking it (or the camera badge)
            opens the viewer below, which is where uploading and removing live. */}
        <div className="nf-r-profile-content" style={{ position: 'relative', padding: '0 24px 20px' }}>
          <div className="nf-r-profile-avatar" style={{ position: 'absolute', top: -44, left: 24 }}>
            <button
              type="button"
              onClick={() => setPhotoViewerOpen(true)}
              aria-label={profile.photoDataUrl ? 'View profile photo' : 'Add a profile photo'}
              title={profile.photoDataUrl ? 'View profile photo' : 'Add a profile photo'}
              style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', display: 'block', borderRadius: '50%' }}
            >
              {profile.photoDataUrl ? (
                <img src={profile.photoDataUrl} alt="Profile" className="nf-r-profile-avatar-img" style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '4px solid var(--panel)', display: 'block' }} />
              ) : (
                <div className="nf-r-profile-avatar-img" style={{ width: 88, height: 88, borderRadius: '50%', background: 'var(--brand)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 26, fontWeight: 700, border: '4px solid var(--panel)', fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif' }}>
                  {initials}
                </div>
              )}
            </button>
            {profile.hasEmployeeRecord && (
              <button
                type="button"
                onClick={() => setPhotoViewerOpen(true)}
                aria-label="Change profile photo"
                title="Change profile photo"
                style={{ position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: '50%', background: 'var(--brand)', border: '2px solid var(--panel)', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}
              >
                <Camera size={12} color="#fff" aria-hidden />
              </button>
            )}
            {uploading && (
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center' }}>
                <Loader2 size={16} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            )}
          </div>

          {/* Details — sit below the avatar, full width, with Edit/Save floated to the right. */}
          <div className="nf-r-profile-details" style={{ paddingTop: 52, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--txt)', fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.fullName}</div>
              {profile.designationName && (
                <div style={{ fontSize: 13, color: 'var(--txt-mut)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.designationName}</div>
              )}
              <div style={{ fontSize: 12, color: 'var(--txt-mut)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.email}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'color-mix(in srgb, var(--brand) 18%, transparent)', color: 'var(--brand-bright)' }}>
                  {ROLE_LABELS[profile.role] ?? profile.role}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: profile.active ? 'rgba(47,182,124,.15)' : 'rgba(107,114,128,.15)', color: profile.active ? 'var(--ok)' : 'var(--txt-dim)' }}>
                  {profile.active ? 'Active' : 'Inactive'}
                </span>
                <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: 'rgba(107,114,128,.15)', color: 'var(--txt-dim)' }}>
                  {profile.employeeCode}
                </span>
              </div>
            </div>

            {/* Edit / Save buttons */}
            {profile.hasEmployeeRecord && (
              <div className="nf-r-profile-actions" style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
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
        </div>
      </Card>

      {/* Quick facts — contact info strip */}
      <Card style={{ boxShadow: CARD_SHADOW }}>
        <div className="nf-r-profile-contacts" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', rowGap: 18, columnGap: 16 }}>
          <ContactChip icon={<Mail size={16} aria-hidden />} label="Email" value={profile.email} />
          <ContactChip icon={<Phone size={16} aria-hidden />} label="Phone" value={profile.phone} />
          <ContactChip icon={<MapPin size={16} aria-hidden />} label="Location" value={profile.locationName} />
          <ContactChip icon={<Hash size={16} aria-hidden />} label="Employee ID" value={profile.employeeCode} />
          <ContactChip icon={<Building2 size={16} aria-hidden />} label="Department" value={profile.departmentName} />
          <ContactChip icon={<UserCircle2 size={16} aria-hidden />} label="Reporting Manager" value={profile.managerName} />
        </div>
      </Card>

      {/* 2-column: Personal + Employment */}
      <div className="nf-r-stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Personal Information */}
        <Card style={{ padding: '20px 24px', boxShadow: CARD_SHADOW }}>
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
        </Card>

        {/* Employment — HR managed */}
        <Card style={{ padding: '20px 24px', boxShadow: CARD_SHADOW }}>
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
                <div style={{ fontSize: 13, color: 'var(--txt)' }}>{profile.workMode ?? '-'}</div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Emergency Contact */}
      <Card style={{ padding: '20px 24px', boxShadow: CARD_SHADOW }}>
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
      </Card>

      {/* Security */}
      <Card style={{ padding: '20px 24px', boxShadow: CARD_SHADOW }}>
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
      </Card>

      {/* Photo viewer — opened by clicking the avatar. Shows the picture large enough to judge,
          and is the only place upload/remove live, so the identity card stays uncluttered. */}
      <Modal
        open={photoViewerOpen}
        title="Profile photo"
        onClose={() => setPhotoViewerOpen(false)}
        footer={
          // Own flex row rather than relying on Modal's footer: that one has no wrapping, and
          // three buttons would squeeze off the edge of a narrow phone.
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
            <button
              onClick={() => setPhotoViewerOpen(false)}
              style={{ padding: '7px 14px', background: 'var(--raised)', border: '1px solid var(--line2)', borderRadius: 6, fontSize: 12.5, color: 'var(--txt-mut)', cursor: 'pointer' }}
            >
              Close
            </button>
            {profile.hasEmployeeRecord && profile.photoDataUrl && (
              <button
                onClick={handlePhotoRemove}
                disabled={uploading}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'transparent', border: '1px solid rgba(228,55,61,.4)', borderRadius: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--risk)', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? .6 : 1 }}
              >
                <Trash2 size={13} aria-hidden />
                Delete image
              </button>
            )}
            {profile.hasEmployeeRecord && (
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={uploading}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: 'var(--brand)', border: 'none', borderRadius: 6, fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? .7 : 1 }}
              >
                {uploading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Camera size={13} aria-hidden />}
                {uploading ? 'Working…' : profile.photoDataUrl ? 'Change image' : 'Upload image'}
              </button>
            )}
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          {/* Scales with the viewport so it stays large on a desktop and never overflows a
              narrow phone — the modal itself is already min(440px, 100%). */}
          <div style={{ position: 'relative', width: 'clamp(150px, 55vw, 240px)', aspectRatio: '1 / 1' }}>
            {profile.photoDataUrl ? (
              <img
                src={profile.photoDataUrl}
                alt={`${profile.fullName}'s profile photo`}
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--line2)', display: 'block' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--brand)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 'clamp(38px, 14vw, 64px)', fontWeight: 700, border: '3px solid color-mix(in srgb, var(--brand) 40%, transparent)', fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif' }}>
                {initials}
              </div>
            )}
            {uploading && (
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center' }}>
                <Loader2 size={26} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--txt-dim)', textAlign: 'center' }}>
            {profile.hasEmployeeRecord
              ? 'JPG or PNG, up to 2 MB.'
              : 'Your account has no employee record, so the photo cannot be changed here.'}
          </div>
        </div>
        {/* Lives inside the modal now — the identity card no longer carries photo controls. */}
        <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
      </Modal>

      {/* Banner viewer — opened by the "Add/Change cover" button on the banner itself. JPEG/PNG
          only, enforced both here (accept + client check) and on the server
          (ProfileController.uploadBanner), since the accept attribute is not a real boundary
          on its own. */}
      <Modal
        open={bannerViewerOpen}
        title="Cover banner"
        onClose={() => setBannerViewerOpen(false)}
        footer={
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
            <button
              onClick={() => setBannerViewerOpen(false)}
              style={{ padding: '7px 14px', background: 'var(--raised)', border: '1px solid var(--line2)', borderRadius: 6, fontSize: 12.5, color: 'var(--txt-mut)', cursor: 'pointer' }}
            >
              Close
            </button>
            {profile.hasEmployeeRecord && profile.bannerDataUrl && (
              <button
                onClick={handleBannerRemove}
                disabled={uploadingBanner}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'transparent', border: '1px solid rgba(228,55,61,.4)', borderRadius: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--risk)', cursor: uploadingBanner ? 'not-allowed' : 'pointer', opacity: uploadingBanner ? .6 : 1 }}
              >
                <Trash2 size={13} aria-hidden />
                Remove banner
              </button>
            )}
            {profile.hasEmployeeRecord && (
              <button
                onClick={() => bannerInputRef.current?.click()}
                disabled={uploadingBanner}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: 'var(--brand)', border: 'none', borderRadius: 6, fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: uploadingBanner ? 'not-allowed' : 'pointer', opacity: uploadingBanner ? .7 : 1 }}
              >
                {uploadingBanner ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ImagePlus size={13} aria-hidden />}
                {uploadingBanner ? 'Working…' : profile.bannerDataUrl ? 'Change banner' : 'Upload banner'}
              </button>
            )}
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '3 / 1', borderRadius: 8, overflow: 'hidden' }}>
            {profile.bannerDataUrl ? (
              <img
                src={profile.bannerDataUrl}
                alt="Cover banner"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, var(--brand-deep) 0%, var(--brand) 55%, var(--brand-bright) 100%)' }} />
            )}
            {uploadingBanner && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center' }}>
                <Loader2 size={26} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--txt-dim)', textAlign: 'center' }}>
            {profile.hasEmployeeRecord
              ? 'JPEG (.jpg/.jpeg) or PNG (.png), up to 2 MB.'
              : 'Your account has no employee record, so the banner cannot be changed here.'}
          </div>
        </div>
        <input ref={bannerInputRef} type="file" accept="image/jpeg,image/png" style={{ display: 'none' }} onChange={handleBannerChange} />
      </Modal>

      {/* Crop step — shown after a file is picked, before it ever reaches the server. Fixed to
          the banner's 3:1 aspect so what the user frames here is exactly what gets uploaded. */}
      <Modal open={!!bannerCropFile} title="Adjust banner" onClose={handleBannerCropCancel} width={560}>
        {bannerCropFile && (
          <ImageCropper
            file={bannerCropFile}
            aspect={3}
            onCancel={handleBannerCropCancel}
            onCropped={handleBannerCropApply}
          />
        )}
      </Modal>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
