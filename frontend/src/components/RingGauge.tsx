import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

/** A single-value circular progress ring — e.g. "92% Utilization". Distinct from the
 * multi-bucket donuts on the Team Dashboard (which split a whole team across buckets);
 * this always renders exactly one filled arc plus its remainder. */
export function RingGauge({
  pct, color, label, size = 130, thickness = 18,
}: {
  pct: number;
  color: string;
  label: string;
  size?: number;
  thickness?: number;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const data = [
    { key: 'filled', value: clamped },
    { key: 'rest', value: 100 - clamped },
  ];
  const outerRadius = size / 2 - 2;
  const innerRadius = outerRadius - thickness;

  return (
    <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data} cx="50%" cy="50%"
            innerRadius={innerRadius} outerRadius={outerRadius}
            startAngle={90} endAngle={-270}
            dataKey="value" strokeWidth={0} isAnimationActive={false}
          >
            <Cell fill={color} />
            <Cell fill="var(--line)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
      }}>
        <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)' }}>
          {Math.round(pct)}%
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}
