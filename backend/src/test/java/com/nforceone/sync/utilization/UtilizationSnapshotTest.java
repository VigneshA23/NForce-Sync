package com.nforceone.sync.utilization;

import com.nforceone.sync.approval2.EodProjectApproval;
import com.nforceone.sync.approval2.EodProjectApprovalRepository;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.project.TaskCategory;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.Project;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.*;

/**
 * Verifies that buildSnapshot counts hours by approved piece (not by overall entry.status).
 * A PARTIALLY_APPROVED PROJECT_GROUPED entry must contribute hours only for projects whose
 * piece is APPROVED (not PENDING); a fully APPROVED entry must contribute all task hours.
 * PLAIN_LOG entries are never counted (Decision 8 in ApprovalPieceService).
 */
@ExtendWith(MockitoExtension.class)
class UtilizationSnapshotTest {

    @Mock EodEntryRepository entryRepository;
    @Mock AppUserRepository userRepository;
    @Mock UtilSnapshotRepository snapshotRepository;
    @Mock HolidayRepository holidayRepository;
    @Mock AllocationRepository allocationRepository;
    @Mock EodProjectApprovalRepository pieceRepository;

    UtilizationService service;

    static final LocalDate DATE = LocalDate.of(2026, 9, 1);
    static final Long EMP_ID = 160L;

