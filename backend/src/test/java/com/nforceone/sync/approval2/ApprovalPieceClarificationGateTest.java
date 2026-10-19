package com.nforceone.sync.approval2;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.eod.EodClarification;
import com.nforceone.sync.eod.EodClarificationRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodLogLineRepository;
import com.nforceone.sync.eod.EodTaskRepository;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.utilization.UtilizationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * v2 piece approve/reject must honour an open EOD clarification round.
 *
 * Clarification state is per PIECE (one project + one lead): a round blocks approve and reject of ITS OWN
 * piece only, so the other project's lead keeps full access to theirs — in both directions. A legacy round
 * (no piece) keeps the old behaviour and blocks every piece of the entry.
 */
@ExtendWith(MockitoExtension.class)
class ApprovalPieceClarificationGateTest {

    @Mock EodProjectApprovalRepository pieceRepository;
    @Mock EodProjectApprovalActionRepository actionRepository;
    @Mock EodEntryRepository entryRepository;
    @Mock AppUserRepository userRepository;
    @Mock UtilizationService utilizationService;
    @Mock NotificationService notificationService;
    @Mock AuditLogRepository auditLogRepository;
    @Mock EodLogLineRepository logLineRepository;
    @Mock EodTaskRepository taskRepository;
    @Mock EodClarificationRepository clarificationRepository;

    @InjectMocks ApprovalPieceService service;

    private static final String LEAD_A_EMAIL = "lead.a@example.com";
    private static final String LEAD_B_EMAIL = "lead.b@example.com";
    private static final EodClarification.Status RESOLVED = EodClarification.Status.RESOLVED;

    private AppUser leadA;
    private AppUser leadB;
    private EodEntry entry;
    private EodProjectApproval pieceA;
    private EodProjectApproval pieceB;

    @BeforeEach
    void setUp() {
        leadA = user(10L, "Lead A", LEAD_A_EMAIL);
        leadB = user(11L, "Lead B", LEAD_B_EMAIL);
        AppUser employee = user(20L, "Akhila S", "akhila@example.com");

        entry = new EodEntry();
        entry.setId(200L);
        entry.setEmployee(employee);
        entry.setEntryDate(LocalDate.of(2026, 9, 4));
        entry.setEntryForm(EodEntry.EntryForm.PROJECT_GROUPED);
        entry.setStatus(EodEntry.Status.SUBMITTED);

        pieceA = piece(1L, leadA, "Project A");
        pieceB = piece(2L, leadB, "Project B");

        lenient().when(userRepository.findByEmailAndDeletedAtIsNull(LEAD_A_EMAIL)).thenReturn(Optional.of(leadA));
        lenient().when(userRepository.findByEmailAndDeletedAtIsNull(LEAD_B_EMAIL)).thenReturn(Optional.of(leadB));
        lenient().when(pieceRepository.findById(1L)).thenReturn(Optional.of(pieceA));
        lenient().when(pieceRepository.findById(2L)).thenReturn(Optional.of(pieceB));
        lenient().when(pieceRepository.findByEodEntryId(200L)).thenReturn(List.of(pieceA, pieceB));
        lenient().when(entryRepository.save(any())).thenReturn(entry);
        // No clarification anywhere unless a test opens one.
        lenient().when(clarificationRepository.existsByPiece_IdAndStatusNot(any(), any())).thenReturn(false);
        lenient().when(clarificationRepository.existsByEodEntryIdAndPieceIsNullAndStatusNotAndOpenedBy_Id(any(), any(), any())).thenReturn(false);
    }

    private AppUser user(Long id, String name, String email) {
        AppUser u = new AppUser();
        u.setId(id); u.setRole(AppUser.Role.EMPLOYEE); u.setFullName(name); u.setEmail(email);
        return u;
    }

