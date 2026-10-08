import { Clock, Gauge, Plane } from 'lucide-react';
import { Card, KpiCard } from '../../components/KpiCard';
import { RingGauge } from '../../components/RingGauge';
import type { OverviewCounts, OverviewWording } from './overviewCounts';

// ── Team Overview summary row: hero (ring + headline + status bar) beside three stat cards ──────

const SEGMENTS = [
  { key: 'submitted', label: 'Submitted',         color: 'var(--ok)' },
  { key: 'pending',   label: 'Pending approval',  color: 'var(--warn)' },
  { key: 'onLeave',   label: 'On leave',          color: 'var(--info)' },
  { key: 'missing',   label: 'Missing',           color: 'var(--risk)' },
] as const;

function StatusBar({ counts }: { counts: OverviewCounts }) {
  const summary = SEGMENTS.map(s => `${s.label} ${counts[s.key]}`).join(', ');
  return (
    <div
      role="img"
      aria-label={`Status breakdown of ${counts.total} members: ${summary}`}
      style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--line)', gap: 2 }}
    >
      {counts.total > 0 && SEGMENTS.map(s => counts[s.key] > 0 && (
        <div key={s.key} style={{ flex: counts[s.key], background: s.color, minWidth: 4 }} />
      ))}
    </div>
  );
}

const SUMMARY_CSS = `
        .nf-ov-summary { display: grid; grid-template-columns: minmax(0, 2.4fr) repeat(3, minmax(0, 1fr)); gap: 12px; }
        @media (max-width: 1000px) {
          .nf-ov-summary { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .nf-ov-summary .nf-ov-hero { grid-column: 1 / -1; }
        }
        @media (max-width: 640px) {
          .nf-ov-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .nf-ov-summary .nf-ov-hero { flex-direction: column; align-items: flex-start !important; }
        }
      `;

/** Same grid and card footprint as the real summary, so nothing jumps when the data arrives. */
function SummarySkeleton() {
  return (
    <div className="nf-ov-summary" style={{ marginBottom: 20 }} aria-busy="true" aria-label="Loading team summary">
      <Card className="nf-ov-hero" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div className="skeleton" style={{ width: 130, height: 130, borderRadius: '50%', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="skeleton" style={{ height: 20, width: '60%', borderRadius: 4, marginBottom: 14 }} />
          <div className="skeleton" style={{ height: 8, borderRadius: 4 }} />
          <div style={{ display: 'flex', gap: 18, marginTop: 12 }}>
            {SEGMENTS.map(s => <div key={s.key} className="skeleton" style={{ height: 12, width: 70, borderRadius: 4 }} />)}
          </div>
        </div>
      </Card>
      {[0, 1, 2].map(i => (
        <Card key={i}>
          <div className="skeleton" style={{ height: 12, width: '55%', borderRadius: 4, marginBottom: 14 }} />
          <div className="skeleton" style={{ height: 26, width: '35%', borderRadius: 4 }} />
        </Card>
      ))}
      <style>{SUMMARY_CSS}</style>
    </div>
  );
}

/** `counts`/`wording` are null while the member list is loading. */
export function OverviewSummary({ counts, wording, animateRing = false }: {
  counts: OverviewCounts | null; wording: OverviewWording | null; animateRing?: boolean;
}) {
  if (!counts || !wording) return <SummarySkeleton />;
  const avg = counts.avgUtilization === null ? '—' : `${Math.round(counts.avgUtilization)}%`;
  const avgAccent = counts.avgUtilization === null ? 'var(--txt-dim)'
    : counts.avgUtilization >= 85 ? 'var(--ok)'
    : counts.avgUtilization >= 60 ? 'var(--warn)'
    : 'var(--risk)';

  return (
    <div className="nf-ov-summary" style={{ marginBottom: 20 }}>
      <Card className="nf-ov-hero" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <RingGauge pct={counts.completionPct} color="var(--brand)" label="submitted" size={130} thickness={16} animate={animateRing} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--txt)', letterSpacing: '-0.01em', marginBottom: 14 }}>
            {wording.headline}
          </div>
          <StatusBar counts={counts} />
          <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
            {SEGMENTS.map(s => (
              <li key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--txt-mut)' }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                {s.label}
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums', color: 'var(--txt)', fontWeight: 600 }}>
                  {counts[s.key]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <KpiCard icon={<Clock size={18} />} accent="var(--warn)" label="Waiting for approval" value={counts.pending} />
      <KpiCard icon={<Plane size={18} />} accent="var(--info)" label="On leave" value={counts.onLeave} />
      <KpiCard icon={<Gauge size={18} />} accent={avgAccent} label="Avg utilization" value={avg} />

      <style>{SUMMARY_CSS}</style>
    </div>
  );
}
