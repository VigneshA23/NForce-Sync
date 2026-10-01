import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { COUNTRY_CODES, flagEmoji } from '../lib/countryCodes';

/**
 * Compact country-dial-code picker — closed state is just a flag + code chip (e.g. "🇮🇳 +91"),
 * sized to sit flush beside a phone number input rather than as a dropdown of its own. Opens a
 * searchable popover (type a country name or code to filter) so ~20+ entries don't have to be
 * scrolled through one at a time.
 *
 * Shared by Profile's Primary and Emergency phone fields — one component, so every role's
 * Profile page gets the identical control rather than a per-page reimplementation.
 */
export function CountryCodeSelect({ value, onChange, ariaLabel }: {
  /** Current dial code, e.g. "+91". */
  value: string;
  onChange: (dialCode: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = COUNTRY_CODES.find(c => c.dialCode === value);

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

  useEffect(() => {
    if (!open) return;
    // Popover just mounted — focus the search box a beat later so the click that opened it
    // doesn't get swallowed by the input stealing focus mid-event.
    const id = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? COUNTRY_CODES.filter(c => c.name.toLowerCase().includes(q) || c.dialCode.includes(q))
    : COUNTRY_CODES;

  // Clearing the search here (rather than in an effect keyed off `open`) keeps this a plain
  // event-driven state update instead of a setState-in-effect cascade.
  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) setQuery('');
  }

  function pick(dialCode: string) {
    onChange(dialCode);
    setOpen(false);
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selected?.name}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          height: '100%', boxSizing: 'border-box',
          padding: '7px 8px', background: 'var(--raised)', border: '1px solid var(--line2)',
          borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        <span aria-hidden="true">{selected ? flagEmoji(selected.iso2) : '🏳️'}</span>
        <span>{value}</span>
        <ChevronDown size={12} aria-hidden="true" style={{ color: 'var(--txt-dim)', flexShrink: 0 }} />
      </button>

      {open && (
        <div className="nf-r-popover" style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50, width: 240,
          background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 10,
          boxShadow: '0 12px 28px rgba(0,0,0,.35)', overflow: 'hidden',
        }}>
          <div style={{ position: 'relative', padding: 8, borderBottom: '1px solid var(--line)' }}>
            <Search size={13} aria-hidden="true" style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-dim)' }} />
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search country or code…"
              style={{
                width: '100%', boxSizing: 'border-box', background: 'var(--raised2)',
                border: '1px solid var(--line2)', borderRadius: 6, padding: '6px 9px 6px 26px',
                fontSize: 12.5, color: 'var(--txt)', outline: 'none', fontFamily: 'Inter, sans-serif',
              }}
            />
          </div>
          {/* ~7 rows before scrolling (28px row + a hair of padding), per the "6-8 rows" ask. */}
          <div role="listbox" aria-label={ariaLabel} style={{ maxHeight: 208, overflowY: 'auto', padding: 4 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 8px', fontSize: 12, color: 'var(--txt-dim)' }}>No matches</div>
            ) : (
              filtered.map(c => {
                const isSelected = c.dialCode === value;
                return (
                  <button
                    type="button"
                    key={c.iso2}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => pick(c.dialCode)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '6px 8px', borderRadius: 6, border: 'none', textAlign: 'left',
                      background: isSelected ? 'color-mix(in srgb, var(--brand) 16%, transparent)' : 'transparent',
                      color: isSelected ? 'var(--brand-bright)' : 'var(--txt)',
                      fontSize: 12.5, fontWeight: isSelected ? 600 : 400, cursor: 'pointer',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--raised)'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span aria-hidden="true">{flagEmoji(c.iso2)}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    <span style={{ color: 'var(--txt-dim)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{c.dialCode}</span>
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
