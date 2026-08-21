import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

interface MenuPosition {
  top: number;
  left: number;
}

/**
 * Kebab (3-dot) trigger + menu panel. Shares the outside-click/Escape-close
 * pattern used by the profile dropdown and workspace search in Shell.tsx,
 * generalized so any row/toolbar can reuse it instead of hand-rolling popovers.
 *
 * The panel renders through a portal into document.body and is positioned with
 * `fixed` coordinates computed from the trigger's own rect — so it is never
 * clipped by an ancestor's `overflow: hidden`/`auto` (e.g. a table's rounded-
 * corner wrapper) and isn't limited to a low ancestor z-index/stacking context.
 * It also flips to open upward when there isn't enough room below the trigger.
 */
export function DropdownMenu({ items, align = 'right', ariaLabel = 'Actions', open: openProp, onOpenChange }: DropdownMenuProps) {
  const isControlled = openProp !== undefined && onOpenChange !== undefined;
  const [openState, setOpenState] = useState(false);
  const open = isControlled ? openProp : openState;
  const setOpen = isControlled ? onOpenChange : setOpenState;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  // Recomputed every open (and on scroll/resize while open) from the trigger's live rect, rather
  // than once — the trigger can move under the menu (page scroll, a resize, an above-fold layout
  // shift) and a stale position would either drift off the button or restore the original clipping.
  function updatePosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const triggerRect = trigger.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    const menuWidth = menuRef.current?.offsetWidth ?? 176;

    const roomBelow = window.innerHeight - triggerRect.bottom;
    const openUpward = roomBelow < menuHeight + MENU_GAP + VIEWPORT_MARGIN && triggerRect.top > menuHeight + MENU_GAP + VIEWPORT_MARGIN;

    const top = openUpward
      ? triggerRect.top - menuHeight - MENU_GAP
      : triggerRect.bottom + MENU_GAP;

    let left = align === 'right' ? triggerRect.right - menuWidth : triggerRect.left;
    left = Math.min(Math.max(left, VIEWPORT_MARGIN), window.innerWidth - menuWidth - VIEWPORT_MARGIN);

    setPosition({ top, left });
  }

  // Runs before paint so the freshly-mounted (but still invisible) menu's real height feeds the
  // very first position calc — otherwise the initial render would use the height fallback above
  // and visibly jump once the true size is known.
  useLayoutEffect(() => {
    if (!open) { setPosition(null); return; }
    updatePosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    function onMouse(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current && !menuRef.current.contains(target)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onReposition() { updatePosition(); }
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
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

      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="nf-r-popover"
          style={{
            position: 'fixed',
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            visibility: position ? 'visible' : 'hidden',
            minWidth: 176, zIndex: 1000, background: 'var(--panel)',
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
        </div>,
        document.body
      )}
    </>
  );
}
