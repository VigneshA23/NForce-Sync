import type { UtilizationThresholds } from '../../../api/teamUtilization';
import { averageColor, fmtPct } from './utilizationLogic';

// 270° arc gauge from the prototype: a track, a soft band over the healthy range, and the value arc.
// All colours are tokens; the healthy range comes from the payload's thresholds, never a constant.

const SIZE = 210;
const CENTER = SIZE / 2;
const RADIUS = 86;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC = 0.75 * CIRCUMFERENCE;      // the visible 270°

const arcStyle = (dash: number, offset = 0): React.CSSProperties => ({
  fill: 'none',
  strokeWidth: 14,
  transformOrigin: `${CENTER}px ${CENTER}px`,
  transform: 'rotate(135deg)',
  strokeDasharray: `${dash} ${CIRCUMFERENCE}`,
  strokeDashoffset: offset,
});

export function UtilizationGauge({ avg, thresholds }: { avg: number | null; thresholds: UtilizationThresholds }) {
  const color = averageColor(avg, thresholds);
  const clampedAvg = avg === null ? 0 : Math.max(0, Math.min(avg, 100));
  // The gauge scale is 0–100%; a healthy range that runs past 100 is drawn up to the end of the arc.
  const bandStart = Math.max(0, Math.min(thresholds.underPct, 100)) / 100 * ARC;
  const bandEnd = Math.max(0, Math.min(thresholds.overPct, 100)) / 100 * ARC;

  return (
    <div
      className="tu-gauge"
      role="img"
      aria-label={avg === null
        ? 'Average utilization unavailable'
        : `Average utilization ${fmtPct(avg)}, healthy range ${thresholds.underPct} to ${thresholds.overPct} percent`}
      style={{ position: 'relative', width: SIZE, height: SIZE }}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" style={{ width: '100%', height: '100%' }}>
        <circle cx={CENTER} cy={CENTER} r={RADIUS} style={{ ...arcStyle(ARC), stroke: 'var(--raised2)' }} />
        <circle
          cx={CENTER} cy={CENTER} r={RADIUS}
          style={{ ...arcStyle(Math.max(bandEnd - bandStart, 0), -bandStart), stroke: 'color-mix(in srgb, var(--ok) 28%, transparent)' }}
        />
        <circle
          className="tu-gauge-value"
          cx={CENTER} cy={CENTER} r={RADIUS}
          style={{ ...arcStyle(Math.max(0.001, ARC * clampedAvg / 100)), stroke: color, strokeLinecap: 'round' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', paddingBottom: 10,
      }}>
        <div style={{
          fontSize: 50, fontWeight: 650, letterSpacing: -2, lineHeight: 1, color: 'var(--txt)',
          fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums',
        }}>
          {avg === null ? '—' : Math.round(avg)}
          {avg !== null && <small style={{ fontSize: 24, fontWeight: 500, color: 'var(--txt-mut)', letterSpacing: 0, marginLeft: 2 }}>%</small>}
        </div>
        <div style={{ color: 'var(--txt-mut)', fontSize: 12.5, marginTop: 6 }}>Average utilization</div>
      </div>
    </div>
  );
}
