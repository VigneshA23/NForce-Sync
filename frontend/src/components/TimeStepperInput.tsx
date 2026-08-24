import { useEffect, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

/**
 * Themed replacement for a native `<input type="time">`: separate HH/MM steppers with a
 * 12-hour AM/PM toggle, matching the dark crimson/charcoal design system instead of the
 * browser's own scrollable hour/minute list (see DatePicker.tsx for the same rationale
 * applied to `<input type="date">`).
 *
 * `value`/`onChange` speak 24-hour "HH:mm" — the same shape the Shift form already stores
 * and submits — so callers don't need to know this renders as 12-hour AM/PM underneath.
 */

interface TimeStepperInputProps {
  id?: string;
  value: string; // 24h "HH:mm"
  onChange: (value: string) => void;
  /** Used to build distinct aria-labels (e.g. "Start time hour") when a form has more than one. */
  label: string;
  /** Tightens internal spacing/padding for narrow layouts (e.g. side-by-side columns). Default rendering is unchanged when omitted. */
  compact?: boolean;
}

function parse24h(value: string): { hour12: number; minute: number; period: 'AM' | 'PM' } {
  const [hStr, mStr] = value.split(':');
  const h24 = Number(hStr) || 0;
  const minute = Number(mStr) || 0;
  const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour12, minute, period };
}

function to24h(hour12: number, minute: number, period: 'AM' | 'PM'): string {
  const h24 = (hour12 % 12) + (period === 'PM' ? 12 : 0);
  return `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

const chevronButtonStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 18, height: 13, padding: 0, border: 'none', background: 'transparent',
  color: 'var(--txt-dim)', cursor: 'pointer',
};

const chevronButtonStyleCompact: React.CSSProperties = { ...chevronButtonStyle, width: 14, height: 11 };

const numberBoxStyle: React.CSSProperties = {
  width: 26, textAlign: 'center', background: 'transparent', border: 'none',
  color: 'var(--txt)', fontSize: 15, fontFamily: 'inherit', fontWeight: 600, outline: 'none',
};

const numberBoxStyleCompact: React.CSSProperties = { ...numberBoxStyle, width: 18, fontSize: 13 };

// One HH or MM field: a typeable box plus an up/down chevron pair, wrapping at [min, max].
function NumberStepper({
  value, min, max, ariaLabel, onChange, compact,
}: {
  value: number; min: number; max: number; ariaLabel: string; onChange: (n: number) => void; compact?: boolean;
}) {
  const [text, setText] = useState(String(value).padStart(2, '0'));

  useEffect(() => { setText(String(value).padStart(2, '0')); }, [value]);

  function wrap(n: number): number {
    const span = max - min + 1;
    return min + (((n - min) % span) + span) % span;
  }

  function commit(raw: string) {
    const digits = raw.replace(/\D/g, '');
    if (digits === '') { setText(String(value).padStart(2, '0')); return; }
    const wrapped = wrap(Number(digits));
    onChange(wrapped);
    setText(String(wrapped).padStart(2, '0'));
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 1 : 2 }}>
      <input
        aria-label={ariaLabel}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={text}
        onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 2))}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          if (e.key === 'ArrowUp') { e.preventDefault(); onChange(wrap(value + 1)); }
          if (e.key === 'ArrowDown') { e.preventDefault(); onChange(wrap(value - 1)); }
        }}
        style={compact ? numberBoxStyleCompact : numberBoxStyle}
      />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <button type="button" aria-label={`Increase ${ariaLabel}`} onClick={() => onChange(wrap(value + 1))} style={compact ? chevronButtonStyleCompact : chevronButtonStyle}>
          <ChevronUp size={compact ? 10 : 12} aria-hidden="true" />
        </button>
        <button type="button" aria-label={`Decrease ${ariaLabel}`} onClick={() => onChange(wrap(value - 1))} style={compact ? chevronButtonStyleCompact : chevronButtonStyle}>
          <ChevronDown size={compact ? 10 : 12} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function TimeStepperInput({ id, value, onChange, label, compact }: TimeStepperInputProps) {
  const { hour12, minute, period } = parse24h(value);

  return (
    <div
      id={id}
      style={{
        display: 'flex', alignItems: 'center', gap: compact ? 4 : 8,
        background: 'var(--shell)', border: '1px solid var(--line2)', borderRadius: 6,
        padding: compact ? '6px 6px' : '7px 10px', boxSizing: 'border-box',
      }}
    >
      <NumberStepper
        value={hour12} min={1} max={12} ariaLabel={`${label} hour`} compact={compact}
        onChange={(h) => onChange(to24h(h, minute, period))}
      />
      <span style={{ color: 'var(--txt-mut)', fontWeight: 600, fontSize: compact ? 13 : 15 }}>:</span>
      <NumberStepper
        value={minute} min={0} max={59} ariaLabel={`${label} minute`} compact={compact}
        onChange={(m) => onChange(to24h(hour12, m, period))}
      />
      <div style={{ display: 'flex', marginLeft: 'auto', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--line2)' }}>
        {(['AM', 'PM'] as const).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={period === p}
            aria-label={`${label} ${p}`}
            onClick={() => onChange(to24h(hour12, minute, p))}
            style={{
              padding: compact ? '4px 6px' : '5px 10px', fontSize: compact ? 10 : 11, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: period === p ? 'var(--brand)' : 'transparent',
              color: period === p ? '#fff' : 'var(--txt-mut)',
            }}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
