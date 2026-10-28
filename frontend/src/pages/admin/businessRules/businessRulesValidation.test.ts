import { describe, expect, it } from 'vitest';
import {
  MAX_HOLIDAY_NAME, MAX_SHIFT_NAME, isRealIsoDate, serverErrorsFor, validateHoliday, validateShift,
} from './businessRulesValidation';

const okShift = { name: 'General', start: '09:00', end: '18:00', cutoff: '' };

describe('validateShift', () => {
  it('accepts a normal shift', () => {
    expect(validateShift(okShift)).toEqual({});
  });

  it('requires a name, and a name of only spaces counts as empty', () => {
    expect(validateShift({ ...okShift, name: '' }).name).toBe('Shift name is required.');
    expect(validateShift({ ...okShift, name: '    ' }).name).toBe('Shift name is required.');
  });

  it('measures the name after trimming: 100 characters pass, 101 do not', () => {
    expect(validateShift({ ...okShift, name: ` ${'a'.repeat(MAX_SHIFT_NAME)} ` }).name).toBeUndefined();
    expect(validateShift({ ...okShift, name: 'a'.repeat(MAX_SHIFT_NAME + 1) }).name)
      .toBe(`Shift name must be ${MAX_SHIFT_NAME} characters or fewer.`);
  });

  it('rejects an end equal to the start, under End Time', () => {
    expect(validateShift({ ...okShift, start: '09:00', end: '09:00' }).endTime)
      .toBe('End time must be different from start time.');
  });

  it('accepts an overnight shift (end earlier than start)', () => {
    expect(validateShift({ ...okShift, start: '15:30', end: '00:30' })).toEqual({});
  });

  it('flags a missing time (defensive: the stepper always holds one)', () => {
    expect(validateShift({ ...okShift, start: '' }).startTime).toBe('Start time is required.');
    expect(validateShift({ ...okShift, end: '' }).endTime).toBe('End time is required.');
  });

  it('allows a blank cutoff (no deadline) and 0 to 24, rejects the rest', () => {
    for (const ok of ['', '  ', '0', '3', '3.5', '24']) expect(validateShift({ ...okShift, cutoff: ok }).eodCutoffHours).toBeUndefined();
    for (const bad of ['-1', '24.5', '25', 'abc']) {
      expect(validateShift({ ...okShift, cutoff: bad }).eodCutoffHours).toBe('EOD cutoff must be between 0 and 24 hours.');
    }
  });
});

describe('validateHoliday', () => {
  const ok = { name: 'Independence Day', date: '2026-08-15' };

  it('accepts a normal holiday', () => {
    expect(validateHoliday(ok)).toEqual({});
  });

  it('requires a name (spaces only counts as empty) and a date', () => {
    expect(validateHoliday({ ...ok, name: '   ' }).name).toBe('Holiday name is required.');
    expect(validateHoliday({ ...ok, date: '' }).holidayDate).toBe('Date is required.');
  });

  it('measures the name after trimming: 200 pass, 201 do not', () => {
    expect(validateHoliday({ ...ok, name: 'a'.repeat(MAX_HOLIDAY_NAME) }).name).toBeUndefined();
    expect(validateHoliday({ ...ok, name: 'a'.repeat(MAX_HOLIDAY_NAME + 1) }).name)
      .toBe(`Holiday name must be ${MAX_HOLIDAY_NAME} characters or fewer.`);
  });

  it('calls a half-typed date (the input reports bad input) invalid, not just missing', () => {
    expect(validateHoliday({ ...ok, date: '', dateBadInput: true }).holidayDate).toBe('Enter a valid date.');
  });

  it('rejects a value that is not a real YYYY-MM-DD date', () => {
    for (const bad of ['2026-02-31', '2026-13-01', '15-08-2026', '202610-01-01', 'tomorrow']) {
      expect(validateHoliday({ ...ok, date: bad }).holidayDate).toBe('Enter a valid date.');
    }
  });
});

describe('isRealIsoDate', () => {
  it('knows leap years', () => {
    expect(isRealIsoDate('2028-02-29')).toBe(true);
    expect(isRealIsoDate('2026-02-29')).toBe(false);
  });
});

describe('serverErrorsFor', () => {
  const http = (status: number, data: Record<string, unknown>) => ({ response: { status, data } });

  it('puts a duplicate shift name under the name field, in the backend\'s words', () => {
    const r = serverErrorsFor('shift', http(409, { error: 'A shift with this name already exists' }), 'Failed to save shift.');
    expect(r).toEqual({ fields: { name: 'A shift with this name already exists' }, banner: null });
  });

  it('puts a duplicate holiday date under the date field', () => {
    const r = serverErrorsFor('holiday', http(409, { error: 'A holiday is already defined on this date' }), 'Failed to add holiday.');
    expect(r).toEqual({ fields: { holidayDate: 'A holiday is already defined on this date' }, banner: null });
  });

  it('maps bean-validation fields to inline messages', () => {
    const r = serverErrorsFor('shift', http(400, { error: 'Validation failed', fields: { name: 'size must be between 0 and 100' } }), 'x');
    expect(r).toEqual({ fields: { name: 'size must be between 0 and 100' }, banner: null });
  });

  it('sends a field this form has no place for to the banner', () => {
    const r = serverErrorsFor('holiday', http(400, { error: 'Validation failed', fields: { surprise: 'bad' } }), 'x');
    expect(r).toEqual({ fields: {}, banner: 'bad' });
  });

  it('puts "Start and end time cannot be the same" under End Time', () => {
    const r = serverErrorsFor('shift', http(400, { error: 'Start and end time cannot be the same' }), 'x');
    expect(r).toEqual({ fields: { endTime: 'Start and end time cannot be the same' }, banner: null });
  });

  it('shows anything else as a banner: the server\'s message when there is one, the fallback when there is not', () => {
    expect(serverErrorsFor('shift', http(500, { error: 'Shift not found' }), 'Failed to save shift.'))
      .toEqual({ fields: {}, banner: 'Shift not found' });
    expect(serverErrorsFor('shift', new Error('Network Error'), 'Failed to save shift.'))
      .toEqual({ fields: {}, banner: 'Failed to save shift.' });
  });
});
