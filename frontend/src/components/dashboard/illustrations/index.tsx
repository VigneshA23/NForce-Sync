import { Component, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { resolveIllustrationKey } from '../../../lib/illustration';
import { ACCENT_SWATCHES, useAccentColor, type AccentColor } from '../../../lib/accentColor';
import { recoloredImageUrl } from './recolorArt';
import { NeutralHeroArt } from './NeutralHeroArt';
import femaleArt from '../../../assets/hero-person-female.png';
import maleArt from '../../../assets/hero-person-male.png';
import nonBinaryArt from '../../../assets/hero-person-non-binary.png';
import femaleMask from '../../../assets/hero-person-female-accent-mask.png';
import maleMask from '../../../assets/hero-person-male-accent-mask.png';
import nonBinaryMask from '../../../assets/hero-person-non-binary-accent-mask.png';

/** The exact hero artwork NForce OneHR shows for each gender (Prefer not to say / unset gets OneHR's neutral scene). */
const HERO_ART = { female: femaleArt, male: maleArt, 'non-binary': nonBinaryArt } as const;
/** OneHR's accent masks: opaque over the backdrop, clear over the person — the accent recolor only
 *  touches what they cover, so skin keeps its natural tone under every accent. */
const HERO_MASK = { female: femaleMask, male: maleMask, 'non-binary': nonBinaryMask } as const;

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

/** NForce OneHR's own hero artwork (person at an NF laptop on a red backdrop), used as-is for
 *  parity with OneHR's dashboard. It is a full-bleed banner image, so it is right-anchored and
 *  cropped by `cover`, with the left edge faded out so it melts into the hero's dark base and the
 *  greeting text never sits on a hard image edge.
 *
 *  The art is drawn in OneHR red; for any other accent preference its red parts are re-tinted to
 *  that accent (recolorArt.ts) so the banner follows the user's colour choice. Until the tinted
 *  copy is ready the image stays transparent rather than flashing red. */
function OneHrHeroArt({ src, mask, fit = 'cover' }: { src: string; mask: string; fit?: 'cover' | 'contain' }) {
  const { accent } = useAccentColor();
  const [failed, setFailed] = useState(false);
  const [tinted, setTinted] = useState<{ accent: AccentColor; url: string } | null>(null);

  useEffect(() => {
    if (accent === 'red') return;
    let live = true;
    recoloredImageUrl(src, ACCENT_SWATCHES[accent].brand, mask)
      .then(url => { if (live) setTinted({ accent, url }); })
      .catch(() => { /* recolor unavailable — the original art still shows */ });
    return () => { live = false; };
  }, [src, mask, accent]);

  if (failed) return null;
  const ready = accent === 'red' || tinted?.accent === accent;
  const shownSrc = accent !== 'red' && tinted?.accent === accent ? tinted.url : src;
  return (
    <img
      src={shownSrc}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      style={{
        display: 'block', width: '100%', height: '100%',
        opacity: ready ? 1 : 0, transition: 'opacity .25s ease',
        // `contain` shows the whole scene, centered, with nothing cropped (Non-binary only).
        objectFit: fit, objectPosition: fit === 'contain' ? 'center' : 'right center',
        maskImage: 'linear-gradient(90deg, transparent 0%, transparent 16%, rgba(0,0,0,.4) 40%, #000 56%)',
        WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, transparent 16%, rgba(0,0,0,.4) 40%, #000 56%)',
        pointerEvents: 'none',
      }}
    />
  );
}

/** `gender` is `undefined` while the profile is still loading — render nothing then, so the neutral
 *  scene can't flash before a gendered image replaces it. `label` fills the scene's "TODAY" card. */
export function HeroIllustration({ gender, label }: { gender: string | null | undefined; label?: string }) {
  if (gender === undefined) return null;
  const key = resolveIllustrationKey(gender);
  return (
    <IllustrationErrorBoundary>
      {key === 'neutral' ? <NeutralHeroArt label={label} /> : <OneHrHeroArt src={HERO_ART[key]} mask={HERO_MASK[key]} fit={key === 'non-binary' ? 'contain' : 'cover'} />}
    </IllustrationErrorBoundary>
  );
}
