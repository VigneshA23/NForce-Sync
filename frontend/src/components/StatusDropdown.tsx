import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface StatusMeta { label: string; color: string; }

/** Generic version of the interactive status control from pages/lead/Blockers.tsx's
 *  StatusDropdown — extracted so a second status-driven feature (EOD Clarification) can reuse
 *  the exact same look/behavior without duplicating it or touching the Blockers page itself.
 *  Same custom open/close popover pattern as FilterDropdown, for the same reason Blockers' one
 *  used it: a native <select> can't reliably show a colored dot + checkmark per option. */
export function StatusDropdown<T extends string>({ status, options, meta, onChange, disabled }: {
  status: T;
  options: T[];
  meta: Record<T, StatusMeta>;
  onChange: (status: T) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { label, color } = meta[status];
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        aria-label="Status"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 12px 5px 10px', borderRadius: 20,
          fontSize: 12, fontWeight: 700, letterSpacing: '0.01em', color,
          background: `color-mix(in srgb, ${color} 16%, transparent)`,
          border: `1px solid color-mix(in srgb, ${color} 34%, transparent)`,
          whiteSpace: 'nowrap', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.7 : 1,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
        {label}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div className="nf-r-popover" style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, minWidth: 170,
            background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 6,
            boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
          }}>
            {options.map(opt => {
              const optMeta = meta[opt];
              const isSelected = opt === status;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => { onChange(opt); setOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                    padding: '7px 8px', borderRadius: 6, border: 'none',
                    background: isSelected ? `color-mix(in srgb, ${optMeta.color} 14%, transparent)` : 'transparent',
                    color: isSelected ? optMeta.color : 'var(--txt)',
                    fontSize: 12.5, fontWeight: isSelected ? 700 : 500, cursor: 'pointer',
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: optMeta.color, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{optMeta.label}</span>
                  {isSelected && <Check size={13} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Read-only counterpart — same pill styling, no interaction. Generic version of Blockers'
 *  StatusBadge, for the non-TL sides (Employee, PM) that can see status but not change it. */
export function StatusBadge<T extends string>({ status, meta }: { status: T; meta: Record<T, StatusMeta> }) {
  const { label, color } = meta[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, color,
      background: `color-mix(in srgb, ${color} 16%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}
