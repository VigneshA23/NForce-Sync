import { useRef } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ShieldAlert } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { useCountdown, formatCountdown } from '../../lib/useCountdown';

interface LockedState {
  email?: string;
  retryAfterSeconds?: number;
}

export default function Locked() {
  const navigate  = useNavigate();
  const reduced   = useReducedMotion();
  const location  = useLocation();

  const state = (location.state ?? null) as LockedState | null;

  // Anchor the deadline once, on mount, from the server's remaining-seconds. Recomputing it on
  // every render would restart the countdown each tick.
  const targetRef = useRef<number | null>(
    state?.retryAfterSeconds ? Date.now() + state.retryAfterSeconds * 1000 : null,
  );
  const remaining = useCountdown(targetRef.current);
  const stillLocked = remaining > 0;

  // Reached directly (typed URL, stale bookmark) with no lockout to show — nothing useful here.
  if (!state?.retryAfterSeconds) return <Navigate to="/login" replace />;

  function handleRetry() {
    navigate('/login', { replace: true });
  }

  function handleReset() {
    // Carry the email so /forgot can prefill it — the user already typed it once.
    navigate('/forgot', { state: { email: state?.email } });
  }

  return (
    <AuthLayout>
      <motion.div
        initial={reduced ? undefined : { opacity: 0, y: 12 }}
        animate={reduced ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        style={{ textAlign: 'center' }}
      >
        {/* Icon */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'rgba(228,55,61,.12)',
            border: '1px solid rgba(228,55,61,.25)',
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 24px',
          }}
        >
          <ShieldAlert size={28} style={{ color: 'var(--risk)' }} aria-hidden="true" />
        </div>

        <h1
          style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: 'var(--txt)',
            marginBottom: 12,
          }}
        >
          {stillLocked ? 'Account temporarily locked' : 'You can sign in again'}
        </h1>

        <p
          style={{
            fontSize: 13,
            color: 'var(--txt-mut)',
            lineHeight: 1.65,
            marginBottom: stillLocked ? 20 : 32,
            maxWidth: 340,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          {stillLocked ? (
            <>
              Too many consecutive failed sign-in attempts
              {state.email ? <> for <strong style={{ color: 'var(--txt)' }}>{state.email}</strong></> : null}.
              Wait for the timer, or reset your password to regain access now.
            </>
          ) : (
            <>You've been unlocked - you can sign in now.</>
          )}
        </p>

        {/* Live countdown — the timer the lock actually runs on, served by the backend. */}
        {stillLocked && (
          <div
            role="timer"
            aria-live="off"
            aria-label={`Lockout lifts in ${formatCountdown(remaining)}`}
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 34,
              fontWeight: 600,
              color: 'var(--txt)',
              letterSpacing: '0.02em',
              fontVariantNumeric: 'tabular-nums',
              marginBottom: 6,
            }}
          >
            {formatCountdown(remaining)}
          </div>
        )}
        {stillLocked && (
          <p style={{ fontSize: 11, color: 'var(--txt-dim)', marginBottom: 28 }}>
            until you can try again
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={handleReset}
            style={primaryButtonStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--brand-bright)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--brand)')}
          >
            Reset password
          </button>
          <button
            type="button"
            onClick={handleRetry}
            disabled={stillLocked}
            style={{
              ...ghostButtonStyle,
              opacity: stillLocked ? 0.45 : 1,
              cursor: stillLocked ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (stillLocked) return;
              e.currentTarget.style.background = 'var(--raised)';
              e.currentTarget.style.borderColor = 'var(--txt-mut)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'var(--line2)';
            }}
          >
            {stillLocked ? `Retry in ${formatCountdown(remaining)}` : 'Retry sign in'}
          </button>
        </div>

        <p
          style={{
            fontSize: 11,
            color: 'var(--txt-dim)',
            marginTop: 28,
            lineHeight: 1.5,
          }}
        >
          {stillLocked && <>The lockout lifts automatically — you can leave this page.<br /></>}
          <a
            href="/login"
            onClick={(e) => { e.preventDefault(); navigate('/login', { replace: true }); }}
            style={{ color: 'var(--txt-mut)', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Back to sign in
          </a>
          {' · '}Contact your administrator if you need immediate access.
        </p>
      </motion.div>
    </AuthLayout>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '12px 16px',
  background: 'var(--brand)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 0.14s',
  fontFamily: 'Inter, sans-serif',
};

const ghostButtonStyle: React.CSSProperties = {
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
