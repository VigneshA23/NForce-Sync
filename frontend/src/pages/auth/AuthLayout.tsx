import { motion, useReducedMotion } from 'framer-motion';
import { BrandMark } from '../../components/BrandMark';
import loginBg from '../../assets/login-bg.jpg';

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
        backgroundColor: '#04050e',
        backgroundImage: `url(${loginBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Dark overlay */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'rgba(4,5,14,0.72)',
      }} />

      {/* Gradient tint */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: [
          'radial-gradient(ellipse 65% 55% at 15% 30%, rgba(91,33,182,0.24) 0%, transparent 65%)',
          'radial-gradient(ellipse 50% 45% at 80% 75%, rgba(49,46,129,0.18) 0%, transparent 60%)',
        ].join(', '),
      }} />

      {/* 60 / 40 grid */}
      <div
        className="nf-auth-outer"
        style={{
          position: 'relative', zIndex: 2,
          display: 'grid',
          gridTemplateColumns: '60fr 40fr',
          height: '100dvh',
        }}
      >

        {/* ══ LEFT 60% ══ */}
        <div
          className="nf-auth-hero"
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '40px 52px',
            height: '100dvh',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          {/* Faint watermark */}
          <div aria-hidden="true" style={{
            position: 'absolute', bottom: -8, left: -10,
            fontSize: 'clamp(100px, 15vw, 200px)',
            fontWeight: 900, letterSpacing: '-0.06em',
            color: 'rgba(255,255,255,0.025)',
            lineHeight: 1, userSelect: 'none', pointerEvents: 'none',
          }}>
            SYNC
          </div>

          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, position: 'relative', zIndex: 1 }}>
            <BrandMark size="lg" />
            <div>
              <div style={{ lineHeight: 1.1 }}>
                <span style={{ fontWeight: 700, fontSize: 26, letterSpacing: '-0.01em', color: '#fff' }}>
                  NForce
                </span>
                <span style={{ fontWeight: 700, fontSize: 26, letterSpacing: '-0.01em', color: '#B11116', marginLeft: 5 }}>
                  Sync
                </span>
              </div>
              <div style={{
                fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.52)', marginTop: 7, fontWeight: 400,
              }}>
                EOD & Utilization
              </div>
            </div>
          </div>

          {/* Headline */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Eyebrow */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <span style={{ display: 'inline-block', width: 28, height: 1.5, background: '#E4373D', borderRadius: 1 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#E4373D', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                Enterprise Workforce Platform
              </span>
            </div>

            <div style={{ fontSize: 'clamp(32px, 4.2vw, 58px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#fff' }}>
              Centralized
            </div>
            <div style={{ fontSize: 'clamp(32px, 4.2vw, 58px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
              <span style={{ color: '#E4373D' }}>Work</span>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 300 }}> &amp; </span>
              <span style={{ color: '#E4373D' }}>Utilization</span>
            </div>
            <div style={{
              fontSize: 'clamp(32px, 4.2vw, 58px)', fontWeight: 800,
              letterSpacing: '-0.03em', lineHeight: 1.05, color: '#fff', marginBottom: 28,
            }}>
              Management.
            </div>

            <p style={{
              fontSize: 14, fontWeight: 400, color: 'rgba(255,255,255,0.36)',
              lineHeight: 1.75, margin: '0 0 24px', maxWidth: 380, letterSpacing: '0.01em',
            }}>
              Track EOD submissions and utilization across your entire team — all in one place.
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['EOD Reports', 'Utilization Tracking', 'Team Insights'].map((label) => (
                <span key={label} style={{
                  fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.38)',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 20, padding: '5px 12px', letterSpacing: '0.04em',
                }}>
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Copyright */}
          <div style={{
            position: 'relative', zIndex: 1, paddingTop: 20,
            borderTop: '1px solid rgba(255,255,255,0.07)',
          }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.04em' }}>
              © 2026 NForce One · Enterprise Workforce Platform
            </span>
          </div>
        </div>

        {/* ══ RIGHT 40% — glass panel ══ */}
        <div
          className="nf-auth-panel"
          style={{
            position: 'relative',
            background: 'rgba(6, 7, 20, 0.5)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.06), -24px 0 60px rgba(0,0,0,0.2)',
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
          <div aria-hidden="true" style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'linear-gradient(155deg, rgba(255,255,255,0.035) 0%, transparent 35%)',
          }} />

          {/* Top accent edge */}
          <div aria-hidden="true" style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1, pointerEvents: 'none',
            background: 'linear-gradient(90deg, transparent 0%, rgba(228,55,61,0.45) 35%, rgba(228,55,61,0.45) 65%, transparent 100%)',
          }} />

          {/* Ambient orb — red/brand, bottom-left drift */}
          <div aria-hidden="true" style={{
            position: 'absolute',
            width: 400, height: 400,
            bottom: '5%', left: '-15%',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(177,17,22,0.22) 0%, rgba(177,17,22,0.07) 45%, transparent 70%)',
            filter: 'blur(48px)',
            pointerEvents: 'none',
            animation: reduced ? undefined : 'nf-orb-a 14s ease-in-out infinite',
          }} />

          {/* Ambient orb — purple, top-right drift */}
          <div aria-hidden="true" style={{
            position: 'absolute',
            width: 320, height: 320,
            top: '4%', right: '-10%',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(91,33,182,0.22) 0%, rgba(49,46,129,0.08) 45%, transparent 70%)',
            filter: 'blur(52px)',
            pointerEvents: 'none',
            animation: reduced ? undefined : 'nf-orb-b 20s ease-in-out infinite',
          }} />

          {/* Ambient orb — accent red, mid-right float */}
          <div aria-hidden="true" style={{
            position: 'absolute',
            width: 180, height: 180,
            top: '38%', right: '12%',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(228,55,61,0.12) 0%, transparent 65%)',
            filter: 'blur(32px)',
            pointerEvents: 'none',
            animation: reduced ? undefined : 'nf-orb-c 26s ease-in-out infinite',
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
              NForce One
            </span>
          </div>

          {/* Form card — ONLY animation on the page */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              position: 'relative', zIndex: 1,
              width: '100%', maxWidth: 420,
              background: 'rgba(255,255,255,0.045)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 20,
              padding: '40px 36px',
              boxShadow: [
                'inset 0 1px 0 rgba(255,255,255,0.1)',
                '0 24px 64px rgba(0,0,0,0.4)',
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
          animation: nf-fadein 0.35s ease-out both;
        }
        @keyframes nf-fadein {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* Ambient orbs */
        @keyframes nf-orb-a {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33%      { transform: translate(22px, -32px) scale(1.09); }
          66%      { transform: translate(-14px, 18px) scale(0.93); }
        }
        @keyframes nf-orb-b {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50%      { transform: translate(-26px, 38px) scale(1.14); }
        }
        @keyframes nf-orb-c {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          30%      { transform: translate(28px, 14px) scale(0.87); }
          70%      { transform: translate(-10px, -22px) scale(1.08); }
        }

        /* Card border breathing glow */
        @keyframes nf-card-glow {
          0%, 100% {
            box-shadow:
              inset 0 1px 0 rgba(255,255,255,0.10),
              0 24px 64px rgba(0,0,0,0.40);
          }
          50% {
            box-shadow:
              inset 0 1px 0 rgba(255,255,255,0.13),
              0 24px 64px rgba(0,0,0,0.42),
              0 0 0 1px rgba(177,17,22,0.2),
              0 0 32px rgba(177,17,22,0.12);
          }
        }

        /* Submit button shimmer sweep */
        @keyframes nf-shimmer {
          0%   { transform: translateX(-130%) skewX(-18deg); }
          100% { transform: translateX(230%)  skewX(-18deg); }
        }
        .nf-submit-btn {
          position: relative;
          overflow: hidden;
        }
        .nf-submit-btn::after {
          content: '';
          position: absolute;
          top: 0; left: 0; width: 60%; height: 100%;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%);
          transform: translateX(-130%) skewX(-18deg);
          pointer-events: none;
        }
        .nf-submit-btn:not(:disabled):hover::after {
          animation: nf-shimmer 0.65s ease-out forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .nf-auth-root    { animation: none; }
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
