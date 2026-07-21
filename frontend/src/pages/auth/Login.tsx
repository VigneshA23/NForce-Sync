import { useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { useAuth, ROLE_LANDING } from '../../lib/auth';
import type { Role } from '../../lib/types';

const MAX_ATTEMPTS = 5;

const DEMO_ROLES: { role: Role; label: string; color: string }[] = [
  { role: 'employee',   label: 'Employee',        color: '#4C8DD6' },
  { role: 'lead',       label: 'Team Lead',        color: '#2FB67C' },
  { role: 'pm',         label: 'Project Manager',  color: '#E0A93B' },
  { role: 'dm',         label: 'Delivery Manager', color: '#9B6DFF' },
  { role: 'hr',         label: 'HR Admin',         color: '#E4373D' },
  { role: 'finance',    label: 'Finance Admin',    color: '#14B8A6' },
  { role: 'leadership', label: 'Leadership',       color: '#F09030' },
  { role: 'superadmin', label: 'Super Admin',      color: '#A78BFA' },
];

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
  const { loginWithRole, failCount, recordFailedAttempt } = useAuth();
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  const emailId  = useId();
  const passId   = useId();
  const errorId  = useId();

  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);

  function handleDemoPill(role: Role) {
    loginWithRole(role);
    navigate(ROLE_LANDING[role], { replace: true });
  }

  function handleSsoClick() {
    // SSO is inert in this phase — visual only
    setError('Microsoft SSO is not yet connected. Use a demo role below to explore the app.');
  }

  async function handleCredentialSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    await new Promise((r) => setTimeout(r, 420));

    const attempts = recordFailedAttempt();
    setSubmitting(false);

    if (attempts >= MAX_ATTEMPTS) {
      navigate('/locked', { replace: true });
      return;
    }

    setError('Invalid email or password.');
    emailRef.current?.focus();
  }

  const hasError = Boolean(error);

  return (
    <AuthLayout
      leftHeadline="One source of truth for daily work and utilization."
      leftSubtext="Submit your EOD, track approved hours, and give leadership real-time visibility — no more scattered emails and spreadsheets."
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

        {/* SSO button */}
        <motion.div variants={reduced ? undefined : itemVariants}>
          <SsoButton onClick={handleSsoClick} />
        </motion.div>

        {/* OR divider */}
        <motion.div variants={reduced ? undefined : itemVariants}>
          <OrDivider />
        </motion.div>

        {/* Error alert */}
        {hasError && (
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
              color: '#f4a5a8',
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
            <FieldGroup>
              <label htmlFor={emailId} style={labelStyle}>
                Email
              </label>
              <input
                ref={emailRef}
                id={emailId}
                type="email"
                autoComplete="email"
                placeholder="you@nforce.one"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={hasError}
                aria-describedby={hasError ? errorId : undefined}
                style={inputStyle}
                onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                onBlur={(e) => Object.assign(e.target.style, inputStyle)}
              />
            </FieldGroup>
          </motion.div>

          <motion.div variants={reduced ? undefined : itemVariants}>
            <FieldGroup>
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
            </FieldGroup>
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
              disabled={submitting}
              style={outlineButtonStyle}
              onMouseEnter={(e) => {
                if (!submitting) Object.assign(e.currentTarget.style, outlineButtonHoverStyle);
              }}
              onMouseLeave={(e) => Object.assign(e.currentTarget.style, outlineButtonStyle)}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </motion.div>
        </form>

        {/* Demo section */}
        <motion.div variants={reduced ? undefined : itemVariants}>
          <div style={{ height: 1, background: 'var(--line)', margin: '28px 0 20px' }} />
          <div style={{ marginBottom: 12 }}>
            <span
              style={{
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--txt-dim)',
                fontWeight: 600,
              }}
            >
              Demo · preview as any role
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}
          >
            {DEMO_ROLES.map(({ role, label, color }) => (
              <DemoPill key={role} role={role} label={label} color={color} onClick={handleDemoPill} />
            ))}
          </div>
        </motion.div>

        {/* Attempt warning */}
        {failCount > 0 && failCount < MAX_ATTEMPTS && (
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
            {MAX_ATTEMPTS - failCount} attempt{MAX_ATTEMPTS - failCount !== 1 ? 's' : ''} remaining before lockout.
          </p>
        )}
      </motion.div>
    </AuthLayout>
  );
}

function SsoButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '12px 16px',
        background: hovered ? 'var(--brand-bright)' : 'var(--brand)',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'background 0.15s, transform 0.15s, box-shadow 0.15s',
        transform: hovered ? 'translateY(-1px)' : 'none',
        boxShadow: hovered
          ? '0 4px 20px rgba(177,17,22,.35)'
          : '0 1px 4px rgba(0,0,0,.3)',
        marginBottom: 4,
      }}
    >
      <MicrosoftIcon />
      Continue with Microsoft SSO
    </button>
  );
}

function OrDivider() {
  return (
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
  );
}

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 14 }}>{children}</div>;
}

function DemoPill({
  role,
  label,
  color,
  onClick,
}: {
  role: Role;
  label: string;
  color: string;
  onClick: (role: Role) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onClick(role)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '7px 12px',
        background: hovered ? `${color}18` : 'var(--raised2)',
        border: `1px solid ${hovered ? color + '55' : 'var(--line2)'}`,
        borderRadius: 99,
        fontSize: 12,
        color: hovered ? 'var(--txt)' : 'var(--txt-mut)',
        cursor: 'pointer',
        transition: 'all 0.14s',
        textAlign: 'left',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      aria-label={`Sign in as ${label}`}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
      {label}
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

const mutedLinkStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--txt-mut)',
  textDecoration: 'none',
  cursor: 'pointer',
  transition: 'color 0.12s',
};

const outlineButtonStyle: React.CSSProperties = {
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

const outlineButtonHoverStyle: React.CSSProperties = {
  ...outlineButtonStyle,
  borderColor: 'var(--txt-mut)',
  background: 'var(--raised)',
};
