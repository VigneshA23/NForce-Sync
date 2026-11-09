package com.nforceone.sync.project;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.project.dto.AllocationDto;
import com.nforceone.sync.project.dto.UpdateAllocationRequest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * AllocationService#update. A project change ALWAYS updates the same row in place — whether the
 * allocation is in the future or already running — and never ends a row or creates a new one. Also
 * covers the guards that apply to a project change: Team Lead of the old project, and the target
 * project's ACTIVE status, start date, duplicate overlap and the employee's capacity.
 */
@ExtendWith(MockitoExtension.class)
class AllocationServiceUpdateTest {

    @Mock private AllocationRepository allocationRepository;
    @Mock private ProjectRepository projectRepository;
    @Mock private AppUserRepository appUserRepository;
    @Mock private PmScopeService pmScopeService;

    private AllocationService service;
    private AppUser employee;
    private Project oldProject;
    private Project newProject;

    @BeforeEach
    void setUp() {
        service = new AllocationService(allocationRepository, projectRepository, appUserRepository, pmScopeService);
        // The advisory lock is a native query on the EntityManager; deep stubs let it return null.
        EntityManager em = mock(EntityManager.class, Mockito.RETURNS_DEEP_STUBS);
        ReflectionTestUtils.setField(service, "entityManager", em);

        employee = user(1L, "Asha Rao");
        oldProject = project(100L, "OLD", null);
        newProject = project(200L, "NEW", null);
    }

    // ── no project change ─────────────────────────────────────────────────────

    @Test
    void noProjectId_editsDatesAndShareInPlace() {
        Allocation row = row(10L, oldProject, "2026-10-01", null, 50);
        stubFind(row);
        stubSave();

        AllocationDto dto = service.update(10L, req("2026-10-01", "2026-12-31", 60, null));

        assertEquals(10L, dto.id());
        assertEquals(100L, dto.projectId());
        assertEquals(LocalDate.of(2026, 12, 31), row.getEffectiveTo());
        assertEquals(60, row.getAllocationPct());
        verify(projectRepository, never()).findById(any());
        verify(allocationRepository, times(1)).saveAndFlush(row);
    }

    @Test
    void sameProjectId_isTreatedAsNoProjectChange() {
        Allocation row = row(10L, oldProject, "2026-10-01", null, 50);
        stubFind(row);
        stubSave();

        service.update(10L, req("2026-10-01", null, 70, 100L));

        assertSame(oldProject, row.getProject());
        assertEquals(70, row.getAllocationPct());
        verify(projectRepository, never()).findById(any());
        verify(allocationRepository, times(1)).saveAndFlush(row);
    }

    // ── project change: always the same row, in place ─────────────────────────

    @Test
    void futureStart_projectChange_updatesTheSameRowInPlace() {
        Allocation row = row(10L, oldProject, "2026-12-01", null, 50);
        stubFind(row);
        stubTarget();
        stubSave();

        AllocationDto dto = service.update(10L, req("2026-12-05", "2027-01-31", 40, 200L));

        assertEquals(10L, dto.id());
        assertEquals(200L, dto.projectId());
        assertSame(newProject, row.getProject());
        assertEquals(LocalDate.of(2026, 12, 5), row.getEffectiveFrom());
        assertEquals(LocalDate.of(2027, 1, 31), row.getEffectiveTo());
        assertEquals(40, row.getAllocationPct());
        verify(allocationRepository, times(1)).saveAndFlush(row);
    }

    @Test
    void alreadyStarted_projectChange_alsoUpdatesTheSameRow_withNothingEndedOrCreated() {
        // Started well before any "today": the old window is NOT end-dated and no second row appears.
        Allocation row = row(10L, oldProject, "2026-01-01", null, 50);
        stubFind(row);
        stubTarget();
        stubSave();

        AllocationDto dto = service.update(10L, req("2026-01-01", null, 50, 200L));

        assertEquals(10L, dto.id());
        assertEquals(200L, dto.projectId());
        assertSame(newProject, row.getProject());
        // dates and share untouched — the whole period, past included, now belongs to the new project
        assertEquals(LocalDate.of(2026, 1, 1), row.getEffectiveFrom());
        assertNull(row.getEffectiveTo());
        assertEquals(50, row.getAllocationPct());
        verify(allocationRepository, times(1)).saveAndFlush(row);   // the one row, and only that
        verify(allocationRepository, never()).save(any());
    }

