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
      title="Escalated Approvals"
      defaultSort="latest"
      subtitle="Pieces awaiting your decision — Team Lead escalations and projects with no Team Lead"
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
      tabs={['pending', 'approved', 'rejected']}
      pendingShowsAll
      showTlFilter
      showProjectFilter
      clarificationReadOnly
    />
  );
}
