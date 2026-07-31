import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDate } from '../lib/date';

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

function formatDateDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return formatDate(iso);
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  inputStyle,
  placeholder = 'Select date',
}: {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  /** Page-local input styling, so this matches whichever form it sits in. */
  inputStyle?: React.CSSProperties;
  placeholder?: string;
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
          style={{ ...inputStyle, paddingRight: 36, cursor: 'pointer' }}
          value={formatDateDisplay(value)}
          placeholder={placeholder}
          onClick={toggleOpen}
        />
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
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, width: 260,
          background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,.3)', zIndex: 100, padding: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-dim)', display: 'flex', padding: 4 }}>
              <ChevronLeft size={15} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
              {MONTH_LABELS[viewMonth]} {viewYear}
            </span>
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
