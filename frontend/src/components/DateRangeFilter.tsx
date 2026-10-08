import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { DatePicker } from './DatePicker';
import { KPI_GRID_STYLE } from '../lib/kpiGrid';
import { todayISO } from '../lib/date';
import {
  PRESET_LABELS, PRESET_ORDER, clampRange, formatRangeLabel, resolvePreset, sameRange,
} from '../lib/dateRange';
import type { DateRange, RangePreset } from '../lib/dateRange';

// Same theme-aware input box the other DatePicker call sites supply (DatePicker itself is unstyled).
const dateInputStyle: React.CSSProperties = {
  background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 8,
  color: 'var(--txt)', fontSize: 12.5, padding: '7px 10px', boxSizing: 'border-box',
};

/**
 * Quick-preset chip bar (Today / Last 7 days / Last 30 days / This month) plus an optional Custom
 * From/To row. The parent owns the effective range (`value`) and is only notified when it actually
 * changes; the active chip is tracked here so custom dates that happen to match a preset still read
 * as "Custom". The parent should initialise `value` to `resolvePreset(defaultPreset)`.
 */
export function DateRangeFilter({
  value,
  onChange,
  maxDate,
  defaultPreset = 'thisMonth',
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Latest selectable date (`yyyy-MM-dd`); defaults to today. */
  maxDate?: string;
  defaultPreset?: RangePreset;
}) {
  const [preset, setPreset] = useState<RangePreset>(defaultPreset);
  const [hovered, setHovered] = useState<RangePreset | null>(null);
  // A cleared picker shows empty, but the effective range (and data) stays on the previous valid one.
  const [cleared, setCleared] = useState({ from: false, to: false });
  const max = maxDate ?? todayISO();

  function emit(next: DateRange) {
    if (!sameRange(next, value)) onChange(next);
  }

  function selectPreset(p: RangePreset) {
    setPreset(p);
    setCleared({ from: false, to: false });
    // Custom keeps whatever range is current; the pickers then refine it.
    if (p !== 'custom') emit(resolvePreset(p));
  }

  // Clearing only blanks the field; the range stays on the previous valid one until a date is picked.
  function editFrom(iso: string) {
    if (!iso) { setCleared(c => ({ ...c, from: true })); return; }
    setCleared(c => ({ ...c, from: false }));
    emit(clampRange({ from: iso, to: value.to }, 'from', max));
  }
  function editTo(iso: string) {
    if (!iso) { setCleared(c => ({ ...c, to: true })); return; }
    setCleared(c => ({ ...c, to: false }));
    emit(clampRange({ from: value.from, to: iso }, 'to', max));
  }

  return (
    // Same grid definition as the KPI tile row (KPI_GRID_STYLE) so each chip is centred over its tile.
    // The -1px margin offsets the surrounding Card's border so both grids share identical column edges.
    // .nf-range-grid swaps to a wrapping flex row at <=1024px, where the tile row stops being a wide grid.
    <div role="group" aria-label="Date range" className="nf-range-grid" style={{ ...KPI_GRID_STYLE, margin: '0 -1px', alignItems: 'center' }}>
      {PRESET_ORDER.map(p => {
        const active = preset === p;
        const isHover = hovered === p && !active;
        return (
          <button
            key={p}
            type="button"
            className="nf-range-chip"
            aria-pressed={active}
            onClick={() => selectPreset(p)}
            // Keeps a mouse click from focusing the chip (no focus ring after click); keyboard focus is unaffected.
            onMouseDown={e => e.preventDefault()}
            onMouseEnter={() => setHovered(p)}
            onMouseLeave={() => setHovered(null)}
            style={{
              justifySelf: 'center',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
              fontSize: 12.5, fontWeight: 500, lineHeight: 1, cursor: 'pointer',
              padding: '8px 14px', borderRadius: 999, whiteSpace: 'nowrap',
              border: `1px solid ${active ? 'var(--brand)' : 'var(--line2)'}`,
              background: active ? 'var(--brand)' : isHover ? 'var(--raised)' : 'transparent',
              color: active ? '#fff' : 'var(--txt-mut)',
              boxShadow: isHover ? '0 1px 3px rgba(0,0,0,.25)' : 'none',
              transition: 'background .15s, border-color .15s, color .15s',
            }}
          >
            {p === 'custom' && <CalendarDays size={14} aria-hidden="true" />}
            {PRESET_LABELS[p]}
          </button>
        );
      })}
      <div
        className="nf-range-label"
        aria-live="polite"
        style={{ justifySelf: 'center', whiteSpace: 'nowrap', fontSize: 12.5, color: 'var(--txt-mut)', fontVariantNumeric: 'tabular-nums' }}
      >
        {formatRangeLabel(value)}
      </div>

      {preset === 'custom' && (
        <div
          className="nf-range-custom"
          style={{ gridColumn: '1 / -1', justifySelf: 'start', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '0 21px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--txt-mut)' }}>From</span>
            <DatePicker value={cleared.from ? '' : value.from} onChange={editFrom} max={value.to} inputStyle={dateInputStyle} clearable />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--txt-mut)' }}>To</span>
            <DatePicker value={cleared.to ? '' : value.to} onChange={editTo} min={value.from} max={max} inputStyle={dateInputStyle} clearable />
          </div>
        </div>
      )}
    </div>
  );
}
