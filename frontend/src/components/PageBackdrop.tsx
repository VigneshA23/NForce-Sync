// Decorative page backdrop: blush-pink → white gradient (dark: deep rose → near-black) with very-low-opacity crimson
// accents. Purely visual — aria-hidden, no pointer events. Attached to the VIEWPORT (position: fixed),
// below the top bar and right of the sidebar (--header-h / --sidebar-w from index.css), so it never
// depends on page height, Day Type or window size. Sits behind page content (zIndex -1); the parent
// wrapper must be `isolation: isolate` (see pageBackdropWrapperStyle).

const C = 'var(--pb-crimson)';
const PINK = 'var(--pb-pink)';


const LEAF = 'M0,0 C-70,-60 -70,-190 0,-280 C70,-190 70,-60 0,0 Z';



// Always-rendered wrapper for the backdrop. Base colour matches the gradient so a short page never shows a strip.
// minHeight subtracts the top bar and the Shell's 28px+28px page padding so it fills the viewport without adding scroll.
export const pageBackdropWrapperStyle = {
  position: 'relative',
  isolation: 'isolate',
  minHeight: 'calc(100dvh - var(--header-h) - 56px)',
  background: 'var(--pb-g2)',
} as const;

export function PageBackdrop() {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMaxYMax slice"
      style={{
        position: 'fixed',
        top: 'var(--header-h)', left: 'var(--sidebar-w)', right: 0, bottom: 0,
        width: 'calc(100vw - var(--sidebar-w))',
        height: 'calc(100dvh - var(--header-h))',
        zIndex: -1,
        pointerEvents: 'none',
      }}
    >
      <defs>
        <linearGradient id="pb-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--pb-g1)" />
          <stop offset="0.55" stopColor="var(--pb-g2)" />
          <stop offset="1" stopColor="var(--pb-g3)" />
        </linearGradient>
        <radialGradient id="pb-glow1" cx="0.85" cy="0.1" r="0.55">
          <stop offset="0" stopColor="var(--pb-pink)" stopOpacity={0.07} />
          <stop offset="1" stopColor="var(--pb-pink)" stopOpacity={0} />
        </radialGradient>
        <radialGradient id="pb-glow2" cx="0.1" cy="0.9" r="0.5">
          <stop offset="0" stopColor="var(--pb-pink)" stopOpacity={0.06} />
          <stop offset="1" stopColor="var(--pb-pink)" stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#pb-bg)" />
      <rect width="1600" height="900" fill="url(#pb-glow1)" />
      <rect width="1600" height="900" fill="url(#pb-glow2)" />

      {/* Bottom-left: soft leaves */}
      <g fill={PINK}>
        <path d={LEAF} transform="translate(120 920) rotate(-18) scale(1.15)" fillOpacity={0.34} />
        <path d={LEAF} transform="translate(230 930) rotate(22) scale(0.95)" fillOpacity={0.28} />
        <path d={LEAF} transform="translate(20 900) rotate(-48) scale(0.8)" fillOpacity={0.38} />
      </g>

      {/* Bottom-right: layered waves */}
      <path d="M700,900 C900,800 1060,880 1230,810 C1380,750 1500,780 1600,730 V900 Z" fill={PINK} fillOpacity={0.24} />
      <path d="M860,900 C1030,830 1160,890 1310,840 C1440,800 1530,830 1600,790 V900 Z" fill={PINK} fillOpacity={0.32} />
      <path d="M1040,900 C1160,860 1280,905 1400,870 C1490,845 1550,865 1600,850 V900 Z" fill={C} fillOpacity={0.14} />
    </svg>
  );
}
