import { describe, expect, it } from 'vitest';
import { legacyLogOf } from './dailyLogLegacy';

const legacy = { entryForm: 'PLAIN_LOG', logSummary: 'Worked on reports', logTotalHours: 8, logLines: [] };

describe('legacyLogOf', () => {
  it('returns the summary and hours of a legacy plain log', () => {
    expect(legacyLogOf(legacy)).toEqual({ summary: 'Worked on reports', hours: 8 });
  });

  it('is null for an entry with no entry at all', () => {
    expect(legacyLogOf(null)).toBeNull();
    expect(legacyLogOf(undefined)).toBeNull();
  });

  it('is null for a structured (project-grouped) entry, whatever its log fields hold', () => {
    expect(legacyLogOf({ ...legacy, entryForm: 'PROJECT_GROUPED' })).toBeNull();
  });

  it('is null when line items exist: they are the breakdown', () => {
    expect(legacyLogOf({ ...legacy, logLines: [{ categoryName: 'Meetings' }] })).toBeNull();
  });

  it('treats an empty logLines array and an absent logLines the same way: both are legacy', () => {
    expect(legacyLogOf({ ...legacy, logLines: [] })).toEqual({ summary: 'Worked on reports', hours: 8 });
    expect(legacyLogOf({ ...legacy, logLines: undefined })).toEqual({ summary: 'Worked on reports', hours: 8 });
    expect(legacyLogOf({ ...legacy, logLines: null })).toEqual({ summary: 'Worked on reports', hours: 8 });
  });

  it('keeps the hours when the summary is null or undefined', () => {
    expect(legacyLogOf({ ...legacy, logSummary: null })).toEqual({ summary: null, hours: 8 });
    expect(legacyLogOf({ ...legacy, logSummary: undefined })).toEqual({ summary: null, hours: 8 });
  });

  it('is null for 0 hours even with a summary: a leave day', () => {
    expect(legacyLogOf({ ...legacy, logTotalHours: 0 })).toBeNull();
  });

  it('is null for null / missing hours', () => {
    expect(legacyLogOf({ ...legacy, logTotalHours: null })).toBeNull();
    expect(legacyLogOf({ ...legacy, logTotalHours: undefined })).toBeNull();
  });

  it('keeps fractional hours', () => {
    expect(legacyLogOf({ ...legacy, logTotalHours: 7.5 })?.hours).toBe(7.5);
  });
});
