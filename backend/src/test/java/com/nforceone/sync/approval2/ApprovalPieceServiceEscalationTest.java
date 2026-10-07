package com.nforceone.sync.approval2;

import com.nforceone.sync.approval2.dto.ApprovalPieceDto;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodLogLineRepository;
import com.nforceone.sync.notification.NotificationService;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Unit tests for escalation-related behaviour in {@link ApprovalPieceService}.
 *
 * <p>Covers: PM authority on escalated pieces, lead still acting after escalation,
 * 409 with "decided by" name when piece already acted on, self-approval guard, and
 * SUPERADMIN bypass.
 */
@ExtendWith(MockitoExtension.class)
class ApprovalPieceServiceEscalationTest {

    @Mock EodProjectApprovalRepository pieceRepository;
    @Mock EodProjectApprovalActionRepository actionRepository;
    @Mock EodEntryRepository entryRepository;
    @Mock AppUserRepository userRepository;
    @Mock UtilizationService utilizationService;
    @Mock NotificationService notificationService;
    @Mock AuditLogRepository auditLogRepository;
    @Mock EodLogLineRepository logLineRepository;

    @InjectMocks ApprovalPieceService service;

    private static final String LEAD_EMAIL      = "lead@example.com";
    private static final String PM_EMAIL        = "pm@example.com";
    private static final String EMPLOYEE_EMAIL  = "employee@example.com";
    private static final String SUPERADMIN_EMAIL = "root@example.com";

    private AppUser lead;
    private AppUser pm;
    private AppUser employee;
    private AppUser superadmin;
    private EodEntry entry;
    private EodProjectApproval piece;

    @BeforeEach
    void setUp() {
        lead = user(10L, AppUser.Role.EMPLOYEE, "Alice Lead", LEAD_EMAIL);
        pm   = user(20L, AppUser.Role.PM,       "Bob PM",    PM_EMAIL);
        employee = user(30L, AppUser.Role.EMPLOYEE, "Carol Employee", EMPLOYEE_EMAIL);
        superadmin = user(99L, AppUser.Role.SUPERADMIN, "Root Admin", SUPERADMIN_EMAIL);

        entry = new EodEntry();
        entry.setId(200L);
        entry.setEmployee(employee);
        entry.setEntryDate(LocalDate.of(2026, 10, 4));
        entry.setEntryForm(EodEntry.EntryForm.PROJECT_GROUPED);
        entry.setStatus(EodEntry.Status.SUBMITTED);

        piece = new EodProjectApproval();
        piece.setId(1L);
        piece.setApprover(lead);
        piece.setApproverType(EodProjectApproval.ApproverType.LEAD);
        piece.setStatus(EodProjectApproval.Status.PENDING);
        piece.setFrozenAt(OffsetDateTime.of(2026, 10, 3, 9, 0, 0, 0, ZoneOffset.UTC));
        piece.setCreatedAt(OffsetDateTime.of(2026, 10, 3, 9, 0, 0, 0, ZoneOffset.UTC));
        piece.setEodEntry(entry);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static AppUser user(Long id, AppUser.Role role, String name, String email) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setRole(role);
        u.setFullName(name);
        u.setEmail(email);
        return u;
    }

    /** Stubs common reads needed by approve()/reject(): actor lookup + piece lookup. */
    private void stubActorAndPiece(String email, AppUser actor) {
        when(userRepository.findByEmailAndDeletedAtIsNull(email)).thenReturn(Optional.of(actor));
        when(pieceRepository.findById(piece.getId())).thenReturn(Optional.of(piece));
        when(pieceRepository.findByEodEntryId(entry.getId())).thenReturn(List.of(piece));
        when(entryRepository.save(any())).thenReturn(entry);
    }

    // ── tests ─────────────────────────────────────────────────────────────────

