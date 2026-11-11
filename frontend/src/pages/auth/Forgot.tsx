import { useId, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { LoginHeroBackdrop } from './LoginHeroBackdrop';
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
  const location = useLocation();

  // Prefilled when arriving from the lockout screen, which already knows the address —
  // no reason to make a locked-out user type it again.
  const prefilledEmail = (location.state as { email?: string } | null)?.email ?? '';

  const [email, setEmail]     = useState(prefilledEmail);
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
      heroBackdrop={<LoginHeroBackdrop />}
      cardTheme="light"
      heroFullBleed
      hideFeatureBadges
      hideEyebrow
    >
      <motion.div
        variants={reduced ? undefined : containerVariants}
        initial={reduced ? undefined : 'hidden'}
        animate={reduced ? undefined : 'show'}
      >
        <motion.div variants={reduced ? undefined : itemVariants} style={{ marginBottom: 28 }}>
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
            Forgot password
          </h1>
          <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>
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
                  style={errorBannerStyle}
                >
                  <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1, color: '#B1111E' }} aria-hidden="true" />
                  <span>{fieldError}</span>
                </div>
              )}

              <div className="nf-field" style={{ marginBottom: 16 }}>
                <label htmlFor={emailId} style={labelStyle} className="nf-label">
                  Company email <span style={{ color: '#E4373D' }} aria-label="required">*</span>
                </label>
                <div className="nf-input-wrap">
                  <input
                    id={emailId}
                    type="email"
                    autoComplete="email"
                    placeholder="you@nforce.one"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={Boolean(fieldError)}
                    aria-describedby={fieldError ? errorId : undefined}
                    className="nf-input-inner nf-input-inner--light"
                    style={lightInputStyle}
                    autoFocus
                  />
                </div>
              </div>
            </motion.div>

            <motion.div variants={reduced ? undefined : itemVariants} style={{ marginTop: 20 }}>
              <button
                type="submit"
                className="nf-submit-btn"
                disabled={sending}
                style={{
                  ...submitButtonStyle,
                  opacity: sending ? 0.75 : 1,
                  cursor: sending ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!sending) Object.assign(e.currentTarget.style, submitButtonHoverStyle);
                }}
                onMouseLeave={(e) => Object.assign(e.currentTarget.style, {
                  ...submitButtonStyle,
                  opacity: sending ? 0.75 : 1,
                  cursor: sending ? 'not-allowed' : 'pointer',
                })}
              >
                {sending ? 'Sending…' : (
                  <>
                    Send temporary password <ArrowRight size={16} aria-hidden="true" />
                  </>
                )}
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
        background: 'rgba(15,122,66,.07)',
        border: '1px solid rgba(15,122,66,.2)',
        borderRadius: 10,
        marginBottom: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <CheckCircle2
          size={18}
          style={{ color: '#0F7A42', flexShrink: 0, marginTop: 1 }}
          aria-hidden="true"
        />
        <div>
          <p style={{ fontSize: 13, color: '#0F7A42', lineHeight: 1.5, marginBottom: 4, fontWeight: 600 }}>
            If an account exists for that address, a temporary password is on its way.
          </p>
          <p style={{ fontSize: 12, color: '#4B5563' }}>
            Check your inbox. Sign in with it, then you'll be prompted to set a new password.
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
        color: '#6B7280',
        cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = '#E4373D')}
      onMouseLeave={(e) => (e.currentTarget.style.color = '#6B7280')}
    >
      ← Back to sign in
    </button>
  );
}

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
