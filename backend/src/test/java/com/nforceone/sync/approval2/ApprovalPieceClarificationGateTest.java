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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * v2 piece approve/reject must honour an open EOD clarification round — the legacy
 * ApprovalService already did, the piece path did not.
 *
 * Rounds are per ENTRY (per-piece scoping is deferred), so the gate is entry-wide: a round open
 * on an entry blocks approve and reject of EVERY piece on that entry, including pieces owned by a
 * different approver than the one who raised the clarification. The entry-wide tests below pin
 * that behaviour so a later per-piece change has to update them deliberately.
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

    private void roundIsOpen(boolean open) {
        when(clarificationRepository.existsByEodEntryIdAndStatusNot(200L, EodClarification.Status.RESOLVED))
                .thenReturn(open);
    }

    private static void assertConflict(ResponseStatusException ex) {
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        assertTrue(ex.getReason().contains("open clarification"), ex.getReason());
    }

    // ── gate blocks while a round is open ────────────────────────────────────

    @Test
    void approve_whileRoundOpen_gets409_andNothingIsSaved() {
        roundIsOpen(true);

        assertConflict(assertThrows(ResponseStatusException.class,
                () -> service.approve(1L, LEAD_A_EMAIL, null)));

        verify(pieceRepository, never()).save(any());
        assertEquals(EodProjectApproval.Status.PENDING, pieceA.getStatus());
    }

    @Test
    void reject_whileRoundOpen_gets409_andNothingIsSaved() {
        roundIsOpen(true);

        assertConflict(assertThrows(ResponseStatusException.class,
                () -> service.reject(1L, LEAD_A_EMAIL, "needs rework")));

        verify(pieceRepository, never()).save(any());
        assertEquals(EodProjectApproval.Status.PENDING, pieceA.getStatus());
    }

    // ── entry-wide scope (rounds are per entry; per-piece is deferred) ───────

    @Test
    void openRound_blocksApproveAndRejectOfEveryPieceOnTheEntry() {
        // One round on the entry, however it was raised. Both pieces — owned by two different
        // approvers — are blocked, for both actions.
        roundIsOpen(true);

        assertConflict(assertThrows(ResponseStatusException.class, () -> service.approve(1L, LEAD_A_EMAIL, null)));
        assertConflict(assertThrows(ResponseStatusException.class, () -> service.approve(2L, LEAD_B_EMAIL, null)));
        assertConflict(assertThrows(ResponseStatusException.class, () -> service.reject(1L, LEAD_A_EMAIL, "no")));
        assertConflict(assertThrows(ResponseStatusException.class, () -> service.reject(2L, LEAD_B_EMAIL, "no")));

        verify(pieceRepository, never()).save(any());
    }

    @Test
    void gate_isKeyedOnTheEntry_notOnThePiece() {
        roundIsOpen(true);

        assertThrows(ResponseStatusException.class, () -> service.approve(2L, LEAD_B_EMAIL, null));

        // The lookup uses the ENTRY id shared by both pieces (200), never a piece id (1 or 2).
        verify(clarificationRepository).existsByEodEntryIdAndStatusNot(200L, EodClarification.Status.RESOLVED);
        verify(clarificationRepository, never()).existsByEodEntryIdAndStatusNot(eq(1L), any());
        verify(clarificationRepository, never()).existsByEodEntryIdAndStatusNot(eq(2L), any());
    }


    // ── gate is open once the round is resolved ──────────────────────────────

    @Test
    void approve_afterRoundResolved_succeeds() {
        roundIsOpen(false);
        when(pieceRepository.findByEodEntryId(200L)).thenReturn(List.of(pieceA, pieceB));
        when(entryRepository.save(any())).thenReturn(entry);

        service.approve(1L, LEAD_A_EMAIL, null);

        assertEquals(EodProjectApproval.Status.APPROVED, pieceA.getStatus());
        verify(pieceRepository).save(pieceA);
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
