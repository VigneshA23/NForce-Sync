import { useRef } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

// ── Shared filter-row controls ───────────────────────────────────────────────
// Native <select> / <input> with an in-field "x" that appears only while the field has a value and
// resets just that one filter. Meant to sit in a `.nf-filter-grid` (index.css) so the row stretches to
// the full width of its container. Colours are tokens only; focus/hover live in `.nf-filter-*` rules in
// index.css so they follow the user's accent (--brand).

/** Row of filter controls: `count` picks the column template (first control, the search, is wider). */
export function FilterGrid({ count, children }: { count: 2 | 3 | 4; children: React.ReactNode }) {
  return <div className={`nf-filter-grid nf-filter-grid--n${count}`}>{children}</div>;
}

const CONTROL_BASE: React.CSSProperties = {
  width: '100%', height: 36, boxSizing: 'border-box',
  background: 'var(--shell)', border: '1px solid var(--line2)', borderRadius: 6,
  color: 'var(--txt)', fontSize: 13, fontWeight: 400, fontFamily: 'Inter, sans-serif',
  padding: '0 12px', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden',
};

function ClearButton({ label, onClick, right }: { label: string; onClick: () => void; right: number }) {
  return (
    <button
      type="button"
      className="nf-filter-clear"
      aria-label={`Clear ${label}`}
      title={`Clear ${label}`}
      onClick={onClick}
      style={{ right }}
    >
      <X size={13} aria-hidden="true" />
    </button>
  );
}

export function FilterSelect({ value, onChange, onClear, label, placeholder, children }: {
  value: string;
  onChange: (value: string) => void;
  /** Resets this filter to its "no filter" value. */
  onClear: () => void;
  /** Filter name, used for the aria-labels ("Filter by <label>" / "Clear <label>"). */
  label: string;
  /** Text of the empty option, shown while nothing is selected. */
  placeholder: string;
  children: React.ReactNode;
}) {
  const hasValue = value !== '';
  return (
    <div className="nf-filter-field">
      <select
        className="nf-filter-control nf-filter-select"
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={`Filter by ${label}`}
        // Right padding clears the chevron (and the x while a value is set) so long names ellipsize instead of running under them.
        style={{ ...CONTROL_BASE, appearance: 'none', cursor: 'pointer', paddingRight: hasValue ? 54 : 32 }}
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
      <ChevronDown size={14} aria-hidden="true" className="nf-filter-chevron" />
      {hasValue && <ClearButton label={label} onClick={onClear} right={26} />}
    </div>
  );
}

export function FilterSearch({ value, onChange, label, placeholder }: {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name for the field, e.g. "project name". The clear button is "Clear <label>". */
  label: string;
  placeholder: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="nf-filter-field">
      <Search size={13} aria-hidden="true" className="nf-filter-search-icon" />
      <input
        ref={inputRef}
        type="search"
        className="nf-filter-control"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={`Search ${label}`}
        style={{ ...CONTROL_BASE, paddingLeft: 30, paddingRight: value !== '' ? 32 : 12 }}
      />
      {value !== '' && (
        <ClearButton
          label={`search ${label}`}
          right={6}
          onClick={() => { onChange(''); inputRef.current?.focus(); }}
        />
      )}
    </div>
  );
}
