import { Component, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { resolveIllustrationKey } from '../../../lib/illustration';
import femalePhoto from '../../../assets/hero-illustration-female.png';
import malePhoto from '../../../assets/hero-illustration-male.png';

/** A soft-edged ellipse, in fractions (0–1) of the photo's own box — used to carve a
 *  "leave this alone" hole out of the accent-color tint (see `IllustrationPhoto`). Found by
 *  sampling each source photo's pixels for skin tone and fitting an ellipse around the result,
 *  so it lines up with that specific photo's pose. */
type SkinZone = { cx: number; cy: number; rx: number; ry: number };

const SKIN_ZONES: Record<'female' | 'male', { face: SkinZone; hands: SkinZone }> = {
  female: {
    face:  { cx: 0.53, cy: 0.38, rx: 0.10, ry: 0.17 },
    hands: { cx: 0.69, cy: 0.85, rx: 0.16, ry: 0.16 },
  },
  male: {
    face:  { cx: 0.53, cy: 0.36, rx: 0.09, ry: 0.11 },
    hands: { cx: 0.65, cy: 0.84, rx: 0.17, ry: 0.10 },
  },
};

/** If a variant ever throws while rendering, render nothing rather than breaking the dashboard —
 *  per the "must never break because of illustration selection" rule. */
class IllustrationErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** A real photo/illustration asset (Female/Male), shown in full (no cropping) inside the hero's
 *  illustration slot. `object-fit: cover` with a manually tuned crop kept losing either the
 *  plant pot or the character depending on which way it was biased — `contain` sidesteps that
 *  entirely by scaling the WHOLE source image (character, plant, pot, mug) down to fit the box
 *  and centering it, guaranteeing nothing is ever cropped out. Falls back to the neutral SVG if
 *  the image fails to load. Both source assets carry a small leftover "next" chevron button
 *  baked into their top-right corner (an artifact of the screenshot they were originally cropped
 *  from) — a small patch in the hero's own corner color covers it. Renders nothing if the image
 *  fails to load. */
function IllustrationPhoto({ src, alt, zones }: { src: string; alt: string; zones: { face: SkinZone; hands: SkinZone } }) {
  const [failed, setFailed] = useState(false);
  const rawId = useId().replace(/[^a-zA-Z0-9-]/g, '');
  if (failed) return null;

  const vignetteGradId = `${rawId}-vig`;
  const holeFadeId = `${rawId}-hole`;
  const photoMaskId = `${rawId}-photo-mask`;
  const tintMaskId = `${rawId}-tint-mask`;

  return (
    // `isolation: isolate` scopes the tint layer's mix-blend-mode to just this stacking
    // context (the photo + tint), so it recolors the source photo without also bleeding
    // into the hero card's own background behind it.
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', isolation: 'isolate' }}>
      {/* Mask definitions only — not rendered directly. `objectBoundingBox` units (0–1) let every
          coordinate below line up with the photo's own box regardless of its rendered size.
          `photoMaskId` is just the vignette (fades all 4 edges into the card so the photo reads
          as bleeding into the banner rather than sitting in a visible rectangle); `tintMaskId`
          layers the same vignette under two soft holes (face, hands) so the accent recolor never
          touches skin. */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <radialGradient id={vignetteGradId} cx="0.56" cy="0.48" r="0.58">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="38%" stopColor="#fff" />
            <stop offset="80%" stopColor="#000" />
          </radialGradient>
          <radialGradient id={holeFadeId}>
            <stop offset="0%" stopColor="#000" />
            <stop offset="55%" stopColor="#000" />
            <stop offset="100%" stopColor="#fff" />
          </radialGradient>
          <mask id={photoMaskId} maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox">
            <rect x="0" y="0" width="1" height="1" fill={`url(#${vignetteGradId})`} />
          </mask>
          <mask id={tintMaskId} maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox">
            <rect x="0" y="0" width="1" height="1" fill={`url(#${vignetteGradId})`} />
            <ellipse cx={zones.face.cx} cy={zones.face.cy} rx={zones.face.rx} ry={zones.face.ry} fill={`url(#${holeFadeId})`} />
            <ellipse cx={zones.hands.cx} cy={zones.hands.cy} rx={zones.hands.rx} ry={zones.hands.ry} fill={`url(#${holeFadeId})`} />
          </mask>
        </defs>
      </svg>

      <img
        src={src}
        alt={alt}
        onError={() => setFailed(true)}
        style={{
          width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center',
          display: 'block',
          mask: `url(#${photoMaskId})`,
          WebkitMask: `url(#${photoMaskId})`,
        }}
      />
      {/* Recolors the photo's baked-in red backdrop/swirl to the selected accent color.
          `mix-blend-mode: hue` replaces only the hue of whatever's beneath it — saturation and
          luminance (so shading/highlights) survive the recolor instead of flattening into a flat
          tint. Masked with soft holes over the face and hands, so skin keeps its natural,
          non-accent color; hair/shirt/props are low-saturation or already blend into the swirl,
          so recoloring them along with the backdrop reads as one consistent accent-colored scene
          rather than a natural photo with an odd tinted halo around it. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, var(--brand-bright) 0%, var(--brand) 45%, var(--hero-corner) 100%)',
          mixBlendMode: 'hue',
          mask: `url(#${tintMaskId})`,
          WebkitMask: `url(#${tintMaskId})`,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', top: 0, right: 0, width: '22%', height: '22%',
          background: 'radial-gradient(circle at 100% 0%, var(--hero-corner) 0%, var(--hero-corner) 60%, transparent 92%)',
        }}
      />
    </div>
  );
}

/**
 * Renders the hero illustration for the given profile gender. `gender` should be `undefined`
 * while the profile is still loading — that resolves to neutral, same as any unrecognized value
 * (including "prefer not to say"). Female/Male use the real illustration assets from src/assets;
 * Neutral has no illustration at all — the slot is simply left empty rather than shown with a
 * placeholder figure.
 */
export function HeroIllustration({ gender }: { gender: string | null | undefined }) {
  const key = resolveIllustrationKey(gender);
  if (key === 'neutral') return null;
  return (
    <IllustrationErrorBoundary>
      {key === 'female' ? <IllustrationPhoto src={femalePhoto} alt="" zones={SKIN_ZONES.female} />
        : <IllustrationPhoto src={malePhoto} alt="" zones={SKIN_ZONES.male} />}
    </IllustrationErrorBoundary>
  );
}
