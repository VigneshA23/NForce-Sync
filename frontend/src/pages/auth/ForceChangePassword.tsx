import { useState, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { LoginHeroBackdrop } from './LoginHeroBackdrop';
import { useAuth, ROLE_LANDING, buildAuthUser } from '../../lib/auth';
import { changePassword } from '../../api/auth';

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#1F2937',
  marginBottom: 8,
  letterSpacing: '0',
  textTransform: 'none',
};

const lightInputStyle: React.CSSProperties = {
  background: '#fff',
  color: '#111827',
  boxShadow: 'none',
};

const submitButtonStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '13px 16px',
  background: '#E4373D',
  border: 'none',
  borderRadius: 8,
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 0.14s, transform 0.14s',
  fontFamily: 'Inter, sans-serif',
  letterSpacing: '0.01em',
};

const submitButtonHoverStyle: React.CSSProperties = {
  ...submitButtonStyle,
  background: '#C82026',
  transform: 'translateY(-1px)',
};

const errorBannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 9,
  padding: '11px 13px',
  borderRadius: 7,
  background: 'rgba(228,55,61,0.07)',
  border: '1px solid rgba(228,55,61,0.22)',
  color: '#B1111E',
  fontSize: 13,
  marginBottom: 18,
  lineHeight: 1.45,
};

const toggleButtonStyle: React.CSSProperties = {
  // Must sit above .nf-input-inner (position: relative; z-index: 1, opaque background in
  // AuthLayout) — a z-auto button is painted underneath it and is invisible.
  zIndex: 3,
  position: 'absolute',
  right: 11,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#6B7280',
  display: 'flex',
  alignItems: 'center',
  padding: 4,
  borderRadius: 4,
};

export default function ForceChangePassword() {
  const { user, loginWithCredentials } = useAuth();
  const navigate = useNavigate();

  const newId  = useId();
  const confId = useId();

  const [newPassword,      setNewPassword]       = useState('');
  const [confirmPassword,  setConfirmPassword]   = useState('');
  const [showNew,          setShowNew]           = useState(false);
  const [showConfirm,      setShowConfirm]       = useState(false);
  const [error,            setError]             = useState<string | null>(null);
  const [submitting,       setSubmitting]        = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!newPassword)      { setError('New password is required.'); return; }

    const complexity = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/.test(newPassword);
    if (!complexity) {
      setError('New password must be at least 8 characters and include uppercase, lowercase, digit, and symbol.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      // No currentPassword here — reaching this screen already means the backend authenticated
      // this user with the temporary password (that's what /login just checked), and the JWT's
      // mustChangePassword claim carries that forward. Re-entering it would be redundant.
      const { token, user: serverUser, mustChangePassword } = await changePassword(newPassword);
      const freshUser = buildAuthUser(serverUser, mustChangePassword);
      loginWithCredentials(token, freshUser);
      navigate(ROLE_LANDING[freshUser.role], { replace: true });
    } catch (err: unknown) {
      let message = 'Failed to change password. Please try again.';
      if (
        err &&
        typeof err === 'object' &&
        'response' in err
      ) {
        const r = (err as { response?: { data?: { error?: string } } }).response;
        if (typeof r?.data?.error === 'string') message = r.data.error;
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      leftHeadline="Secure your account before continuing."
      heroBackdrop={<LoginHeroBackdrop />}
      cardTheme="light"
      heroFullBleed
      hideFeatureBadges
      hideEyebrow
    >
      <div>
        {/* Title */}
        <div style={{ marginBottom: 28 }}>
          <h1
            style={{
              fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: '#111827',
              marginBottom: 6,
            }}
          >
            Change your password
          </h1>
          <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>
            {user?.name?.split(' ')[0] ? `Welcome, ${user.name.split(' ')[0]}. ` : ''}
            Set a new password to access the platform.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={errorBannerStyle} role="alert">
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1, color: '#B1111E' }} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* New Password */}
          <div className="nf-field" style={{ marginBottom: 16 }}>
            <label htmlFor={newId} style={labelStyle} className="nf-label">New Password *</label>
            <div className="nf-input-wrap" style={{ position: 'relative' }}>
              <input
                id={newId}
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Min 8 chars, upper + lower + digit + symbol"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="nf-input-inner nf-input-inner--light"
                style={{ ...lightInputStyle, paddingRight: 46 }}
                autoFocus
              />
              <button
                type="button"
                aria-label={showNew ? 'Hide password' : 'Show password'}
                onClick={() => setShowNew((v) => !v)}
                aria-pressed={showNew}
                title={showNew ? 'Hide password' : 'Show password'}
                style={toggleButtonStyle}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#111827')}
                onMouseLeave={(e) => (e.currentTarget.style.color = toggleButtonStyle.color as string)}
              >
                {showNew
                  ? <EyeOff size={18} aria-hidden="true" />
                  : <Eye    size={18} aria-hidden="true" />
                }
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="nf-field" style={{ marginBottom: 20 }}>
            <label htmlFor={confId} style={labelStyle} className="nf-label">Confirm New Password *</label>
            <div className="nf-input-wrap" style={{ position: 'relative' }}>
              <input
                id={confId}
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Repeat your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="nf-input-inner nf-input-inner--light"
                style={{ ...lightInputStyle, paddingRight: 46 }}
              />
              <button
                type="button"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
                onClick={() => setShowConfirm((v) => !v)}
                aria-pressed={showConfirm}
                title={showConfirm ? 'Hide password' : 'Show password'}
                style={toggleButtonStyle}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#111827')}
                onMouseLeave={(e) => (e.currentTarget.style.color = toggleButtonStyle.color as string)}
              >
                {showConfirm
                  ? <EyeOff size={18} aria-hidden="true" />
                  : <Eye    size={18} aria-hidden="true" />
                }
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="nf-submit-btn"
            disabled={submitting}
            style={{
              ...submitButtonStyle,
              opacity: submitting ? 0.75 : 1,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!submitting) Object.assign(e.currentTarget.style, submitButtonHoverStyle);
            }}
            onMouseLeave={(e) => Object.assign(e.currentTarget.style, {
              ...submitButtonStyle,
              opacity: submitting ? 0.75 : 1,
              cursor: submitting ? 'not-allowed' : 'pointer',
            })}
          >
            {submitting ? 'Updating password…' : (
              <>
                Set new password <ArrowRight size={16} aria-hidden="true" />
              </>
            )}
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}
