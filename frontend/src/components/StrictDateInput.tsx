import { useEffect, useRef, useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { maskDateInput, parseStrictDDMMYYYY, isoToDDMMYYYY, MIN_ISO_DATE, MAX_ISO_DATE } from '../lib/strictDate';

// Same masked-text-input + hidden-native-date-picker pattern as the "From"/"To" fields on
// Employee → My EOD History (pages/employee/EodHistory.tsx): manual typing is a plain DD-MM-YYYY
// text field validated by parseStrictDDMMYYYY (never a native <input type="date">'s own typing
// behavior, which some browsers silently normalize on an impossible date like 31 Feb), and the
// calendar icon opens a fully transparent native date input stacked on top purely to drive the
// popup — a picker selection is mirrored into the text field and funneled through the exact same
// parser, so typing and the picker can never disagree on what counts as valid.
//
// The component only calls `onChange` once text resolves to a genuine calendar date (or is
// cleared) — an invalid or incomplete edit is surfaced via `onInvalidChange` and never reaches
// the caller's committed value, mirroring EodHistory's own commit-only-when-valid behavior.

const BASE_STYLE: React.CSSProperties = {
  padding: '7px 10px',
  background: 'var(--shell)',
  border: '1px solid var(--line2)',
  borderRadius: 6,
  color: 'var(--txt)',
  fontSize: 12,
  outline: 'none',
  cursor: 'text',
  fontFamily: 'Inter, sans-serif',
};

export interface StrictDateInputProps {
  id?: string;
  /** Committed value as `YYYY-MM-DD`, or `''` when empty. */
  value: string;
  /** Called only when the typed/picked text resolves to a genuine calendar date, or is cleared. */
  onChange: (iso: string) => void;
  /** Called whenever the field's current text is not (yet) a valid, complete DD-MM-YYYY date. */
  onInvalidChange?: (invalid: boolean) => void;
  /** Bounds for the calendar picker, as `YYYY-MM-DD`. Defaults to the same 1900–2099 range as EOD History. */
  min?: string;
  max?: string;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  style?: React.CSSProperties;
}

export function StrictDateInput({
  id, value, onChange, onInvalidChange,
  min = MIN_ISO_DATE, max = MAX_ISO_DATE,
  ariaLabel, placeholder = 'DD-MM-YYYY', disabled, autoFocus, style,
}: StrictDateInputProps) {
  const [text, setText] = useState(value ? isoToDDMMYYYY(value) : '');
  const [invalid, setInvalid] = useState(false);
  // Tracks the last ISO value this component itself emitted, so an externally-driven reset of
  // `value` (e.g. the parent form clearing/reseeding on open) resyncs the visible text, without
  // clobbering the text the user is still mid-typing after this component's own onChange call.
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value !== lastEmitted.current) {
      setText(value ? isoToDDMMYYYY(value) : '');
      setInvalid(false);
      onInvalidChange?.(false);
      lastEmitted.current = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function commit(nextText: string) {
    const trimmed = nextText.trim();
    if (trimmed === '') {
      setInvalid(false);
      onInvalidChange?.(false);
      if (value !== '') {
        lastEmitted.current = '';
        onChange('');
      }
      return;
    }
    const iso = parseStrictDDMMYYYY(trimmed);
    if (iso === null) {
      setInvalid(true);
      onInvalidChange?.(true);
      return;
    }
    setInvalid(false);
    onInvalidChange?.(false);
    lastEmitted.current = iso;
    onChange(iso);
  }

  function handlePickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const iso = e.target.value;
    const ddmmyyyy = iso ? isoToDDMMYYYY(iso) : '';
    setText(ddmmyyyy);
    commit(ddmmyyyy);
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        maxLength={10}
        value={text}
        onChange={e => setText(maskDateInput(e.target.value))}
        onBlur={() => commit(text)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        disabled={disabled}
        autoFocus={autoFocus}
        style={{ ...BASE_STYLE, cursor: disabled ? 'not-allowed' : 'text', width: 128, paddingRight: 26, ...style }}
      />
      <div style={{
        position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
        color: 'var(--txt-dim)', display: 'flex', pointerEvents: 'none',
      }}>
        <CalendarIcon size={13} aria-hidden="true" />
      </div>
      <input
        type="date"
        min={min}
        max={max}
        value={value}
        onChange={handlePickerChange}
        tabIndex={-1}
        aria-label={ariaLabel ? `Pick ${ariaLabel} from calendar` : 'Pick date from calendar'}
        disabled={disabled}
        style={{
          position: 'absolute', right: 0, top: 0, width: 24, height: '100%', opacity: 0,
          cursor: disabled ? 'not-allowed' : 'pointer', border: 'none', padding: 0,
        }}
      />
    </div>
  );
}
