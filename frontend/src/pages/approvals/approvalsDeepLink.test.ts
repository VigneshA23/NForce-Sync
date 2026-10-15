import { describe, expect, it } from 'vitest';
import type { ApprovalPieceDto } from '../../api/approvalPieces';
import { pageOfPiece, parseApprovalsDeepLink, resolveApprovalsDeepLink } from './approvalsDeepLink';

const piece = (id: number, employeeId: number): ApprovalPieceDto =>
  ({ id, employeeId, employeeCode: `E${employeeId}`, employeeName: `Emp ${employeeId}` }) as ApprovalPieceDto;

describe('parseApprovalsDeepLink — direct page load', () => {
  it('reads the query string exactly as a browser location.search delivers it', () => {
    expect(parseApprovalsDeepLink('?employeeId=30&highlight=55&date=2026-10-13'))
      .toEqual({ employeeId: 30, pieceId: 55, date: '2026-10-13' });
  });

  it('also accepts URLSearchParams (in-app navigation via useSearchParams)', () => {
    expect(parseApprovalsDeepLink(new URLSearchParams('employeeId=30&highlight=55')))
      .toEqual({ employeeId: 30, pieceId: 55, date: null });
  });

  it('no params, or an incomplete / malformed set → not a deep link (page opens normally)', () => {
    expect(parseApprovalsDeepLink('')).toBeNull();
    expect(parseApprovalsDeepLink('?highlight=55')).toBeNull();
    expect(parseApprovalsDeepLink('?employeeId=30')).toBeNull();
    expect(parseApprovalsDeepLink('?employeeId=abc&highlight=55')).toBeNull();
    expect(parseApprovalsDeepLink('?employeeId=30&highlight=-1')).toBeNull();
    expect(parseApprovalsDeepLink('?employeeId=30&highlight=0')).toBeNull();
  });

  it('a malformed date is dropped, never trusted', () => {
    expect(parseApprovalsDeepLink('?employeeId=30&highlight=55&date=<script>')?.date).toBeNull();
  });
});

describe('resolveApprovalsDeepLink', () => {
  const link = { employeeId: 30, pieceId: 55, date: '2026-10-13' };

  it('finds the piece in the scoped pending list', () => {
    expect(resolveApprovalsDeepLink(link, [piece(1, 9), piece(55, 30)]).status).toBe('found');
  });

  it('already handled / not pending (absent from the pending list) → unavailable', () => {
    expect(resolveApprovalsDeepLink(link, [piece(1, 9)])).toEqual({ status: 'unavailable' });
    expect(resolveApprovalsDeepLink(link, [])).toEqual({ status: 'unavailable' });
  });

  it('a piece outside the PM scope is indistinguishable from a missing one', () => {
    // Scope is enforced by the server's list, so an out-of-scope id is simply absent: same result object.
    expect(resolveApprovalsDeepLink({ ...link, pieceId: 999 }, [piece(55, 30)]))
      .toEqual(resolveApprovalsDeepLink(link, []));
  });

  it('employeeId that disagrees with the piece is unavailable too (no partial match)', () => {
    expect(resolveApprovalsDeepLink({ ...link, employeeId: 31 }, [piece(55, 30)])).toEqual({ status: 'unavailable' });
  });
});

describe('pageOfPiece', () => {
  const list = Array.from({ length: 25 }, (_, i) => piece(i + 1, 30));
  it('returns the 1-based page that holds the row', () => {
    expect(pageOfPiece(list, 1, 10)).toBe(1);
    expect(pageOfPiece(list, 10, 10)).toBe(1);
    expect(pageOfPiece(list, 11, 10)).toBe(2);
    expect(pageOfPiece(list, 25, 10)).toBe(3);
  });
  it('falls back to page 1 when absent', () => {
    expect(pageOfPiece(list, 999, 10)).toBe(1);
  });
});
