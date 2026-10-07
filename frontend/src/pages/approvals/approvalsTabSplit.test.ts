import { describe, it, expect } from 'vitest';
import { splitPendingPieces } from './approvalsTabSplit';
import type { ApprovalPieceDto } from '../../api/approvalPieces';

function makePiece(overrides: Partial<ApprovalPieceDto>): ApprovalPieceDto {
  return {
    id: 1,
    eodEntryId: 100,
    employeeId: 10,
    employeeName: 'Test User',
    employeeCode: 'NF-TEST',
    projectId: null,
    projectName: null,
    approverId: null,
    approverName: null,
    approverType: 'LEAD',
    status: 'PENDING',
    frozenAt: '2026-10-01T09:00:00Z',
    actedAt: null,
    comment: null,
    entryDate: '2026-10-01',
    entryForm: 'PROJECT_GROUPED',
    logSummary: null,
    logTotalHours: null,
    logNotes: null,
    logLines: [],
    escalatedAt: null,
    escalatedToId: null,
    escalatedToName: null,
    hoursPending: null,
    dayType: null,
    workLocation: null,
    nextDayPlan: null,
    remarks: null,
    taskLines: [],
    ...overrides,
  };
}

const escalatedLeadPiece = makePiece({
  id: 1,
  approverType: 'LEAD',
  escalatedAt: '2026-10-01T12:00:00Z',
});

const pmTypePiece = makePiece({
  id: 2,
  approverType: 'PM',
  escalatedAt: null,
});

const nonEscalatedLeadPiece = makePiece({
  id: 3,
  approverType: 'LEAD',
  escalatedAt: null,
});

describe('splitPendingPieces', () => {
  // ── PM Approvals: no pending tab — all pieces go to escalated ────────────

  it('hasPendingTab=false: all pieces go to escalated, plain is empty', () => {
    const result = splitPendingPieces([escalatedLeadPiece, pmTypePiece], false);
    expect(result.escalated).toHaveLength(2);
    expect(result.plain).toHaveLength(0);
  });

  it('hasPendingTab=false: PM-type piece (no escalatedAt) lands in escalated', () => {
    const result = splitPendingPieces([pmTypePiece], false);
    expect(result.escalated).toContain(pmTypePiece);
  });

  it('hasPendingTab=false: empty input produces empty escalated and plain', () => {
    const result = splitPendingPieces([], false);
    expect(result.escalated).toHaveLength(0);
    expect(result.plain).toHaveLength(0);
  });

  // ── RM Approvals: has pending tab — split by LEAD+escalatedAt ────────────

  it('hasPendingTab=true: LEAD+escalatedAt goes to escalated, rest to plain', () => {
    const result = splitPendingPieces([escalatedLeadPiece, pmTypePiece, nonEscalatedLeadPiece], true);
    expect(result.escalated).toEqual([escalatedLeadPiece]);
    expect(result.plain).toContain(pmTypePiece);
    expect(result.plain).toContain(nonEscalatedLeadPiece);
  });

  it('hasPendingTab=true: PM piece without escalatedAt goes to plain', () => {
    const result = splitPendingPieces([pmTypePiece], true);
    expect(result.escalated).toHaveLength(0);
    expect(result.plain).toEqual([pmTypePiece]);
  });

  // ── Tab count consistency ──────────────────────────────────────────────────

  it('escalated.length + plain.length == input.length (no duplication)', () => {
    const pieces = [escalatedLeadPiece, pmTypePiece, nonEscalatedLeadPiece];
    const { escalated, plain } = splitPendingPieces(pieces, true);
    expect(escalated.length + plain.length).toBe(pieces.length);
  });
});
