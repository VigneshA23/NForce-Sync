import { useEffect, useState, useId } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { useAuth, ROLE_LANDING, buildAuthUser } from '../../lib/auth';
import { changePassword, checkResetTokenValid, resetPasswordWithToken } from '../../api/auth';

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

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 550,
  color: 'var(--txt-mut)',
  marginBottom: 5,
  letterSpacing: '0.03em',
};

const RESET_LINK_INVALID_MESSAGE =
  'This password reset link is invalid or has expired. Please request a new one.';

export default function ForceChangePassword() {
  const { user, loginWithCredentials } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Present when opened from the "Sign in to NForce Sync" link in the password-reset email —
  // that flow has no active session yet, so the reset token stands in for one.
  const resetToken = searchParams.get('token');

  const curId  = useId();
  const newId  = useId();
  const confId = useId();

  const [currentPassword,  setCurrentPassword]  = useState('');
  const [newPassword,      setNewPassword]       = useState('');
  const [confirmPassword,  setConfirmPassword]   = useState('');
  const [showCurrent,      setShowCurrent]       = useState(false);
  const [showNew,          setShowNew]           = useState(false);
  const [showConfirm,      setShowConfirm]       = useState(false);
  const [error,            setError]             = useState<string | null>(null);
  const [submitting,       setSubmitting]        = useState(false);

  // For the token flow, the token must be validated against the backend before the form ever
  // renders — otherwise an expired link briefly (or permanently, on a slow response) shows the
  // form and the "invalid link" error at the same time. No token at all means this is the
  // authenticated must-change-password flow, which skips this check entirely.
  const [tokenStatus, setTokenStatus] = useState<'checking' | 'valid' | 'invalid'>(
    resetToken ? 'checking' : 'valid',
  );
  const [tokenFirstName, setTokenFirstName] = useState<string | null>(null);

  useEffect(() => {
    if (!resetToken) return;
    let cancelled = false;
    checkResetTokenValid(resetToken)
      .then(({ valid, firstName }) => {
        if (cancelled) return;
        setTokenStatus(valid ? 'valid' : 'invalid');
        setTokenFirstName(firstName ?? null);
      })
      .catch(() => {
        if (!cancelled) setTokenStatus('invalid');
      });
    return () => { cancelled = true; };
  }, [resetToken]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!resetToken && !currentPassword) { setError('Current password is required.'); return; }
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
      const { token, user: serverUser, mustChangePassword } = resetToken
        ? await resetPasswordWithToken(resetToken, newPassword)
        : await changePassword(currentPassword, newPassword);
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
      // The submit endpoint re-checks token validity server-side (it doesn't trust the earlier
      // client-side check), so a token that expires between page load and submit lands here too.
      if (resetToken && message === RESET_LINK_INVALID_MESSAGE) {
        setTokenStatus('invalid');
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (resetToken && tokenStatus === 'checking') {
    return (
      <AuthLayout
        leftHeadline="Secure your account before continuing."
        leftSubtext="Your administrator has assigned you a temporary password. Set a new password to access the platform."
      >
        <p style={{ fontSize: 13, color: 'var(--txt-mut)' }}>Checking your reset link…</p>
      </AuthLayout>
    );
  }

  if (resetToken && tokenStatus === 'invalid') {
    return (
      <AuthLayout
        leftHeadline="Secure your account before continuing."
        leftSubtext="Your administrator has assigned you a temporary password. Set a new password to access the platform."
      >
        <div>
          <div style={{ marginBottom: 20 }}>
            <h1
              style={{
                fontFamily: '"Space Grotesk", sans-serif',
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: 'var(--txt)',
                marginBottom: 6,
              }}
            >
              Change your password
            </h1>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 7,
            marginBottom: 20,
            background: 'rgba(228,55,61,.10)',
            border: '1px solid rgba(228,55,61,.25)',
            fontSize: 12,
            color: 'var(--risk)',
          }} role="alert">
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            {RESET_LINK_INVALID_MESSAGE}
          </div>

          <Link
            to="/forgot"
            style={{
              display: 'block',
              width: '100%',
              boxSizing: 'border-box',
              padding: '11px 0',
              background: 'var(--brand)',
              border: 'none',
              borderRadius: 7,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: '0.01em',
              textAlign: 'center',
              textDecoration: 'none',
            }}
          >
            Request a new reset link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      leftHeadline="Secure your account before continuing."
      leftSubtext="Your administrator has assigned you a temporary password. Set a new password to access the platform."
    >
      <div>
        {/* Title */}
        <div style={{ marginBottom: 28 }}>
          <h1
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: 'var(--txt)',
              marginBottom: 6,
            }}
          >
            Change your password
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', lineHeight: 1.5 }}>
            {(() => {
              const name = tokenFirstName ?? user?.name?.split(' ')[0];
              return name ? `Welcome, ${name}. ` : '';
            })()}
            Set a new password to access the platform.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 7,
            marginBottom: 16,
            background: 'rgba(228,55,61,.10)',
            border: '1px solid rgba(228,55,61,.25)',
            fontSize: 12,
            color: 'var(--risk)',
          }} role="alert">
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Current Password — only for the authenticated must-change-password flow. The
              reset-token flow proves identity via the token itself, so it skips this field. */}
          {!resetToken && (
            <div style={{ marginBottom: 14 }}>
              <label htmlFor={curId} style={labelStyle}>Current (Temporary) Password *</label>
              <div style={{ position: 'relative' }}>
                <input
                  id={curId}
                  type={showCurrent ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your temporary password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  style={{ ...inputStyle, paddingRight: 40 }}
                  onFocus={(e) => Object.assign(e.target.style, { ...inputFocus, paddingRight: '40px' })}
                  onBlur={(e) => Object.assign(e.target.style, { ...inputStyle, paddingRight: '40px' })}
                  autoFocus
                />
                <button
                  type="button"
                  aria-label={showCurrent ? 'Hide password' : 'Show password'}
                  onClick={() => setShowCurrent((v) => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-dim)', padding: 4, display: 'flex' }}
                >
                  {/* Open eye = visible, slashed = hidden — the icon shows state, not the action. */}
                  {showCurrent ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
                </button>
              </div>
            </div>
          )}

          {/* New Password */}
          <div style={{ marginBottom: 14 }}>
            <label htmlFor={newId} style={labelStyle}>New Password *</label>
            <div style={{ position: 'relative' }}>
              <input
                id={newId}
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Min 8 chars, upper + lower + digit + symbol"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ ...inputStyle, paddingRight: 40 }}
                onFocus={(e) => Object.assign(e.target.style, { ...inputFocus, paddingRight: '40px' })}
                onBlur={(e) => Object.assign(e.target.style, { ...inputStyle, paddingRight: '40px' })}
                autoFocus={!!resetToken}
              />
              <button
                type="button"
                aria-label={showNew ? 'Hide password' : 'Show password'}
                onClick={() => setShowNew((v) => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-dim)', padding: 4, display: 'flex' }}
              >
                {showNew ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div style={{ marginBottom: 24 }}>
            <label htmlFor={confId} style={labelStyle}>Confirm New Password *</label>
            <div style={{ position: 'relative' }}>
              <input
                id={confId}
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Repeat your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{ ...inputStyle, paddingRight: 40 }}
                onFocus={(e) => Object.assign(e.target.style, { ...inputFocus, paddingRight: '40px' })}
                onBlur={(e) => Object.assign(e.target.style, { ...inputStyle, paddingRight: '40px' })}
              />
              <button
                type="button"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
                onClick={() => setShowConfirm((v) => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-dim)', padding: 4, display: 'flex' }}
              >
                {showConfirm ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '11px 0',
              background: submitting ? 'var(--brand-deep)' : 'var(--brand)',
              border: 'none',
              borderRadius: 7,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'background 0.14s',
              letterSpacing: '0.01em',
            }}
            onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.background = 'var(--brand-bright)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = submitting ? 'var(--brand-deep)' : 'var(--brand)'; }}
          >
            {submitting ? 'Updating password…' : 'Set new password'}
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}
