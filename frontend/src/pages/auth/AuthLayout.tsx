import { motion, useReducedMotion } from 'framer-motion';
import { Users, ClipboardList, ShieldCheck } from 'lucide-react';
import { BrandMark } from '../../components/BrandMark';

interface StreakDef {
  top: string;
  width: number;
  opacity: number;
  duration: number;
  delay: number;
}

const STREAKS: StreakDef[] = [
  { top:  '6.0%', width: 180, opacity: 0.28, duration: 11, delay:   0 },
  { top: '10.5%', width: 120, opacity: 0.20, duration: 13, delay:  -4 },
  { top: '15.0%', width: 240, opacity: 0.32, duration:  9, delay:  -8 },
  { top: '19.5%', width:  95, opacity: 0.16, duration: 14, delay:  -3 },
  { top: '24.0%', width: 275, opacity: 0.25, duration: 10, delay:  -7 },
  { top: '28.5%', width: 145, opacity: 0.22, duration: 12, delay:  -2 },
  { top: '33.0%', width: 200, opacity: 0.30, duration:  8, delay: -11 },
  { top: '37.5%', width: 115, opacity: 0.17, duration: 15, delay:  -5 },
  { top: '42.0%', width: 255, opacity: 0.24, duration: 11, delay:  -9 },
  { top: '46.5%', width: 160, opacity: 0.21, duration: 13, delay:  -1 },
  { top: '51.0%', width: 210, opacity: 0.27, duration:  9, delay:  -6 },
  { top: '55.5%', width: 130, opacity: 0.19, duration: 12, delay: -10 },
  { top: '60.0%', width: 175, opacity: 0.23, duration: 10, delay:  -4 },
  { top: '64.5%', width: 105, opacity: 0.15, duration: 14, delay:  -8 },
];

function SpeedStreaks() {
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
        {STREAKS.map((s, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: s.top,
              right: 0,
              width: s.width,
              height: 2,
              background: 'linear-gradient(90deg, transparent, var(--brand-bright))',
              borderRadius: 2,
              opacity: s.opacity,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {STREAKS.map((s, i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            top: s.top,
            left: -(s.width + 60),
            width: s.width,
            height: 2,
            background: 'linear-gradient(90deg, transparent, var(--brand-bright))',
            borderRadius: 2,
          }}
          animate={{ x: [0, 1800] }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            ease: 'linear',
            repeatDelay: 0,
          }}
          initial={{ opacity: s.opacity }}
        />
      ))}
    </div>
  );
}

const STATS = [
  { Icon: Users,         value: '8',    label: 'Role levels' },
  { Icon: ClipboardList, value: 'EOD',  label: 'Daily cycle' },
  { Icon: ShieldCheck,   value: '100%', label: 'Audit coverage' },
] as const;

interface AuthLayoutProps {
  leftHeadline?: string;
  leftSubtext?: string;
  showStats?: boolean;
  children: React.ReactNode;
}

const panelGradient = [
  'radial-gradient(120% 100% at 80% 10%, rgba(177,17,22,.26) 0%, transparent 55%)',
  'linear-gradient(160deg, #0a0b0e 0%, #12141a 100%)',
].join(', ');

export function AuthLayout({ leftHeadline, leftSubtext, showStats = false, children }: AuthLayoutProps) {
  return (
    <div
      data-theme="dark"
      style={{
        display: 'grid',
        gridTemplateColumns: '55fr 45fr',
        minHeight: '100dvh',
      }}
      className="max-[900px]:block"
    >
      {/* ── LEFT PANEL ─────────────────────────────────── */}
      <div
        className="max-[900px]:hidden"
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: panelGradient,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '44px 48px',
        }}
      >
        <SpeedStreaks />

        {/* Brand row */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
          <BrandMark size="lg" />
          <div>
            <div
              style={{
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 700,
                fontSize: 18,
                letterSpacing: '0.04em',
                color: 'var(--txt)',
              }}
            >
              NForce Sync
            </div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--txt-dim)',
                marginTop: 3,
              }}
            >
              EOD & Utilization
            </div>
          </div>
        </div>

        {/* Headline + subtext */}
        {leftHeadline && (
          <div style={{ position: 'relative', maxWidth: 420 }}>
            <h2
              style={{
                fontFamily: '"Space Grotesk", sans-serif',
                fontSize: 36,
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                color: 'var(--txt)',
                marginBottom: 16,
              }}
            >
              {leftHeadline}
            </h2>
            {leftSubtext && (
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.65,
                  color: 'var(--txt-mut)',
                  maxWidth: 380,
                }}
              >
                {leftSubtext}
              </p>
            )}
          </div>
        )}

        {/* Stats row */}
        {showStats ? (
          <div
            style={{
              position: 'relative',
              display: 'flex',
              borderTop: '1px solid rgba(255,255,255,.07)',
              paddingTop: 24,
            }}
          >
            {STATS.map(({ Icon, value, label }, i) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  paddingLeft: i === 0 ? 0 : 24,
                  marginLeft: i === 0 ? 0 : 24,
                  borderLeft: i === 0 ? 'none' : '1px solid var(--line)',
                }}
              >
                <Icon size={13} aria-hidden="true" style={{ color: 'var(--txt-dim)' }} />
                <div
                  style={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: 24,
                    fontWeight: 600,
                    color: 'var(--txt)',
                    letterSpacing: '-0.01em',
                    lineHeight: 1,
                  }}
                >
                  {value}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    color: 'var(--txt-dim)',
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div />
        )}
      </div>

      {/* ── RIGHT PANEL ────────────────────────────────── */}
      <div
        style={{
          background: 'var(--panel)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 32px',
          minHeight: '100dvh',
        }}
      >
        {/* Mobile brand strip — only visible <900px */}
        <div
          className="hidden max-[900px]:flex"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 80,
            background: panelGradient,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            borderBottom: '1px solid var(--line)',
          }}
        >
          <BrandMark size="sm" />
          <span
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: '0.03em',
            }}
          >
            NForce Sync
          </span>
        </div>

        <div
          className="max-[900px]:mt-20"
          style={{
            width: '100%',
            maxWidth: 440,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
