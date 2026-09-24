import type { ReactNode } from 'react';

/**
 * Shared chrome for the hero-banner illustration — background glow, desk, laptop, plant, mug —
 * identical across all 3 gender variants so they share the same dimensions, composition,
 * lighting and placement per spec. Each variant only supplies its own seated-figure silhouette
 * via `figure`, guaranteeing the three can never visually drift apart from one another.
 */
export function IllustrationScene({ figure }: { figure: ReactNode }) {
  return (
    <svg
      viewBox="0 0 240 190"
      width="100%"
      height="100%"
      role="img"
      aria-hidden="true"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <radialGradient id="heroGlow" cx="50%" cy="38%" r="65%">
          <stop offset="0%" stopColor="var(--brand-bright)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--brand-bright)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ambient glow */}
      <circle cx="130" cy="70" r="95" fill="url(#heroGlow)" />

      {/* Desk */}
      <rect x="18" y="150" width="204" height="8" rx="4" fill="var(--raised2)" />
      <rect x="30" y="158" width="10" height="22" fill="var(--raised2)" />
      <rect x="196" y="158" width="10" height="22" fill="var(--raised2)" />

      {/* Plant (left) */}
      <g transform="translate(30,110)">
        <rect x="-10" y="26" width="20" height="18" rx="3" fill="var(--raised)" stroke="var(--line2)" strokeWidth="1" />
        <path d="M0 26 C -14 14 -12 -6 -2 -14" stroke="var(--ok)" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M0 26 C 10 16 12 -2 4 -12" stroke="var(--ok)" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M0 26 C -2 10 0 -4 0 -18" stroke="var(--ok)" strokeWidth="4" fill="none" strokeLinecap="round" />
      </g>

      {/* Mug (right) */}
      <g transform="translate(200,132)">
        <rect x="-8" y="0" width="16" height="14" rx="3" fill="var(--brand-bright)" />
        <path d="M8 3 q7 0 7 5.5 q0 5.5 -7 5.5" stroke="var(--brand-bright)" strokeWidth="2.5" fill="none" />
      </g>

      {/* Laptop */}
      <g transform="translate(85,96)">
        <rect x="0" y="0" width="70" height="46" rx="4" fill="var(--panel)" stroke="var(--line2)" strokeWidth="1.5" />
        <rect x="6" y="6" width="58" height="34" rx="2" fill="var(--shell)" />
        <rect x="10" y="10" width="26" height="3" rx="1.5" fill="var(--brand-bright)" opacity="0.8" />
        <rect x="10" y="17" width="42" height="2.5" rx="1.25" fill="var(--line2)" />
        <rect x="10" y="23" width="34" height="2.5" rx="1.25" fill="var(--line2)" />
        <rect x="10" y="29" width="38" height="2.5" rx="1.25" fill="var(--line2)" />
        <path d="M-6 46 L76 46 L84 58 L-14 58 Z" fill="var(--raised2)" />
      </g>

      {/* Seated figure (gender-specific) */}
      {figure}
    </svg>
  );
}
