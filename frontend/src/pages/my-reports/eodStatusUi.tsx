import type { MemberEodStatus } from '../../api/teamLead';
import { STATUS_CFG, initialsOf } from './eodStatusConfig';

// Status pill + initials chip shared by the Team EOD Status list and detail page.

/** A dot + text pill in any status colour (text always carries the meaning, never colour alone). */
export function ColorPill({ color, label }: { color: string; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 999,
      background: `color-mix(in srgb, ${color} 16%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      color, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {label}
    </span>
  );
}

export function StatusPill({ status }: { status: MemberEodStatus }) {
  const { color, label } = STATUS_CFG[status];
  return <ColorPill color={color} label={label} />;
}

/** Initials chip, tinted by the member's status colour. */
export function StatusAvatar({ name, color, size = 32 }: { name: string; color: string; size?: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: `color-mix(in srgb, ${color} 22%, var(--raised2))`,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
        color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.34, fontWeight: 700,
      }}
    >
      {initialsOf(name)}
    </div>
  );
}
