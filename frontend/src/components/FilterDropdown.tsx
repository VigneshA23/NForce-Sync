import { useState } from 'react';
import { ArrowUpDown, ChevronDown, ListFilter } from 'lucide-react';

// ── checkbox multi-select filter dropdown with a "Clear all" option ────────────
// Shared by Approvals and Team Lead Blockers so both pages behave identically:
// checking multiple options ORs within this filter, callers AND multiple filters
// together by chaining separate `.filter()` calls, one per dropdown.

export function FilterDropdown({ label, options, selected, onToggle, onClear, getLabel }: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  onClear: () => void;
  /** Displayed checkbox text for an option value — defaults to the value itself. Lets
   *  callers filter by a stable key (e.g. employee code) while showing a friendlier label
   *  (e.g. employee name) without changing how the filter itself works. */
  getLabel?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 500,
          background: selected.size ? 'color-mix(in srgb, var(--brand) 10%, var(--raised2))' : 'var(--raised2)',
          border: `1px solid ${selected.size ? 'rgba(177,17,22,.5)' : 'var(--line2)'}`,
          color: 'var(--txt)', cursor: 'pointer',
        }}
      >
        <ListFilter size={13} aria-hidden="true" />
        {label} {selected.size > 0 && `(${selected.size})`}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div className="nf-r-popover" style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, minWidth: 210,
            background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 10,
            boxShadow: '0 12px 28px rgba(0,0,0,0.35)', maxHeight: 260, overflowY: 'auto',
          }}>
            {selected.size > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                <button
                  onClick={onClear}
                  style={{ background: 'none', border: 'none', color: 'var(--brand-bright)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: '4px' }}
                >
                  Clear all
                </button>
              </div>
            )}
            {options.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--txt-dim)', padding: '6px 4px' }}>No options</div>
            )}
            {options.map(opt => (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--txt)', padding: '5px 4px', cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.has(opt)} onChange={() => onToggle(opt)} style={{ accentColor: 'var(--brand-bright)' }} />
                {getLabel ? getLabel(opt) : opt}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Toggle a value in/out of a Set-based filter, immutably. */
export function toggleFilterVal(set: Set<string>, setFn: (s: Set<string>) => void, val: string) {
  const next = new Set(set);
  if (next.has(val)) next.delete(val); else next.add(val);
  setFn(next);
}

// ── single-select sort dropdown — same button/panel styling as FilterDropdown above, but
// radio (exactly-one, always-selected) rather than checkbox (any-of, clearable). ─────────

export function SortDropdown<T extends string>({ label, options, value, onChange, defaultValue }: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** When set, shows a "Clear" option that resets sort back to this value — mirrors
   *  FilterDropdown's "Clear all", except sort always has some value selected. */
  defaultValue?: T;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 500,
          background: 'var(--raised2)', border: '1px solid var(--line2)',
          color: 'var(--txt)', cursor: 'pointer',
        }}
      >
        <ArrowUpDown size={13} aria-hidden="true" />
        {label}: {current?.label ?? ''}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div className="nf-r-popover" style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, minWidth: 180,
            background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 10,
            boxShadow: '0 12px 28px rgba(0,0,0,0.35)', maxHeight: 260, overflowY: 'auto',
          }}>
            {defaultValue !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                <button
                  onClick={() => { onChange(defaultValue); setOpen(false); }}
                  style={{ background: 'none', border: 'none', color: 'var(--brand-bright)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: '4px' }}
                >
                  Clear
                </button>
              </div>
            )}
            {options.map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--txt)', padding: '5px 4px', cursor: 'pointer' }}>
                <input
                  type="radio" name={label} checked={value === opt.value}
                  onChange={() => { onChange(opt.value); setOpen(false); }}
                  style={{ accentColor: 'var(--brand-bright)' }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
