import {
  useMyReportsPendingApprovals,
  useMyReportsDecidedPieces,
  useMyReportsApprovePiece,
  useMyReportsRejectPiece,
} from '../../api/myReports';
import ApprovalsPage from '../approvals/ApprovalsPage';

export default function MyReportsApprovals() {
  const { data: pending, isPending: pendingLoading, isError: pendingError, refetch } =
    useMyReportsPendingApprovals();
  const { data: approved, isPending: approvedLoading } = useMyReportsDecidedPieces('APPROVED');
  const { data: rejected, isPending: rejectedLoading } = useMyReportsDecidedPieces('REJECTED');

  const approvePiece = useMyReportsApprovePiece();
  const rejectPiece  = useMyReportsRejectPiece();

  return (
    <ApprovalsPage
      title="Reporting Approvals"
      subtitle="EOD submissions from your direct reports awaiting your action as Reporting Manager"
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
    />
  );
}
