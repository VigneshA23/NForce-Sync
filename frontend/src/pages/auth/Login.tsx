import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { AuthLayout } from './AuthLayout';
import { useAuth, ROLE_LANDING, buildAuthUser } from '../../lib/auth';
import { login, asLockedError, attemptsRemainingFrom, checkResetTokenValid } from '../../api/auth';
import { useCountdown, formatCountdown } from '../../lib/useCountdown';

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true" focusable="false">
      <rect x="0"  y="0"  width="10" height="10" fill="#F25022" />
      <rect x="11" y="0"  width="10" height="10" fill="#7FBA00" />
      <rect x="0"  y="11" width="10" height="10" fill="#00A4EF" />
      <rect x="11" y="11" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.23, 1, 0.32, 1] as const } },
};

export default function Login() {
  const { loginWithCredentials } = useAuth();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [searchParams] = useSearchParams();

  const emailId      = useId();
  const passId       = useId();
  const errorId      = useId();
  const rememberMeId = useId();

  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [lockedUntilMs, setLockedUntilMs] = useState<number | null>(null);
  const [resetLinkNotice, setResetLinkNotice] = useState<string | null>(null);
  const [viaResetLink, setViaResetLink] = useState(false);
  const viaNewUserLink = searchParams.get('newUser') === '1';

  const lockRemaining = useCountdown(lockedUntilMs);
  const isLocked = lockRemaining > 0;

  const emailRef    = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (lockedUntilMs != null && lockRemaining === 0) setLockedUntilMs(null);
  }, [lockRemaining, lockedUntilMs]);

  useEffect(() => {
    const saved = localStorage.getItem('nf_sync_remember_email');
    if (saved) { setEmail(saved); setRememberMe(true); }
  }, []);

  useEffect(() => {
    const resetToken = searchParams.get('resetToken');
    if (!resetToken) return;
    let cancelled = false;
    checkResetTokenValid(resetToken)
      .then(({ valid, email: linkedEmail }) => {
        if (cancelled) return;
        if (valid && linkedEmail) {
          setViaResetLink(true);
          emailRef.current?.focus();
        } else {
          setResetLinkNotice('This password reset link is invalid or has expired. Please request a new one.');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResetLinkNotice('This password reset link is invalid or has expired. Please request a new one.');
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCredentialSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLocked) return;
    setError(null);
    setSubmitting(true);

    try {
      const { token, user: serverUser, mustChangePassword } = await login(email, password);
      const authUser = buildAuthUser(serverUser, mustChangePassword);
      setAttemptsLeft(null);
      if (rememberMe) {
        localStorage.setItem('nf_sync_remember_email', email.trim());
      } else {
        localStorage.removeItem('nf_sync_remember_email');
      }
      loginWithCredentials(token, authUser);
      navigate(
        authUser.mustChangePassword ? '/force-change-password' : ROLE_LANDING[authUser.role],
        { replace: true },
      );
    } catch (err) {
      const locked = asLockedError(err);
      if (locked) {
        navigate('/locked', {
          replace: true,
          state: { email: email.trim(), retryAfterSeconds: locked.retryAfterSeconds },
        });
        return;
      }

      const remaining = attemptsRemainingFrom(err);
      setAttemptsLeft(remaining);

      let message = 'Invalid email or password.';
      if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
        message = err.response.data.error;
      } else if (!axios.isAxiosError(err) || !err.response) {
        message = 'Could not reach the server. Please try again.';
      }
      setError(message);
      emailRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  const hasError = Boolean(error);

  if (resetLinkNotice) {
    return (
      <AuthLayout leftHeadline="Centralized Work & Utilization Management" showStats>
        <motion.div
          variants={reduced ? undefined : containerVariants}
          initial={reduced ? undefined : 'hidden'}
          animate={reduced ? undefined : 'show'}
        >
          <motion.div variants={reduced ? undefined : itemVariants} style={{ marginBottom: 28 }}>
            <div style={accentLineStyle} />
            <h1 style={headingStyle}>Change your password</h1>
          </motion.div>

          <motion.div
            variants={reduced ? undefined : itemVariants}
            role="alert"
            aria-live="polite"
            style={errorBannerStyle}
          >
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1, color: 'var(--risk)' }} aria-hidden="true" />
            <span>{resetLinkNotice}</span>
          </motion.div>

          <motion.div variants={reduced ? undefined : itemVariants}>
            <button
              type="button"
              onClick={() => navigate('/forgot')}
              className="nf-submit-btn"
              style={submitButtonStyle}
              onMouseEnter={(e) => Object.assign(e.currentTarget.style, submitButtonHoverStyle)}
              onMouseLeave={(e) => Object.assign(e.currentTarget.style, submitButtonStyle)}
            >
              Request a new reset link
            </button>
          </motion.div>
        </motion.div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout leftHeadline="Centralized Work & Utilization Management" showStats>
      <motion.div
        variants={reduced ? undefined : containerVariants}
        initial={reduced ? undefined : 'hidden'}
        animate={reduced ? undefined : 'show'}
      >
        {/* Header */}
        <motion.div variants={reduced ? undefined : itemVariants} style={{ marginBottom: 32 }}>
          <div style={accentLineStyle} />
          <h1 style={headingStyle}>Welcome back</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)', lineHeight: 1.58, margin: 0 }}>
            Sign in to submit and review EOD reports.
          </p>
        </motion.div>

        {/* Microsoft SSO */}
        <motion.div variants={reduced ? undefined : itemVariants}>
          <button
            type="button"
            disabled
            aria-label="Continue with Microsoft"
            style={ssoButtonStyle}
          >
            <MicrosoftIcon />
            <span>Continue with Microsoft SSO</span>
          </button>
        </motion.div>

        {/* OR divider */}
        <motion.div variants={reduced ? undefined : itemVariants}>
          <div style={dividerStyle}>
            <span style={dividerLineStyle} />
            <span style={dividerTextStyle}>or use company credentials</span>
            <span style={dividerLineStyle} />
          </div>
        </motion.div>

        {/* Lock banner */}
        {isLocked && (
          <motion.div
            initial={reduced ? undefined : { opacity: 0, y: -6 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            role="status"
            aria-live="polite"
            style={errorBannerStyle}
          >
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1, color: 'var(--risk)' }} aria-hidden="true" />
            <span>
              Account temporarily locked. Try again in{' '}
              <strong>{formatCountdown(lockRemaining)}</strong>
              , or{' '}
              <a
                href="/forgot"
                onClick={(e) => { e.preventDefault(); navigate('/forgot', { state: { email: email.trim() } }); }}
                style={{ color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
              >
                reset your password
              </a>
              .
            </span>
          </motion.div>
        )}

        {/* Error alert */}
        {hasError && !isLocked && (
          <motion.div
            initial={reduced ? undefined : { opacity: 0, y: -6 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            role="alert"
            aria-live="polite"
            id={errorId}
            style={errorBannerStyle}
          >
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1, color: 'var(--risk)' }} aria-hidden="true" />
            <span>{error}</span>
          </motion.div>
        )}

        {/* Credentials form */}
        <form onSubmit={handleCredentialSubmit} noValidate>
          <motion.div variants={reduced ? undefined : itemVariants}>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor={emailId} style={labelStyle}>Email</label>
              <input
                ref={emailRef}
                id={emailId}
                type="email"
                autoComplete="email"
                placeholder="you@nforceone.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={hasError}
                aria-describedby={hasError ? errorId : undefined}
                style={inputStyle}
                onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                onBlur={(e)  => Object.assign(e.target.style, inputStyle)}
              />
            </div>
          </motion.div>

          <motion.div variants={reduced ? undefined : itemVariants}>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor={passId} style={labelStyle}>
                {(viaResetLink || viaNewUserLink) ? 'Current (Temporary) Password' : 'Password'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  ref={passwordRef}
                  id={passId}
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={hasError}
                  aria-describedby={hasError ? errorId : undefined}
                  style={{ ...inputStyle, paddingRight: 46 }}
                  onFocus={(e) => Object.assign(e.target.style, { ...inputFocusStyle, paddingRight: '46px' })}
                  onBlur={(e)  => Object.assign(e.target.style, { ...inputStyle,      paddingRight: '46px' })}
                />
                <button
                  type="button"
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPass((v) => !v)}
                  style={eyeButtonStyle}
                >
                  {showPass
                    ? <Eye     size={15} aria-hidden="true" />
                    : <EyeOff  size={15} aria-hidden="true" />
                  }
                </button>
              </div>
            </div>
          </motion.div>

          {/* Remember me + Forgot link row */}
          <motion.div
            variants={reduced ? undefined : itemVariants}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, marginTop: -4 }}
          >
            <label htmlFor={rememberMeId} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                id={rememberMeId}
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ accentColor: '#E4373D', width: 14, height: 14, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)', userSelect: 'none' }}>Remember me</span>
            </label>
            <a
              href="/forgot"
              onClick={(e) => { e.preventDefault(); navigate('/forgot'); }}
              style={mutedLinkStyle}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.72)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.38)')}
            >
              Forgot password?
            </a>
          </motion.div>

          {/* Sign in button */}
          <motion.div variants={reduced ? undefined : itemVariants}>
            <button
              type="submit"
              className="nf-submit-btn"
              disabled={submitting || isLocked}
              style={{
                ...submitButtonStyle,
                opacity: isLocked ? 0.45 : 1,
                cursor: isLocked ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!submitting && !isLocked) Object.assign(e.currentTarget.style, submitButtonHoverStyle);
              }}
              onMouseLeave={(e) => Object.assign(e.currentTarget.style, {
                ...submitButtonStyle,
                opacity: isLocked ? 0.45 : 1,
                cursor: isLocked ? 'not-allowed' : 'pointer',
              })}
            >
              {isLocked
                ? `Locked · ${formatCountdown(lockRemaining)}`
                : submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </motion.div>
        </form>

        {/* Attempts warning */}
        {!isLocked && attemptsLeft != null && attemptsLeft > 0 && (
          <p
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.32)',
              textAlign: 'center',
              marginTop: 14,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.01em',
            }}
            aria-live="polite"
          >
            {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining before lockout.
          </p>
        )}
      </motion.div>
    </AuthLayout>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const accentLineStyle: React.CSSProperties = {
  width: 40,
  height: 2,
  background: '#E4373D',
  borderRadius: 1,
  marginBottom: 20,
};

