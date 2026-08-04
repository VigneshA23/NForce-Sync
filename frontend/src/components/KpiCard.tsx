export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--line)',
      borderRadius: 10,
      padding: '20px',
      ...style,
    }}>
      {children}
    </div>
  );
}

interface KpiProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent?: string;
}

export function KpiCard({ icon, label, value, accent = 'var(--txt)' }: KpiProps) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: 'var(--raised2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: accent,
        }}>
          {icon}
        </div>
      </div>
      <div style={{
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 28,
        fontWeight: 700,
        color: accent,
        letterSpacing: '-0.02em',
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        marginBottom: 6,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--txt-mut)', fontWeight: 500 }}>{label}</div>
    </Card>
  );
}