    @Test
    void startedAllocation_projectChange_withALaterEffectiveFrom_updatesTheSameRowInPlace() {
        Allocation row = row(10L, oldProject, "2026-01-01", null, 50);
        stubFind(row);
        stubTarget();
        stubSave();

        AllocationDto dto = service.update(10L, req("2026-06-01", null, 50, 200L));

        assertEquals(10L, dto.id());
        assertSame(newProject, row.getProject());
        assertEquals(LocalDate.of(2026, 6, 1), row.getEffectiveFrom());
        assertNull(row.getEffectiveTo(), "the old window is not end-dated");
        verify(allocationRepository, times(1)).saveAndFlush(row);
        verify(allocationRepository, never()).save(any());
    }

    @Test
    void startedAllocation_projectChange_withAnEarlierEffectiveFrom_isAlsoFine() {
        // Any valid date works; there is no "must be after the old start" rule.
        Allocation row = row(10L, oldProject, "2026-01-01", null, 50);
        stubFind(row);
        stubTarget();
        stubSave();

        service.update(10L, req("2025-12-01", null, 50, 200L));

        assertSame(newProject, row.getProject());
        assertEquals(LocalDate.of(2025, 12, 1), row.getEffectiveFrom());
        verify(allocationRepository, times(1)).saveAndFlush(row);
    }

    @Test
    void startedAllocation_effectiveFromOnOrBeforeTheOldStart_neverTriggersTheRemovedRule() {
        // The removed end-and-create rule rejected exactly these requests with "This allocation
        // started on … Effective From must be after that date, so the current allocation can end the
        // day before." Each must now succeed, and the old message must be unreachable.
        for (String requestedFrom : List.of("2026-01-01", "2025-12-31", "2025-06-01", "2026-01-02", "2026-11-01")) {
            Allocation row = row(10L, oldProject, "2026-01-01", null, 50);
            stubFind(row);
            stubTarget();
            stubSave();

            AllocationDto dto = assertDoesNotThrow(
                    () -> service.update(10L, req(requestedFrom, null, 50, 200L)), requestedFrom);

            assertEquals(200L, dto.projectId(), requestedFrom);
            assertSame(newProject, row.getProject(), requestedFrom);
            assertEquals(LocalDate.parse(requestedFrom), row.getEffectiveFrom(), requestedFrom);
            assertNull(row.getEffectiveTo(), requestedFrom);
        }
        // every iteration saves its own edited row via saveAndFlush; no row is ever created via save()
        verify(allocationRepository, never()).save(any());
    }

    @Test
    void projectChange_onAStartedAllocation_isOnlySubjectToTheNamedChecks() {
        // Valid dates on a started allocation, only the target project is bad → ONLY that check fires.
        newProject.setStatus(Project.Status.COMPLETED);
        Allocation row = row(10L, oldProject, "2026-01-01", null, 50);
        stubFind(row);
        stubTarget();

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.update(10L, req("2026-01-01", null, 50, 200L)));