const headingStyle: React.CSSProperties = {
  fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
  fontSize: 26,
  fontWeight: 700,
  letterSpacing: '-0.03em',
  color: '#fff',
  margin: '0 0 6px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.45)',
  marginBottom: 8,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  padding: '12px 14px',
  color: '#fff',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 0.15s',
  fontFamily: 'Inter, sans-serif',
  boxSizing: 'border-box',
};

const inputFocusStyle: React.CSSProperties = {
  ...inputStyle,
  borderColor: 'rgba(228,55,61,0.55)',
};

const eyeButtonStyle: React.CSSProperties = {
  position: 'absolute',
  right: 11,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'rgba(255,255,255,0.35)',
  display: 'flex',
  alignItems: 'center',
  padding: 4,
  borderRadius: 4,
};

const mutedLinkStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'rgba(255,255,255,0.38)',
  textDecoration: 'none',
  cursor: 'pointer',
  transition: 'color 0.14s',
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

const ssoButtonStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: '13px 16px',
  background: '#8B1A1A',
  color: 'rgba(255,255,255,0.65)',
  border: '1px solid rgba(228,55,61,0.3)',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'not-allowed',
  marginBottom: 4,
  fontFamily: 'Inter, sans-serif',
  letterSpacing: '0.01em',
  opacity: 0.75,
};

const dividerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  margin: '20px 0',
};

const dividerLineStyle: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: 'rgba(255,255,255,0.07)',
  display: 'block',
};

const dividerTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'rgba(255,255,255,0.22)',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
};

const errorBannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 9,
  padding: '11px 13px',
  borderRadius: 7,
  background: 'rgba(228,55,61,0.08)',
  border: '1px solid rgba(228,55,61,0.2)',
  color: 'var(--risk)',
  fontSize: 13,
  marginBottom: 18,
  lineHeight: 1.45,
};
