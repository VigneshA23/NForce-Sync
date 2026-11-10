import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Panel card — OneHR's `nf-dash-card`: 16px corners, a faint crimson wash across the top
 *  110px, soft drop shadow that warms to crimson on hover. */
export function Card({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div
      className={['nf-card', className].filter(Boolean).join(' ')}
      style={{
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--brand) 4%, var(--panel)) 0%, var(--panel) 110px)',
        border: '1px solid var(--line)',
        borderRadius: 16,
        boxShadow: '0 6px 22px rgba(16,24,40,.07)',
        padding: 'var(--nf-density-card-pad, 20px)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A Card's heading row — OneHR's `nf-dash-title`: 38px crimson icon tile + bold 16px title,
 *  with an optional right-aligned slot (a "View all →" link, a filter, a count). Pass `accent`
 *  (e.g. var(--warn)) when the panel's colour carries meaning — it tints the tile and title. */
export function CardTitle({ icon: Icon, children, right, accent, style }: {
  icon?: LucideIcon;
  accent?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, ...style }}>
      {Icon && (
        <span aria-hidden="true" style={{
          width: 38, height: 38, flexShrink: 0, borderRadius: 11,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: accent ?? 'var(--brand)',
          background: `color-mix(in srgb, ${accent ?? 'var(--brand)'} 12%, var(--panel))`,
          border: `1px solid color-mix(in srgb, ${accent ?? 'var(--brand)'} 28%, transparent)`,
        }}>
          <Icon size={18} />
        </span>
      )}
      <h3 style={{
        // 160px basis: in a wrapping title row, the `right` slot drops to its own line on narrow
        // screens instead of squeezing the title into a one-word-per-line column.
        flex: '1 1 160px', minWidth: 0, margin: 0,
        fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
        fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', color: accent ?? 'var(--txt)',
      }}>
        {children}
      </h3>
      {right}
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
  /** Shows a placeholder bar instead of `value`, so a tile never flashes 0 before its data arrives. */
  loading?: boolean;
  /** Native tooltip on the tile, for a label that needs a qualifier (e.g. "approved entries only"). */
  title?: string;
  style?: React.CSSProperties;
}

/** KPI tile — OneHR's `nf-dash-tile`: a 6px accent edge on the left, a diagonal wash toward the
 *  accent, label + accent icon tile on top, the value underneath. The value keeps the accent
 *  colour because in Sync the colour carries meaning (risk/warn/ok), not decoration. */
export function KpiCard({ icon, label, value, accent = 'var(--txt)', trend, loading = false, title, style: extraStyle }: KpiProps) {
  const [hov, setHov] = useState(false);
  // A neutral (text-coloured) tile still gets a visible edge — use the brand crimson for it.
  const edge = accent === 'var(--txt)' ? 'var(--brand)' : accent;
  return (
    <div
      title={title}
      aria-busy={loading || undefined}
      className="nf-kpi-tile"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: `linear-gradient(135deg, var(--panel) 0%, var(--panel) 35%, color-mix(in srgb, ${edge} 16%, var(--panel)) 100%)`,
        border: '1px solid var(--line)',
        borderLeft: `6px solid ${edge}`,
        borderRadius: 16,
        padding: '10px 14px 9px 12px',
        // Fills whatever height the wrapping ClickableKpi (or a bare grid cell) stretches it
        // to — without this, a tile with no `trend` line renders shorter than its siblings that
        // have one, since a plain block div sizes to its own content by default rather than
        // inheriting a parent's stretched height.
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        position: 'relative',
        overflow: 'hidden',
        transform: hov ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        boxShadow: hov
          ? `0 10px 22px -10px color-mix(in srgb, ${edge} 65%, transparent)`
          : `0 6px 18px -10px color-mix(in srgb, ${edge} 55%, transparent)`,
        cursor: 'default',
        ...extraStyle,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{
          minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.3, paddingTop: 2,
          fontSize: 13, fontWeight: 700, color: 'var(--txt)',
        }}>
          {label}
        </div>
        <div aria-hidden="true" className="nf-kpi-ico" style={{
          width: 30, height: 30, borderRadius: 10, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: edge,
          background: `color-mix(in srgb, ${edge} 14%, var(--panel))`,
          border: `1px solid color-mix(in srgb, ${edge} 22%, transparent)`,
          boxShadow: `0 4px 10px -6px color-mix(in srgb, ${edge} 60%, transparent)`,
        }}>
          {icon}
        </div>
      </div>

      <div style={{
        fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
        fontSize: 24, fontWeight: 800, color: accent,
        letterSpacing: '-0.02em', lineHeight: 1.05,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {loading ? (
          <span
            role="status" aria-label={`Loading ${label}`}
            style={{
              display: 'inline-block', width: 56, height: 22, borderRadius: 6, verticalAlign: 'top',
              background: 'var(--raised2)', animation: 'nf-kpi-pulse 1.2s ease-in-out infinite',
            }}
          />
        ) : value}
      </div>
      {trend && (
        <div style={{
          fontSize: 11, fontWeight: 600,
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
        cursor: 'pointer', borderRadius: 16, position: 'relative', height: '100%',
      }}
    >
      {children}
      {/* Bottom-right: the icon tile now owns the top-right corner (OneHR tile layout). */}
      <ChevronRight
        size={14}
        aria-hidden="true"
        style={{
          position: 'absolute', bottom: 8, right: 9, color: 'var(--txt-dim)',
          opacity: hover ? 1 : 0.45, transition: 'opacity 0.14s', pointerEvents: 'none',
        }}
      />
    </div>
  );
}
