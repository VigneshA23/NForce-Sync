import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useAccessibility } from '../lib/accessibility';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/** Recharts donut with a legend beside it — same chart library as UtilizationDonut. Hovering a slice highlights
 *  it and swaps the center text to that segment's label, count and share; the legend is static. */
export function DonutBreakdown({ data, centerLabel = 'Total users', size = 190 }: {
  data: DonutSegment[];
  centerLabel?: string;
  size?: number;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const { settings } = useAccessibility();

  const segments = data.filter(d => d.value > 0);
  const total = segments.reduce((sum, d) => sum + d.value, 0);
  const active = segments.find(d => d.label === hovered) ?? null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <div
        style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
        onMouseLeave={() => setHovered(null)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={segments} dataKey="value" nameKey="label"
              cx="50%" cy="50%"
              innerRadius="64%" outerRadius="96%"
              startAngle={90} endAngle={-270}
              paddingAngle={segments.length > 1 ? 3 : 0}
              cornerRadius={segments.length > 1 ? 6 : 0}
              stroke="none"
              isAnimationActive={!settings.reduceMotion}
              animationDuration={800}
              onMouseEnter={(_, index) => setHovered(segments[index]?.label ?? null)}
            >
              {segments.map(seg => (
                <Cell
                  key={seg.label}
                  fill={seg.color}
                  style={{
                    cursor: 'pointer',
                    opacity: hovered === null || hovered === seg.label ? 1 : 0.45,
                    filter: hovered === seg.label ? `drop-shadow(0 0 5px ${seg.color})` : 'none',
                    transition: 'opacity 0.2s, filter 0.2s',
                  }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center', pointerEvents: 'none',
          padding: size * 0.2,
        }}>
          <div style={{
            fontSize: 12, fontWeight: 500, color: 'var(--txt-mut)', maxWidth: '100%',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {active ? active.label : centerLabel}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, color: 'var(--txt)', fontVariantNumeric: 'tabular-nums' }}>
            {active ? active.value : total}
          </div>
          {active && (
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--txt-mut)' }}>
              {Math.round((active.value / total) * 100)}%
            </div>
          )}
        </div>
      </div>

      {/* Legend sits to the right of the chart (wraps below it on narrow cards); it grows with the number
          of entries and scrolls past ~8 rows so a long list can't stretch the card indefinitely. */}
      <div style={{
        flex: '1 1 180px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2,
        maxHeight: 300, overflowY: 'auto',
      }}>
        {segments.map(seg => (
          <div
            key={seg.label}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '6px 8px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
              <span title={seg.label} style={{
                fontSize: 12.5, fontWeight: 500, color: 'var(--txt)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {seg.label}
              </span>
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--txt-mut)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {seg.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