    @BeforeEach
    void setUp() {
        service = new UtilizationService(
                entryRepository, userRepository, snapshotRepository,
                holidayRepository, allocationRepository, pieceRepository);
        when(holidayRepository.existsByHolidayDate(DATE)).thenReturn(false);
        when(snapshotRepository.findByEmployeeIdAndSnapshotDate(EMP_ID, DATE))
                .thenReturn(Optional.empty());
        when(snapshotRepository.save(any())).thenAnswer(i -> i.getArgument(0));
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private Project project(Long id, String name) {
        Project p = new Project(); p.setId(id); p.setName(name); return p;
    }

    private TaskCategory category(boolean productive) {
        TaskCategory tc = new TaskCategory();
        tc.setIsProductive(productive);
        return tc;
    }

    private EodTask task(Project project, BigDecimal hours, boolean productive) {
        EodTask t = new EodTask();
        t.setProject(project);
        t.setHours(hours);
        t.setTaskCategory(category(productive));
        return t;
    }

    private EodProjectApproval piece(Long projectId, EodProjectApproval.Status status, boolean superseded) {
        EodProjectApproval p = new EodProjectApproval();
        Project pr = new Project(); pr.setId(projectId);
        p.setProject(pr);
        p.setStatus(status);
        p.setSupersededAt(superseded ? OffsetDateTime.now() : null);
        return p;
    }

    private EodEntry projectGroupedEntry(Long entryId, EodEntry.Status status, List<EodTask> tasks) {
        EodEntry e = new EodEntry();
        e.setId(entryId);
        e.setEntryDate(DATE);
        e.setEntryForm(EodEntry.EntryForm.PROJECT_GROUPED);
        e.setStatus(status);
        e.getTasks().addAll(tasks);
        return e;
    }

    // ── tests ─────────────────────────────────────────────────────────────────

    @Test
    void fullyApprovedEntry_allTasksCountedInSnapshot() {
        Project sync = project(88L, "Nforce Sync");
        EodEntry entry = projectGroupedEntry(354L, EodEntry.Status.APPROVED,
                List.of(task(sync, new BigDecimal("8.0"), true)));
        when(entryRepository.findByEmployeeIdAndEntryDate(EMP_ID, DATE))
                .thenReturn(Optional.of(entry));
        when(pieceRepository.findByEodEntryId(354L))
                .thenReturn(List.of(piece(88L, EodProjectApproval.Status.APPROVED, false)));

        UtilSnapshot snap = service.computeSnapshot(EMP_ID, DATE);

        assertEquals(0, snap.getApprovedProductiveHours().compareTo(new BigDecimal("8")));
        assertEquals(new BigDecimal("100.00"), snap.getUtilizationPct());
    }

    @Test
    void partiallyApproved_onlyApprovedProjectHoursCounted() {
        // Two projects: SYNC approved, ONEHR still pending.
        Project sync  = project(88L, "Nforce Sync");
        Project onehr = project(89L, "Nforce OneHR");
        EodEntry entry = projectGroupedEntry(354L, EodEntry.Status.PARTIALLY_APPROVED,
                List.of(task(sync, new BigDecimal("4.0"), true),
                        task(onehr, new BigDecimal("4.0"), true)));
        when(entryRepository.findByEmployeeIdAndEntryDate(EMP_ID, DATE))
                .thenReturn(Optional.of(entry));
        when(pieceRepository.findByEodEntryId(354L))
                .thenReturn(List.of(
                        piece(88L, EodProjectApproval.Status.APPROVED, false),
                        piece(89L, EodProjectApproval.Status.PENDING,  false)));

        UtilSnapshot snap = service.computeSnapshot(EMP_ID, DATE);

        // Only SYNC 4h counted; ONEHR 4h pending → 4/8 = 50%
        assertEquals(0, snap.getApprovedProductiveHours().compareTo(new BigDecimal("4")));
        assertEquals(new BigDecimal("50.00"), snap.getUtilizationPct());
    }

    @Test
    void supersededPiece_notCountedEvenIfApproved() {
        Project sync = project(88L, "Nforce Sync");
        EodEntry entry = projectGroupedEntry(354L, EodEntry.Status.PARTIALLY_APPROVED,
                List.of(task(sync, new BigDecimal("8.0"), true)));
        when(entryRepository.findByEmployeeIdAndEntryDate(EMP_ID, DATE))
                .thenReturn(Optional.of(entry));
        // Old piece is superseded (APPROVED but superseded_at != null)
        when(pieceRepository.findByEodEntryId(354L))
                .thenReturn(List.of(piece(88L, EodProjectApproval.Status.APPROVED, true)));

        UtilSnapshot snap = service.computeSnapshot(EMP_ID, DATE);

        // Superseded piece excluded → 0 productive hours
        assertEquals(BigDecimal.ZERO, snap.getApprovedProductiveHours());
    }

    @Test
    void benchHours_separateFromProductiveHours() {
        Project sync = project(88L, "Nforce Sync");
        EodEntry entry = projectGroupedEntry(354L, EodEntry.Status.APPROVED,
                List.of(task(sync, new BigDecimal("6.0"), true),
                        task(sync, new BigDecimal("2.0"), false)));   // bench
        when(entryRepository.findByEmployeeIdAndEntryDate(EMP_ID, DATE))
                .thenReturn(Optional.of(entry));
        when(pieceRepository.findByEodEntryId(354L))
                .thenReturn(List.of(piece(88L, EodProjectApproval.Status.APPROVED, false)));

        UtilSnapshot snap = service.computeSnapshot(EMP_ID, DATE);

        assertEquals(0, snap.getApprovedProductiveHours().compareTo(new BigDecimal("6")));
        assertEquals(0, snap.getBenchHours().compareTo(new BigDecimal("2")));
        assertEquals(new BigDecimal("75.00"), snap.getUtilizationPct());
    }

    @Test
    void submittedEntry_noHoursCounted() {
        Project sync = project(88L, "Nforce Sync");
        EodEntry entry = projectGroupedEntry(354L, EodEntry.Status.SUBMITTED,
                List.of(task(sync, new BigDecimal("8.0"), true)));
        when(entryRepository.findByEmployeeIdAndEntryDate(EMP_ID, DATE))
                .thenReturn(Optional.of(entry));

        UtilSnapshot snap = service.computeSnapshot(EMP_ID, DATE);

        assertEquals(BigDecimal.ZERO, snap.getApprovedProductiveHours());
        verify(pieceRepository, never()).findByEodEntryId(any());
    }
}
