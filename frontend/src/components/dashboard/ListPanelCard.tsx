import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '../KpiCard';

/**
 * Shared chrome for a titled list/section panel: icon + title (+ optional count badge) on the
 * left, an optional "View all" link on the right, scrollable body below. Replaces the
 * hand-rolled `<Card pad={0}>` header pattern duplicated across the old per-role dashboards.
 */
export function ListPanelCard({
  title, icon: Icon, count, viewAllPath, viewAllLabel = 'View all', maxHeight = 300, children, style,
}: {
  title: string;
  icon?: LucideIcon;
  count?: number;
  viewAllPath?: string;
  viewAllLabel?: string;
  maxHeight?: number | 'none';
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <Card style={{ padding: 0, display: 'flex', flexDirection: 'column', ...style }}>
      <div style={{ padding: '12px 16px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
        {Icon && <Icon size={13} color="var(--txt-mut)" style={{ flexShrink: 0 }} aria-hidden="true" />}
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {title}
        </span>
        {count !== undefined && count > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
            background: 'color-mix(in srgb, var(--brand-bright) 14%, transparent)', color: 'var(--brand-bright)',
          }}>
            {count}
          </span>
        )}
        {viewAllPath && (
          <Link to={viewAllPath} style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
            color: 'var(--info)', fontSize: 11, fontWeight: 500, textDecoration: 'none',
          }}>
            {viewAllLabel} <ArrowRight size={11} />
          </Link>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: maxHeight === 'none' ? 'visible' : 'auto', maxHeight: maxHeight === 'none' ? undefined : maxHeight }}>
        {children}
      </div>
    </Card>
  );
}

/** One row inside a ListPanelCard — consistent left border, padding, hover-free static row. */
export function ListPanelRow({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding: '9px 16px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10, ...style }}>
      {children}
    </div>
  );
}

/** Standard empty-state body for a ListPanelCard. */
export function ListPanelEmpty({ children }: { children: ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '20px 16px', fontSize: 12, color: 'var(--txt-dim)' }}>
      {children}
    </div>
  );
}
