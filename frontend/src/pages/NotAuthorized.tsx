import { Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth, ROLE_LANDING } from '../lib/auth';

export function NotAuthorized() {
  const { user } = useAuth();
  const landingPath = user ? ROLE_LANDING[user.role] : '/login';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 16,
        textAlign: 'center',
      }}
      role="main"
      aria-labelledby="not-auth-title"
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'rgba(177,17,22,.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Shield size={28} style={{ color: 'var(--brand-bright)' }} aria-hidden="true" />
      </div>

      <div>
        <div
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 11,
            letterSpacing: '0.12em',
            color: 'var(--brand-bright)',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          403
        </div>
        <h1
          id="not-auth-title"
          style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--txt)',
            margin: 0,
            marginBottom: 8,
          }}
        >
          Not authorized
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--txt-mut)',
            margin: 0,
            maxWidth: 320,
            lineHeight: 1.6,
          }}
        >
          Your role doesn't have access to this page. Contact your administrator if you believe this is an error.
        </p>
      </div>

      <Link
        to={landingPath}
        style={{
          marginTop: 8,
          padding: '9px 20px',
          background: 'var(--raised)',
          color: 'var(--txt)',
          border: '1px solid var(--line2)',
          borderRadius: 6,
          textDecoration: 'none',
          fontSize: 13,
          fontWeight: 500,
          transition: 'background 120ms',
        }}
        className="nf-nav-item"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
