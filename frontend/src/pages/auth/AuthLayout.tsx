import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { BrandMark } from '../../components/BrandMark';
import loginBg from '../../assets/login-bg.jpg';

// ── Layout ────────────────────────────────────────────────────────────

interface AuthLayoutProps {
  leftHeadline?: string;
  showStats?: boolean;
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const reduced = useReducedMotion();
  const [bgReady, setBgReady] = useState(false);

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setBgReady(true);
    img.onerror = () => setBgReady(true); // animate anyway on error
    img.src = loginBg;
  }, []);

  return (
    <motion.div
      data-theme="dark"
      initial={{ opacity: 0 }}
      animate={{ opacity: bgReady ? 1 : 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      style={{
        position: 'relative',
        height: '100dvh',
        maxHeight: '100dvh',
        overflow: 'hidden',
        backgroundColor: '#04050e',
        backgroundImage: `url(${loginBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        fontFamily: 'Inter, "Segoe UI", sans-serif',
      }}
    >
      {/* ── Dark overlay ── */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, zIndex: 0,
        background: 'rgba(4, 5, 14, 0.74)',
        pointerEvents: 'none',
      }} />

      {/* ── Gradient tint ── */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: [
          'radial-gradient(ellipse 65% 55% at 15% 30%, rgba(91,33,182,0.26) 0%, transparent 65%)',
          'radial-gradient(ellipse 50% 45% at 80% 75%, rgba(49,46,129,0.2) 0%, transparent 60%)',
          'radial-gradient(ellipse 35% 30% at 5% 80%,  rgba(109,40,217,0.14) 0%, transparent 55%)',
        ].join(', '),
      }} />

      {/* ── Animated blobs ── */}
      <div aria-hidden="true" className="nf-blob nf-blob-1" style={{
        position: 'absolute', top: '-12%', left: '-6%',
        width: '48vw', height: '48vw', borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(100,40,200,0.11) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 1, willChange: 'transform',
      }} />
      <div aria-hidden="true" className="nf-blob nf-blob-2" style={{
        position: 'absolute', bottom: '-18%', right: '-8%',
        width: '42vw', height: '42vw', borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(49,46,129,0.13) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 1, willChange: 'transform',
      }} />

      {/* ── Crystal shimmer ── */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
        background: 'linear-gradient(140deg, rgba(255,255,255,0.028) 0%, transparent 42%, rgba(255,255,255,0.018) 100%)',
      }} />


      {/* ── 60 / 40 grid ── */}
      <div
        className="nf-auth-outer"
        style={{
          position: 'relative', zIndex: 3,
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
            padding: '40px 52px 40px 52px',
            height: '100dvh',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          {/* Faint watermark */}
          <div aria-hidden="true" style={{
            position: 'absolute', bottom: -8, left: -10,
            fontSize: 'clamp(100px, 15vw, 200px)',
            fontWeight: 900,
            letterSpacing: '-0.06em',
            color: 'rgba(255,255,255,0.02)',
            lineHeight: 1,
            userSelect: 'none', pointerEvents: 'none',
          }}>
            SYNC
          </div>

          {/* ── Top: brand ── */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            style={{ display: 'flex', alignItems: 'center', gap: 20, position: 'relative', zIndex: 1 }}
          >
            <BrandMark size="lg" />
            <div>
              <div style={{ lineHeight: 1.1 }}>
                <span style={{
                  fontWeight: 700, fontSize: 26,
                  letterSpacing: '-0.01em', color: '#fff',
                }}>
                  NForce
                </span>
                <span style={{
                  fontWeight: 700, fontSize: 26,
                  letterSpacing: '-0.01em', color: '#B11116',
                  marginLeft: 5,
                }}>
                  Sync
                </span>
              </div>
              <div style={{
                fontSize: 10, letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.52)', marginTop: 7,
                fontWeight: 400,
              }}>
                EOD & Utilization
              </div>
            </div>
          </motion.div>

          {/* ── Centre: headline ── */}
          <div style={{ position: 'relative', zIndex: 1 }}>

            {/* Eyebrow */}
            <div style={{ overflow: 'hidden', marginBottom: 16 }}>
              <motion.div
                initial={reduced ? false : { y: '110%' }}
                animate={{ y: 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.55, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              >
                <span style={{
                  display: 'inline-block', width: 28, height: 1.5,
                  background: '#E4373D', borderRadius: 1,
                }} />
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: '#E4373D', letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                }}>
                  Enterprise Workforce Platform
                </span>
              </motion.div>
            </div>

            {/* Main headline — line 1 */}
            <div style={{ overflow: 'hidden' }}>
              <motion.div
                initial={reduced ? false : { y: '110%' }}
                animate={{ y: 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.65, delay: 0.18, ease: [0.23, 1, 0.32, 1] }}
                style={{
                  fontSize: 'clamp(32px, 4.2vw, 58px)',
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  lineHeight: 1.05,
                  color: '#fff',
                }}
              >
                Centralized
              </motion.div>
            </div>

            {/* Main headline — line 2 with red words */}
            <div style={{ overflow: 'hidden' }}>
              <motion.div
                initial={reduced ? false : { y: '110%' }}
                animate={{ y: 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.68, delay: 0.25, ease: [0.23, 1, 0.32, 1] }}
                style={{
                  fontSize: 'clamp(32px, 4.2vw, 58px)',
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  lineHeight: 1.05,
                }}
              >
                <span style={{ color: '#E4373D' }}>Work</span>
                <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 300 }}> & </span>
                <span style={{ color: '#E4373D' }}>Utilization</span>
              </motion.div>
            </div>

            {/* Main headline — line 3 */}
            <div style={{ overflow: 'hidden', marginBottom: 32 }}>
              <motion.div
                initial={reduced ? false : { y: '110%' }}
                animate={{ y: 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.65, delay: 0.32, ease: [0.23, 1, 0.32, 1] }}
                style={{
                  fontSize: 'clamp(32px, 4.2vw, 58px)',
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  lineHeight: 1.05,
                  color: '#fff',
                }}
              >
                Management.
              </motion.div>
            </div>

            {/* Subtitle */}
            <motion.p
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={reduced ? { duration: 0 } : { duration: 0.5, delay: 0.44 }}
              style={{
                fontSize: 14,
                fontWeight: 400,
                color: 'rgba(255,255,255,0.36)',
                lineHeight: 1.75,
                margin: 0,
                maxWidth: 380,
                letterSpacing: '0.01em',
              }}
            >
              Track EOD submissions and utilization across your entire team — all in one place.
            </motion.p>

            {/* Feature pills */}
            <motion.div
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={reduced ? { duration: 0 } : { duration: 0.5, delay: 0.54 }}
              style={{ display: 'flex', gap: 8, marginTop: 24, flexWrap: 'wrap' }}
            >
              {['EOD Reports', 'Utilization Tracking', 'Team Insights'].map((label) => (
                <span key={label} style={{
                  fontSize: 11, fontWeight: 500,
                  color: 'rgba(255,255,255,0.38)',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 20, padding: '5px 12px',
                  letterSpacing: '0.04em',
                }}>
                  {label}
                </span>
              ))}
            </motion.div>
          </div>

          {/* ── Bottom: copyright ── */}
          <motion.div
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduced ? { duration: 0 } : { delay: 0.7 }}
            style={{
              position: 'relative', zIndex: 1,
              paddingTop: 20,
              borderTop: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <span style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.2)',
              letterSpacing: '0.04em',
            }}>
              © 2026 NForce One · Enterprise Workforce Platform
            </span>
          </motion.div>
        </div>

        {/* ══ RIGHT 40% — glass panel ══ */}
        <div
          className="nf-auth-panel"
          style={{
            position: 'relative',
            background: 'rgba(6, 7, 20, 0.46)',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            borderLeft: '1px solid rgba(255,255,255,0.09)',
            boxShadow: [
              'inset 1px 0 0 rgba(255,255,255,0.07)',
              '-32px 0 80px rgba(0,0,0,0.25)',
            ].join(', '),
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
          {/* Inner shimmer hit */}
          <div aria-hidden="true" style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'linear-gradient(155deg, rgba(255,255,255,0.04) 0%, transparent 35%)',
          }} />

          {/* Mobile brand strip */}
          <div
            className="nf-auth-brandstrip"
            style={{
              display: 'none',
              position: 'absolute',
              top: 0, left: 0, right: 0, height: 60,
              alignItems: 'center', justifyContent: 'center', gap: 12,
              borderBottom: '1px solid rgba(255,255,255,0.07)', zIndex: 3,
            }}
          >
            <BrandMark size="sm" />
            <span style={{
              fontWeight: 700, fontSize: 14,
              letterSpacing: '0.05em', textTransform: 'uppercase', color: '#fff',
            }}>
              NForce One
            </span>
          </div>

          {/* ── Form card ── */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.55, delay: 0.08, ease: [0.23, 1, 0.32, 1] }}
            style={{
              position: 'relative', zIndex: 1,
              width: '100%', maxWidth: 420,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 20,
              padding: '40px 36px',
              boxShadow: [
                'inset 0 1px 0 rgba(255,255,255,0.1)',
                '0 0 0 0.5px rgba(255,255,255,0.04)',
                '0 24px 64px rgba(0,0,0,0.4)',
              ].join(', '),
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            {children}
          </motion.div>
        </div>
      </div>

      <style>{`
        @keyframes nf-blob-float-1 {
          0%, 100% { transform: translate(0, 0)    scale(1);    }
          33%       { transform: translate(55px, -35px) scale(1.06); }
          66%       { transform: translate(-25px, 20px) scale(0.95); }
        }
        @keyframes nf-blob-float-2 {
          0%, 100% { transform: translate(0, 0)    scale(1);    }
          45%       { transform: translate(-45px, 30px) scale(1.05); }
          78%       { transform: translate(25px, -16px) scale(0.97); }
        }
        .nf-blob-1 { animation: nf-blob-float-1 22s ease-in-out infinite; }
        .nf-blob-2 { animation: nf-blob-float-2 18s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .nf-blob { animation: none !important; }
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
    </motion.div>
  );
}
