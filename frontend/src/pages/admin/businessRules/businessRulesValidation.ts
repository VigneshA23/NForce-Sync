import { extractApiError, extractFieldErrors, isHttpStatus } from '../../../api/admin';

// Client-side rules for the Shift and Holiday modals. They mirror what the backend enforces (CreateShiftRequest /
// CreateHolidayRequest and BusinessRuleService) so a mistake is caught before a request is sent; the server stays the
// authority and its own messages are shown inline when it disagrees (see serverErrorsFor).

/** Column lengths: shift_definition.name is 100, holiday.name is 200. */
export const MAX_SHIFT_NAME = 100;
export const MAX_HOLIDAY_NAME = 200;

export type ShiftField = 'name' | 'startTime' | 'endTime' | 'eodCutoffHours';
export type HolidayField = 'name' | 'holidayDate';

export interface ShiftFormValues {
  name: string;
  /** 24h "HH:mm". */
  start: string;
  end: string;
  /** Raw text of the EOD cutoff box; blank means "no deadline". */
  cutoff: string;
}

export interface HolidayFormValues {
  name: string;
  /** The date input's value: "YYYY-MM-DD", or "" when empty or only partly typed. */
  date: string;
  /** The date input reported text it could not turn into a date (validity.badInput). */
  dateBadInput?: boolean;
}

/** True for a real calendar date written YYYY-MM-DD (4-digit year, month and day in range). */
export function isRealIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

export function validateShift(v: ShiftFormValues): Partial<Record<ShiftField, string>> {
  const errors: Partial<Record<ShiftField, string>> = {};

  const name = v.name.trim();
  if (name === '') errors.name = 'Shift name is required.';
  else if (name.length > MAX_SHIFT_NAME) errors.name = `Shift name must be ${MAX_SHIFT_NAME} characters or fewer.`;

  if (!v.start) errors.startTime = 'Start time is required.';
  if (!v.end) errors.endTime = 'End time is required.';
  // An end before the start is a shift that crosses midnight (3:30 PM to 12:30 AM) and is valid; only an equal pair isn't.
  if (v.start && v.end && v.start === v.end) errors.endTime = 'End time must be different from start time.';

  const cutoff = v.cutoff.trim();
  if (cutoff !== '') {
    const hours = Number(cutoff);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      errors.eodCutoffHours = 'EOD cutoff must be between 0 and 24 hours.';
    }
  }
  return errors;
}

export function validateHoliday(v: HolidayFormValues): Partial<Record<HolidayField, string>> {
  const errors: Partial<Record<HolidayField, string>> = {};

  const name = v.name.trim();
  if (name === '') errors.name = 'Holiday name is required.';
  else if (name.length > MAX_HOLIDAY_NAME) errors.name = `Holiday name must be ${MAX_HOLIDAY_NAME} characters or fewer.`;

  if (v.dateBadInput) errors.holidayDate = 'Enter a valid date.';
  else if (v.date === '') errors.holidayDate = 'Date is required.';
  else if (!isRealIsoDate(v.date)) errors.holidayDate = 'Enter a valid date.';

  return errors;
}

export interface ServerErrors {
  /** Messages to show under the matching field. */
  fields: Record<string, string>;
  /** A message for the modal banner when nothing could be pinned to a field. */
  banner: string | null;
}

const FIELDS_BY_KIND = {
  shift: ['name', 'startTime', 'endTime', 'eodCutoffHours'],
  holiday: ['name', 'holidayDate'],
} as const;

/** The field a 409 duplicate belongs to: a shift's name, a holiday's date. */
const DUPLICATE_FIELD = { shift: 'name', holiday: 'holidayDate' } as const;

/**
 * Turns an API failure into inline field messages where it can, and one banner message where it can't. Uses the
 * backend's own wording, so the client and server never describe the same problem in two different ways.
 *
 * - 409 (duplicate shift name / holiday date): inline under that field.
 * - 400 with a `fields` map (bean validation): inline under each field it names; fields this form has no place for
 *   go to the banner.
 * - 400 "Start and end time cannot be the same": inline under End Time.
 * - anything else (network error, 5xx, an unexpected 4xx): the banner, with the server's message when it sent one.
 */
export function serverErrorsFor(kind: 'shift' | 'holiday', err: unknown, fallback: string): ServerErrors {
  const message = extractApiError(err, fallback);

  if (isHttpStatus(err, 409)) {
    return { fields: { [DUPLICATE_FIELD[kind]]: message }, banner: null };
  }

  const reported = extractFieldErrors(err);
  if (Object.keys(reported).length > 0) {
    const known: readonly string[] = FIELDS_BY_KIND[kind];
    const fields: Record<string, string> = {};
    const unplaced: string[] = [];
    for (const [field, msg] of Object.entries(reported)) {
      if (known.includes(field)) fields[field] = msg;
      else unplaced.push(msg);
    }
    return { fields, banner: unplaced.length > 0 ? unplaced.join(' ') : null };
  }

  if (kind === 'shift' && isHttpStatus(err, 400) && /start and end time/i.test(message)) {
    return { fields: { endTime: message }, banner: null };
  }

  return { fields: {}, banner: message };
}
