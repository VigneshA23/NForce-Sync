import { AlertTriangle, CheckCircle2, Circle, Clock, XCircle } from 'lucide-react';
import { useAccessibility } from './accessibility';

export type StatusTone = 'ok' | 'warn' | 'risk' | 'info' | 'neutral';

const ICONS = {
  ok:      CheckCircle2,
  warn:    AlertTriangle,
  risk:    XCircle,
  info:    Clock,
  neutral: Circle,
} as const;

// Status colors are a mix of theme tokens and hardcoded hexes across the app; map the known
// ones back to a tone so a color-keyed badge can still pick the right icon.
const COLOR_TONES: [RegExp, StatusTone][] = [
  [/--ok\b|#2FB67C|#1A7A52/i,           'ok'],
  [/--warn\b|#E0A93B|#896010/i,         'warn'],
  [/--risk\b|#E4373D|#C81A1F/i,         'risk'],
  [/--info\b|#4C8DD6|#1A5FAA/i,         'info'],
];

function toneFromColor(color: string): StatusTone {
  for (const [re, tone] of COLOR_TONES) if (re.test(color)) return tone;
  return 'neutral';
}

/** Shape cue for color-keyed status UI. Renders nothing unless "Color-blind friendly status
 *  cues" is on (Preferences → Accessibility), so default visuals are untouched. Pass `fallback`
 *  to render something else (e.g. the original colored dot) when cues are off. */
export function StatusGlyph({ tone, color, size = 12, fallback = null }: {
  tone?: StatusTone;
  color?: string;
  size?: number;
  fallback?: React.ReactNode;
}) {
  const { settings } = useAccessibility();
  if (!settings.statusCues) return <>{fallback}</>;
  const Icon = ICONS[tone ?? (color ? toneFromColor(color) : 'neutral')];
  return <Icon size={size} aria-hidden="true" style={{ flexShrink: 0 }} />;
}
