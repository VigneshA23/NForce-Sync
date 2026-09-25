import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

export function Card({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        padding: 'var(--nf-density-card-pad, 20px)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface KpiTrend {
  label: string;
  positive: boolean;
}

interface KpiProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent?: string;
  /** Optional small trend chip under the value, e.g. "+5% vs last week". Only rendered when the
   *  caller has a real number to show — never fabricated. */
  trend?: KpiTrend;
  style?: React.CSSProperties;
}

export function KpiCard({ icon, label, value, accent = 'var(--txt)', trend, style: extraStyle }: KpiProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: 'var(--panel)',
        border: `1px solid ${hov ? `color-mix(in srgb, ${accent} 45%, var(--line))` : 'var(--line)'}`,
        borderRadius: 12,
        padding: '16px 18px',
        position: 'relative',
        overflow: 'hidden',
        transform: hov ? 'translateY(-3px) scale(1.01)' : 'translateY(0) scale(1)',
        transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.18s ease, box-shadow 0.18s ease',
        boxShadow: hov
          ? `0 8px 24px -4px color-mix(in srgb, ${accent} 25%, transparent), 0 2px 8px color-mix(in srgb, ${accent} 10%, transparent)`
          : '0 1px 4px rgba(0,0,0,0.06)',
        cursor: 'default',
        ...extraStyle,
      }}
    >
      {/* ambient glow blob */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: -16, right: -16, width: 72, height: 72, borderRadius: '50%',
        background: `radial-gradient(circle, color-mix(in srgb, ${accent} 28%, transparent), transparent 70%)`,
        opacity: hov ? 1 : 0.5, transition: 'opacity 0.25s ease', pointerEvents: 'none',
      }} />
      {/* top accent shimmer */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${accent} 50%, transparent) 50%, transparent)`,
        opacity: hov ? 0.6 : 0, transition: 'opacity 0.25s ease',
        borderRadius: '12px 12px 0 0', pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: `color-mix(in srgb, ${accent} 14%, var(--raised2))`,
          boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 20%, transparent)${hov ? `, 0 0 12px color-mix(in srgb, ${accent} 30%, transparent)` : ''}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
          transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease',
          transform: hov ? 'scale(1.12)' : 'scale(1)',
        }}>
          {icon}
        </div>
      </div>

      <div style={{
        fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
        fontSize: 24, fontWeight: 700, color: accent,
        letterSpacing: '-0.02em', lineHeight: 1,
        fontVariantNumeric: 'tabular-nums', marginBottom: 5,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--txt-mut)', fontWeight: 500 }}>{label}</div>
      {trend && (
        <div style={{
          marginTop: 6, fontSize: 11, fontWeight: 600,
          color: trend.positive ? 'var(--ok)' : 'var(--risk)',
        }}>
          {trend.label}
        </div>
      )}
    </div>
  );
}

/** Accessible click wrapper for a KpiCard (or any tile) that navigates somewhere — hover-lift +
 *  a chevron that brightens on hover, so a tile reads as clickable at a glance instead of only
 *  on hover. Keyboard-activatable (role="button", Enter/Space) to match a real <button>. */
export function ClickableKpi({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      style={{
        cursor: 'pointer', borderRadius: 12, position: 'relative', height: '100%',
      }}
    >
      {children}
      <ChevronRight
        size={14}
        aria-hidden="true"
        style={{
          position: 'absolute', top: 10, right: 10, color: 'var(--txt-dim)',
          opacity: hover ? 1 : 0.45, transition: 'opacity 0.14s', pointerEvents: 'none',
        }}
      />
    </div>
  );
}
