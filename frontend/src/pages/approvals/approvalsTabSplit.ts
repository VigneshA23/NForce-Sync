import type { ApprovalPieceDto } from '../../api/approvalPieces';

export type { ApprovalPieceDto };

/**
 * Splits all pending pieces into escalated / plain buckets.
 *
 * PM Approvals (showAllInPending=true): one Pending tab holds everything awaiting the PM — pieces escalated
 * to him (each row carries its "Escalated" chip) AND direct PM pieces for projects with no Team Lead — so
 * `plain` is the whole list and `escalated` is empty.
 * RM Approvals (hasPendingTab=true): only LEAD pieces with escalatedAt are escalated.
 * Legacy PM layout (neither flag): everything goes to the escalated bucket.
 */
export function splitPendingPieces(
  pieces: ApprovalPieceDto[],
  hasPendingTab: boolean,
  showAllInPending = false,
): { escalated: ApprovalPieceDto[]; plain: ApprovalPieceDto[] } {
  if (showAllInPending) return { escalated: [], plain: pieces };
  if (!hasPendingTab) return { escalated: pieces, plain: [] };
  return {
    escalated: pieces.filter(p => !!p.escalatedAt && p.approverType === 'LEAD'),
    plain: pieces.filter(p => !(!!p.escalatedAt && p.approverType === 'LEAD')),
  };
}
