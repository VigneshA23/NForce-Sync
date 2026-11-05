import { X } from 'lucide-react';

/**
 * A filter dropdown with an inline ✕ to clear it, mirroring the DatePicker's clearable control.
 *
 * <p>The placeholder option ("Select Project…") is deliberately `disabled` so it reads as a label
 * rather than a value — which left no way to undo a single filter once chosen, short of resetting
 * them all. A ✕ sitting in the control solves that without adding a pseudo-option to the list,
 * where the OS-drawn menu would render it as just another value.
 *
 * The button sits left of the select's chevron (native arrow or selectStyle's drawn one), and the select gains right padding while it is shown
 * so a long option label can never run underneath it.
 */
export function FilterSelect({
  value, onChange, style, label, children, disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Page-local select styling, so this matches whichever filter bar it sits in. */
  style?: React.CSSProperties;
  /** Names the field for assistive tech, e.g. "project" -> "Clear project". */
  label: string;
  children: React.ReactNode;
  /** Blocks interaction while a dependency (e.g. a parent dropdown) hasn't been chosen yet. */
  disabled?: boolean;
}) {
  const isSet = value !== '';

  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{
          ...style, paddingRight: isSet ? 54 : style?.paddingRight,
          opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : style?.cursor,
        }}
      >
        {children}
      </select>
      {isSet && !disabled && (
        <button
          type="button"
          aria-label={`Clear ${label}`}
          title={`Clear ${label}`}
          onClick={() => onChange('')}
          style={{
            position: 'absolute', right: 30, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 3,
            display: 'flex', color: 'var(--txt-dim)', borderRadius: 4,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--txt)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--txt-dim)')}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