        assertTrue(ex.getReason().contains("only ACTIVE projects can be allocated"));
        assertFalse(ex.getReason().contains("end the day before"));
        assertFalse(ex.getReason().contains("started on"));
    }

    @Test
    void projectChange_keepsTheSameRowIdAndLeavesOneRowPerAllocation() {
        // A list-backed stand-in for the table: ARENA → TRACTION must leave exactly one row.
        Project arena = project(300L, "ARENA", null);
        Project traction = project(400L, "TRACTION", null);
        List<Allocation> table = new ArrayList<>();
        table.add(row(10L, arena, "2026-01-01", null, 50));
        table.add(row(11L, oldProject, "2026-01-01", null, 30));

        when(allocationRepository.findById(10L)).thenReturn(Optional.of(table.get(0)));
        when(projectRepository.findById(400L)).thenReturn(Optional.of(traction));
        when(allocationRepository.saveAndFlush(any(Allocation.class))).thenAnswer(i -> {
            Allocation a = i.getArgument(0);
            if (table.stream().noneMatch(r -> r == a)) table.add(a);   // would add a row only if a new one were created
            return a;
        });
        when(allocationRepository.findAllWithRefsOrderByEffectiveFromDesc()).thenAnswer(i -> new ArrayList<>(table));

        service.update(10L, req("2026-01-01", null, 50, 400L));

        List<AllocationDto> listed = service.listAll(null);
        assertEquals(2, listed.size(), "still one row per allocation");
        AllocationDto edited = listed.stream().filter(d -> d.id() == 10L).findFirst().orElseThrow();
        assertEquals("TRACTION", edited.projectCode());
        assertEquals(1, listed.stream().filter(d -> d.id() == 10L).count());
        assertTrue(listed.stream().noneMatch(d -> d.projectCode().equals("ARENA")), "nothing left on ARENA");
    }

    @Test
    void projectChange_capacityCheckExcludesTheRowBeingEdited() {
        Allocation row = row(10L, oldProject, "2026-10-01", null, 50);
        stubFind(row);
        stubTarget();
        stubSave();

        service.update(10L, req("2026-11-15", null, 60, 200L));

        verify(allocationRepository).findOverlappingForEmployee(
                eq(1L), eq(LocalDate.of(2026, 11, 15)), eq(Allocation.OPEN_ENDED), eq(Allocation.OPEN_ENDED), eq(10L));
        verify(allocationRepository).findOverlapping(
                eq(1L), eq(200L), eq(LocalDate.of(2026, 11, 15)), eq(Allocation.OPEN_ENDED),
                eq(Allocation.OPEN_ENDED), eq(10L));
    }

    // ── Team Lead guard ───────────────────────────────────────────────────────

    @Test
    void teamLeadOfTheOldProject_cannotBeMoved_onARunningAllocation() {
        oldProject.setLead(employee);
        Allocation row = row(10L, oldProject, "2026-01-01", null, 50);
        stubFind(row);
        stubTarget();

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.update(10L, req("2026-01-01", null, 50, 200L)));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertEquals("Asha Rao is the Team Lead of OLD. Assign another Team Lead (or clear it) before moving this allocation.",
                ex.getReason());
        assertSame(oldProject, row.getProject());
        verify(allocationRepository, never()).saveAndFlush(any());
    }

    @Test
    void teamLeadOfTheOldProject_cannotBeMoved_onAFutureAllocationEither() {
        oldProject.setLead(employee);
        Allocation row = row(10L, oldProject, "2099-01-01", null, 50);
        stubFind(row);
        stubTarget();

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.update(10L, req("2099-01-05", null, 50, 200L)));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("Team Lead of OLD"));
        assertSame(oldProject, row.getProject());
        verify(allocationRepository, never()).saveAndFlush(any());
    }

    @Test
    void teamLead_canStillEditDatesWithoutChangingProject() {
        // The guard is about MOVING the allocation, not editing it.
        oldProject.setLead(employee);
        Allocation row = row(10L, oldProject, "2026-10-01", null, 50);
        stubFind(row);
        stubSave();

        assertDoesNotThrow(() -> service.update(10L, req("2026-10-01", "2026-12-31", 50, null)));
        assertEquals(LocalDate.of(2026, 12, 31), row.getEffectiveTo());
    }

    @Test
    void leadOfADifferentProject_isNotBlocked() {
        oldProject.setLead(user(2L, "Someone Else"));
        Allocation row = row(10L, oldProject, "2026-12-01", null, 50);
        stubFind(row);
        stubTarget();
        stubSave();

        assertDoesNotThrow(() -> service.update(10L, req("2026-12-05", null, 50, 200L)));
        assertSame(newProject, row.getProject());
    }

    // ── checks re-run for the new project ─────────────────────────────────────

    @Test
    void targetProjectMustBeActive() {
        newProject.setStatus(Project.Status.COMPLETED);
        Allocation row = row(10L, oldProject, "2026-10-01", null, 50);
        stubFind(row);
        stubTarget();

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.update(10L, req("2026-10-01", null, 50, 200L)));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("only ACTIVE projects can be allocated"));
        assertSame(oldProject, row.getProject());
        verify(allocationRepository, never()).saveAndFlush(any());
    }

    @Test
    void effectiveFromBeforeTheNewProjectsStart_isRejected() {
        newProject.setStartDate(LocalDate.of(2026, 12, 1));
        Allocation row = row(10L, oldProject, "2026-10-01", null, 50);
        stubFind(row);
        stubTarget();

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.update(10L, req("2026-10-01", null, 50, 200L)));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("project start date"));
        assertSame(oldProject, row.getProject());
    }

    @Test
    void unknownTargetProject_is404() {
        Allocation row = row(10L, oldProject, "2026-10-01", null, 50);
        stubFind(row);
        when(projectRepository.findById(200L)).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.update(10L, req("2026-10-01", null, 50, 200L)));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }

    @Test
    void duplicateOnTheNewProject_is409_andTheRowIsLeftOnItsOldProject() {
        Allocation row = row(10L, oldProject, "2026-10-01", null, 50);
        Allocation existing = row(11L, newProject, "2026-11-01", null, 20);
        stubFind(row);
        stubTarget();
        when(allocationRepository.findOverlapping(eq(1L), eq(200L), any(), any(), any(), eq(10L)))
                .thenReturn(List.of(existing));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.update(10L, req("2026-11-15", null, 50, 200L)));

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        assertSame(oldProject, row.getProject());
        verify(allocationRepository, never()).saveAndFlush(any());
    }

    @Test
    void overCapacity_isRejected_countingOnlyTheEmployeesOtherAllocations() {
        Allocation row = row(10L, oldProject, "2026-10-01", null, 50);
        Allocation other = row(12L, oldProject, "2026-11-01", null, 80);
        stubFind(row);
        stubTarget();
        // The repository query already excludes id 10 (verified above); only the other 80% remains.
        when(allocationRepository.findOverlappingForEmployee(eq(1L), any(), any(), any(), eq(10L)))
                .thenReturn(List.of(other));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.update(10L, req("2026-11-15", null, 30, 200L)));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("only 20% is available"));
        assertSame(oldProject, row.getProject());
        verify(allocationRepository, never()).saveAndFlush(any());
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private void stubFind(Allocation row) {
        when(allocationRepository.findById(row.getId())).thenReturn(Optional.of(row));
    }

    private void stubTarget() {
        when(projectRepository.findById(200L)).thenReturn(Optional.of(newProject));
    }

    private void stubSave() {
        when(allocationRepository.saveAndFlush(any(Allocation.class))).thenAnswer(i -> i.getArgument(0));
    }

    private static UpdateAllocationRequest req(String from, String to, int pct, Long projectId) {
        return new UpdateAllocationRequest(LocalDate.parse(from), to == null ? null : LocalDate.parse(to), pct, projectId);
    }

    private Allocation row(Long id, Project project, String from, String to, int pct) {
        Allocation a = new Allocation();
        a.setId(id);
        a.setEmployee(employee);
        a.setProject(project);
        a.setEffectiveFrom(LocalDate.parse(from));
        a.setEffectiveTo(to == null ? null : LocalDate.parse(to));
        a.setAllocationPct(pct);
        return a;
    }

    private static AppUser user(Long id, String name) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setFullName(name);
        u.setRole(AppUser.Role.EMPLOYEE);
        return u;
    }

    private static Project project(Long id, String code, AppUser lead) {
        Project p = new Project();
        p.setId(id);
        p.setCode(code);
        p.setName(code + " project");
        p.setStatus(Project.Status.ACTIVE);
        p.setLead(lead);
        return p;
    }
}
