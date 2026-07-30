import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

const SESSION_KEY = 'nfsync_session';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

/**
 * Root error boundary. Without one, a single bad property access during render — e.g. a
 * `.map()` on a field a stale backend build no longer sends — unmounts the entire tree and
 * leaves an empty #root, i.e. a blank white page with the diagnostics thrown away.
 *
 * Renders the error and stack so the failure is readable, plus two ways out: reload, and
 * sign out (for the case where the error recurs on every render because of bad session state).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the console trace — it carries the source-mapped frames this UI cannot show.
    console.error('Unhandled render error:', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleSignOut = () => {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // Storage may be unavailable (private mode, blocked cookies) — the redirect below
      // is still worth attempting.
    }
    window.location.assign('/login');
  };

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          background: 'var(--shell)',
          color: 'var(--txt)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <div style={{ width: '100%', maxWidth: 720 }}>
          <h1
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              marginBottom: 8,
            }}
          >
            Something went wrong
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', lineHeight: 1.6, marginBottom: 20 }}>
            This screen failed to render. The details below are what went wrong — reloading often
            clears it. If it happens every time, sign out and back in.
          </p>

          <div
            style={{
              background: 'var(--raised)',
              border: '1px solid var(--line2)',
              borderLeft: '3px solid var(--risk)',
              borderRadius: 8,
              padding: '12px 14px',
              marginBottom: 20,
              overflowX: 'auto',
            }}
          >
            <div
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 12,
                color: 'var(--risk)',
                marginBottom: componentStack || error.stack ? 10 : 0,
                wordBreak: 'break-word',
              }}
            >
              {error.name}: {error.message}
            </div>
            {(error.stack || componentStack) && (
              <pre
                style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 11,
                  color: 'var(--txt-mut)',
                  lineHeight: 1.5,
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  maxHeight: 260,
                  overflowY: 'auto',
                }}
              >
                {error.stack ?? ''}
                {componentStack ?? ''}
              </pre>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={this.handleReload} style={primaryButtonStyle}>
              Reload
            </button>
            <button type="button" onClick={this.handleSignOut} style={secondaryButtonStyle}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '10px 18px',
  background: 'var(--brand)',
  border: 'none',
  borderRadius: 7,
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '10px 18px',
  background: 'transparent',
  border: '1px solid var(--line2)',
  borderRadius: 7,
  color: 'var(--txt)',
  fontSize: 13,
  fontWeight: 550,
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
};
