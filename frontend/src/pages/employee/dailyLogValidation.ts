/**
 * Line-item rules for the Daily Log form, in one place so the required marker, the inline messages and the
 * submit-time validator can never drift apart. Mirrors the server (SaveEodLogLineRequest + PlainLogValidation):
 * the description is mandatory for everyone who uses this form — there is no role exception.
 */
export const MIN_DESC = 3;
export const MAX_DESC = 4000;
export const QUARTER = 0.25;
export const MAX_LINE_HOURS = 24;

export interface LineFields {
  key: number;
  categoryId: number | null;
  hours: number;
  description: string;
}

export type LineField = 'category' | 'hours' | 'description';

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
  const d = descriptionError(line.description);
  if (d) p.description = d;
  return p;
}

const FIELD_ORDER: LineField[] = ['category', 'hours', 'description'];

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
