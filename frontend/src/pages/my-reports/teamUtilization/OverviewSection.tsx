import { Card } from '../../../components/KpiCard';
import type { UtilizationStatus, UtilizationSummary } from '../../../api/teamUtilization';
import { UtilizationGauge } from './UtilizationGauge';
import {
  COUNTED_STATUSES, STATUS_META, countedMembers, deltaView, headlineFor, statusHint,
  type CountedStatus, type DeltaTone, type StatusFilter,
} from './utilizationLogic';

const DELTA_COLOR: Record<DeltaTone, string> = {
  up: 'var(--ok)', down: 'var(--risk)', flat: 'var(--txt-mut)', none: 'var(--txt-mut)',
};

/** Order of the segments in the stacked bar, left to right. */
const STACK_ORDER: CountedStatus[] = ['none', 'under', 'optimal', 'over'];

export function OverviewSection({
  summary, filter, onToggleFilter,
}: {
  summary: UtilizationSummary;
  filter: StatusFilter;
  /** Clicking a count selects that status; clicking the active one again clears it (the caller decides). */
  onToggleFilter: (status: UtilizationStatus) => void;
}) {
  const { counts, thresholds } = summary;
  const counted = countedMembers(counts);
  const { headline, sub } = headlineFor(counts);
  const delta = deltaView(summary);
  const deltaColor = DELTA_COLOR[delta.tone];

  return (
    <section className="tu-overview" aria-label="Utilization overview">
      {/* Gauge */}
      <Card className="tu-gauge-card" style={{ padding: '22px 20px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <UtilizationGauge avg={summary.averageUtilizationPct} thresholds={thresholds} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: -14 }}>
          <span style={{
            fontSize: 12.5, fontWeight: 600, padding: '3px 10px', borderRadius: 999, color: deltaColor,
            background: `color-mix(in srgb, ${deltaColor} 14%, transparent)`,
          }}>
            {delta.text}
          </span>
          <span style={{ fontSize: 12, color: 'var(--txt-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i aria-hidden="true" style={{
              width: 18, height: 6, borderRadius: 3, display: 'inline-block',
              background: 'color-mix(in srgb, var(--ok) 45%, transparent)',
            }} />
            Healthy range is {thresholds.underPct}–{thresholds.overPct}%
          </span>
        </div>
      </Card>

      {/* Headline, distribution and the clickable counts */}
      <Card style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: 600, letterSpacing: '-0.3px', color: 'var(--txt)' }}>{headline}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--txt-mut)', fontSize: 13.5 }}>
          {counted} {counted === 1 ? 'member' : 'members'} counted · {sub}
        </p>

        <div aria-hidden="true" style={{ display: 'flex', gap: 3, height: 14, margin: '22px 0 6px' }}>
          {STACK_ORDER.map(k => {
            if (!counts[k]) return null;
            return (
              <span
                key={k}
                className="tu-stack-seg"
                style={{ flex: counts[k], minWidth: 0, borderRadius: 4, background: STATUS_META[k].color }}
              />
            );
          })}
        </div>

        <div className="tu-legend" role="group" aria-label="Filter members by status">
          {COUNTED_STATUSES.map(k => {
            const meta = STATUS_META[k];
            const active = filter === k;
            return (
              <button
                key={k}
                type="button"
                className="tu-tile"
                aria-pressed={active}
                onClick={() => onToggleFilter(k)}
              >
                <span style={{
                  display: 'block', fontFamily: '"JetBrains Mono", monospace', fontSize: 30, fontWeight: 500,
                  lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', color: meta.color,
                }}>
                  {counts[k]}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6, fontWeight: 600, fontSize: 13, color: 'var(--txt)' }}>
                  <i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color }} />
                  {meta.label}
                </span>
                <span style={{ display: 'block', color: 'var(--txt-dim)', fontSize: 12, marginTop: 2 }}>
                  {counted ? Math.round(counts[k] / counted * 100) : 0}% of team · {statusHint(k, thresholds)}
                </span>
              </button>
            );
          })}
        </div>

        {summary.excludedCount > 0 && (
          <p style={{ margin: '10px 4px 0', fontSize: 12, color: 'var(--txt-dim)' }}>
            {summary.excludedCount} on leave or unavailable — not counted in the average or the totals above.
          </p>
        )}
      </Card>
    </section>
  );
}
