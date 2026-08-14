import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Eye, EyeOff, AlertCircle, Lock } from 'lucide-react';
import axios from 'axios';
import { AuthLayout } from './AuthLayout';
import { useAuth, ROLE_LANDING, buildAuthUser } from '../../lib/auth';
import { login, asLockedError, attemptsRemainingFrom } from '../../api/auth';
import { useCountdown, formatCountdown } from '../../lib/useCountdown';

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true" focusable="false">
      <rect x="0"  y="0"  width="10" height="10" fill="#F25022" />
      <rect x="11" y="0"  width="10" height="10" fill="#7FBA00" />
      <rect x="0"  y="11" width="10" height="10" fill="#00A4EF" />
      <rect x="11" y="11" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.23, 1, 0.32, 1] as const } },
};

export default function Login() {
  const { loginWithCredentials } = useAuth();
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  const emailId  = useId();
  const passId   = useId();
  const errorId  = useId();

  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Attempts left before this account locks, straight from the server — the client no longer
  // keeps its own tally, which used to be shared across every email typed into this form.
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  // Epoch ms when the lock lifts; drives the inline countdown and disables the submit button.
  const [lockedUntilMs, setLockedUntilMs] = useState<number | null>(null);

  const lockRemaining = useCountdown(lockedUntilMs);
  const isLocked = lockRemaining > 0;

  const emailRef = useRef<HTMLInputElement>(null);

  // Once the window elapses, drop the banner so the form is usable again without a reload.
  useEffect(() => {
    if (lockedUntilMs != null && lockRemaining === 0) setLockedUntilMs(null);
  }, [lockRemaining, lockedUntilMs]);

  async function handleCredentialSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLocked) return;
    setError(null);
    setSubmitting(true);

    try {
      const { token, user: serverUser, mustChangePassword } = await login(email, password);
      // mustChangePassword arrives top-level on the login response as well as on the user
      // object — pass it through explicitly. Dropping it lets the user into the app with a
      // temp-password token, which JwtFilter then 403s on every request (empty dropdowns).
      const authUser = buildAuthUser(serverUser, mustChangePassword);
      setAttemptsLeft(null);
      loginWithCredentials(token, authUser);
      navigate(
        authUser.mustChangePassword ? '/force-change-password' : ROLE_LANDING[authUser.role],
        { replace: true },
      );
    } catch (err) {
      const locked = asLockedError(err);
      if (locked) {
        // Hand the countdown to the lock screen, which owns the "what now?" options.
        navigate('/locked', {
          replace: true,
          state: { email: email.trim(), retryAfterSeconds: locked.retryAfterSeconds },
        });
        return;
      }

      // Only a 401 is a credential failure. A network error or a 500 used to land here too and
      // was counted as a failed attempt, which could lock someone out over a backend hiccup.
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

  return (
    <AuthLayout
      leftHeadline="Centralized Work & Utilization Management"
      leftSubtext="Submit EOD updates, track approved hours, monitor utilization, and give leadership real-time insights all from one centralized platform."
      showStats
    >
      <motion.div
        variants={reduced ? undefined : containerVariants}
        initial={reduced ? undefined : 'hidden'}
        animate={reduced ? undefined : 'show'}
      >
        {/* Title */}
        <motion.div variants={reduced ? undefined : itemVariants} style={{ marginBottom: 28 }}>
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
            Welcome back
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', lineHeight: 1.5 }}>
            Sign in to submit and review EOD reports.
          </p>
        </motion.div>

        {/* SSO button — visual only, not yet connected */}
        <motion.div variants={reduced ? undefined : itemVariants}>
          <button
            type="button"
            disabled
            aria-label="Microsoft SSO — coming soon"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '12px 16px',
              background: 'var(--brand)',
              color: 'rgba(255,255,255,.45)',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'not-allowed',
              opacity: 0.55,
              marginBottom: 4,
            }}
          >
            <MicrosoftIcon />
            Continue with Microsoft SSO
          </button>
        </motion.div>

        {/* OR divider */}
        <motion.div variants={reduced ? undefined : itemVariants}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              color: 'var(--txt-dim)',
              fontSize: 12,
              margin: '20px 0',
            }}
          >
            <span style={{ flex: 1, height: 1, background: 'var(--line)', display: 'block' }} />
            or use company credentials
            <span style={{ flex: 1, height: 1, background: 'var(--line)', display: 'block' }} />
          </div>
        </motion.div>

        {/* Lockout banner — shown when this account is still inside its cooldown window.
            Ticks down to 00:00, at which point the form re-enables on its own. */}
        {isLocked && (
          <motion.div
            initial={reduced ? undefined : { opacity: 0, y: -6 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            role="status"
            aria-live="polite"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 8,
              background: 'rgba(228,55,61,.10)',
              border: '1px solid rgba(228,55,61,.25)',
              color: '#f4a5a8',
              fontSize: 13,
              marginBottom: 18,
            }}
          >
            <Lock size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--risk)' }} aria-hidden="true" />
            <span>
              Account temporarily locked. Try again in{' '}
              <strong style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                {formatCountdown(lockRemaining)}
              </strong>
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
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 8,
              background: 'rgba(228,55,61,.10)',
              border: '1px solid rgba(228,55,61,.25)',
              color: 'var(--risk)',
              fontSize: 13,
              marginBottom: 18,
            }}
          >
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--risk)' }} aria-hidden="true" />
            <span>{error}</span>
          </motion.div>
        )}

        {/* Credentials form */}
        <form onSubmit={handleCredentialSubmit} noValidate>
          <motion.div variants={reduced ? undefined : itemVariants}>
            <div style={{ marginBottom: 14 }}>
              <label htmlFor={emailId} style={labelStyle}>
                Email
              </label>
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
                onBlur={(e) => Object.assign(e.target.style, inputStyle)}
              />
            </div>
          </motion.div>

          <motion.div variants={reduced ? undefined : itemVariants}>
            <div style={{ marginBottom: 14 }}>
              <label htmlFor={passId} style={labelStyle}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id={passId}
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={hasError}
                  aria-describedby={hasError ? errorId : undefined}
                  style={{ ...inputStyle, paddingRight: 44 }}
                  onFocus={(e) => Object.assign(e.target.style, { ...inputFocusStyle, paddingRight: '44px' })}
                  onBlur={(e) => Object.assign(e.target.style, { ...inputStyle, paddingRight: '44px' })}
                />
                <button
                  type="button"
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPass((v) => !v)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--txt-dim)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 4,
                    borderRadius: 4,
                  }}
                >
                  {showPass
                    ? <EyeOff size={15} aria-hidden="true" />
                    : <Eye size={15} aria-hidden="true" />
                  }
                </button>
              </div>
            </div>
          </motion.div>

          {/* Forgot link */}
          <motion.div
            variants={reduced ? undefined : itemVariants}
            style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18, marginTop: -4 }}
          >
            <a
              href="/forgot"
              onClick={(e) => { e.preventDefault(); navigate('/forgot'); }}
              style={mutedLinkStyle}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand-bright)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--txt-mut)')}
            >
              Forgot password?
            </a>
          </motion.div>

          {/* Sign in button */}
          <motion.div variants={reduced ? undefined : itemVariants}>
            <button
              type="submit"
              disabled={submitting || isLocked}
              style={{ ...submitButtonStyle, opacity: isLocked ? 0.5 : 1, cursor: isLocked ? 'not-allowed' : 'pointer' }}
              onMouseEnter={(e) => {
                if (!submitting && !isLocked) Object.assign(e.currentTarget.style, submitButtonHoverStyle);
              }}
              onMouseLeave={(e) => Object.assign(e.currentTarget.style, {
                ...submitButtonStyle,
                opacity: isLocked ? 0.5 : 1,
                cursor: isLocked ? 'not-allowed' : 'pointer',
              })}
            >
              {isLocked
                ? `Locked — ${formatCountdown(lockRemaining)}`
                : submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </motion.div>
        </form>

        {/* Attempt warning — count comes from the server, so it reflects this account only. */}
        {!isLocked && attemptsLeft != null && attemptsLeft > 0 && (
          <p
            style={{
              fontSize: 11,
              color: 'var(--txt-dim)',
              textAlign: 'center',
              marginTop: 16,
              fontVariantNumeric: 'tabular-nums',
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

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 550,
  color: 'var(--txt-mut)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--shell)',
  border: '1px solid var(--line2)',
  borderRadius: 6,
  padding: '10px 12px',
  color: 'var(--txt)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  fontFamily: 'Inter, sans-serif',
};

const inputFocusStyle: React.CSSProperties = {
  ...inputStyle,
  borderColor: 'var(--brand-bright)',
  boxShadow: '0 0 0 3px rgba(228,55,61,.14)',
};

const mutedLinkStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--txt-mut)',
  textDecoration: 'none',
  cursor: 'pointer',
  transition: 'color 0.12s',
};

const submitButtonStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '11px 16px',
  background: 'transparent',
  border: '1px solid var(--line2)',
  borderRadius: 8,
  color: 'var(--txt)',
  fontSize: 14,
  fontWeight: 550,
  cursor: 'pointer',
  transition: 'all 0.14s',
  fontFamily: 'Inter, sans-serif',
};

const submitButtonHoverStyle: React.CSSProperties = {
  ...submitButtonStyle,
  borderColor: 'var(--txt-mut)',
  background: 'var(--raised)',
};
