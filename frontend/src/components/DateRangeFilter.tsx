import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { DatePicker } from './DatePicker';
import { KPI_GRID_STYLE } from '../lib/kpiGrid';
import { todayISO } from '../lib/date';
import {
  PRESET_LABELS, PRESET_ORDER, clampRange, formatRangeLabel, resolvePreset, sameRange,
} from '../lib/dateRange';
import type { DateRange, RangePreset } from '../lib/dateRange';
import { chipStyle, fieldStyle } from '../lib/uiStyles';

// Same theme-aware input box the other DatePicker call sites supply (DatePicker itself is unstyled).
const dateInputStyle: React.CSSProperties = { ...fieldStyle, width: 'auto' };

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
        return (
          <button
            key={p}
            type="button"
            className="nf-range-chip nf-chip"
            aria-pressed={active}
            onClick={() => selectPreset(p)}
            // Keeps a mouse click from focusing the chip (no focus ring after click); keyboard focus is unaffected.
            onMouseDown={e => e.preventDefault()}
            style={{ ...chipStyle(active), justifySelf: 'center' }}
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
