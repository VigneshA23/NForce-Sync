/**
 * Line-item rules for the Daily Log form, in one place so the required marker, the inline messages and the
 * submit-time validator can never drift apart. Mirrors the server (SaveEodLogLineRequest + PlainLogValidation):
 * the description is mandatory for everyone who uses this form — there is no role exception.
 */
import { blockerReasonMessage, statusMissingMessage } from '../../components/taskStatus/taskStatus';

export const MIN_DESC = 3;
export const MAX_DESC = 4000;
export const QUARTER = 0.25;
export const MAX_LINE_HOURS = 24;

export interface LineFields {
  key: number;
  categoryId: number | null;
  hours: number;
  description: string;
  /** COMPLETED / IN_PROGRESS / BLOCKED / NOT_STARTED, or empty while none is chosen (a draft may; a submit may not). */
  taskStatus: string;
  /** Why it is blocked — required once the status is Blocked. */
  blockerReason: string;
}

export type LineField = 'category' | 'hours' | 'description' | 'status' | 'blockerReason';

/** null when the description is acceptable; otherwise the message to show inline. */
export function descriptionError(description: string): string | null {
  const len = description.trim().length;
  if (len === 0) return `Description is required (min ${MIN_DESC} characters)`;
  if (len < MIN_DESC) return `Minimum ${MIN_DESC} characters required`;
  if (len > MAX_DESC) return `Description must be ${MAX_DESC} characters or fewer`;
  return null;
}

/** Per-field problems of one line, keyed in the order they appear on the row. Empty object = valid. */
export function lineProblems(line: LineFields): Partial<Record<LineField, string>> {
  const p: Partial<Record<LineField, string>> = {};
  if (line.categoryId == null) p.category = 'Select a category';
  if (!(line.hours >= QUARTER && line.hours <= MAX_LINE_HOURS)) p.hours = 'Hours must be between 0.25 and 24';
  if (!line.taskStatus) p.status = 'Status is required';
  if (line.taskStatus === 'BLOCKED' && !line.blockerReason.trim()) p.blockerReason = 'Blocker reason is required when status is Blocked';
  const d = descriptionError(line.description);
  if (d) p.description = d;
  return p;
}

const FIELD_ORDER: LineField[] = ['category', 'hours', 'description', 'status', 'blockerReason'];

/** The first invalid row and the first invalid control inside it, or null when every line is valid. */
export function firstInvalidLine(lines: LineFields[]): { key: number; field: LineField } | null {
  for (const line of lines) {
    const problems = lineProblems(line);
    const field = FIELD_ORDER.find(f => problems[f] != null);
    if (field) return { key: line.key, field };
  }
  return null;
}

/** DOM id of a line's control, used to scroll to and focus the first invalid one. */
export const lineFieldId = (key: number, field: LineField) => `dl-line-${key}-${field}`;

/** Drafts are saved with the same line rules today, so a description problem blocks Save draft; say so. */
export function draftErrorMessage(serverMessage: string): string {
  return /description/i.test(serverMessage) ? `Can't save draft yet — ${serverMessage}` : serverMessage;
}

/**
 * Why a draft cannot be saved right now because of a row with no category, or null. The server stores a line's
 * category in a NOT NULL column, so such a draft is rejected; the row is never dropped from the payload (the user
 * would lose what they typed unnoticed) — they are told which row needs a category instead.
 */
export function draftBlockReason(lines: LineFields[]): string | null {
  const i = lines.findIndex(l => l.categoryId == null);
  return i < 0 ? null : `Row ${i + 1} has no category — pick one so the draft can be saved.`;
}

/**
 * Rows whose category is not in the list the server offered for this entry date. The server picks the list
 * (Bench Log or Daily Log categories, by who you are and the date), so a category carried over from another
 * date — Copy yesterday, a draft whose category was since deactivated — may no longer be allowed. Returns the
 * 0-based row indexes; the form clears those rows' category so a stale one is never submitted.
 */
export function staleCategoryRows(lines: LineFields[], allowedCategoryIds: number[]): number[] {
  const allowed = new Set(allowedCategoryIds);
  const stale: number[] = [];
  lines.forEach((l, i) => { if (l.categoryId != null && !allowed.has(l.categoryId)) stale.push(i); });
  return stale;
}

