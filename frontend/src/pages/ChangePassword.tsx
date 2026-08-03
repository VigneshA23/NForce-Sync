import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle, Circle } from 'lucide-react';
import { changePassword } from '../api/auth';
import { useAuth, buildAuthUser } from '../lib/auth';
import { useToast } from '../lib/toast';

const CRITERIA = [
  { label: 'Uppercase letter',    test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Lowercase letter',    test: (p: string) => /[a-z]/.test(p) },
  { label: 'Number',              test: (p: string) => /[0-9]/.test(p) },
  { label: 'Special character',   test: (p: string) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p) },
];

function strengthScore(password: string) {
  if (!password) return 0;
  return CRITERIA.filter(c => c.test(password)).length;
}

const STRENGTH_COLOR = ['', 'var(--risk)', 'var(--warn)', 'var(--ok)', 'var(--ok)'];
const STRENGTH_LABEL = ['', 'Weak', 'Fair', 'Good', 'Strong'];

function PasswordInput({ id, label, value, onChange, autoComplete }: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--txt-mut)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--raised)', border: '1px solid var(--line2)',
            borderRadius: 6, padding: '9px 38px 9px 10px',
            fontSize: 13, color: 'var(--txt)', outline: 'none',
            fontFamily: 'Inter, sans-serif',
          }}
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-dim)', display: 'flex', alignItems: 'center' }}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}

export default function ChangePassword() {
  const navigate = useNavigate();
  const { token, user, loginWithCredentials } = useAuth();
  const { showToast } = useToast();

  const [current,  setCurrent]  = useState('');
  const [next,     setNext]     = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  const score = strengthScore(next);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!current) { setError('Current password is required.'); return; }
    if (next.length < 8) { setError('New password must be at least 8 characters.'); return; }
    if (score < 3) { setError('New password must include at least 3 of: uppercase, lowercase, number, special character.'); return; }
    if (next !== confirm) { setError('Passwords do not match.'); return; }
    if (!token) { navigate('/login', { replace: true }); return; }

    setLoading(true);
    try {
      const result = await changePassword(current, next);
      loginWithCredentials(result.token, buildAuthUser(result.user, false));
      showToast('success', 'Password changed successfully');
      navigate('/profile', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 480 }}>

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, marginBottom: 4, fontSize: 20, fontWeight: 700, color: 'var(--txt)', fontFamily: '"Space Grotesk", sans-serif' }}>Change Password</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--txt-mut)' }}>Update your account password. You will remain signed in.</p>
      </div>

      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '24px' }}>

        {/* Account info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '10px 14px', background: 'var(--raised2)', borderRadius: 7 }}>
          <Lock size={14} color="var(--txt-dim)" aria-hidden />
          <span style={{ fontSize: 12, color: 'var(--txt-mut)' }}>Signed in as <strong style={{ color: 'var(--txt)' }}>{user?.email}</strong></span>
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(228,55,61,.08)', border: '1px solid rgba(228,55,61,.25)', borderRadius: 6, fontSize: 12.5, color: 'var(--risk)' }} role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PasswordInput id="current" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />

          <div>
            <PasswordInput id="new" label="New password" value={next} onChange={setNext} autoComplete="new-password" />

            {/* Strength meter */}
            {next && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  {[1, 2, 3, 4].map(level => (
                    <div key={level} style={{ flex: 1, height: 3, borderRadius: 2, background: level <= score ? STRENGTH_COLOR[score] : 'var(--line2)', transition: 'background 200ms' }} />
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                    {CRITERIA.map(c => {
                      const met = c.test(next);
                      return (
                        <span key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: met ? 'var(--ok)' : 'var(--txt-dim)' }}>
                          {met ? <CheckCircle size={10} /> : <Circle size={10} />}
                          {c.label}
                        </span>
                      );
                    })}
                  </div>
                  {score > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: STRENGTH_COLOR[score], flexShrink: 0, marginLeft: 8 }}>
                      {STRENGTH_LABEL[score]}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <PasswordInput id="confirm" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />

          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button
              type="submit"
              disabled={loading}
              style={{ flex: 1, padding: '9px 16px', background: loading ? 'var(--brand)' : 'var(--brand)', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .7 : 1 }}
            >
              {loading ? 'Updating…' : 'Update Password'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/profile')}
              disabled={loading}
              style={{ padding: '9px 16px', background: 'var(--raised)', border: '1px solid var(--line2)', borderRadius: 7, fontSize: 13, color: 'var(--txt-mut)', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