    private EodProjectApproval piece(Long id, AppUser approver, String projectName) {
        Project project = new Project();
        project.setId(100L + id);
        project.setName(projectName);

        EodProjectApproval p = new EodProjectApproval();
        p.setId(id);
        p.setApprover(approver);
        p.setApproverType(EodProjectApproval.ApproverType.LEAD);
        p.setStatus(EodProjectApproval.Status.PENDING);
        p.setProject(project);
        p.setFrozenAt(OffsetDateTime.of(2026, 9, 3, 12, 0, 0, 0, ZoneOffset.UTC));
        p.setCreatedAt(OffsetDateTime.of(2026, 9, 3, 12, 0, 0, 0, ZoneOffset.UTC));
        p.setEodEntry(entry);
        return p;
    }

    /** An open round on exactly this piece (the other piece, and legacy rounds, stay unblocked). */
    private void roundOpenOnPiece(Long pieceId) {
        lenient().when(clarificationRepository.existsByPiece_IdAndStatusNot(pieceId, RESOLVED)).thenReturn(true);
    }

    private static void assertConflict(ResponseStatusException ex) {
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        assertTrue(ex.getReason().contains("open clarification"), ex.getReason());
    }

    // ── a round blocks its own piece ─────────────────────────────────────────

    @Test
    void approve_whileOwnPieceHasOpenRound_gets409_andNothingIsSaved() {
        roundOpenOnPiece(1L);

        assertConflict(assertThrows(ResponseStatusException.class,
                () -> service.approve(1L, LEAD_A_EMAIL, null)));

        verify(pieceRepository, never()).save(any());
        assertEquals(EodProjectApproval.Status.PENDING, pieceA.getStatus());
    }

    @Test
    void reject_whileOwnPieceHasOpenRound_gets409_andNothingIsSaved() {
        roundOpenOnPiece(1L);

        assertConflict(assertThrows(ResponseStatusException.class,
                () -> service.reject(1L, LEAD_A_EMAIL, "needs rework")));

        verify(pieceRepository, never()).save(any());
        assertEquals(EodProjectApproval.Status.PENDING, pieceA.getStatus());
    }

    // ── per-piece scope: the OTHER lead is not blocked ───────────────────────

    @Test
    void roundOnPieceA_doesNotBlockLeadB_approve() {
        roundOpenOnPiece(1L);

        service.approve(2L, LEAD_B_EMAIL, null);

        assertEquals(EodProjectApproval.Status.APPROVED, pieceB.getStatus());
        assertEquals(EodProjectApproval.Status.PENDING, pieceA.getStatus());
    }

    @Test
    void roundOnPieceA_doesNotBlockLeadB_reject() {
        roundOpenOnPiece(1L);

        service.reject(2L, LEAD_B_EMAIL, "not enough detail");

        assertEquals(EodProjectApproval.Status.REJECTED, pieceB.getStatus());
        // ...while A's own piece is still pending and still blocked.
        assertEquals(EodProjectApproval.Status.PENDING, pieceA.getStatus());
    }

    @Test
    void bothLeadsHaveOpenRounds_eachIsBlockedOnlyOnTheirOwnPiece() {
        roundOpenOnPiece(1L);
        roundOpenOnPiece(2L);

        assertConflict(assertThrows(ResponseStatusException.class, () -> service.approve(1L, LEAD_A_EMAIL, null)));
        assertConflict(assertThrows(ResponseStatusException.class, () -> service.reject(2L, LEAD_B_EMAIL, "no")));

        // Resolving A's round unblocks A only: B is still blocked.
        when(clarificationRepository.existsByPiece_IdAndStatusNot(1L, RESOLVED)).thenReturn(false);
        service.approve(1L, LEAD_A_EMAIL, null);
        assertEquals(EodProjectApproval.Status.APPROVED, pieceA.getStatus());
        assertConflict(assertThrows(ResponseStatusException.class, () -> service.approve(2L, LEAD_B_EMAIL, null)));
        assertEquals(EodProjectApproval.Status.PENDING, pieceB.getStatus());
    }

