import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { utilColor, fmtPct } from '../lib/rules';

// ── UtilPctDonut — single utilization % as a donut gauge ────────────────────────

interface UtilPctDonutProps {
  pct: number | null;
  size?: number;
}

export function UtilPctDonut({ pct, size = 92 }: UtilPctDonutProps) {
  const color = utilColor(pct);
  const value = pct === null ? 0 : Math.max(0, Math.min(pct, 100));
  const data = [
    { name: 'filled', value },
    { name: 'rest', value: 100 - value },
  ];

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data} cx="50%" cy="50%"
            innerRadius={size * 0.34} outerRadius={size * 0.48}
            startAngle={90} endAngle={-270}
            dataKey="value" strokeWidth={0} isAnimationActive={false}
          >
            <Cell fill={color} />
            <Cell fill="var(--raised2)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontFamily: '"JetBrains Mono", monospace', fontSize: size * 0.16,
          fontWeight: 700, color, fontVariantNumeric: 'tabular-nums',
        }}>
          {fmtPct(pct)}
        </span>
      </div>
    </div>
  );
}

// ── CategoryDonut — billable / non-billable / bench breakdown ──────────────────

const CATEGORY_COLORS = ['var(--ok)', 'var(--info)', 'var(--txt-dim)'];

interface CategoryDonutProps {
  billableHours: number;
  nonBillableHours: number;
  benchHours: number;
  size?: number;
}

export function CategoryDonut({ billableHours, nonBillableHours, benchHours, size = 100 }: CategoryDonutProps) {
  const total = billableHours + nonBillableHours + benchHours;
  const data = [
    { name: 'Billable',     value: billableHours },
    { name: 'Non-billable', value: nonBillableHours },
    { name: 'Bench',        value: benchHours },
  ].filter(d => d.value > 0);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: size, height: size, flexShrink: 0 }}>
        {total > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data} cx="50%" cy="50%"
                innerRadius={size * 0.32} outerRadius={size * 0.48}
                paddingAngle={3} dataKey="value"
                strokeWidth={0} isAnimationActive={false}
              >
                {data.map((entry) => {
                  const colorIdx = ['Billable', 'Non-billable', 'Bench'].indexOf(entry.name);
                  return <Cell key={entry.name} fill={CATEGORY_COLORS[colorIdx]} />;
                })}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div style={{
            width: '100%', height: '100%', borderRadius: '50%',
            border: '1px solid var(--line)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 10, color: 'var(--txt-dim)' }}>No data</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: 'var(--txt-dim)',
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2,
        }}>
          Billable vs Non-Billable
        </span>
        <span><span style={{ color: 'var(--ok)' }}>●</span>{' '}
          <span style={{ fontSize: 10, color: 'var(--txt-mut)' }}>
            Billable {billableHours.toFixed(1)}h ({total > 0 ? Math.round(billableHours / total * 100) : 0}%)
          </span>
        </span>
        <span><span style={{ color: 'var(--info)' }}>●</span>{' '}
          <span style={{ fontSize: 10, color: 'var(--txt-mut)' }}>
            Non-billable {nonBillableHours.toFixed(1)}h ({total > 0 ? Math.round(nonBillableHours / total * 100) : 0}%)
          </span>
        </span>
        <span><span style={{ color: 'var(--txt-dim)' }}>●</span>{' '}
          <span style={{ fontSize: 10, color: 'var(--txt-mut)' }}>
            Bench {benchHours.toFixed(1)}h ({total > 0 ? Math.round(benchHours / total * 100) : 0}%)
          </span>
        </span>
      </div>
    </div>
  );
}

// ── SegmentDonut — generic labelled-segment donut with a centered value ────────

interface SegmentDonutProps {
  segments: { label: string; value: number; color: string }[];
  centerValue?: string;
  size?: number;
}

export function SegmentDonut({ segments, centerValue, size = 92 }: SegmentDonutProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const data = segments.filter(s => s.value > 0);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {total > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data} cx="50%" cy="50%"
              innerRadius={size * 0.34} outerRadius={size * 0.48}
              paddingAngle={2} dataKey="value"
              strokeWidth={0} isAnimationActive={false}
            >
              {data.map(s => <Cell key={s.label} fill={s.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div style={{
          width: '100%', height: '100%', borderRadius: '50%',
          border: '1px solid var(--line)',
        }} />
      )}
      {centerValue && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontFamily: '"Space Grotesk", sans-serif', fontSize: size * 0.19,
            fontWeight: 700, color: 'var(--txt)', fontVariantNumeric: 'tabular-nums',
          }}>
            {centerValue}
          </span>
        </div>
      )}
    </div>
  );
}
