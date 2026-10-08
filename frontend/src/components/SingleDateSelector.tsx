import { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { DatePicker } from './DatePicker';

// Single-day counterpart of DateRangeSelector: Yesterday / Today quick picks plus one calendar
// input. There is deliberately no range option — the Team EOD Status page is a one-day snapshot.
// The caller owns the committed date (this page keeps it in the URL); this component only owns
// whether the popover is open.

export function SingleDateSelector({
  date, todayISO, yesterdayISO, label, onChange,
}: {
  date: string;
  todayISO: string;
  yesterdayISO: string;
  /** Pre-formatted trigger text, e.g. "Today, 8 Oct 2026". */
  label: string;
  onChange: (iso: string) => void;
}) {
  const [open, setOpen] = useState(false);

  function commit(iso: string) {
    // Defensive: DatePicker already greys out days past `max` and isn't clearable here.
    if (!iso || iso > todayISO) return;
    onChange(iso);
    setOpen(false);
  }

  const quickStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
    background: active ? 'var(--info)' : 'var(--raised2)',
    color: active ? '#fff' : 'var(--txt)',
    border: '1px solid var(--line2)',
  });

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '9px 14px', fontSize: 12.5, fontWeight: 600,
          color: 'var(--txt)', background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        <Calendar size={13} aria-hidden="true" />
        {label}
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div className="nf-r-popover" role="dialog" aria-label="Choose a date" style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, minWidth: 240,
            background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 14,
            boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
          }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button onClick={() => commit(yesterdayISO)} style={quickStyle(date === yesterdayISO)}>Yesterday</button>
              <button onClick={() => commit(todayISO)} style={quickStyle(date === todayISO)}>Today</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Pick a date
            </div>
            <DatePicker
              value={date}
              max={todayISO}
              onChange={commit}
              quickNav
              inputStyle={{
                width: '100%', padding: '7px 8px', fontSize: 12, borderRadius: 6, boxSizing: 'border-box',
                background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)',
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
