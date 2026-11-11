import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

/**
 * Custom select — a styled button that opens a panel of options directly below it, instead of
 * relying on the browser's own (unstyleable, inconsistently positioned) native <select> list.
 * Same visual language everywhere it's used (Submit EOD's Day type/Work location/Project/Category,
 * the shared task Status field, Daily Log's Category) so every dropdown in the app looks and
 * behaves the same way.
 */
export function Dropdown({
  value, onChange, options, placeholder, disabled, readOnly, id, className, style,
  error, 'aria-required': ariaRequired,
}: {
  value: string;
  onChange: (next: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  id?: string;
  className?: string;
  style?: CSSProperties;
  error?: boolean;
  'aria-required'?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const selected = options.find(o => o.value === value);
  const isInert = disabled || readOnly;

  function toggleOpen() {
    if (isInert) return;
    setOpen(v => !v);
  }

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        id={id}
        onClick={toggleOpen}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={ariaRequired}
        aria-invalid={error ? true : undefined}
        className={`eod-form-field nf-dropdown-btn ${className ?? ''}`}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          width: '100%', boxSizing: 'border-box',
          padding: '10px 38px 10px 12px', minHeight: 44,
          color: selected ? 'var(--txt)' : 'var(--eod-placeholder)',
          fontSize: 14, textAlign: 'left', fontFamily: 'inherit',
          cursor: isInert ? (readOnly ? 'default' : 'not-allowed') : 'pointer',
          ...(error ? { borderColor: 'rgba(228,55,61,.6)' } : null),
          ...style,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
          {selected ? selected.label : (placeholder ?? 'Select…')}
        </span>
        {!readOnly && (
          <ChevronDown
            size={14} aria-hidden="true"
            style={{
              flexShrink: 0, color: 'var(--eod-placeholder)',
              transition: 'transform 120ms',
              transform: open ? 'rotate(180deg)' : 'none',
            }}
          />
        )}
      </button>

      {open && !isInert && (
        <div
          className="nf-r-popover"
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
            background: 'var(--eod-field-bg)', border: '1px solid var(--eod-field-border)', borderRadius: 10,
            boxShadow: '0 12px 28px rgba(0,0,0,.35)', overflow: 'hidden',
          }}
        >
          <div style={{ maxHeight: 240, overflowY: 'auto', padding: 4 }}>
            {options.length === 0 ? (
              <div style={{ padding: '10px 8px', fontSize: 12.5, color: 'var(--eod-placeholder)' }}>No options</div>
            ) : (
              options.map(o => {
                const isSelected = o.value === value;
                return (
                  <button
                    type="button"
                    key={o.value}
                    role="option"
                    aria-selected={isSelected}
                    disabled={o.disabled}
                    onClick={() => !o.disabled && pick(o.value)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 10px', borderRadius: 6, border: 'none',
                      background: isSelected ? 'color-mix(in srgb, var(--brand) 16%, transparent)' : 'transparent',
                      color: o.disabled ? 'var(--eod-placeholder)' : isSelected ? 'var(--brand-bright)' : 'var(--txt)',
                      fontSize: 13.5, fontWeight: isSelected ? 600 : 400,
                      cursor: o.disabled ? 'not-allowed' : 'pointer',
                    }}
                    onMouseEnter={e => { if (!isSelected && !o.disabled) e.currentTarget.style.background = 'var(--eod-dis-bg)'; }}
                    onMouseLeave={e => { if (!isSelected && !o.disabled) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {o.label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
