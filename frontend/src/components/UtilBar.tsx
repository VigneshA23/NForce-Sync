import { RULES, utilColor, fmtPct } from '../lib/rules';

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

// ── UtilLegend ─────────────────────────────────────────────────────────────────

export function UtilLegend() {
  const items = [
    { color: 'var(--ok)',      label: `Healthy (${RULES.util.under}–${RULES.util.over}%)` },
    { color: 'var(--warn)',    label: `Under (< ${RULES.util.under}%)` },
    { color: 'var(--risk)',    label: `Over (> ${RULES.util.over}%)` },
    { color: 'var(--txt-dim)', label: 'N/A (weekend / no data)' },
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
