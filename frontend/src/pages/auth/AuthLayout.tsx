import { motion, useReducedMotion } from 'framer-motion';
import { ClipboardCheck, ScrollText, CalendarOff } from 'lucide-react';
import { BrandMark } from '../../components/BrandMark';
import loginIllustration from '../../assets/login_screen.png';

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
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 1, gridColumn: '1 / -1' }}>
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
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 1, gridColumn: '1 / -1' }}>
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

const CAPABILITIES = [
  { Icon: ClipboardCheck, label: 'Role-based approvals' },
  { Icon: ScrollText,     label: 'Full audit trail' },
  { Icon: CalendarOff,    label: 'Weekend-aware utilization' },
] as const;

interface AuthLayoutProps {
  leftHeadline?: string;
  showStats?: boolean;
  children: React.ReactNode;
}

const panelGradient = [
  'radial-gradient(120% 100% at 80% 10%, rgba(177,17,22,.26) 0%, transparent 55%)',
  'linear-gradient(160deg, #0a0b0e 0%, #12141a 100%)',
].join(', ');

export function AuthLayout({ leftHeadline, showStats = false, children }: AuthLayoutProps) {
  const reduced = useReducedMotion();
  const headlineWords = leftHeadline ? leftHeadline.split(' ') : [];

  return (
    <div
      data-theme="dark"
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '55fr 45fr',
        minHeight: '100dvh',
      }}
      className="nf-auth-grid"
    >
      {/* Speed streaks — span the full screen, behind all panel content but above both
          panels' plain backgrounds/imagery (z-index 1 vs their auto/0). */}
      <SpeedStreaks />

      {/* ── LEFT PANEL ─────────────────────────────────── */}
      <div
        className="nf-auth-left"
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: '#0a0b0e',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '44px 48px',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            backgroundImage: `url(${loginIllustration})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            opacity: 0.3,
          }}
        />

        {/* Brand row */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 14 }}>
          <BrandMark size="lg" />
          <div>
            <div
              style={{
                fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
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

        {/* Capability tags */}
        {showStats ? (
          <div
            style={{
              position: 'relative',
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              rowGap: 10,
              borderTop: '1px solid rgba(255,255,255,.07)',
              paddingTop: 20,
            }}
          >
            {CAPABILITIES.map(({ Icon, label }, i) => (
              <div
                key={label}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    style={{
                      color: 'var(--line2)',
                      fontSize: 14,
                      lineHeight: 1,
                      margin: '0 12px',
                      userSelect: 'none',
                    }}
                  >
                    ·
                  </span>
                )}
                <Icon size={12} aria-hidden="true" style={{ color: 'var(--txt-dim)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--txt-dim)', lineHeight: 1 }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div />
        )}
      </div>

      {/* ── RIGHT PANEL ────────────────────────────────── */}
      <div
        className="nf-auth-right"
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: '#0a0b0e',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 32px',
          minHeight: '100dvh',
        }}
      >
        {/* Faint depth behind the card — echoes the left panel's brand-red glow, much softer */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            background: 'radial-gradient(70% 55% at 50% 40%, rgba(228,55,61,.07) 0%, transparent 70%)',
          }}
        />

        {/* Mobile brand strip — only visible <900px */}
        <div
          className="nf-auth-brandstrip"
          style={{
            position: 'absolute',
            zIndex: 2,
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
              fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: '0.03em',
            }}
          >
            NForce Sync
          </span>
        </div>

        {/* Headline — sized off the panel's own width (container query units) so the
            phrase always fits on one line instead of wrapping or overflowing. */}
        {leftHeadline && (
          <motion.h2
            className="nf-auth-headline"
            initial={reduced ? undefined : { opacity: 0, x: -60 }}
            animate={reduced ? undefined : { opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
            style={{
              position: 'relative',
              zIndex: 2,
              width: '100%',
              fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: '-0.01em',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              marginBottom: 20,
            }}
          >
            {headlineWords.map((word, i) => (
              <span key={i} style={{ color: i % 2 === 0 ? 'var(--txt)' : 'var(--brand-bright)' }}>
                {word}
                {i < headlineWords.length - 1 ? ' ' : ''}
              </span>
            ))}
          </motion.h2>
        )}

        <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 440 }}>
          <div
            className="nf-auth-form"
            style={{
              position: 'relative',
              overflow: 'hidden',
              background: 'linear-gradient(155deg, #262a32 0%, #14161a 100%)',
              border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 20,
              padding: '44px 40px',
              boxShadow: [
                '0 28px 70px -20px rgba(0,0,0,.65)',
                '0 1px 0 0 rgba(255,255,255,.06) inset',
              ].join(', '),
            }}
          >
            {/* Brand accent strip along each edge of the card */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                background: 'linear-gradient(90deg, transparent, var(--brand-bright), transparent)',
              }}
            />
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 2,
                background: 'linear-gradient(90deg, transparent, var(--brand-bright), transparent)',
              }}
            />
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: 2,
                background: 'linear-gradient(180deg, transparent, var(--brand-bright), transparent)',
              }}
            />
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: 0,
                width: 2,
                background: 'linear-gradient(180deg, transparent, var(--brand-bright), transparent)',
              }}
            />
            {children}
          </div>
        </div>
      </div>

      {/*
        These rules replace Tailwind arbitrary variants (max-[900px]:block /
        :hidden) that were silently inert: a utility class loses to an inline
        style for the same property, and `display` is set inline on both the
        grid and the left panel. The result was that phones kept the 55/45
        split and rendered the marketing panel squeezed into 55% of a 390px
        screen. Overriding from a stylesheet with !important is what actually
        wins against the inline style.

        Every rule that changes layout lives inside the media query, so the
        desktop split is untouched. The one base rule below only restates what
        Tailwind's `hidden` was already doing to the mobile brand strip, so the
        desktop rendering is identical either way.

        The headline uses container query units (cqw), sized off `.nf-auth-right`'s
        own content width via `container-type: inline-size`. That's what keeps
        "Centralized Work & Utilization Management" on one line at any window
        size — cqw scales with the actual space available in the right panel,
        not the viewport, so it stays proportional whether the left marketing
        panel is showing (900px+) or hidden (mobile, right panel goes full width).
      */}
      <style>{`
        .nf-auth-grid {
          --txt: #FFFFFF;
          --txt-mut: #C7CBD1;
          --txt-dim: #B7BCC4;
        }
        .nf-auth-brandstrip { display: none; }
        .nf-auth-right { container-type: inline-size; container-name: nf-auth-right; }
        .nf-auth-headline { font-size: clamp(13px, 3.6cqw, 30px); }
        @media (max-width: 900px) {
          .nf-auth-grid      { grid-template-columns: 1fr !important; }
          .nf-auth-left      { display: none !important; }
          .nf-auth-brandstrip { display: flex; }
          .nf-auth-form      { margin-top: 80px; padding: 32px 24px !important; }
        }
      `}</style>
    </div>
  );
}
