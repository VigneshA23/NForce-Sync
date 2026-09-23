/**
 * Decorative texture layer for the hero banner: a few soft, blurred curved swirl bands (like
 * flowing light/fabric folds) plus a handful of tiny sparkle marks — matches the reference's
 * painterly glow texture. Purely decorative (aria-hidden), absolutely positioned, no pointer
 * events. Masked by its parent to the same footprint as the glow gradient.
 */
export function HeroSparkles() {
  return (
    <svg
      viewBox="0 0 400 220"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 0,
        // Confines the swirls/sparkles to the same footprint as the hero's glow gradient so
        // they never show over the dark left side where the greeting text sits.
        maskImage: 'radial-gradient(ellipse 42% 130% at 84% 58%, black 0%, black 45%, transparent 82%)',
        WebkitMaskImage: 'radial-gradient(ellipse 42% 130% at 84% 58%, black 0%, black 45%, transparent 82%)',
      }}
    >
      <defs>
        <filter id="nf-hero-swirl-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      {/* Soft curved swirl bands — bold enough to read as a design element (like fabric folds
          catching light), alternating darker and lighter bands for real contrast rather than a
          single faint overlay. */}
      <g filter="url(#nf-hero-swirl-blur)" fill="none" strokeLinecap="round">
        <path d="M 170 240 Q 290 140 420 30" stroke="rgba(0,0,0,.38)" strokeWidth={44} />
        <path d="M 200 240 Q 310 150 420 80" stroke="rgba(255,255,255,.16)" strokeWidth={30} />
        <path d="M 150 240 Q 280 120 420 -30" stroke="rgba(0,0,0,.28)" strokeWidth={34} />
        <path d="M 240 240 Q 340 180 420 140" stroke="rgba(255,210,210,.14)" strokeWidth={26} />
      </g>

      {/* 4-point sparkle marks — small and sparse, mostly upper-middle of the glow */}
      {[
        { x: 205, y: 40, s: 5 },
        { x: 250, y: 65, s: 3.5 },
      ].map(({ x, y, s }, i) => (
        <path
          key={`spark-${i}`}
          d={`M${x} ${y - s} L${x + s * 0.28} ${y - s * 0.28} L${x + s} ${y} L${x + s * 0.28} ${y + s * 0.28} L${x} ${y + s} L${x - s * 0.28} ${y + s * 0.28} L${x - s} ${y} L${x - s * 0.28} ${y - s * 0.28} Z`}
          fill="rgba(255,255,255,.5)"
        />
      ))}
      {[[225, 90], [270, 35]].map(([cx, cy], i) => (
        <circle key={`dot-${i}`} cx={cx} cy={cy} r={1.2} fill="rgba(255,255,255,.4)" />
      ))}
    </svg>
  );
}
