import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { api } from '../../api/client';

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.23, 1, 0.32, 1] as const } },
};

export default function Forgot() {
  const navigate = useNavigate();
  const reduced  = useReducedMotion();
  const emailId  = useId();
  const errorId  = useId();

  const [email, setEmail]     = useState('');
  const [sent, setSent]       = useState(false);
  const [sending, setSending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);

    if (!email.trim()) {
      setFieldError('Enter your company email address.');
      return;
    }
    if (!email.includes('@')) {
      setFieldError('Enter a valid email address.');
      return;
    }

    setSending(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
    } catch {
      // Always show sent state — never reveal whether email exists
    } finally {
      setSending(false);
      setSent(true);
    }
  }

  return (
    <AuthLayout
      leftHeadline="Forgot your password?"
      leftSubtext="Enter your company email. If an account exists, we'll send a temporary password to sign in with."
    >
      <motion.div
        variants={reduced ? undefined : containerVariants}
        initial={reduced ? undefined : 'hidden'}
        animate={reduced ? undefined : 'show'}
      >
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
            Forgot password
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', lineHeight: 1.5 }}>
            We'll email a temporary password to your registered company address.
          </p>
        </motion.div>

        {sent ? (
          <motion.div
            initial={reduced ? undefined : { opacity: 0, scale: 0.97 }}
            animate={reduced ? undefined : { opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
          >
            <ConfirmationCard onBack={() => navigate('/login')} />
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <motion.div variants={reduced ? undefined : itemVariants}>
              {fieldError && (
                <div
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
                    color: '#f4a5a8',
                    fontSize: 13,
                    marginBottom: 16,
                  }}
                >
                  <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--risk)' }} aria-hidden="true" />
                  <span>{fieldError}</span>
                </div>
              )}

              <label
                htmlFor={emailId}
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 550,
                  color: 'var(--txt-mut)',
                  marginBottom: 6,
                }}
              >
                Company email <span style={{ color: 'var(--brand-bright)' }} aria-label="required">*</span>
              </label>
              <input
                id={emailId}
                type="email"
                autoComplete="email"
                placeholder="you@nforce.one"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(fieldError)}
                aria-describedby={fieldError ? errorId : undefined}
                style={inputStyle}
                onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                onBlur={(e) => Object.assign(e.target.style, inputStyle)}
                autoFocus
              />
            </motion.div>

            <motion.div variants={reduced ? undefined : itemVariants} style={{ marginTop: 20 }}>
              <button
                type="submit"
                disabled={sending}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px 16px',
                  background: sending ? 'var(--brand-deep)' : 'var(--brand)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: sending ? 'not-allowed' : 'pointer',
                  opacity: sending ? 0.75 : 1,
                  transition: 'all 0.14s',
                  fontFamily: 'Inter, sans-serif',
                }}
                onMouseEnter={(e) => {
                  if (!sending) e.currentTarget.style.background = 'var(--brand-bright)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = sending ? 'var(--brand-deep)' : 'var(--brand)';
                }}
              >
                {sending ? 'Sending…' : 'Send temporary password'}
              </button>
            </motion.div>

            <motion.div
              variants={reduced ? undefined : itemVariants}
              style={{ textAlign: 'center', marginTop: 20 }}
            >
              <BackLink onClick={() => navigate('/login')} />
            </motion.div>
          </form>
        )}
      </motion.div>
    </AuthLayout>
  );
}

function ConfirmationCard({ onBack }: { onBack: () => void }) {
  return (
    <div
      style={{
        padding: '20px 16px',
        background: 'rgba(47,182,124,.08)',
        border: '1px solid rgba(47,182,124,.22)',
        borderRadius: 10,
        marginBottom: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <CheckCircle2
          size={18}
          style={{ color: 'var(--ok)', flexShrink: 0, marginTop: 1 }}
          aria-hidden="true"
        />
        <div>
          <p style={{ fontSize: 13, color: '#8fe0bd', lineHeight: 1.5, marginBottom: 4 }}>
            If an account exists for that address, a temporary password is on its way.
          </p>
          <p style={{ fontSize: 12, color: 'var(--txt-dim)' }}>
            Check your inbox — sign in with it, then you'll be prompted to set a new password.
          </p>
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <BackLink onClick={onBack} />
      </div>
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        fontSize: 12,
        color: 'var(--txt-mut)',
        cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand-bright)')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--txt-mut)')}
    >
      ← Back to sign in
    </button>
  );
}

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
