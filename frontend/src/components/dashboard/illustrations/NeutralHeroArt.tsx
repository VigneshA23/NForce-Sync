import { useId } from 'react';
import logo from '../../../assets/nforce-logo.png';

const GLOW = 'color-mix(in srgb, var(--brand-bright) 55%, #fff)';
const ACCENT_TINT = 'color-mix(in srgb, var(--brand-bright) 60%, #fff)';

/**
 * The hero scene NForce OneHR draws for "Prefer not to say" / no gender (an inline SVG there, not
 * an image file): laptop with a progress ring, calendar + chart cards, a plant and a mug on a desk,
 * tinted by the active accent via CSS variables. Ported 1:1 from OneHR's `Mke`/`jke`; the only
 * change is per-instance ids so the gradients/masks can't collide.
 */
export function NeutralHeroArt({ label }: { label?: string }) {
  const p = useId().replace(/[^a-zA-Z0-9-]/g, '');
  const id = (n: string) => `${p}-${n}`;
  const ref = (n: string) => `url(#${id(n)})`;
  return (
    <svg
      viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"
      aria-hidden="true" focusable="false" style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id={id('glow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" style={{ stopColor: GLOW }} stopOpacity={0.42} />
          <stop offset="100%" style={{ stopColor: GLOW }} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={id('desk')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000" stopOpacity={0.18} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.42} />
        </linearGradient>
        <linearGradient id={id('screen')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F1F2F5" />
        </linearGradient>
        <linearGradient id={id('fadeX')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" />
          <stop offset="0.12" stopColor="#0f0f0f" />
          <stop offset="0.26" stopColor="#4d4d4d" />
          <stop offset="0.4" stopColor="#adadad" />
          <stop offset="0.55" stopColor="#fff" />
        </linearGradient>
        <mask id={id('deskMask')} maskUnits="userSpaceOnUse" x="0" y="0" width="320" height="180">
          <rect width={320} height={180} fill={ref('fadeX')} />
        </mask>
        <clipPath id={id('screenLogo')}><circle cx={174} cy={113} r={8} /></clipPath>
        <clipPath id={id('mugLogo')}><circle cx={114} cy={143.5} r={6.2} /></clipPath>
      </defs>

      <circle cx={200} cy={78} r={96} fill={ref('glow')} />
      <g mask={ref('deskMask')}>
        <rect x={0} y={154} width={320} height={26} fill={ref('desk')} />
        <rect x={0} y={154} width={320} height={1} fill="#FFFFFF" fillOpacity={0.1} />
      </g>
      <circle cx={196} cy={66} r={58} fill="none" stroke="#FFFFFF" strokeOpacity={0.09} />
      <circle cx={196} cy={66} r={76} fill="none" stroke="#FFFFFF" strokeOpacity={0.05} />
      <circle cx={132} cy={24} r={1.4} fill="#FFFFFF" opacity={0.55} />
      <circle cx={292} cy={40} r={1.1} fill="#FFFFFF" opacity={0.45} />
      <circle cx={262} cy={16} r={0.9} fill="#FFFFFF" opacity={0.4} />

      {/* Calendar card */}
      <g transform="translate(26 0)">
        <rect x={16} y={24} width={96} height={38} rx={8} fill="#FFFFFF" fillOpacity={0.1} stroke="#FFFFFF" strokeOpacity={0.18} />
        <rect x={27} y={34} width={16} height={15} rx={2.5} fill="none" stroke="#FFFFFF" strokeOpacity={0.85} strokeWidth={1.4} />
        <rect x={27} y={34} width={16} height={4} rx={2} style={{ fill: ACCENT_TINT }} />
        <line x1={31} y1={32} x2={31} y2={36} stroke="#FFFFFF" strokeOpacity={0.85} strokeWidth={1.2} strokeLinecap="round" />
        <line x1={39} y1={32} x2={39} y2={36} stroke="#FFFFFF" strokeOpacity={0.85} strokeWidth={1.2} strokeLinecap="round" />
        <circle cx={31.5} cy={42} r={1.1} fill="#FFFFFF" fillOpacity={0.6} />
        <circle cx={35.5} cy={42} r={1.1} fill="#FFFFFF" fillOpacity={0.6} />
        <circle cx={31.5} cy={45.5} r={1.1} fill="#FFFFFF" fillOpacity={0.6} />
        <text x={49} y={39} fontSize={5.5} fontWeight={700} letterSpacing={0.6} fill="#FFFFFF" fillOpacity={0.7} style={{ fontFamily: '"Space Grotesk", sans-serif' }}>TODAY</text>
        <text x={49} y={49} fontSize={6.4} fontWeight={700} fill="#FFFFFF" fillOpacity={0.94} style={{ fontFamily: '"Space Grotesk", sans-serif' }}>{label ?? '–'}</text>
      </g>

      {/* Chart card */}
      <g transform="translate(26 0)">
        <rect x={28} y={74} width={88} height={54} rx={8} fill="#FFFFFF" fillOpacity={0.08} stroke="#FFFFFF" strokeOpacity={0.15} />
        <rect x={40} y={84} width={36} height={4} rx={2} fill="#FFFFFF" fillOpacity={0.55} />
        <rect x={40} y={106} width={8} height={12} rx={2} fill="#FFFFFF" fillOpacity={0.3} />
        <rect x={54} y={100} width={8} height={18} rx={2} fill="#FFFFFF" fillOpacity={0.3} />
        <rect x={68} y={103} width={8} height={15} rx={2} fill="#FFFFFF" fillOpacity={0.3} />
        <rect x={82} y={96} width={8} height={22} rx={2} fill="#FFFFFF" fillOpacity={0.3} />
        <rect x={96} y={90} width={8} height={28} rx={2} style={{ fill: ACCENT_TINT }} />
      </g>

      {/* Plant */}
      <g>
        <path d="M284 128 C270 112 266 96 272 84 C282 96 286 112 284 128 Z" style={{ fill: 'color-mix(in srgb, var(--brand-deep) 75%, #000)' }} />
        <path d="M286 128 C284 108 290 90 302 82 C306 100 298 118 286 128 Z" style={{ fill: 'color-mix(in srgb, var(--brand) 70%, var(--brand-deep))' }} />
        <path d="M284 130 C276 120 262 116 252 120 C260 130 274 134 284 130 Z" style={{ fill: 'color-mix(in srgb, var(--brand-deep) 90%, #000)' }} />
        <path d="M288 130 C296 118 308 114 316 116 C312 128 300 134 288 130 Z" style={{ fill: 'color-mix(in srgb, var(--brand) 80%, var(--brand-bright))' }} />
        <rect x={274} y={128} width={24} height={26} rx={4} style={{ fill: 'color-mix(in srgb, var(--brand-deep) 30%, #000)' }} />
        <rect x={274} y={128} width={24} height={4} rx={2} fill="#FFFFFF" fillOpacity={0.08} />
      </g>

      {/* Mug */}
      <g>
        <rect x={106} y={134} width={16} height={20} rx={3} fill="#F3E3DA" />
        <path d="M122 139 Q129 139 129 144 Q129 149 122 149" fill="none" stroke="#F3E3DA" strokeWidth={2.4} />
        <image href={logo} x={107.5} y={137} width={13} height={13} clipPath={ref('mugLogo')} preserveAspectRatio="xMidYMid slice" />
      </g>

      {/* Laptop */}
      <g>
        <rect x={146} y={78} width={104} height={70} rx={5} fill="#1B1D26" />
        <rect x={151} y={83} width={94} height={60} rx={2} fill={ref('screen')} />
        <circle cx={174} cy={113} r={12} fill="none" stroke="#E5E7EB" strokeWidth={5} />
        <circle cx={174} cy={113} r={12} fill="none" style={{ stroke: 'var(--brand)' }} strokeWidth={5} strokeDasharray="52 75.4" transform="rotate(-90 174 113)" strokeLinecap="round" />
        <image href={logo} x={166} y={105} width={16} height={16} clipPath={ref('screenLogo')} preserveAspectRatio="xMidYMid slice" />
        <rect x={196} y={92} width={38} height={4} rx={2} fill="#C9CDD6" />
        <rect x={196} y={114} width={6} height={10} rx={1.5} fill="#D6D9E0" />
        <rect x={205} y={106} width={6} height={18} rx={1.5} fill="#D6D9E0" />
        <rect x={214} y={111} width={6} height={13} rx={1.5} fill="#D6D9E0" />
        <rect x={223} y={100} width={6} height={24} rx={1.5} style={{ fill: 'var(--brand)' }} />
        <rect x={196} y={130} width={30} height={3} rx={1.5} fill="#E1E4EA" />
        <path d="M136 148 L260 148 L268 155 L128 155 Z" fill="#B7BBC6" />
        <rect x={186} y={148} width={24} height={2.5} rx={1.2} fill="#9CA1AD" />
      </g>
    </svg>
  );
}
