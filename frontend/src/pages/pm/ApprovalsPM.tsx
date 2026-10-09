import {
  usePendingPieces,
  useDecidedPmPieces,
  useApprovePiece,
  useRejectPiece,
} from '../../api/approvalPieces';
import ApprovalsPage from '../approvals/ApprovalsPage';

export default function ApprovalsPM() {
  const { data: pending, isPending: pendingLoading, isError: pendingError, refetch } = usePendingPieces();
  const { data: approved, isPending: approvedLoading } = useDecidedPmPieces('APPROVED');
  const { data: rejected, isPending: rejectedLoading } = useDecidedPmPieces('REJECTED');

  const approvePiece = useApprovePiece();
  const rejectPiece  = useRejectPiece();

  return (
    <ApprovalsPage
      title="Approvals"
      subtitle="Project pieces awaiting your decision — pending PM action and Team Lead escalations"
      pendingPieces={pending}
      decidedApproved={approved}
      decidedRejected={rejected}
      pendingLoading={pendingLoading}
      approvedLoading={approvedLoading}
      rejectedLoading={rejectedLoading}
      pendingError={pendingError}
      onRefetch={refetch}
      onApprove={(pieceId) => approvePiece.mutateAsync({ pieceId })}
      onReject={(pieceId, comment) => rejectPiece.mutateAsync({ pieceId, comment })}
      approveBusy={approvePiece.isPending}
      rejectBusy={rejectPiece.isPending}
      tabs={['escalated', 'approved', 'rejected']}
      showTlFilter
      showProjectFilter
      clarificationReadOnly
    />
  );
}
