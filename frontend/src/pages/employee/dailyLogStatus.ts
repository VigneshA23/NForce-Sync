import { CheckCircle, Clock, XCircle } from 'lucide-react';
import type { ApprovalPieceDto } from '../../api/approvalPieces';

export const PIECE_STATUS: Record<string, { color: string; label: string; Icon: typeof CheckCircle }> = {
  APPROVED: { color: '#2FB67C', label: 'Approved', Icon: CheckCircle },
  REJECTED: { color: '#E4373D', label: 'Rejected', Icon: XCircle },
  PENDING:  { color: '#4C8DD6', label: 'Pending',  Icon: Clock },
};

export const TYPE_LABEL: Record<string, string> = {
  REPORTING_MANAGER: 'Reporting Manager',
  ADMIN_GROUP: 'Admin Group',
  AUTO_APPROVED: 'Auto-approved',
  LEAD: 'Team Lead',
  PM: 'Project Manager',
};

/** One line per piece. A rejection's reason is NOT repeated here — the Rejected banner above the form owns it. */
export function pieceText(p: ApprovalPieceDto): string {
  const type = TYPE_LABEL[p.approverType] ?? p.approverType;
  if (p.approverType === 'AUTO_APPROVED') return 'Auto-approved';                  // no reviewer, nothing pending
  const status = (PIECE_STATUS[p.status] ?? PIECE_STATUS.PENDING).label;
  return p.approverName ? `${type}: ${p.approverName} · ${status}` : `${type} · ${status}`;
}
