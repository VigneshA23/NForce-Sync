import type { UtilizationStatus, UtilizationThresholds } from '../../../api/teamUtilization';
import { STATUS_META } from './utilizationLogic';

/** The bar's scale tops out here, so an overloaded member is visibly longer than a 100% one. */
const CAP = 125;

/**
 * Per-member bar with tick marks at the configured under / over thresholds. Its own component
 * (not the shared UtilBar, which bakes the 60/100 constants in) because the ticks must come from
 * the payload's thresholds.
 */
export function UtilizationTrack({
  pct, status, thresholds,
}: { pct: number | null; status: UtilizationStatus; thresholds: UtilizationThresholds }) {
  const fill = pct === null ? 0 : Math.min(Math.max(pct, 0), CAP) / CAP * 100;
  return (
    <span
      className="tu-track"
      aria-hidden="true"
      style={{ position: 'relative', display: 'block', height: 8, borderRadius: 999, background: 'var(--raised2)' }}
    >
      {[thresholds.underPct, thresholds.overPct].map(t => (
        <span
          key={t}
          style={{ position: 'absolute', top: -3, bottom: -3, width: 1, background: 'var(--line2)', left: `${t / CAP * 100}%` }}
        />
      ))}
      <span
        className="tu-fill"
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999,
          width: `${fill}%`, background: STATUS_META[status].color,
        }}
      />
    </span>
  );
}