    @Test
    void threeProjectsOnOneEod_aRoundOnTheMiddleOneBlocksOnlyThatPiece() {
        AppUser leadC = user(12L, "Lead C", "lead.c@example.com");
        EodProjectApproval pieceC = piece(3L, leadC, "Project C");
        lenient().when(userRepository.findByEmailAndDeletedAtIsNull("lead.c@example.com")).thenReturn(Optional.of(leadC));
        lenient().when(pieceRepository.findById(3L)).thenReturn(Optional.of(pieceC));
        lenient().when(pieceRepository.findByEodEntryId(200L)).thenReturn(List.of(pieceA, pieceB, pieceC));
        roundOpenOnPiece(2L);   // only Project B's round

        service.approve(1L, LEAD_A_EMAIL, null);
        service.reject(3L, "lead.c@example.com", "needs rework");
        assertConflict(assertThrows(ResponseStatusException.class, () -> service.approve(2L, LEAD_B_EMAIL, null)));
        assertConflict(assertThrows(ResponseStatusException.class, () -> service.reject(2L, LEAD_B_EMAIL, "no")));

        assertEquals(EodProjectApproval.Status.APPROVED, pieceA.getStatus());
        assertEquals(EodProjectApproval.Status.REJECTED, pieceC.getStatus());
        assertEquals(EodProjectApproval.Status.PENDING, pieceB.getStatus());
    }

    @Test
    void gate_isKeyedOnThePiece_withAnEntryLevelCheckOnlyForLegacyRounds() {
        roundOpenOnPiece(2L);

        assertThrows(ResponseStatusException.class, () -> service.approve(2L, LEAD_B_EMAIL, null));

        verify(clarificationRepository).existsByPiece_IdAndStatusNot(2L, RESOLVED);
        // The entry-level lookup is restricted to rounds with no piece (legacy), never "any open round".
        verify(clarificationRepository, never()).existsByEodEntryIdAndStatusNot(any(), any());
    }

    // ── legacy (null-piece) round blocks only the pieces its OPENER holds ────

    @Test
    void legacyRoundWithoutAPiece_blocksOnlyTheOpenersPieces_neverAnotherLeads() {
        // Lead A (id 10) opened a legacy round on the entry.
        when(clarificationRepository.existsByEodEntryIdAndPieceIsNullAndStatusNotAndOpenedBy_Id(200L, RESOLVED, 10L))
                .thenReturn(true);

        assertConflict(assertThrows(ResponseStatusException.class, () -> service.approve(1L, LEAD_A_EMAIL, null)));
        assertConflict(assertThrows(ResponseStatusException.class, () -> service.reject(1L, LEAD_A_EMAIL, "no")));
        assertEquals(EodProjectApproval.Status.PENDING, pieceA.getStatus());

        // Lead B is not blocked by a thread they cannot see.
        service.approve(2L, LEAD_B_EMAIL, null);
        assertEquals(EodProjectApproval.Status.APPROVED, pieceB.getStatus());
    }

    @Test
    void legacyRound_doesNotBlockAPieceThatIsNowEscalatedToAPm_butStillBlocksOnesTheOpenerHolds() {
        // Lead A opened a legacy round. His piece A has since been escalated to a PM; piece C is still his.
        AppUser pm = user(30L, "PM P", "pm@example.com");
        lenient().when(userRepository.findByEmailAndDeletedAtIsNull("pm@example.com")).thenReturn(Optional.of(pm));
        EodProjectApproval pieceC = piece(3L, leadA, "Project C");
        lenient().when(pieceRepository.findById(3L)).thenReturn(Optional.of(pieceC));
        lenient().when(pieceRepository.findByEodEntryId(200L)).thenReturn(List.of(pieceA, pieceB, pieceC));
        pieceA.setEscalatedTo(pm);
        when(clarificationRepository.existsByEodEntryIdAndPieceIsNullAndStatusNotAndOpenedBy_Id(200L, RESOLVED, 10L))
                .thenReturn(true);

        // The escalated piece is not blocked: the PM, and the opener himself, can decide it.
        service.approve(1L, "pm@example.com", null);
        assertEquals(EodProjectApproval.Status.APPROVED, pieceA.getStatus());

        // The piece the opener still holds is blocked, as before.
        assertConflict(assertThrows(ResponseStatusException.class, () -> service.approve(3L, LEAD_A_EMAIL, null)));
        assertEquals(EodProjectApproval.Status.PENDING, pieceC.getStatus());
    }

