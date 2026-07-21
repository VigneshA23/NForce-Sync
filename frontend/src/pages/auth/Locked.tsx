import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ShieldAlert } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { useAuth } from '../../lib/auth';

export default function Locked() {
  const navigate  = useNavigate();
  const reduced   = useReducedMotion();
  const { resetFailCount } = useAuth();

  function handleBack() {
    resetFailCount();
    navigate('/login', { replace: true });
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
          Account temporarily locked
        </h1>

        <p
          style={{
            fontSize: 13,
            color: 'var(--txt-mut)',
            lineHeight: 1.65,
            marginBottom: 32,
            maxWidth: 340,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          Five consecutive failed sign-in attempts triggered a 15-minute lockout.
          Wait and try again, or reset your password now.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={() => navigate('/forgot')}
            style={primaryButtonStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--brand-bright)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--brand)')}
          >
            Reset password
          </button>
          <button
            type="button"
            onClick={handleBack}
            style={ghostButtonStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--raised)';
              e.currentTarget.style.borderColor = 'var(--txt-mut)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'var(--line2)';
            }}
          >
            Back to sign in
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
          Lockout lifts automatically after 15 minutes.
          <br />
          Contact your administrator if you need immediate access.
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
