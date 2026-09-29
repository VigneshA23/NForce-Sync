import { motion, useReducedMotion } from 'framer-motion';
import { BrandMark } from '../../components/BrandMark';

interface AuthLayoutProps {
  leftHeadline?: string;
  showStats?: boolean;
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const reduced = useReducedMotion();

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
            justifyContent: 'space-between',
            padding: '44px 56px 36px',
            height: '100dvh',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          {/* ── Aurora gradient blobs ── */}
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

          {/* Brand — top */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, position: 'relative', zIndex: 10 }}>
            <BrandMark size="lg" />
            <div>
              <div style={{ lineHeight: 1.1 }}>
                <span style={{ fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', color: '#fff' }}>NForce</span>
                <span style={{ fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', color: '#E4373D', marginLeft: 5 }}>Sync</span>
              </div>
              <div style={{ fontSize: 10, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>
                EOD & Utilization
              </div>
            </div>
          </div>

          {/* Headline — center */}
          <div style={{ position: 'relative', zIndex: 10 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <span style={{ display: 'inline-block', width: 32, height: 2, background: 'linear-gradient(90deg, #E4373D, rgba(228,55,61,0.3))', borderRadius: 2 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#E4373D', letterSpacing: '0.22em', textTransform: 'uppercase' }}>
                Enterprise Workforce Platform
              </span>
            </div>

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
              fontSize: 15, fontWeight: 400, color: 'rgba(255,255,255,0.42)',
              lineHeight: 1.72, margin: '24px 0 0', maxWidth: 400, letterSpacing: '0.01em',
            }}>
              Track EOD submissions and team utilization across your entire organization — all in one place.
            </p>
          </div>

          {/* Feature badges + copyright — bottom */}
          <div style={{ position: 'relative', zIndex: 10 }}>
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
            <div style={{ paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.04em' }}>
                © 2026 NForce One · Enterprise Workforce Platform
              </span>
            </div>
          </div>
        </div>

        {/* ══ RIGHT 40% — glass login panel ══ */}
        <div
          className="nf-auth-panel"
          style={{
            position: 'relative',
            background: 'rgba(7,8,15,0.7)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.05), -20px 0 60px rgba(0,0,0,0.3)',
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

          {/* Mobile brand strip */}
          <div
            className="nf-auth-brandstrip"
            style={{
              display: 'none', position: 'absolute',
              top: 0, left: 0, right: 0, height: 60,
              alignItems: 'center', justifyContent: 'center', gap: 12,
              borderBottom: '1px solid rgba(255,255,255,0.07)', zIndex: 3,
            }}
          >
            <BrandMark size="sm" />
            <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#fff' }}>
              NForce Sync
            </span>
          </div>

          {/* Form card */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
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
