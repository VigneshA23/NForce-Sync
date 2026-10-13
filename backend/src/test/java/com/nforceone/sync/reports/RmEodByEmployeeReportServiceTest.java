package com.nforceone.sync.reports;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.ShiftDefinitionRepository;
import com.nforceone.sync.eod.EodAccessPolicy;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.org.DesignationRepository;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.reports.dto.EodByEmployeeReportDto;
import com.nforceone.sync.reports.dto.EodByEmployeeRowDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

/**
 * My Reporting Team > Reports: which entries and which employees the caller gets. The roster and the access
 * gate come from {@link EodAccessPolicy} (stubbed here; its own rules are in EodAccessPolicyReportingTeamTest).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RmEodByEmployeeReportServiceTest {

    private static final LocalDate FROM = LocalDate.of(2026, 10, 1);
    private static final LocalDate TO = LocalDate.of(2026, 10, 13);

    @Mock AppUserRepository appUserRepository;
    @Mock AllocationRepository allocationRepository;
    @Mock EodEntryRepository eodEntryRepository;
    @Mock DesignationRepository designationRepository;
    @Mock ShiftDefinitionRepository shiftRepository;
    @Mock EodAccessPolicy accessPolicy;

    private RmEodByEmployeeReportService service;
    private AppUser rm, activeWithEntries, activeNoEntries, former;

    @BeforeEach
    void setUp() {
        rm = user(1L, "Dheeraj");
        activeWithEntries = user(2L, "Vignesh");
        activeNoEntries = user(3L, "Zero Entries");
        former = user(4L, "Former Report");
        when(appUserRepository.findByEmailAndDeletedAtIsNull(rm.getEmail())).thenReturn(Optional.of(rm));
        when(appUserRepository.findAllById(any())).thenAnswer(inv -> {
            Collection<Long> ids = inv.getArgument(0);
            return List.of(rm, activeWithEntries, activeNoEntries, former).stream()
                    .filter(u -> ids.contains(u.getId())).toList();
        });
        when(allocationRepository.findActiveInRangeForEmployees(anyList(), any(), any())).thenReturn(List.of());
        when(shiftRepository.findAll()).thenReturn(List.of());
        when(accessPolicy.mayViewReportingTeamReports(rm)).thenReturn(true);
        // Current ACTIVE reports are 2 and 3; whoever the entries add is merged in, as the real policy does.
        when(accessPolicy.reportingTeamReportRoster(any(), anyCollection())).thenAnswer(inv -> {
            Set<Long> roster = new java.util.LinkedHashSet<>(List.of(2L, 3L));
            roster.addAll(inv.<Collection<Long>>getArgument(1));
            roster.remove(1L);
            return roster;
        });
        service = new RmEodByEmployeeReportService(appUserRepository, allocationRepository, eodEntryRepository,
                designationRepository, shiftRepository, accessPolicy);
    }

    private static AppUser user(Long id, String name) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setFullName(name);
        u.setEmployeeCode("E" + id);
        u.setEmail(name.toLowerCase().replace(" ", ".") + "@example.com");
        return u;
    }

    private static EodEntry entry(Long id, AppUser employee, EodEntry.Status status, double hours) {
        EodEntry e = new EodEntry();
        e.setId(id);
        e.setEmployee(employee);
        e.setManagerId(1L);
        e.setStatus(status);
        e.setEntryDate(LocalDate.of(2026, 10, 5));
        EodTask t = new EodTask();
        t.setEodEntry(e);
        t.setHours(BigDecimal.valueOf(hours));
        e.setTasks(new ArrayList<>(List.of(t)));
        return e;
    }

    private void snapshotEntries(EodEntry... entries) {
        when(eodEntryRepository.findWithTasksByManagerIdAndEntryDateBetween(1L, FROM, TO)).thenReturn(List.of(entries));
    }

    private EodByEmployeeReportDto report(Long employeeId) {
        return service.getReport(rm.getEmail(), FROM, TO, employeeId, null, null, null, null);
    }

    @Test
    void callerWithNoDirectReportsIsForbidden() {
        when(accessPolicy.mayViewReportingTeamReports(rm)).thenReturn(false);
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> report(null));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    @Test
    void employeeIdOutsideTheReportingTeamIsForbidden() {
        snapshotEntries();
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> report(99L));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    @Test
    void currentReportsAppearEvenWithNoEntriesSoTheAverageDenominatorIsTheTeamSize() {
        snapshotEntries(entry(10L, activeWithEntries, EodEntry.Status.APPROVED, 8));
        EodByEmployeeReportDto dto = report(null);
        assertEquals(2, dto.employeeCount());
        EodByEmployeeRowDto zero = dto.employees().stream().filter(r -> r.employeeId() == 3L).findFirst().orElseThrow();
        assertEquals(0, zero.entryCount());
        assertEquals("MISSING", zero.status());
        assertEquals(0, new BigDecimal("8").compareTo(dto.totalHours()));
    }

    @Test
    void aFormerReportWithApprovedSnapshotEntriesIsListedWithThem() {
        snapshotEntries(entry(11L, former, EodEntry.Status.APPROVED, 6));
        EodByEmployeeReportDto dto = report(null);
        EodByEmployeeRowDto row = dto.employees().stream().filter(r -> r.employeeId() == 4L).findFirst().orElseThrow();
        assertEquals(1, row.entryCount());
        assertEquals(0, new BigDecimal("6").compareTo(row.totalHours()));
    }

    @Test
    void aFormerReportWhoseEntriesAreNotApprovedIsNeverShownAsAnEmptyRow() {
        snapshotEntries(entry(12L, former, EodEntry.Status.SUBMITTED, 6));
        EodByEmployeeReportDto dto = report(null);
        assertTrue(dto.employees().stream().noneMatch(r -> r.employeeId() == 4L));
    }

    @Test
    void aFormerReportCanBeAskedForByIdOnlyWhenTheyHaveSnapshotEntriesInTheRange() {
        snapshotEntries(entry(13L, former, EodEntry.Status.APPROVED, 4));
        assertEquals(1, report(4L).employeeCount());

        snapshotEntries();
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> report(4L));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    @Test
    void employeeIdNarrowsToThatOnePerson() {
        snapshotEntries(entry(14L, activeWithEntries, EodEntry.Status.APPROVED, 8));
        EodByEmployeeReportDto dto = report(2L);
        assertEquals(1, dto.employeeCount());
        assertEquals(2L, dto.employees().get(0).employeeId());
    }

    @Test
    void theCallersOwnEntriesAreNeverListed() {
        snapshotEntries(entry(15L, rm, EodEntry.Status.APPROVED, 8));
        EodByEmployeeReportDto dto = report(null);
        assertTrue(dto.employees().stream().noneMatch(r -> r.employeeId() == 1L));
    }

    @Test
    void theSnapshotQueryIsAskedForTheCallerNotForCurrentReports() {
        snapshotEntries();
        report(null);
        org.mockito.Mockito.verify(eodEntryRepository).findWithTasksByManagerIdAndEntryDateBetween(anyLong(), any(), any());
        org.mockito.Mockito.verify(eodEntryRepository, org.mockito.Mockito.never())
                .findWithTasksByEmployeeIdInAndEntryDateBetween(anyList(), any(), any());
    }
}
