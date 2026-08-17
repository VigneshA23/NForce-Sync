import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface DropdownMenuItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** Text/icon accent color, e.g. 'var(--ok)' | 'var(--risk)' | 'var(--warn)'. */
  color?: string;
  onSelect: () => void;
  disabled?: boolean;
}

interface DropdownMenuProps {
  items: DropdownMenuItem[];
  align?: 'left' | 'right';
  ariaLabel?: string;
  /**
   * Controlled open state — pass both to let a parent coordinate multiple menus (e.g. a table
   * where opening one row's menu should close every other row's). Omit both to fall back to the
   * default uncontrolled behavior (each instance manages its own state independently).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Kebab (3-dot) trigger + menu panel. Shares the outside-click/Escape-close
 * pattern used by the profile dropdown and workspace search in Shell.tsx,
 * generalized so any row/toolbar can reuse it instead of hand-rolling popovers.
 */
export function DropdownMenu({ items, align = 'right', ariaLabel = 'Actions', open: openProp, onOpenChange }: DropdownMenuProps) {
  const isControlled = openProp !== undefined && onOpenChange !== undefined;
  const [openState, setOpenState] = useState(false);
  const open = isControlled ? openProp : openState;
  const setOpen = isControlled ? onOpenChange : setOpenState;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouse(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
          background: open ? 'var(--raised2)' : 'transparent',
          border: '1px solid transparent', color: 'var(--txt-mut)',
        }}
      >
        <MoreVertical size={16} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="nf-r-popover"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', [align]: 0,
            minWidth: 176, zIndex: 30, background: 'var(--panel)',
            border: '1px solid var(--line)', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)', overflow: 'hidden', padding: 4,
          }}
        >
          {items.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                role="menuitem"
                type="button"
                disabled={item.disabled}
                onClick={() => { setOpen(false); item.onSelect(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '8px 10px', borderRadius: 6, border: 'none', background: 'transparent',
                  color: item.color ?? 'var(--txt)', fontSize: 12, fontWeight: 500,
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  opacity: item.disabled ? 0.5 : 1, textAlign: 'left',
                }}
                onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = 'var(--raised2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                {Icon && <Icon size={14} aria-hidden="true" />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