    /**
     * PM can approve a piece after it has been escalated to them (escalatedTo = pm).
     * The PM is not the named approver on the piece, but escalation grants them authority.
     */
    @Test
    void pmCanActOnEscalatedPiece_afterEscalation() {
        piece.setEscalatedTo(pm);
        stubActorAndPiece(PM_EMAIL, pm);
        when(actionRepository.save(any())).thenReturn(null);

        // Should not throw
        ApprovalPieceDto result = service.approve(piece.getId(), PM_EMAIL, null);

        assertThat(result).isNotNull();
        assertThat(piece.getStatus()).isEqualTo(EodProjectApproval.Status.APPROVED);
    }

    /**
     * PM cannot approve a piece that has not been escalated to them (escalatedTo is null).
     * Expects 403 FORBIDDEN.
     */
    @Test
    void pmCannotActBeforeEscalation() {
        piece.setEscalatedTo(null);
        when(userRepository.findByEmailAndDeletedAtIsNull(PM_EMAIL)).thenReturn(Optional.of(pm));
        when(pieceRepository.findById(piece.getId())).thenReturn(Optional.of(piece));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.approve(piece.getId(), PM_EMAIL, null));

        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    /**
     * Even after escalation, the original lead can still approve the piece —
     * the lead remains the named approver.
     */
    @Test
    void leadCanStillActAfterEscalation() {
        piece.setEscalatedTo(pm); // escalated, but lead is still approver
        stubActorAndPiece(LEAD_EMAIL, lead);
        when(actionRepository.save(any())).thenReturn(null);

        ApprovalPieceDto result = service.approve(piece.getId(), LEAD_EMAIL, null);

        assertThat(result).isNotNull();
        assertThat(piece.getStatus()).isEqualTo(EodProjectApproval.Status.APPROVED);
    }

    /**
     * When a piece is already APPROVED or REJECTED, any subsequent actor gets a 409 with
     * "already <status> by <name>" — the last action actor's name is included.
     */
    @Test
    void secondActorGets409WithDecidedByName() {
        piece.setStatus(EodProjectApproval.Status.APPROVED);
        piece.setEscalatedTo(pm);

        EodProjectApprovalAction action = new EodProjectApprovalAction();
        action.setActor(lead);
        action.setAction(EodProjectApprovalAction.Action.APPROVED);
        action.setActedAt(OffsetDateTime.now());

        when(userRepository.findByEmailAndDeletedAtIsNull(PM_EMAIL)).thenReturn(Optional.of(pm));
        when(pieceRepository.findById(piece.getId())).thenReturn(Optional.of(piece));
        when(actionRepository.findTopByPieceIdOrderByActedAtDesc(piece.getId()))
                .thenReturn(Optional.of(action));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.approve(piece.getId(), PM_EMAIL, null));

        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(ex.getReason()).contains("already approved by");
        assertThat(ex.getReason()).contains(lead.getFullName());
    }

    /**
     * Employee cannot approve their own EOD piece — self-approval is always forbidden (403).
     */
    @Test
    void employeeCannotApproveOwnPiece() {
        // Make the piece assigned to the employee (unusual but tests the guard path)
        piece.setApprover(employee);
        when(userRepository.findByEmailAndDeletedAtIsNull(EMPLOYEE_EMAIL)).thenReturn(Optional.of(employee));
        when(pieceRepository.findById(piece.getId())).thenReturn(Optional.of(piece));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.approve(piece.getId(), EMPLOYEE_EMAIL, null));

        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(ex.getReason()).containsIgnoringCase("own");
    }

    /**
     * SUPERADMIN bypasses all approver-authorization checks and can act on any piece,
     * including ones not escalated to them and not assigned to them.
     */
    @Test
    void superadminCanActOnAnyPiece() {
        // Piece has lead as approver, not escalated, SUPERADMIN is unrelated
        piece.setEscalatedTo(null);
        stubActorAndPiece(SUPERADMIN_EMAIL, superadmin);
        when(actionRepository.save(any())).thenReturn(null);

        ApprovalPieceDto result = service.approve(piece.getId(), SUPERADMIN_EMAIL, null);

        assertThat(result).isNotNull();
        assertThat(piece.getStatus()).isEqualTo(EodProjectApproval.Status.APPROVED);
    }
}
