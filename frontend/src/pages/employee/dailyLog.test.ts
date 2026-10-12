import { describe, expect, it } from 'vitest';
import { computeSubmissionWindow } from './useSubmissionWindow';
import { pieceText } from './dailyLogStatus';
import type { CutoffStatus } from '../../api/employee';
import type { ApprovalPieceDto } from '../../api/approvalPieces';

// The server says it is 7:30 PM on 12 Oct and the cutoff is 9:00 PM (a shift end + its cutoff hours).
const base: CutoffStatus = {
  today: '2026-10-12', entryStatus: null, cutoffPassed: false,
  cutoffTime: '21:00:00', cutoffNextDay: false, serverNow: '2026-10-12T19:30:00',
};
const FETCHED = 1_000_000;   // an arbitrary browser timestamp for "when the response arrived"
const win = (c: Partial<CutoffStatus>, elapsedMs = 0, active = true) =>
  computeSubmissionWindow({ ...base, ...c }, FETCHED, FETCHED + elapsedMs, active).state;

describe('submission window (counted from the server clock)', () => {
  it('open: "Closes 9:00 PM · 1h 30m left"', () => {
    expect(win({})).toEqual({ kind: 'open', minutesLeft: 90, urgent: false, closesAt: '9:00 PM', nextDay: false });
  });

  it('goes amber (urgent) under an hour', () => {
    expect(win({ serverNow: '2026-10-12T20:15:00' })).toMatchObject({ kind: 'open', minutesLeft: 45, urgent: true });
    expect(win({ serverNow: '2026-10-12T20:00:00' })).toMatchObject({ minutesLeft: 60, urgent: false });
  });

  it('adds only the time elapsed since the response — never the browser clock itself', () => {
    // The browser clock is wildly wrong (FETCHED is "1970"), but only the 10 minutes since the fetch count.
    expect(win({}, 10 * 60_000)).toMatchObject({ kind: 'open', minutesLeft: 80 });
  });

  it('closes at the cutoff, with no negative countdown', () => {
    expect(win({ serverNow: '2026-10-12T20:55:00' }, 5 * 60_000)).toEqual({ kind: 'closed', closesAt: '9:00 PM' });
    expect(win({ serverNow: '2026-10-12T22:00:00' })).toEqual({ kind: 'closed', closesAt: '9:00 PM' });
  });

  it('stays closed when the server already reported it passed', () => {
    expect(win({ cutoffPassed: true, serverNow: '2026-10-12T19:30:00' })).toMatchObject({ kind: 'closed' });
  });

  it('a shift crossing midnight counts to the cutoff on the NEXT day, and labels it so', () => {
    const night = { cutoffTime: '03:30:00', cutoffNextDay: true, serverNow: '2026-10-12T23:30:00' };
    expect(win(night)).toEqual({ kind: 'open', minutesLeft: 240, urgent: false, closesAt: '3:30 AM', nextDay: true });
  });

  it('no chip when there is no shift / cutoff, or when the page is not showing today', () => {
    expect(win({ cutoffTime: null })).toEqual({ kind: 'none' });
    expect(win({}, 0, false)).toEqual({ kind: 'none' });
    expect(computeSubmissionWindow(undefined, FETCHED, FETCHED, true).state).toEqual({ kind: 'none' });
  });

  it('timer remainder is exposed so the hook can stop at the exact close', () => {
    expect(computeSubmissionWindow(base, FETCHED, FETCHED, true).remainingMs).toBe(90 * 60_000);
  });
});

const piece = (over: Partial<ApprovalPieceDto>): ApprovalPieceDto => ({
  id: 1, eodEntryId: 1, employeeId: 1, employeeName: 'E', employeeCode: 'NF-1', projectId: null, projectName: null,
  approverId: 2, approverName: 'Naveen', approverType: 'REPORTING_MANAGER', status: 'PENDING', frozenAt: null,
  actedAt: null, comment: null, entryDate: '2026-10-12', entryForm: 'PLAIN_LOG', logSummary: null, logTotalHours: null,
  logNotes: null, logLines: [], escalatedAt: null, escalatedToId: null, escalatedToName: null, hoursPending: null,
  dayType: null, workLocation: null, nextDayPlan: null, remarks: null, taskLines: [], ...over,
} as ApprovalPieceDto);

describe('approval status line text — nothing the old Approval card said is lost', () => {
  it('a single reporting-manager piece reads "Reporting Manager: Name · Pending"', () => {
    expect(pieceText(piece({}))).toBe('Reporting Manager: Naveen · Pending');
  });

  it('carries approved and rejected statuses', () => {
    expect(pieceText(piece({ status: 'APPROVED' }))).toBe('Reporting Manager: Naveen · Approved');
    expect(pieceText(piece({ status: 'REJECTED' }))).toBe('Reporting Manager: Naveen · Rejected');
  });

  it('a group / no-reviewer entry names the group', () => {
    expect(pieceText(piece({ approverId: null, approverName: null, approverType: 'ADMIN_GROUP' }))).toBe('Admin Group · Pending');
  });

  it('an auto-approved entry says so, with no reviewer or pending status', () => {
    expect(pieceText(piece({ approverId: null, approverName: null, approverType: 'AUTO_APPROVED', status: 'APPROVED' }))).toBe('Auto-approved');
  });

  it('leads and PMs are named by capacity', () => {
    expect(pieceText(piece({ approverType: 'LEAD', approverName: 'Vignesh' }))).toBe('Team Lead: Vignesh · Pending');
    expect(pieceText(piece({ approverType: 'PM', approverName: 'Dheeraj' }))).toBe('Project Manager: Dheeraj · Pending');
  });
});
