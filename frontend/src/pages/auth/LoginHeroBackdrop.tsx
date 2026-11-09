import { useReducedMotion } from 'framer-motion';
import loginMetalBg from '../../assets/login-metal-bg.png';
import { NetworkPulseEffect } from './NetworkPulseEffect';

export function LoginHeroBackdrop() {
  const reduced = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        background: '#0a0a0c',
        overflow: 'hidden',
      }}
    >
      {/* Brushed-metal / red-seam photo, anchored to the bottom like the reference */}
      <div
        className={reduced ? undefined : 'nf-login-bg-drift'}
        style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          height: '58%',
          backgroundImage: `url(${loginMetalBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center bottom',
          backgroundRepeat: 'no-repeat',
        }}
      />

      {/* Fade the photo into the solid dark top so the headline/brand stay legible */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, #0a0a0c 0%, #0a0a0c 32%, rgba(10,10,12,0.35) 50%, transparent 62%)',
      }} />

      {/* Soft red ambient glow echoing the seam, bleeding up into the dark area */}
      <div style={{
        position: 'absolute',
        left: '4%', bottom: '18%',
        width: '50%', height: '34%',
        background: 'radial-gradient(ellipse, rgba(228,55,61,0.22) 0%, transparent 72%)',
        filter: 'blur(28px)',
      }} />

      <NetworkPulseEffect />

      <style>{`
        .nf-login-bg-drift {
          animation: nf-login-bg-drift 20s ease-in-out infinite alternate;
        }
        @keyframes nf-login-bg-drift {
          0%   { transform: scale(1.02) translate(0%, 0%); }
          100% { transform: scale(1.07) translate(-1%, -0.5%); }
        }
      `}</style>
    </div>
  );
}
