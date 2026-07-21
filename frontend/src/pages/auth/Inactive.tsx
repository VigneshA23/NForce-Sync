import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { UserX, CheckCircle2 } from 'lucide-react';
import { AuthLayout } from './AuthLayout';

export default function Inactive() {
  const navigate = useNavigate();
  const reduced  = useReducedMotion();
  const [requested, setRequested] = useState(false);

  function handleContactAdmin() {
    setRequested(true);
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
            background: 'rgba(224,169,59,.10)',
            border: '1px solid rgba(224,169,59,.25)',
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 24px',
          }}
        >
          <UserX size={28} style={{ color: 'var(--warn)' }} aria-hidden="true" />
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
          Account inactive
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
          This account has been deactivated and cannot sign in.
          Contact your administrator to restore access.
        </p>

        {requested && (
          <div
            role="status"
            aria-live="polite"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(47,182,124,.08)',
              border: '1px solid rgba(47,182,124,.22)',
              fontSize: 13,
              color: '#8fe0bd',
              marginBottom: 12,
            }}
          >
            <CheckCircle2 size={14} aria-hidden="true" style={{ color: 'var(--ok)' }} />
            Request sent. Your administrator has been notified.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!requested && (
          <button
            type="button"
            onClick={handleContactAdmin}
            style={primaryButtonStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--brand-bright)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--brand)')}
          >
            Contact administrator
          </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
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
          If you believe this is an error, ask your administrator
          <br />
          to check your account status in the admin panel.
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
