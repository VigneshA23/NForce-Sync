/**
 * Legacy plain-log entries: saved before line items existed (V110), they carry a free-text `logSummary`
 * and a `logTotalHours` but no `logLines`. The Daily Log form builds its breakdown from `logLines` only, so
 * these two fields have to be read straight off the loaded entry to be shown at all.
 */

export interface LegacyLog {
  /** The free-text summary exactly as saved; null when the entry has none. */
  summary: string | null;
  /** Hours logged for the day, always above 0. */
  hours: number;
}

/** The slice of an entry this needs — `logLines` may be an empty array or absent. */
export interface LegacyLogSource {
  entryForm?: string | null;
  logLines?: readonly unknown[] | null;
  logTotalHours?: number | null;
  logSummary?: string | null;
}

/**
 * The legacy summary and hours of a plain-log entry, or null when there is nothing legacy to show:
 * - not a plain-log entry (a structured entry has tasks, not a summary);
 * - it has line items — an empty array and an absent `logLines` both mean "none", so the entry is legacy;
 *   a non-empty one means the line items are the breakdown;
 * - 0 / null hours — a leave day, however much text sits in the summary.
 * A missing or empty summary does not make it null: the hours are still worth showing.
 */
export function legacyLogOf(entry: LegacyLogSource | null | undefined): LegacyLog | null {
  if (!entry || entry.entryForm !== 'PLAIN_LOG') return null;
  if (entry.logLines?.length) return null;
  const hours = Number(entry.logTotalHours ?? 0);
  if (!(hours > 0)) return null;
  return { summary: entry.logSummary ?? null, hours };
}
