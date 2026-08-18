import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { AuthLayout } from './AuthLayout';

interface StrengthResult {
  level: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
}

function getStrength(pw: string): StrengthResult {
  if (!pw) return { level: 0, label: '', color: '' };
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw))       score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { level: 1, label: 'Weak',        color: 'var(--risk)' };
  if (score === 2) return { level: 2, label: 'Fair',        color: 'var(--warn)' };
  if (score === 3) return { level: 3, label: 'Good',        color: '#6ab4ff'     };
  return              { level: 4, label: 'Strong',       color: 'var(--ok)'  };
}

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.23, 1, 0.32, 1] as const } },
};

export default function Reset() {
  const navigate = useNavigate();
  const reduced  = useReducedMotion();

  const newPassId  = useId();
  const confPassId = useId();
  const strengthId = useId();
  const matchId    = useId();

  const [newPass,  setNewPass]  = useState('');
  const [confPass, setConfPass] = useState('');
  const [showNew,  setShowNew]  = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [done, setDone]         = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const strength   = getStrength(newPass);
  const mismatch   = confPass.length > 0 && newPass !== confPass;
  const canSubmit  = strength.level >= 2 && newPass === confPass && confPass.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 500));
    setSubmitting(false);
    setDone(true);
    setTimeout(() => navigate('/login', { replace: true }), 2200);
  }

  return (
    <AuthLayout
      leftHeadline="Choose a strong new password."
      leftSubtext="Use at least 10 characters with a mix of letters, numbers, and symbols."
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
            Set new password
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)' }}>
            Almost done — set your new password below.
          </p>
        </motion.div>

        {done ? (
          <motion.div
            initial={reduced ? undefined : { opacity: 0, scale: 0.97 }}
            animate={reduced ? undefined : { opacity: 1, scale: 1 }}
            style={{
              padding: '20px',
              background: 'rgba(47,182,124,.08)',
              border: '1px solid rgba(47,182,124,.22)',
              borderRadius: 10,
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 14, color: '#8fe0bd', marginBottom: 8 }}>
              Password updated. Redirecting to sign in…
            </p>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {/* New password */}
            <motion.div variants={reduced ? undefined : itemVariants} style={{ marginBottom: 14 }}>
              <label
                htmlFor={newPassId}
                style={labelStyle}
              >
                New password <span style={{ color: 'var(--brand-bright)' }} aria-label="required">*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id={newPassId}
                  type={showNew ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  aria-describedby={strengthId}
                  style={{ ...inputStyle, paddingRight: 44 }}
                  onFocus={(e) => Object.assign(e.target.style, { ...inputFocusStyle, paddingRight: '44px' })}
                  onBlur={(e)  => Object.assign(e.target.style, { ...inputStyle, paddingRight: '44px' })}
                  autoFocus
                />
                <ToggleEye show={showNew} onToggle={() => setShowNew((v) => !v)} />
              </div>

              {/* Strength meter */}
              {newPass.length > 0 && (
                <div id={strengthId} style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
                    {([1, 2, 3, 4] as const).map((lvl) => (
                      <div
                        key={lvl}
                        style={{
                          flex: 1,
                          height: 3,
                          borderRadius: 99,
                          background: strength.level >= lvl ? strength.color : 'var(--raised2)',
                          transition: 'background 0.2s',
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: strength.color }}>
                    {strength.label}
                    {strength.level < 2 && ' — use at least 8 characters with mixed case and numbers'}
                  </span>
                </div>
              )}
            </motion.div>

            {/* Confirm password */}
            <motion.div variants={reduced ? undefined : itemVariants} style={{ marginBottom: 22 }}>
              <label htmlFor={confPassId} style={labelStyle}>
                Confirm password <span style={{ color: 'var(--brand-bright)' }} aria-label="required">*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id={confPassId}
                  type={showConf ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confPass}
                  onChange={(e) => setConfPass(e.target.value)}
                  aria-invalid={mismatch}
                  aria-describedby={mismatch ? matchId : undefined}
                  style={{
                    ...inputStyle,
                    paddingRight: 44,
                    borderColor: mismatch ? 'var(--risk)' : undefined,
                  }}
                  onFocus={(e) => Object.assign(e.target.style, {
                    ...inputFocusStyle,
                    paddingRight: '44px',
                    borderColor: mismatch ? 'var(--risk)' : 'var(--brand-bright)',
                  })}
                  onBlur={(e) => Object.assign(e.target.style, {
                    ...inputStyle,
                    paddingRight: '44px',
                    borderColor: mismatch ? 'var(--risk)' : 'var(--line2)',
                  })}
                />
                <ToggleEye show={showConf} onToggle={() => setShowConf((v) => !v)} />
              </div>
              {mismatch && (
                <p
                  id={matchId}
                  role="alert"
                  style={{ fontSize: 11, color: 'var(--risk)', marginTop: 5 }}
                >
                  Passwords do not match.
                </p>
              )}
            </motion.div>

            <motion.div variants={reduced ? undefined : itemVariants}>
              <button
                type="submit"
                disabled={!canSubmit || submitting}
                style={{
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
                  cursor: !canSubmit || submitting ? 'not-allowed' : 'pointer',
                  opacity: !canSubmit || submitting ? 0.5 : 1,
                  transition: 'all 0.14s',
                  fontFamily: 'Inter, sans-serif',
                }}
                onMouseEnter={(e) => {
                  if (canSubmit && !submitting) e.currentTarget.style.background = 'var(--brand-bright)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--brand)';
                }}
              >
                {submitting ? 'Updating…' : 'Update password'}
              </button>
            </motion.div>

            <motion.div
              variants={reduced ? undefined : itemVariants}
              style={{ textAlign: 'center', marginTop: 18 }}
            >
              <button
                type="button"
                onClick={() => navigate('/login')}
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
            </motion.div>
          </form>
        )}
      </motion.div>
    </AuthLayout>
  );
}

function ToggleEye({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={show ? 'Hide password' : 'Show password'}
      onClick={onToggle}
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
      {/* Open eye = visible, slashed = hidden — the icon shows state, not the action. */}
      {show ? <Eye size={15} aria-hidden="true" /> : <EyeOff size={15} aria-hidden="true" />}
    </button>
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
