import { useAuth } from '../lib/auth';
import { ROLE_LABELS, ROLE_COLORS } from '../lib/nav';

interface PlaceholderProps {
  title: string;
}

export function Placeholder({ title }: PlaceholderProps) {
  const { user } = useAuth();
  const role = user!.role;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 24,
        maxWidth: 680,
      }}
    >
      <div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 10px',
            background: 'var(--raised2)',
            border: '1px solid var(--line2)',
            borderRadius: 20,
            marginBottom: 12,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: ROLE_COLORS[role],
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--txt-mut)',
              letterSpacing: '0.04em',
            }}
          >
            {ROLE_LABELS[role]}
          </span>
        </div>
        <h1
          style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 26,
            fontWeight: 700,
            color: 'var(--txt)',
            margin: 0,
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h1>
      </div>

      <div
        style={{
          padding: '20px 24px',
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--warn)',
            }}
          />
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 11,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: 'var(--warn)',
            }}
          >
            Under construction
          </span>
        </div>
        <p
          style={{
            fontSize: 13,
            color: 'var(--txt-mut)',
            margin: 0,
            lineHeight: 1.65,
          }}
        >
          This screen is part of the next build phase. Navigation and shell are complete — content
          components ship in the next sprint.
        </p>
      </div>

      {/* Skeleton rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
        {[100, 80, 92, 65].map((w, i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: 14, width: `${w}%`, borderRadius: 4 }}
          />
        ))}
      </div>
    </div>
  );
}
