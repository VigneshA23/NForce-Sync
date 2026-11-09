import { motion, useReducedMotion } from 'framer-motion';
import { BrandMark } from '../../components/BrandMark';

interface AuthLayoutProps {
  leftHeadline?: string;
  showStats?: boolean;
  heroBackdrop?: React.ReactNode;
  cardTheme?: 'dark' | 'light';
  heroFullBleed?: boolean;
  hideFeatureBadges?: boolean;
  hideEyebrow?: boolean;
  children: React.ReactNode;
}

export function AuthLayout({ children, heroBackdrop, cardTheme = 'dark', heroFullBleed = false, hideFeatureBadges = false, hideEyebrow = false }: AuthLayoutProps) {
  const reduced = useReducedMotion();
  const isLight = cardTheme === 'light';

  return (
    <div
      data-theme="dark"
      className="nf-auth-root"
      style={{
        position: 'relative',
        height: '100dvh',
        maxHeight: '100dvh',
        overflow: 'hidden',
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        backgroundColor: '#07080f',
      }}
    >
      {/* Full-bleed backdrop (Login only): spans the entire screen, behind the grid */}
      {heroFullBleed && (
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden' }}>
          {heroBackdrop}
          <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.055, pointerEvents: 'none' }}>
            <filter id="nf-grain-full">
              <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="3" stitchTiles="stitch" />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width="100%" height="100%" filter="url(#nf-grain-full)" />
          </svg>
          <div aria-hidden="true" style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(ellipse 85% 85% at 50% 50%, rgba(0,0,0,0.6) 0%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 85% 85% at 50% 50%, rgba(0,0,0,0.6) 0%, transparent 100%)',
          }} />
        </div>
      )}

      {/* 60 / 40 grid */}
      <div
        className="nf-auth-outer"
        style={{
          position: 'relative', zIndex: 1,
          display: 'grid',
          gridTemplateColumns: '60fr 40fr',
          height: '100dvh',
        }}
      >

        {/* ══ LEFT 60% — aurora hero ══ */}
        <div
          className="nf-auth-hero"
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            padding: '44px 56px 36px',
            height: '100dvh',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          {!heroFullBleed && (
            <>
              {/* ── Hero backdrop: custom override, or default aurora gradient blobs ── */}
              {heroBackdrop ?? (
                <div aria-hidden="true" className="nf-aurora-layer" style={{
                  position: 'absolute', inset: 0, zIndex: 0,
                  background: [
                    /* Brand red — top-left */
                    'radial-gradient(ellipse 75% 65% at 18% 18%, rgba(228,55,61,0.55) 0%, transparent 60%)',
                    /* Warm amber — bottom-left */
                    'radial-gradient(ellipse 60% 55% at 8% 85%, rgba(220,100,20,0.40) 0%, transparent 55%)',
                    /* Deep teal — top-right */
                    'radial-gradient(ellipse 65% 55% at 82% 12%, rgba(14,140,120,0.38) 0%, transparent 55%)',
                    /* Sapphire — bottom-right */
                    'radial-gradient(ellipse 70% 60% at 88% 88%, rgba(30,80,200,0.40) 0%, transparent 58%)',
                    /* Center dark base */
                    'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(7,8,15,0.6) 0%, transparent 80%)',
                  ].join(', '),
                }} />
              )}

              {/* Noise grain overlay for texture */}
              <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, opacity: 0.055, pointerEvents: 'none' }}>
                <filter id="nf-grain">
                  <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="3" stitchTiles="stitch" />
                  <feColorMatrix type="saturate" values="0" />
                </filter>
                <rect width="100%" height="100%" filter="url(#nf-grain)" />
              </svg>

              {/* Subtle dot grid */}
              <div aria-hidden="true" style={{
                position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
                backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)',
                backgroundSize: '28px 28px',
                maskImage: 'radial-gradient(ellipse 85% 85% at 50% 50%, rgba(0,0,0,0.6) 0%, transparent 100%)',
                WebkitMaskImage: 'radial-gradient(ellipse 85% 85% at 50% 50%, rgba(0,0,0,0.6) 0%, transparent 100%)',
              }} />
            </>
          )}

          {/* Brand — top */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, position: 'relative', zIndex: 10, flexShrink: 0 }}>
            <BrandMark size="lg" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ display: 'inline-block', width: 1, height: 34, background: 'rgba(255,255,255,0.2)' }} />
              <div>
                <div style={{ lineHeight: 1.1 }}>
                  <span style={{ fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em', color: '#fff' }}>NForce</span>
                  <span style={{ fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em', color: '#E4373D', marginLeft: 6 }}>Sync</span>
                </div>
                <div style={{ fontSize: 11, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.8)', marginTop: 6 }}>
                  EOD & Utilization
                </div>
              </div>
            </div>
          </div>

          {/* Headline — vertically centered in the remaining space */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 10 }}>
            {!hideEyebrow && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                <span style={{ display: 'inline-block', width: 32, height: 2, background: 'linear-gradient(90deg, #E4373D, rgba(228,55,61,0.3))', borderRadius: 2 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#E4373D', letterSpacing: '0.22em', textTransform: 'uppercase' }}>
                  Enterprise Workforce Platform
                </span>
              </div>
            )}

            <h1 style={{ margin: 0, padding: 0, lineHeight: 1.04, letterSpacing: '-0.03em', fontWeight: 800 }}>
              <span style={{ display: 'block', fontSize: 'clamp(36px, 4.6vw, 64px)', color: '#fff' }}>Centralized</span>
              <span style={{ display: 'block', fontSize: 'clamp(36px, 4.6vw, 64px)' }}>
                <span style={{ color: '#E4373D' }}>Work</span>
                <span style={{ color: 'rgba(255,255,255,0.38)', fontWeight: 300 }}> &amp; </span>
                <span style={{ color: '#E4373D' }}>Utilization</span>
              </span>
              <span style={{ display: 'block', fontSize: 'clamp(36px, 4.6vw, 64px)', color: '#fff' }}>Management.</span>
            </h1>

            <p style={{
              fontSize: 15, fontWeight: 400, color: 'rgba(255,255,255,0.78)',
              lineHeight: 1.72, margin: '24px 0 0', maxWidth: 400, letterSpacing: '0.01em',
            }}>
              Track EOD submissions and team utilization across your entire organization, all in one place.
            </p>
          </div>

          {/* Feature badges + copyright — bottom */}
          <div style={{ position: 'relative', zIndex: 10, flexShrink: 0 }}>
            {!hideFeatureBadges && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
                {[
                  { icon: '✓', label: 'Role-based approvals' },
                  { icon: '✓', label: 'Full audit trail' },
                  { icon: '✓', label: 'Weekend-aware utilization' },
                ].map(({ icon, label }) => (
                  <span key={label} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.60)',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 20, padding: '6px 14px',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                  }}>
                    <span style={{ color: '#E4373D', fontWeight: 700, fontSize: 11 }}>{icon}</span>
                    {label}
                  </span>
                ))}
              </div>
            )}
            <div style={{ paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.04em' }}>
                © 2026 NForce One · Enterprise Workforce Platform
              </span>
            </div>
          </div>
        </div>

        {/* ══ RIGHT 40% — login panel ══ */}
        <div
          className={isLight ? 'nf-auth-panel nf-auth-panel--light' : 'nf-auth-panel'}
          style={{
            position: 'relative',
            background: heroFullBleed ? 'transparent' : (isLight ? '#EFEAE2' : 'rgba(7,8,15,0.7)'),
            backdropFilter: heroFullBleed || isLight ? undefined : 'blur(24px)',
            WebkitBackdropFilter: heroFullBleed || isLight ? undefined : 'blur(24px)',
            borderLeft: heroFullBleed ? 'none' : (isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.08)'),
            boxShadow: heroFullBleed ? 'none' : (isLight
              ? 'inset 1px 0 0 rgba(255,255,255,0.6)'
              : 'inset 1px 0 0 rgba(255,255,255,0.05), -20px 0 60px rgba(0,0,0,0.3)'),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100dvh',
            overflow: 'hidden',
            padding: '0 44px',
            boxSizing: 'border-box',
          }}
        >
          {!isLight && !heroFullBleed && (
            <>
              {/* Dot grid texture */}
              <div aria-hidden="true" style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }} />

              {/* Bottom red warmth */}
              <div aria-hidden="true" style={{
                position: 'absolute', bottom: '-18%', left: '50%',
                transform: 'translateX(-50%)',
                width: '140%', height: '52%',
                borderRadius: '50%',
                background: 'radial-gradient(ellipse, rgba(177,17,22,0.13) 0%, transparent 70%)',
                filter: 'blur(50px)',
                pointerEvents: 'none',
              }} />

              {/* Top accent line */}
              <div aria-hidden="true" style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 1, pointerEvents: 'none',
                background: 'linear-gradient(90deg, transparent 0%, rgba(228,55,61,0.5) 35%, rgba(228,55,61,0.5) 65%, transparent 100%)',
              }} />
            </>
          )}

          {isLight && !heroFullBleed && (
            <>
              {/* Soft warm glow, echoing the reference's light-struck backdrop */}
              <div aria-hidden="true" style={{
                position: 'absolute', top: '-10%', right: '-10%',
                width: '60%', height: '50%',
                background: 'radial-gradient(ellipse, rgba(255,255,255,0.8) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />
            </>
          )}

          {/* Mobile brand strip */}
          <div
            className="nf-auth-brandstrip"
            style={{
              display: 'none', position: 'absolute',
              top: 0, left: 0, right: 0, height: 60,
              alignItems: 'center', justifyContent: 'center', gap: 12,
              borderBottom: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.07)',
              background: isLight ? 'rgba(255,255,255,0.85)' : undefined,
              zIndex: 3,
            }}
          >
            <BrandMark size="sm" />
            <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.05em', textTransform: 'uppercase', color: isLight ? '#111827' : '#fff' }}>
              NForce Sync
            </span>
          </div>

          {/* Form card */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            className={isLight ? 'nf-login-card' : undefined}
            style={isLight ? {
              position: 'relative', zIndex: 1,
              width: '100%', maxWidth: 420,
              background: 'linear-gradient(150deg, #ffffff 0%, #fdfcfb 55%, #f6f3f1 100%)',
              border: '1px solid rgba(17,17,20,0.09)',
              borderRadius: 20,
              padding: '42px 38px 40px 48px',
              overflow: 'hidden',
              boxShadow: [
                '0 1px 0 rgba(255,255,255,0.9) inset',
                '0 0 0 1px rgba(228,55,61,0.06)',
                '0 18px 40px rgba(17,17,20,0.14)',
                '0 34px 80px rgba(177,17,22,0.2)',
              ].join(', '),
              animation: reduced ? undefined : 'nf-card-glow-light 5s ease-in-out infinite 1s',
            } : {
              position: 'relative', zIndex: 1,
              width: '100%', maxWidth: 420,
              background: 'rgba(12,13,24,0.90)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 20,
              padding: '40px 36px',
              boxShadow: [
                'inset 0 1px 0 rgba(255,255,255,0.08)',
                '0 20px 60px rgba(0,0,0,0.5)',
              ].join(', '),
              animation: reduced ? undefined : 'nf-card-glow 5s ease-in-out infinite 1s',
            }}
          >
            {isLight && (
              <>
                <div aria-hidden="true" style={{
                  position: 'absolute', top: 0, bottom: 0, left: 0, width: 5,
                  background: 'linear-gradient(180deg, #E4373D 0%, #B1111A 100%)',
                }} />
                <div aria-hidden="true" style={{
                  position: 'absolute', top: 0, left: 5, right: 0, height: 3,
                  background: 'linear-gradient(90deg, transparent 0%, #E4373D 25%, #E4373D 75%, transparent 100%)',
                  opacity: 0.8,
                }} />
              </>
            )}
            {children}
          </motion.div>
        </div>
      </div>

      <style>{`
        .nf-auth-root {
          animation: nf-fadein 0.4s ease-out both;
        }
        @keyframes nf-fadein {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* Aurora slow shift */
        .nf-aurora-layer {
          animation: nf-aurora 16s ease-in-out infinite alternate;
        }
        @keyframes nf-aurora {
          0%   { transform: scale(1)    translate(0%,  0%); }
          30%  { transform: scale(1.06) translate(-2%, 2%); }
          60%  { transform: scale(0.97) translate(2%, -1%); }
          100% { transform: scale(1.03) translate(-1%, 1.5%); }
        }

        /* ── Input: gradient border wrapper ── */
        .nf-input-wrap {
          position: relative;
          border-radius: 9px;
          isolation: isolate;
        }
        .nf-input-wrap::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          background: rgba(255,255,255,0.1);
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
          transition: background 0.3s;
          z-index: 2;
        }
        .nf-input-wrap:focus-within::before {
          background: linear-gradient(
            120deg,
            rgba(228,55,61,0.9)  0%,
            rgba(255,130,130,0.7) 20%,
            rgba(177,17,22,0.5)  45%,
            rgba(255,100,100,0.8) 65%,
            rgba(228,55,61,0.9)  100%
          );
          background-size: 250% 250%;
          animation: nf-border-flow 2.8s ease infinite;
        }
        @keyframes nf-border-flow {
          0%   { background-position: 0%   50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0%   50%; }
        }

        /* ── Input inner ── */
        .nf-input-inner {
          display: block;
          width: 100%;
          background: rgba(8,9,24,0.86);
          border: none;
          border-radius: 8px;
          padding: 12px 14px;
          color: #fff;
          font-size: 14px;
          font-family: Inter, "Segoe UI", sans-serif;
          outline: none;
          box-sizing: border-box;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
          transition: background 0.25s, box-shadow 0.25s;
          position: relative;
          z-index: 1;
        }
        .nf-input-inner:focus {
          background: rgba(10,8,26,0.94);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.12),
            inset 0 0 28px rgba(228,55,61,0.07);
        }
        .nf-input-inner::placeholder {
          color: rgba(255,255,255,0.2);
        }

        /* ── Label brightens on focus ── */
        .nf-field:focus-within .nf-label {
          color: rgba(228,55,61,0.85) !important;
        }

        /* ── Light card theme (Login screen only) — scoped under .nf-auth-panel--light ── */
        .nf-auth-panel--light .nf-input-wrap::before {
          background: rgba(0,0,0,0.14);
        }
        .nf-auth-panel--light .nf-input-inner {
          background: #fff;
          color: #111827;
          box-shadow: none;
        }
        .nf-auth-panel--light .nf-input-inner:focus {
          background: #fff;
          box-shadow: inset 0 0 0 1px rgba(228,55,61,0.12);
        }
        .nf-auth-panel--light .nf-input-inner::placeholder {
          color: rgba(17,24,39,0.35);
        }
        .nf-auth-panel--light .nf-field:focus-within .nf-label {
          color: #C8282E !important;
        }

        /* ── Direct, ancestor-independent light input styling (Login screen) ── */
        .nf-input-inner--light {
          background: #fff !important;
          color: #111827 !important;
          box-shadow: none !important;
        }
        .nf-input-inner--light:focus {
          background: #fff !important;
          box-shadow: inset 0 0 0 1px rgba(228,55,61,0.12) !important;
        }
        .nf-input-inner--light::placeholder {
          color: rgba(17,24,39,0.35) !important;
        }
        /* Beat the global dark-theme autofill override (index.css uses var(--shell)/var(--txt),
           which resolve dark here since this page sets data-theme="dark" at the root) so a
           browser-saved credential still reads white/dark-text, matching every other state. */
        .nf-input-inner--light:-webkit-autofill,
        .nf-input-inner--light:-webkit-autofill:hover,
        .nf-input-inner--light:-webkit-autofill:active,
        .nf-input-inner--light:-webkit-autofill:focus {
          -webkit-text-fill-color: #111827 !important;
          -webkit-box-shadow: 0 0 0 1000px #fff inset !important;
          box-shadow: 0 0 0 1000px #fff inset !important;
          caret-color: #111827;
        }

        /* ── Card border glow ── */
        @keyframes nf-card-glow {
          0%, 100% {
            box-shadow:
              inset 0 1px 0 rgba(255,255,255,0.08),
              0 20px 60px rgba(0,0,0,0.50);
          }
          50% {
            box-shadow:
              inset 0 1px 0 rgba(255,255,255,0.13),
              0 20px 60px rgba(0,0,0,0.52),
              0 0 0 1px rgba(228,55,61,0.25),
              0 0 36px rgba(228,55,61,0.12);
          }
        }

        /* ── Light card glow (Login screen) ── */
        @keyframes nf-card-glow-light {
          0%, 100% {
            box-shadow:
              0 1px 0 rgba(255,255,255,0.9) inset,
              0 0 0 1px rgba(228,55,61,0.06),
              0 18px 40px rgba(17,17,20,0.14),
              0 34px 80px rgba(177,17,22,0.2);
          }
          50% {
            box-shadow:
              0 1px 0 rgba(255,255,255,0.9) inset,
              0 18px 40px rgba(17,17,20,0.16),
              0 0 0 1px rgba(228,55,61,0.16),
              0 34px 90px rgba(177,17,22,0.3);
          }
        }

        /* ── Submit button shimmer ── */
        @keyframes nf-shimmer {
          0%   { transform: translateX(-130%) skewX(-18deg); }
          100% { transform: translateX(230%)  skewX(-18deg); }
        }
        .nf-submit-btn { position: relative; overflow: hidden; }
        .nf-submit-btn::after {
          content: '';
          position: absolute;
          top: 0; left: 0; width: 60%; height: 100%;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.22) 50%, transparent 100%);
          transform: translateX(-130%) skewX(-18deg);
          pointer-events: none;
        }
        .nf-submit-btn:not(:disabled):hover::after {
          animation: nf-shimmer 0.6s ease-out forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .nf-auth-root       { animation: none; }
          .nf-aurora-layer    { animation: none; }
          .nf-login-card      { animation: none; }
          .nf-input-wrap:focus-within::before { animation: none; }
          .nf-submit-btn::after { display: none; }
        }
        @media (max-width: 960px) {
          .nf-auth-outer      { grid-template-columns: 1fr !important; }
          .nf-auth-hero       { display: none !important; }
          .nf-auth-panel      {
            border-left: none !important;
            height: 100dvh !important;
            padding: 80px 24px 24px !important;
          }
          .nf-auth-brandstrip { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
