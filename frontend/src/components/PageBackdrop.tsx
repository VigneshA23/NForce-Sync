// Decorative page backdrop: blush-pink → white gradient (dark: deep rose → near-black) with very-low-opacity crimson
// accents. Purely visual — aria-hidden, no pointer events. Sits behind page content (zIndex -1);
// the parent must be `position: relative; isolation: isolate`. It bleeds `inset` px past the
// parent so it fills the Shell's page padding (28px).

const C = 'var(--pb-crimson)';
const PINK = 'var(--pb-pink)';


const LEAF = 'M0,0 C-70,-60 -70,-190 0,-280 C70,-190 70,-60 0,0 Z';



export function PageBackdrop({ inset = 28 }: { inset?: number }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      style={{
        position: 'absolute',
        top: -inset, right: -inset, bottom: -inset, left: -inset,
        width: `calc(100% + ${inset * 2}px)`,
        height: `calc(100% + ${inset * 2}px)`,
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