    @Test
    void legacyRound_doesNotBlockTheOpenersOwnEscalatedPiece_whenHeActsOnItHimself() {
        AppUser pm = user(30L, "PM P", "pm@example.com");
        pieceA.setEscalatedTo(pm);
        lenient().when(clarificationRepository.existsByEodEntryIdAndPieceIsNullAndStatusNotAndOpenedBy_Id(200L, RESOLVED, 10L))
                .thenReturn(true);

        service.reject(1L, LEAD_A_EMAIL, "not enough detail");

        assertEquals(EodProjectApproval.Status.REJECTED, pieceA.getStatus());
        // The escalated piece never even consults the legacy round.
        verify(clarificationRepository, never())
                .existsByEodEntryIdAndPieceIsNullAndStatusNotAndOpenedBy_Id(any(), any(), any());
    }

    @Test
    void legacyRoundBlocksAllPendingPiecesOfItsOpener_whenHeHoldsSeveral() {
        // The opener holds both pieces on the entry (a lead of two projects): both stay blocked.
        pieceB.setApprover(leadA);
        when(clarificationRepository.existsByEodEntryIdAndPieceIsNullAndStatusNotAndOpenedBy_Id(200L, RESOLVED, 10L))
                .thenReturn(true);

        assertConflict(assertThrows(ResponseStatusException.class, () -> service.approve(1L, LEAD_A_EMAIL, null)));
        assertConflict(assertThrows(ResponseStatusException.class, () -> service.approve(2L, LEAD_A_EMAIL, null)));
        verify(pieceRepository, never()).save(any());
    }

    // ── a single-project EOD is unchanged ────────────────────────────────────

    @Test
    void singleProjectEntry_openRoundBlocksItsOnlyPiece_untilResolved() {
        when(pieceRepository.findByEodEntryId(200L)).thenReturn(List.of(pieceA));
        roundOpenOnPiece(1L);

        assertConflict(assertThrows(ResponseStatusException.class, () -> service.approve(1L, LEAD_A_EMAIL, null)));

        when(clarificationRepository.existsByPiece_IdAndStatusNot(1L, RESOLVED)).thenReturn(false);
        service.approve(1L, LEAD_A_EMAIL, null);
        assertEquals(EodProjectApproval.Status.APPROVED, pieceA.getStatus());
    }

    // ── gate is open once the round is resolved ──────────────────────────────

    @Test
    void approve_afterRoundResolved_succeeds() {
        service.approve(1L, LEAD_A_EMAIL, null);

        assertEquals(EodProjectApproval.Status.APPROVED, pieceA.getStatus());
        verify(pieceRepository).save(pieceA);
    }

    // ── approving / rejecting one piece never touches another piece's clarification ──

    @Test
    void approvingOnePiece_neverResolvesOrChangesAnyClarification() {
        roundOpenOnPiece(1L);

        service.approve(2L, LEAD_B_EMAIL, null);

        verify(clarificationRepository, never()).save(any());
        verify(clarificationRepository, never()).saveAll(any());
        verify(clarificationRepository, never()).delete(any());
    }

    // ── ordering: authorization still wins over the gate ─────────────────────

    @Test
    void unauthorizedActor_gets403_notTheClarificationConflict() {
        // Lead B is not the approver of piece A: they must learn nothing about its clarification state.
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
                () -> service.approve(1L, LEAD_B_EMAIL, null)).getStatusCode());

        verifyNoInteractions(clarificationRepository);
    }
}
