/**
 * Deep link into the Approvals page, e.g. from the PM's "Approval escalated to you" notification:
 *
 *   /projects/approvals?employeeId=30&highlight=1&date=2026-10-13
 *
 * `highlight` is the approval PIECE id and is the one precise key. `employeeId` must agree with that piece
 * (it scopes the initial filter). `date` is display-only — it is never used to filter or match, only echoed
 * in the "no longer pending" note.
 *
 * Authorisation is not decided here: the pieces passed to resolveApprovalsDeepLink come from the server's
 * already-scoped pending list, so a link can only ever resolve to a piece the viewer may act on.
 */
import type { ApprovalPieceDto } from '../../api/approvalPieces';

export interface ApprovalsDeepLink {
  employeeId: number;
  pieceId: number;
  /** yyyy-MM-dd, display-only; null when absent or malformed. */
  date: string | null;
}

function positiveInt(raw: string | null): number | null {
  if (raw == null || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Reads the deep-link params; null when the URL isn't a (complete) deep link, so the page opens normally. */
export function parseApprovalsDeepLink(search: string | URLSearchParams): ApprovalsDeepLink | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const pieceId = positiveInt(params.get('highlight'));
  const employeeId = positiveInt(params.get('employeeId'));
  if (pieceId == null || employeeId == null) return null;
  const rawDate = params.get('date');
  const date = rawDate != null && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
  return { employeeId, pieceId, date };
}

export type DeepLinkResolution =
  | { status: 'found'; piece: ApprovalPieceDto }
  /** Not pending, already decided, or outside the viewer's scope — deliberately indistinguishable. */
  | { status: 'unavailable' };

export function resolveApprovalsDeepLink(
  link: ApprovalsDeepLink,
  scopedPendingPieces: ApprovalPieceDto[],
): DeepLinkResolution {
  const piece = scopedPendingPieces.find(p => p.id === link.pieceId);
  if (!piece || piece.employeeId !== link.employeeId) return { status: 'unavailable' };
  return { status: 'found', piece };
}

/** 1-based page that holds `pieceId` in the (already filtered and sorted) list; 1 when it isn't there. */
export function pageOfPiece(visible: ApprovalPieceDto[], pieceId: number, pageSize: number): number {
  const idx = visible.findIndex(p => p.id === pieceId);
  return idx < 0 ? 1 : Math.floor(idx / pageSize) + 1;
}

export const DEEP_LINK_UNAVAILABLE_NOTE = 'This approval is no longer pending or isn’t available to you.';
