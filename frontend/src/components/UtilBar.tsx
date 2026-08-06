import { RULES, utilColor, utilState, fmtPct } from '../lib/rules';
import type { OrgUtilRowDto } from '../api/utilization';

// ── UtilBar ────────────────────────────────────────────────────────────────────

interface UtilBarProps {
  pct: number | null;
  capAt?: number;
}

export function UtilBar({ pct, capAt = 120 }: UtilBarProps) {
  const color   = utilColor(pct);
  const fill    = pct === null ? 0 : Math.min(pct, capAt);
  const tick60  = (RULES.util.under / capAt) * 100;
  const tick100 = (RULES.util.over  / capAt) * 100;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        position: 'relative', flex: 1, height: 6,
        background: 'var(--raised2)', borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', left: `${tick60}%`,  top: 0, bottom: 0, width: 1, background: 'var(--line2)', zIndex: 1 }} />
        <div style={{ position: 'absolute', left: `${tick100}%`, top: 0, bottom: 0, width: 1, background: 'var(--line2)', zIndex: 1 }} />
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${(fill / capAt) * 100}%`,
          background: color, borderRadius: 3,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{
        fontFamily: '"JetBrains Mono", monospace', fontSize: 12,
        color, minWidth: 42, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
      }}>
        {fmtPct(pct)}
      </span>
    </div>
  );
}

// ── Distribution ───────────────────────────────────────────────────────────────

export function Distribution({ members }: { members: OrgUtilRowDto[] }) {
  const counts = { under: 0, healthy: 0, over: 0, na: 0 };
  for (const m of members) {
    counts[utilState(m.snapshot?.utilizationPct ?? null)]++;
  }
  const total = members.length;
  const segments = [
    { key: 'under',   color: 'var(--warn)',    label: `Under <${RULES.util.under}%`,   count: counts.under },
    { key: 'healthy', color: 'var(--ok)',      label: `Healthy ${RULES.util.under}–${RULES.util.over}%`, count: counts.healthy },
    { key: 'over',    color: 'var(--risk)',    label: `Over >${RULES.util.over}%`,     count: counts.over },
    { key: 'na',      color: 'var(--txt-dim)', label: 'N/A',                           count: counts.na },
  ] as const;

  return (
    <div style={{ padding: '16px 16px 12px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt-mut)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Utilization Distribution — {total} employees
      </div>
      {/* Stacked proportional bar */}
      <div style={{ display: 'flex', height: 20, borderRadius: 4, overflow: 'hidden', gap: 1, marginBottom: 12 }}>
        {segments.map(s => s.count > 0 && (
          <div
            key={s.key}
            style={{
              flex: s.count / total,
              background: s.color,
              transition: 'flex 0.4s ease',
              position: 'relative',
            }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      {/* Count chips */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {segments.map(s => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--txt-mut)' }}>
              {s.label}
            </span>
            <span style={{ fontSize: 12, fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt)', fontVariantNumeric: 'tabular-nums' }}>
              {s.count}
            </span>
            <span style={{ fontSize: 11, color: 'var(--txt-dim)' }}>
              ({total > 0 ? Math.round((s.count / total) * 100) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── UtilLegend ─────────────────────────────────────────────────────────────────

export function UtilLegend() {
  const items = [
    { color: 'var(--ok)',      label: `Healthy (${RULES.util.under}–${RULES.util.over}%)` },
    { color: 'var(--warn)',    label: `Under (< ${RULES.util.under}%)` },
    { color: 'var(--risk)',    label: `Over (> ${RULES.util.over}%)` },
    { color: 'var(--txt-dim)', label: 'N/A (weekend / holiday / full-day leave)' },
  ];
  return (
    <div style={{
      display: 'flex', gap: 16, flexWrap: 'wrap',
      padding: '12px 16px', borderTop: '1px solid var(--line)',
    }}>
      {items.map(({ color, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--txt-mut)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
          {label}
        </div>
      ))}
      <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txt-dim)' }}>
        Ticks at {RULES.util.under}% and {RULES.util.over}%
      </div>
    </div>
  );
}
