import type { ApprovalPieceDto } from '../../api/approvalPieces';

export type { ApprovalPieceDto };

/**
 * Splits all pending pieces into escalated / plain buckets.
 *
 * PM Approvals (hasPendingTab=false): all pieces go to escalated — no split.
 * RM Approvals (hasPendingTab=true): only LEAD pieces with escalatedAt are escalated.
 */
export function splitPendingPieces(
  pieces: ApprovalPieceDto[],
  hasPendingTab: boolean,
): { escalated: ApprovalPieceDto[]; plain: ApprovalPieceDto[] } {
  if (!hasPendingTab) return { escalated: pieces, plain: [] };
  return {
    escalated: pieces.filter(p => !!p.escalatedAt && p.approverType === 'LEAD'),
    plain: pieces.filter(p => !(!!p.escalatedAt && p.approverType === 'LEAD')),
  };
}
