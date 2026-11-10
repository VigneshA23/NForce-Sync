import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

/**
 * "Nothing here" message inside a card — mirrors NForce OneHR's `nf-dash-empty`: an inset box on
 * the raised surface with a dashed border, a round crimson icon, a bold title and a muted hint.
 *
 *   <EmptyState icon={CalendarX} title="No missed days" hint="Every working day this month has an EOD." />
 *
 * `tone` swaps the icon colour where the empty state is good news (e.g. var(--ok) for "All clear").
 * `action` renders on the right (a "Submit now" button, a "Clear filters" button).
 */
export function EmptyState({ icon: Icon = Inbox, title, hint, tone, action, style }: {
  icon?: LucideIcon;
  title: React.ReactNode;
  hint?: React.ReactNode;
  tone?: string;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const color = tone ?? 'var(--brand)';
  return (
    <div
      className="nf-empty"
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px',
        background: 'var(--raised)',
        border: '1px dashed var(--line2)',
        borderRadius: 13,
        ...style,
      }}
    >
      <span aria-hidden="true" style={{
        width: 36, height: 36, flexShrink: 0, borderRadius: '50%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color,
        background: `color-mix(in srgb, ${color} 13%, var(--panel))`,
      }}>
        <Icon size={17} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--txt)', lineHeight: 1.4 }}>{title}</div>
        {hint && <div style={{ fontSize: 12.5, color: 'var(--txt-mut)', lineHeight: 1.45, marginTop: 2 }}>{hint}</div>}
      </div>
      {action}
    </div>
  );
}
