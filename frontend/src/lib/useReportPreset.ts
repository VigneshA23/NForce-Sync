import { useState } from 'react';
import { resolveReportPreset, type DateRange, type ReportRangePreset } from './dateRange';
import { initialReportRange } from './reportDefaultRange';

/**
 * Preset-pill state shared by every report page (This week / This month / Last month / Custom), so they
 * all behave identically. The page keeps its own filter state and hands in `applyRange` to write From/To:
 * - `onPresetSelect` fills From/To (Custom leaves the dates alone);
 * - `noteRangeEdit` is called with the old and new range on every filter change and flips the pill to
 *   Custom when a date was edited by hand (other filters leave the pill as it was);
 * - `reset` returns the pill to This month and the dates to the 1st of the month → today.
 */
export function useReportPreset(applyRange: (range: DateRange) => void) {
  const [preset, setPreset] = useState<ReportRangePreset>('thisMonth');

  function onPresetSelect(p: ReportRangePreset) {
    setPreset(p);
    if (p === 'custom') return;
    applyRange(resolveReportPreset(p));
  }

  function noteRangeEdit(prev: DateRange, next: DateRange) {
    if (prev.from !== next.from || prev.to !== next.to) setPreset('custom');
  }

  function reset() {
    setPreset('thisMonth');
    applyRange(initialReportRange());
  }

  return { preset, onPresetSelect, noteRangeEdit, reset };
}
