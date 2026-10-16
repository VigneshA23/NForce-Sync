// @vitest-environment jsdom
/**
 * Rendered coverage for the Approvals deep link's "unavailable" path (the resolver itself is covered in
 * approvalsDeepLink.test.ts). A link whose piece isn't in the viewer's scoped pending list — gone, already
 * decided, or never theirs — must show ONE neutral note and change nothing else: no filter applied, no
 * highlight, no row hidden, and nothing that says which of those it was.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ApprovalPieceDto } from '../../api/approvalPieces';
import ApprovalsPage from './ApprovalsPage';
import { DEEP_LINK_UNAVAILABLE_NOTE } from './approvalsDeepLink';

vi.mock('../../api/eodClarification', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/eodClarification')>()),
  useEodInbox: () => ({ data: [] }),
  useRefreshClarification: () => vi.fn(),
  useClarificationStatusForApprovals: () => ({ data: undefined }),
}));
vi.mock('../../lib/toast', () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: { id: 162, role: 'pm' } }) }));
vi.mock('../../components/ClarificationChatPopup', () => ({ ClarificationChatPopup: () => null }));

function makePiece(overrides: Partial<ApprovalPieceDto>): ApprovalPieceDto {
  return {
    id: 1, eodEntryId: 100, employeeId: 10, employeeName: 'Asha Rao', employeeCode: 'NF-ASHA',
    projectId: null, projectName: null, approverId: null, approverName: null, actedByName: null,
    approverType: 'LEAD', status: 'PENDING', frozenAt: '2026-10-01T09:00:00Z', actedAt: null, comment: null,
    entryDate: '2026-10-01', entryForm: 'PROJECT_GROUPED', logSummary: null, logTotalHours: null, logNotes: null,
    logLines: [], escalatedAt: '2026-10-01T12:00:00Z', escalatedToId: 162, escalatedToName: 'PM',
    hoursPending: null, dayType: null, workLocation: null, nextDayPlan: null, remarks: null, taskLines: [],
    ...overrides,
  };
}

// The server's already-scoped pending list for this PM: two pieces, belonging to two employees.
const PENDING = [
  makePiece({ id: 1, eodEntryId: 100, employeeId: 10, employeeName: 'Asha Rao', employeeCode: 'NF-ASHA' }),
  makePiece({ id: 2, eodEntryId: 101, employeeId: 11, employeeName: 'Bala Menon', employeeCode: 'NF-BALA' }),
];

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/projects/approvals${search}`]}>
      <ApprovalsPage
        title="Approvals" subtitle="Pending approvals"
        pendingPieces={PENDING} decidedApproved={[]} decidedRejected={[]}
        pendingLoading={false} approvedLoading={false} rejectedLoading={false}
        pendingError={false} onRefetch={vi.fn()}
        onApprove={vi.fn()} onReject={vi.fn()} approveBusy={false} rejectBusy={false}
        tabs={['pending', 'approved', 'rejected']} pendingShowsAll
      />
    </MemoryRouter>,
  );
}

function expectOnlyTheNeutralNote(note: string) {
  const notes = screen.getAllByRole('status');
  expect(notes).toHaveLength(1);
  expect(notes[0].textContent).toBe(note);
  // Nothing else changed: no employee filter was applied, so both employees' rows are still listed.
  expect(screen.getAllByText('Asha Rao').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Bala Menon').length).toBeGreaterThan(0);
}

describe('Approvals deep link — unavailable piece', () => {
  afterEach(cleanup);

  it('a highlight id that does not exist → the neutral note and nothing else', () => {
    renderAt('?employeeId=10&highlight=999999');
    expectOnlyTheNeutralNote(DEEP_LINK_UNAVAILABLE_NOTE);
  });

  it('a piece outside the viewer\'s scope (the link names another employee\'s id for a listed piece) → same note, no partial match', () => {
    // Piece 2 is in the scoped list but belongs to employee 11; a link claiming employee 10 must not
    // filter to, highlight, or confirm anything about it.
    renderAt('?employeeId=10&highlight=2');
    expectOnlyTheNeutralNote(DEEP_LINK_UNAVAILABLE_NOTE);
  });

  it('control: a link to a piece that IS in scope shows no note (so the note above is not always rendered)', () => {
    renderAt('?employeeId=10&highlight=1');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('the two cases are indistinguishable from each other', () => {
    const missing = renderAt('?employeeId=10&highlight=999999');
    const missingText = screen.getByRole('status').textContent;
    missing.unmount();
    renderAt('?employeeId=10&highlight=2');
    expect(screen.getByRole('status').textContent).toBe(missingText);
  });
});