/** The inline notice shown after stale categories were cleared; null when nothing was cleared. */
export function clearedCategoriesNotice(rowIndexes: number[]): string | null {
  if (rowIndexes.length === 0) return null;
  const rows = rowIndexes.map(i => i + 1).join(', ');
  return `${rowIndexes.length === 1 ? `Row ${rows}'s category isn't` : `Rows ${rows}'s categories aren't`} `
    + 'available for this date, so '
    + `${rowIndexes.length === 1 ? 'it was' : 'they were'} cleared. Pick one from the list.`;
}

// ── Bench Working day: lines + time adjustment = the bench day (8.0) ──────────
// Mirrors EodService.validatePlainLog / BenchModePolicy.workingDayHoursError. The bench day length is NOT kept
// here: the server sends it (capabilities.benchDailyHours, from BenchModePolicy.BENCH_WORKING_DAY_HOURS) so moving
// it is a one-line server change. The fallback below is only for a server that does not send it yet.
// Hours are quarter-hour integers, so 7.5 + 0.5 is exactly 8 and never 7.999999 — the server compares exact
// values too. A time adjustment counts as logged time, so the lines must total the day MINUS the adjustment.

export const DEFAULT_BENCH_DAILY_HOURS = 8;
const quarters = (hours: number) => Math.round(hours / QUARTER);

/** Whether the bench rule applies to what is on screen. Leave-marked, half-leave, Leave, Holiday and Weekend are exempt. */
export function benchHoursRuleApplies(benchMode: boolean, dayType: string, isLeaveMarked: boolean): boolean {
  return benchMode && dayType === 'WORKING_DAY' && !isLeaveMarked;
}

/** The hours the lines must total: the bench day less the adjustment (7.0 for 8.0 and a 60-minute adjustment). */
export function benchTargetHours(benchDailyHours: number, adjustmentMinutes: number): number {
  return Math.round((benchDailyHours * 60 - adjustmentMinutes) / 15) * QUARTER;
}

/** null when the lines total exactly the target, otherwise the inline message (also why Submit is disabled). */
export function benchHoursMessage(lines: { hours: number }[], targetHours: number, adjustmentMinutes = 0): string | null {
  const q = lines.reduce((s, l) => s + quarters(l.hours), 0);
  if (q === quarters(targetHours)) return null;
  const current = (q * QUARTER).toFixed(2);
  return adjustmentMinutes > 0
    ? `Bench Daily Log must total exactly ${targetHours.toFixed(1)} hrs with your time adjustment of ${adjustmentMinutes} minutes (currently ${current} hrs).`
    : `Bench Daily Log must total exactly ${targetHours.toFixed(1)} hrs (currently ${current} hrs).`;
}

/** Highest value this line may take so the total cannot pass the target: target minus the other lines, never below one step. */
export function maxBenchLineHours(lines: { key: number; hours: number }[], key: number, targetHours: number): number {
  const others = lines.filter(l => l.key !== key).reduce((s, l) => s + quarters(l.hours), 0);
  return Math.max(QUARTER, (quarters(targetHours) - others) * QUARTER);
}
/** Shown when the server returns no categories for this date. Bench Log users have no Org Masters to go to. */
export function noCategoriesMessage(benchMode: boolean): { lead: string; admin?: string; tail?: string } {
  return benchMode
    ? { lead: 'No Bench Log categories are configured. Please contact your administrator.' }
    : { lead: 'No categories configured. Go to ', admin: 'Org Masters → Task Categories',
        tail: ' and add categories with scope "Management".' };
}

/**
 * The "Row n: …" lines for the submit banner — a missing Status and a Blocked line with no reason, worded exactly as
 * the server's (and Submit EOD's) messages, with "Row" for the noun. Empty when every line is fine.
 */
export function statusProblemMessages(lines: LineFields[]): string[] {
  const out: string[] = [];
  lines.forEach((l, i) => {
    const missing = statusMissingMessage('Row', i + 1, l.taskStatus);
    if (missing) out.push(missing);
    const reason = blockerReasonMessage('Row', i + 1, l.taskStatus, l.blockerReason);
    if (reason) out.push(reason);
  });
  return out;
}
