import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatDate } from '../lib/date';
import { focusNextOnEnter } from '../lib/formFocus';

/**
 * Calendar picker with a **toggling** icon: click opens, clicking the same icon
 * again closes.
 *
 * Deliberately not a native `<input type="date">`. The native control offers
 * `showPicker()` but no `hidePicker()`, and its own indicator light-dismisses on
 * pointerdown before any click handler runs — so a second click on the icon
 * closes and instantly reopens the panel, which reads to the user as "the
 * calendar won't close". There is no way to fix that from the outside, hence a
 * custom panel whose open state we own.
 *
 * Extracted from the Add-User form (previously `JoiningDatePicker`) so the
 * Submit-EOD entry-date field gets the same behaviour instead of a second copy.
 *
 * `value`/`onChange` speak `yyyy-MM-dd`; the box displays `DD-MM-YYYY` via the
 * shared `formatDate` helper. `min`/`max` take the same ISO shape and grey out
 * days beyond the range (string compare is safe on zero-padded ISO dates).
 */

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Quick-nav year range: covers existing employees' past joining dates plus future onboarding.
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 76 }, (_, i) => CURRENT_YEAR + 25 - i);

function formatDateDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return formatDate(iso);
}

/** Themed replacement for a native `<select>`: a compact button that opens a scrollable grid popover. Used for the quickNav month/year pickers so long option lists don't render as an unstyled native list. */
function GridDropdown({
  ariaLabel,
  items,
  selected,
  onSelect,
  popupWidth,
  columns,
  flex = '1 1 0',
}: {
  ariaLabel: string;
  items: { value: number; label: string }[];
  selected: number;
  onSelect: (value: number) => void;
  popupWidth: number;
  columns: number;
  flex?: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const selectedBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open) selectedBtnRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  const selectedLabel = items.find(i => i.value === selected)?.label ?? selected;

  return (
    <div ref={boxRef} style={{ position: 'relative', flex }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2,
          fontSize: 12, fontWeight: 600, color: 'var(--txt)', background: 'var(--panel)',
          border: '1px solid var(--line)', borderRadius: 5, padding: '2px 4px', cursor: 'pointer',
        }}
      >
        {selectedLabel}
        <ChevronDown size={11} style={{ flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, width: popupWidth,
          maxHeight: 168, overflowY: 'auto', background: 'var(--panel)', border: '1px solid var(--line)',
          borderRadius: 7, boxShadow: '0 8px 24px rgba(0,0,0,.3)', zIndex: 101, padding: 5,
          display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 3,
        }}>
          {items.map(item => {
            const isSelected = item.value === selected;
            return (
              <button
                type="button"
                key={item.value}
                ref={isSelected ? selectedBtnRef : undefined}
                onClick={() => { onSelect(item.value); setOpen(false); }}
                style={{
                  border: 'none', borderRadius: 4, cursor: 'pointer', padding: '4px 2px',
                  fontSize: 11.5, background: isSelected ? 'var(--brand)' : 'transparent',
                  color: isSelected ? '#fff' : 'var(--txt)',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--raised)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  inputStyle,
  placeholder = 'Select date',
  quickNav = false,
  clearable = false,
}: {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  /** Page-local input styling, so this matches whichever form it sits in. */
  inputStyle?: React.CSSProperties;
  placeholder?: string;
  /** Opt-in month/year dropdowns in the header, alongside the prev/next arrows. Off by default so existing call sites are unaffected. */
  quickNav?: boolean;
  /** Opt-in "X" to reset the field back to empty. Off by default — some call sites (e.g. EOD entry date) always need a real date and aren't safe to clear. */
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = value ? new Date(`${value}T00:00:00`) : new Date();
  const [viewYear, setViewYear]   = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());

  // Close on click outside — supplements select-to-close and icon-toggle-to-close.
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Close on Escape, matching what the native picker did.
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  function toggleOpen() {
    setOpen(o => {
      const next = !o;
      if (next) {
        const base = value ? new Date(`${value}T00:00:00`) : new Date();
        setViewYear(base.getFullYear());
        setViewMonth(base.getMonth());
      }
      return next;
    });
  }

  function isOutOfRange(iso: string): boolean {
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  }

  function selectDay(iso: string) {
    if (isOutOfRange(iso)) return;
    onChange(iso);
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    else if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          readOnly
          style={{ ...inputStyle, paddingRight: clearable && value ? 58 : 36, cursor: 'pointer' }}
          value={formatDateDisplay(value)}
          placeholder={placeholder}
          onClick={toggleOpen}
          onKeyDown={focusNextOnEnter}
        />
        {clearable && value && (
          <button
            type="button"
            aria-label="Clear date"
            onClick={() => onChange('')}
            style={{
              position: 'absolute', right: 28, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              display: 'flex', color: 'var(--txt-dim)', borderRadius: 4,
            }}
          >
            <X size={14} />
          </button>
        )}
        <button
          type="button"
          aria-label={open ? 'Close date picker' : 'Open date picker'}
          aria-expanded={open}
          onClick={toggleOpen}
          style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            display: 'flex', color: 'var(--txt-dim)', borderRadius: 4,
          }}
        >
          <Calendar size={15} />
        </button>
      </div>
      {open && (
        <div className="nf-r-popover" style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, width: 260,
          background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,.3)', zIndex: 100, padding: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-dim)', display: 'flex', padding: 4 }}>
              <ChevronLeft size={15} />
            </button>
            {quickNav ? (
              <div style={{ display: 'flex', gap: 4, minWidth: 0 }}>
                <GridDropdown
                  ariaLabel="Select month"
                  items={MONTH_LABELS.map((label, i) => ({ value: i, label: label.slice(0, 3) }))}
                  selected={viewMonth}
                  onSelect={setViewMonth}
                  popupWidth={110}
                  columns={3}
                />
                <GridDropdown
                  ariaLabel="Select year"
                  items={YEAR_OPTIONS.map(y => ({ value: y, label: String(y) }))}
                  selected={viewYear}
                  onSelect={setViewYear}
                  popupWidth={132}
                  columns={3}
                  flex="0 0 56px"
                />
              </div>
            ) : (
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
                {MONTH_LABELS[viewMonth]} {viewYear}
              </span>
            )}
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-dim)', display: 'flex', padding: 4 }}>
              <ChevronRight size={15} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {WEEKDAY_LABELS.map((w, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: 10, color: 'var(--txt-dim)', fontWeight: 600 }}>{w}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((day, i) => {
              if (day == null) return <div key={i} />;
              const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = iso === value;
              const disabled   = isOutOfRange(iso);
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => selectDay(iso)}
                  disabled={disabled}
                  style={{
                    aspectRatio: '1', border: 'none', borderRadius: 5,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontSize: 12, background: isSelected ? 'var(--brand)' : 'transparent',
                    color: isSelected ? '#fff' : 'var(--txt)',
                    opacity: disabled ? 0.3 : 1,
                  }}
                  onMouseEnter={e => { if (!isSelected && !disabled) e.currentTarget.style.background = 'var(--raised)'; }}
                  onMouseLeave={e => { if (!isSelected && !disabled) e.currentTarget.style.background = 'transparent'; }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
