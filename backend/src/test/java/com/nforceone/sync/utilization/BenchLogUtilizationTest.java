package com.nforceone.sync.utilization;

import com.nforceone.sync.approval2.EodProjectApprovalRepository;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodLogLine;
import com.nforceone.sync.eod.EodLogLineRepository;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.PmScopeService;
import com.nforceone.sync.project.TaskCategory;
import com.nforceone.sync.teamlead.LeadTeamPolicy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Bench Log utilization (V117). Approved bench-mode Daily Log hours count as BENCH, never productive, and
 * nothing else about Daily Log utilization changes: PM / Admin / RM / Lead (MANAGEMENT-line) Daily Logs are
 * still uncounted, exactly as before, so their snapshots stay the same.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class BenchLogUtilizationTest {

    @Mock EodEntryRepository entryRepository;
    @Mock AppUserRepository userRepository;
    @Mock UtilSnapshotRepository snapshotRepository;
    @Mock HolidayRepository holidayRepository;
    @Mock AllocationRepository allocationRepository;
    @Mock EodProjectApprovalRepository pieceRepository;
    @Mock EodLogLineRepository logLineRepository;

    private UtilizationService service;

    static final LocalDate TUESDAY  = LocalDate.of(2026, 9, 1);
    static final LocalDate SATURDAY = LocalDate.of(2026, 9, 5);
    static final Long EMP_ID = 160L;

    @BeforeEach
    void setUp() {
        service = new UtilizationService(entryRepository, userRepository, snapshotRepository, holidayRepository,
                new LeadTeamPolicy(allocationRepository, null, pieceRepository), pieceRepository,
                mock(PmScopeService.class), logLineRepository);
        when(holidayRepository.existsByHolidayDate(any())).thenReturn(false);
        when(snapshotRepository.findByEmployeeIdAndSnapshotDate(any(), any())).thenReturn(Optional.empty());
        when(snapshotRepository.save(any())).thenAnswer(i -> i.getArgument(0));
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static EodLogLine line(String scope, boolean productiveFlag, String hours) {
        TaskCategory c = new TaskCategory();
        c.setScope(scope);
        c.setIsProductive(productiveFlag);
        EodLogLine l = new EodLogLine();
        l.setCategory(c);
        l.setHours(new BigDecimal(hours));
        return l;
    }

    private void dailyLog(LocalDate date, EodEntry.Status status, boolean benchMode, List<EodLogLine> lines) {
        EodEntry e = new EodEntry();
        e.setId(500L);
        e.setEntryDate(date);
        e.setEntryForm(EodEntry.EntryForm.PLAIN_LOG);
        e.setStatus(status);
        e.setBenchMode(benchMode);
        when(entryRepository.findByEmployeeIdAndEntryDate(EMP_ID, date)).thenReturn(Optional.of(e));
        when(logLineRepository.findByEntryIdOrderBySortOrderAscIdAsc(500L)).thenReturn(lines);
    }

    private static void assertHours(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual), "expected " + expected + " but was " + actual);
    }

    // ── approved bench lines land in Bench, not Productive ────────────────────

    @Test
    void approvedBenchLines_areBenchHours_notProductive() {
        dailyLog(TUESDAY, EodEntry.Status.APPROVED, true, List.of(
                line("BENCH", false, "4.00"), line("BENCH", false, "2.50")));

        UtilSnapshot snap = service.computeSnapshot(EMP_ID, TUESDAY);

        assertHours("0", snap.getApprovedProductiveHours());
        assertHours("6.5", snap.getBenchHours());
        // Productive % stays 0.00 (not null: 8 hours were available). Bench time is not utilization.
        assertEquals(new BigDecimal("0.00"), snap.getUtilizationPct());
    }

    @Test
    void benchScopeLine_isBench_evenIfItsCategoryWereFlaggedProductive() {
        // The DB CHECK forbids this row; the classification must not depend on that flag anyway.
        dailyLog(TUESDAY, EodEntry.Status.APPROVED, true, List.of(line("BENCH", true, "3.00")));

        UtilSnapshot snap = service.computeSnapshot(EMP_ID, TUESDAY);

        assertHours("0", snap.getApprovedProductiveHours());
        assertHours("3", snap.getBenchHours());
    }

    // ── unapproved bench hours are not counted ────────────────────────────────

    @Test
    void unapprovedBenchHours_areNotCounted() {
        for (EodEntry.Status status : List.of(EodEntry.Status.DRAFT, EodEntry.Status.SUBMITTED,
                EodEntry.Status.REJECTED)) {
            dailyLog(TUESDAY, status, true, List.of(line("BENCH", false, "8.00")));

            UtilSnapshot snap = service.computeSnapshot(EMP_ID, TUESDAY);

            assertHours("0", snap.getBenchHours());
            assertHours("0", snap.getApprovedProductiveHours());
            assertHours("8", snap.getIdleHours()); // the whole day stays idle until the log is approved
        }
    }

    // ── idle = available - (productive + bench), no double counting ───────────

    @Test
    void idle_isAvailableMinusBench_andTheThreeAddUpToAvailable() {
        dailyLog(TUESDAY, EodEntry.Status.APPROVED, true, List.of(line("BENCH", false, "5.00")));

        UtilSnapshot snap = service.computeSnapshot(EMP_ID, TUESDAY);

        assertHours("8", snap.getAvailableHours());
        assertHours("5", snap.getBenchHours());
        assertHours("3", snap.getIdleHours());
        assertHours("8", snap.getApprovedProductiveHours().add(snap.getBenchHours()).add(snap.getIdleHours()));
    }

    @Test
    void benchHoursBeyondAvailable_floorIdleAtZero_andAreCountedOnce() {
        dailyLog(TUESDAY, EodEntry.Status.APPROVED, true, List.of(
                line("BENCH", false, "6.00"), line("BENCH", false, "4.00")));

        UtilSnapshot snap = service.computeSnapshot(EMP_ID, TUESDAY);

        assertHours("10", snap.getBenchHours());   // 10 logged, counted once (not 20)
        assertHours("0", snap.getIdleHours());     // floored, never negative
        assertHours("0", snap.getApprovedProductiveHours());
    }

    @Test
    void benchHoursOnAWeekend_haveNoAvailableHours_andNullPct() {
        dailyLog(SATURDAY, EodEntry.Status.APPROVED, true, List.of(line("BENCH", false, "4.00")));

        UtilSnapshot snap = service.computeSnapshot(EMP_ID, SATURDAY);

        assertHours("0", snap.getAvailableHours());
        assertHours("4", snap.getBenchHours());
        assertHours("0", snap.getIdleHours());
        assertNull(snap.getUtilizationPct()); // THE SPINE: available == 0 gives null, never 0.0
    }

    // ── PM / Admin (MANAGEMENT-line) snapshots are unchanged ──────────────────

    @Test
    void managementLogLines_stayUncounted_asBefore() {
        // A PM / Admin / RM / Lead Daily Log: benchMode false, MANAGEMENT lines, fully approved.
        dailyLog(TUESDAY, EodEntry.Status.APPROVED, false, List.of(
                line("MANAGEMENT", true, "6.00"), line("MANAGEMENT", false, "2.00")));

        UtilSnapshot snap = service.computeSnapshot(EMP_ID, TUESDAY);

        assertHours("0", snap.getApprovedProductiveHours());
        assertHours("0", snap.getBenchHours());
        assertHours("8", snap.getIdleHours());
        assertEquals(new BigDecimal("0.00"), snap.getUtilizationPct());
        // Not even read: a non-bench Daily Log never touches eod_log_line in the snapshot.
        verify(logLineRepository, never()).findByEntryIdOrderBySortOrderAscIdAsc(any());
    }

    @Test
    void benchScopeLineOnANonBenchEntry_isNotCounted() {
        dailyLog(TUESDAY, EodEntry.Status.APPROVED, false, List.of(line("BENCH", false, "8.00")));

        UtilSnapshot snap = service.computeSnapshot(EMP_ID, TUESDAY);

        assertHours("0", snap.getBenchHours());
    }

    @Test
    void managementLineOnABenchEntry_isNotCounted() {
        // Cannot be saved through the API (scope is validated); proves only BENCH-scope lines count.
        dailyLog(TUESDAY, EodEntry.Status.APPROVED, true, List.of(
                line("MANAGEMENT", true, "5.00"), line("BENCH", false, "1.00")));

        UtilSnapshot snap = service.computeSnapshot(EMP_ID, TUESDAY);

        assertHours("0", snap.getApprovedProductiveHours());
        assertHours("1", snap.getBenchHours());
    }
}
