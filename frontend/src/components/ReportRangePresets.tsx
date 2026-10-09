import {
  REPORT_PRESET_LABELS, REPORT_PRESET_ORDER, daysInRange, formatDayCount, type ReportRangePreset,
} from '../lib/dateRange';

/**
 * Preset buttons for the Super Admin EOD Reports date range (This week / This month / Last month /
 * Custom). Presentational only: the page owns which preset is active, because "Custom" depends on
 * whether the dates were edited by hand. Styled like the page's own tab pills — existing tokens only.
 * Not DateRangeFilter, which draws its buttons from the shared PRESET_ORDER used by other pages.
 */
export function ReportRangePresets({ active, onSelect }: {
  active: ReportRangePreset;
  onSelect: (preset: ReportRangePreset) => void;
}) {
  return (
    <div role="group" aria-label="Date range presets" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      {REPORT_PRESET_ORDER.map(p => {
        const on = p === active;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onSelect(p)}
            aria-pressed={on}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${on ? 'var(--brand)' : 'var(--line2)'}`,
              background: on ? 'var(--brand)' : 'var(--raised2)',
              color: on ? '#fff' : 'var(--txt-dim)',
            }}
          >
            {REPORT_PRESET_LABELS[p]}
          </button>
        );
      })}
    </div>
  );
}

/** "9 days" beside the date fields — inclusive of both ends; renders nothing for a blank or backwards range. */
export function RangeDayCount({ from, to }: { from: string; to: string }) {
  const days = daysInRange({ from, to });
  if (days === 0) return null;
  return (
    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--txt-dim)', whiteSpace: 'nowrap' }}>
      {formatDayCount(days)}
    </span>
  );
}
