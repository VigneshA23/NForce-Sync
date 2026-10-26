import { DatePicker } from './DatePicker';
import { CurrentMonthNote } from './CurrentMonthNote';
import { ReportRangePresets, RangeDayCount } from './ReportRangePresets';
import { todayISO } from '../lib/date';
import type { DateRange, ReportRangePreset } from '../lib/dateRange';
import { showsCurrentMonthNote } from '../lib/reportDefaultRange';

const inputStyle: React.CSSProperties = {
  background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 8,
  color: 'var(--txt)', fontSize: 12.5, padding: '7px 10px', width: '100%', boxSizing: 'border-box',
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--txt-dim)', textTransform: 'uppercase' }}>
      {children}
    </span>
  );
}

/**
 * Preset pills + From/To pickers + "N days" badge + helper note, as one block. For report pages that
 * keep the range as a single object (Project Utilization, Project Dashboard); the EOD report pages lay
 * the same pieces out inside their own filter grids. The parent owns `range` and `preset`
 * (see useReportPreset); `onRangeChange` fires on a manual edit of either date.
 *
 * Both ends are capped at today, From is bounded by To, and a date can only be cleared when `clearable`
 * is set — a page that needs a range at all times leaves it off.
 */
export function ReportDateRange({ range, preset, onPresetSelect, onRangeChange, clearable = false, pickFromFirst = false }: {
  range: DateRange;
  preset: ReportRangePreset;
  onPresetSelect: (preset: ReportRangePreset) => void;
  onRangeChange: (next: DateRange) => void;
  clearable?: boolean;
  /** Opt-in for a page whose Custom preset starts blank: "Select from/to date" placeholders, and To stays disabled until From is picked. */
  pickFromFirst?: boolean;
}) {
  const today = todayISO();
  const maxFrom = range.to !== '' ? range.to : today;

  return (
    <div>
      <ReportRangePresets active={preset} onSelect={onPresetSelect} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, maxWidth: 420 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>From *</FieldLabel>
          <DatePicker
            value={range.from} onChange={v => onRangeChange({ from: v, to: range.to })}
            max={maxFrom} inputStyle={inputStyle} quickNav clearable={clearable}
            placeholder={pickFromFirst ? 'Select from date' : undefined}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <FieldLabel>To *</FieldLabel>
            <RangeDayCount from={range.from} to={range.to} />
          </span>
          <DatePicker
            value={range.to} onChange={v => onRangeChange({ from: range.from, to: v })}
            min={range.from} max={today} inputStyle={inputStyle} quickNav clearable={clearable}
            placeholder={pickFromFirst ? 'Select to date' : undefined}
            disabled={pickFromFirst && range.from === ''}
          />
        </label>
      </div>
      {showsCurrentMonthNote(range) && <CurrentMonthNote />}
    </div>
  );
}
