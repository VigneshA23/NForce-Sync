package com.nforceone.sync.project;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.eod.EodTaskRepository;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.org.DesignationRepository;
import com.nforceone.sync.businessrules.ShiftDefinitionRepository;
import com.nforceone.sync.pmblockers.PmBlockersService;
import com.nforceone.sync.pmblockers.dto.PmBlockerDto;
import com.nforceone.sync.project.dto.AllocationDto;
import com.nforceone.sync.project.dto.CreateProjectRequest;
import com.nforceone.sync.project.dto.ProjectFullDto;
import com.nforceone.sync.projectdashboard.ProjectDashboardService;
import com.nforceone.sync.projectdashboard.dto.ProjectDashboardSummaryDto;
import com.nforceone.sync.reports.EodByEmployeeReportService;
import com.nforceone.sync.reports.MissingEodReportService;
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
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Executor;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * PM A vs PM B isolation on the pages that run on the one PmScopeService (a REAL instance here, over mocked
 * repositories whose answers apply the same predicates as the queries they stand in for): Blockers, Reports
 * (and, through getReport, their export), Missing-EOD reminders, the Project Dashboard / Projects Utilization
 * payload, the project and allocation reads, and the capacity-based Team Lead / PM assignment rules.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PmPagesScopeTest {

    private static final LocalDate FROM = LocalDate.of(2026, 10, 1);
    private static final LocalDate TO = LocalDate.of(2026, 10, 12);

    @Mock AppUserRepository userRepository;
    @Mock ProjectRepository projectRepository;
    @Mock AllocationRepository allocationRepository;
    @Mock EodEntryRepository entryRepository;
    @Mock EodTaskRepository taskRepository;
    @Mock DesignationRepository designationRepository;
    @Mock ShiftDefinitionRepository shiftRepository;
    @Mock HolidayRepository holidayRepository;
    @Mock BusinessRuleConfigRepository configRepository;
    @Mock TaskCategoryRepository taskCategoryRepository;
    @Mock NotificationService notificationService;
    @Mock com.nforceone.sync.org.ProjectTypeRepository projectTypeRepository;
    @Mock com.nforceone.sync.approval2.EodProjectApprovalRepository pieceRepository;

    private PmScopeService scope;
    private AppUser pmA, pmB, admin, ravi, sita, outsider, dheeraj;
    private Project projA, projB;
    private final List<Allocation> allocations = new ArrayList<>();

    @BeforeEach
    void setUp() {
        scope = new PmScopeService(projectRepository, allocationRepository);

        pmA = user(1L, AppUser.Role.PM, "pma@example.com", "PM A");
        pmB = user(2L, AppUser.Role.PM, "pmb@example.com", "PM B");
        admin = user(3L, AppUser.Role.ADMIN, "admin@example.com", "Admin");
        ravi = user(10L, AppUser.Role.EMPLOYEE, "ravi@example.com", "Ravi");     // on A and on B
        sita = user(11L, AppUser.Role.EMPLOYEE, "sita@example.com", "Sita");     // on A only
        outsider = user(12L, AppUser.Role.EMPLOYEE, "out@example.com", "Outsider");   // on B only
        dheeraj = user(4L, AppUser.Role.EMPLOYEE, "dheeraj@example.com", "Dheeraj");  // PM-by-assignment
        for (AppUser u : List.of(pmA, pmB, admin, ravi, sita, outsider, dheeraj)) {
            when(userRepository.findByEmailAndDeletedAtIsNull(u.getEmail())).thenReturn(Optional.of(u));
            when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));
            u.setStatus(AppUser.Status.ACTIVE);
        }

        projA = project(10L, "A", pmA, Project.Status.ACTIVE);
        projB = project(20L, "B", pmB, Project.Status.ACTIVE);
        when(projectRepository.findByPmIdOrderByNameAsc(pmA.getId())).thenReturn(List.of(projA));
        when(projectRepository.findByPmIdOrderByNameAsc(pmB.getId())).thenReturn(List.of(projB));
        when(projectRepository.findByPmIdOrderByNameAsc(dheeraj.getId())).thenReturn(List.of());
        when(projectRepository.findAllWithPmOrderByNameAsc()).thenReturn(List.of(projA, projB));
        when(projectRepository.existsByPmIdAndStatus(dheeraj.getId(), Project.Status.ACTIVE)).thenReturn(false);

        allocations.add(allocation(ravi, projA));
        allocations.add(allocation(ravi, projB));
        allocations.add(allocation(sita, projA));
        allocations.add(allocation(outsider, projB));
        allocations.add(allocation(pmA, projA));   // the PM himself is allocated on his own project
        when(allocationRepository.findActiveInRangeForProjects(any(), any(), any())).thenAnswer(inv -> {
            List<Long> ids = inv.getArgument(0);
            return allocations.stream().filter(a -> ids.contains(a.getProject().getId())).toList();
        });
        when(allocationRepository.findByProjectIdWithRefs(anyLong())).thenAnswer(inv ->
                allocations.stream().filter(a -> a.getProject().getId().equals(inv.getArgument(0))).toList());
        when(allocationRepository.findAllWithRefsOrderByEffectiveFromDesc()).thenReturn(allocations);
        when(allocationRepository.countByProjectIdAndEmployeeRole(anyLong(), any())).thenReturn(0L);
    }

    // ── fixtures ──────────────────────────────────────────────────────────────

    private static AppUser user(Long id, AppUser.Role role, String email, String name) {
        AppUser u = new AppUser(); u.setId(id); u.setRole(role); u.setEmail(email); u.setFullName(name);
        u.setEmployeeCode("NF-" + id);
        return u;
    }

    private static Project project(Long id, String code, AppUser pm, Project.Status status) {
        Project p = new Project(); p.setId(id); p.setCode(code); p.setName(code); p.setPm(pm); p.setStatus(status);
        return p;
    }

    private static Allocation allocation(AppUser who, Project project) {
        Allocation a = new Allocation();
        a.setEmployee(who); a.setProject(project);
        a.setEffectiveFrom(LocalDate.of(2026, 1, 1));
        return a;
    }

    private EodTask task(EodEntry entry, Project project, String hours, long id) {
        EodTask t = new EodTask();
        t.setId(id); t.setEodEntry(entry); t.setProject(project); t.setHours(new BigDecimal(hours));
        return t;
    }

    private EodEntry entry(long id, AppUser who, EodEntry.Status status) {
        EodEntry e = new EodEntry();
        e.setId(id); e.setEmployee(who); e.setEntryDate(LocalDate.of(2026, 10, 8)); e.setStatus(status);
        e.setEntryForm(EodEntry.EntryForm.PROJECT_GROUPED);
        return e;
    }

    private static ResponseStatusException forbidden(Runnable r) {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, r::run);
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        return ex;
    }

    // ── Reports (EOD by employee) — and the export, which is built from getReport ─

    private EodByEmployeeReportService reports() {
        return new EodByEmployeeReportService(userRepository, projectRepository, allocationRepository,
                entryRepository, designationRepository, shiftRepository, scope);
    }

    @Test
    void reports_peopleAreScopedByAllocation_andOtherPmsProjectDataNeverAppears() {
        // Ravi is on A and on B. He logged 4h on A and 6h on B in ONE approved entry.
        EodEntry e = entry(500, ravi, EodEntry.Status.APPROVED);
        e.getTasks().add(task(e, projA, "4.0", 1));
        e.getTasks().add(task(e, projB, "6.0", 2));
        when(entryRepository.findWithTasksByEmployeeIdInAndEntryDateBetween(any(), any(), any())).thenReturn(List.of(e));

        EodByEmployeeReportDto report = reports().getReport(pmA.getEmail(), FROM, TO, null, null, null, null, null);

        EodByEmployeeRowDto raviRow = report.employees().stream()
                .filter(r -> r.employeeId().equals(ravi.getId())).findFirst().orElseThrow();
        assertThat(raviRow.entries()).extracting(x -> x.projectCode()).containsExactly("A");
        assertThat(raviRow.totalHours()).isEqualByComparingTo("4.0");
        assertThat(report.totalHours()).isEqualByComparingTo("4.0");
    }

    @Test
    void reports_pmA_neverSeesPmBsOnlyPeople_andNeverHimself() {
        when(entryRepository.findWithTasksByEmployeeIdInAndEntryDateBetween(any(), any(), any())).thenReturn(List.of());

        List<Long> people = reports().getReport(pmA.getEmail(), FROM, TO, null, null, null, null, null)
                .employees().stream().map(EodByEmployeeRowDto::employeeId).collect(Collectors.toList());

        assertThat(people).containsExactlyInAnyOrder(ravi.getId(), sita.getId());   // not Outsider (B only), not PM A
    }

    @Test
    void reports_anotherPmsProjectById_is403() {
        forbidden(() -> reports().getReport(pmA.getEmail(), FROM, TO, projB.getId(), null, null, null, null));
    }

    @Test
    void reports_aPlainEmployeeWithNoProject_is403() {
        forbidden(() -> reports().getReport(outsider.getEmail(), FROM, TO, null, null, null, null, null));
    }

    // ── Missing EOD reminders ─────────────────────────────────────────────────

    @Test
    void missingEodReminder_forAnEmployeeOutsideThePmsScope_is403_andNothingIsSent() {
        MissingEodReportService missing = new MissingEodReportService(userRepository, projectRepository,
                allocationRepository, entryRepository, holidayRepository, configRepository, designationRepository,
                notificationService, shiftRepository, scope);

        BusinessRuleConfig config = new BusinessRuleConfig();
        config.setAtRiskMissingPct(new BigDecimal("30"));
        when(configRepository.findById(any())).thenReturn(Optional.of(config));

        forbidden(() -> missing.remindEmployee(pmA.getEmail(), outsider.getId(), FROM, TO, null, null, null, null));
        verify(notificationService, never()).send(any(), any(), any(), any(), any());
    }

    // ── Blockers: A vs B, self-exclusion, foreign project by id ───────────────

    private PmBlockersService blockers() {
        return new PmBlockersService(userRepository, projectRepository, taskRepository, scope);
    }

    private EodTask blocker(long id, AppUser who, Project project) {
        EodEntry e = entry(id * 10, who, EodEntry.Status.SUBMITTED);
        EodTask t = task(e, project, "1", id);
        t.setTaskStatus(EodTask.TaskStatus.BLOCKED);
        return t;
    }

    @Test
    void blockers_eachPmGetsOnlyBlockersOnHisProjects_andNeverHisOwn() {
        EodTask onA = blocker(1, sita, projA);
        EodTask ownOnA = blocker(2, pmA, projA);
        EodTask onB = blocker(3, outsider, projB);
        when(taskRepository.findBlockedByProjectIdsAndDateRange(any(), any(), any())).thenAnswer(inv -> {
            List<Long> ids = inv.getArgument(0);
            return List.of(onA, ownOnA, onB).stream().filter(t -> ids.contains(t.getProject().getId())).toList();
        });

        List<PmBlockerDto> forA = blockers().getBlockers(pmA.getEmail(), FROM, TO, null, null, null);
        List<PmBlockerDto> forB = blockers().getBlockers(pmB.getEmail(), FROM, TO, null, null, null);

        assertThat(forA).extracting(PmBlockerDto::taskId).containsExactly(1L);      // not his own (2), not B's (3)
        assertThat(forB).extracting(PmBlockerDto::taskId).containsExactly(3L);
    }

    @Test
    void blockers_anotherPmsProjectById_is403() {
        forbidden(() -> blockers().getBlockers(pmA.getEmail(), FROM, TO, projB.getId(), null, null));
    }

    // ── Project Dashboard / Projects Utilization ──────────────────────────────

    private ProjectDashboardService dashboard() {
        BusinessRuleConfig config = new BusinessRuleConfig();
        config.setWorkingHoursPerDay(new BigDecimal("8"));
        config.setAtRiskMissingPct(new BigDecimal("30"));
        when(configRepository.findById(any())).thenReturn(Optional.of(config));
        when(holidayRepository.findAllByOrderByHolidayDateAsc()).thenReturn(List.of());
        when(taskCategoryRepository.findIdByName(any())).thenReturn(Optional.empty());
        return new ProjectDashboardService(userRepository, projectRepository, allocationRepository, taskRepository,
                entryRepository, holidayRepository, configRepository, taskCategoryRepository,
                (Executor) Runnable::run, scope);
    }

    @Test
    void dashboard_membersAreThePmsAllocations_withoutTheOtherPmsPeopleOrThePmHimself() {
        ProjectDashboardSummaryDto summary = dashboard().getSummary(pmA.getEmail(), FROM, TO, null, null, null, null);

        assertThat(summary.resourceUtilization()).extracting(r -> r.employeeName())
                .containsExactlyInAnyOrder("Ravi", "Sita");
        assertThat(summary.projectUtilization()).extracting(p -> p.projectName()).containsExactly("A");
        // hours are looked up only for PM A's project and only for his members
        verify(taskRepository).sumHoursByProject(List.of(projA.getId()),
                List.of(ravi.getId(), sita.getId()), FROM, TO);
    }

    @Test
    void dashboard_withNoAllocationsInRange_returnsTheEmptyShape_theScreenshotsZeroPercentCase() {
        allocations.removeIf(a -> a.getProject().getId().equals(projA.getId()));   // nobody allocated to PM A's project

        ProjectDashboardSummaryDto summary = dashboard().getSummary(pmA.getEmail(), FROM, TO, null, null, null, null);

        // "1 active project", 0%, and NO resource rows: the UI shows the distinct "No one is allocated" state.
        assertThat(summary.cards().totalAssignedProjects()).isEqualTo(1);
        assertThat(summary.cards().activeProjects()).isEqualTo(1);
        assertThat(summary.cards().overallUtilizationPct()).isEqualByComparingTo("0");
        assertThat(summary.cards().actualUtilizationPct()).isEqualByComparingTo("0");
        assertThat(summary.resourceUtilization()).isEmpty();
    }

    @Test
    void dashboard_anotherPmsProjectById_is403() {
        forbidden(() -> dashboard().getSummary(pmA.getEmail(), FROM, TO, projB.getId(), null, null, null));
    }

    // ── /api/projects/all and /api/allocations(/project/{id}) ─────────────────

    private ProjectService projects() {
        return new ProjectService(projectRepository, allocationRepository, userRepository, projectTypeRepository,
                pieceRepository, scope);
    }

    private AllocationService allocationService() {
        return new AllocationService(allocationRepository, projectRepository, userRepository, scope);
    }

    @Test
    void projectList_pmSeesOnlyHisProjects_adminAndSuperadminKeepTheWholeList() {
        assertThat(projects().listAll(pmA.getEmail())).extracting(ProjectFullDto::id).containsExactly(projA.getId());
        assertThat(projects().listAll(pmB.getEmail())).extracting(ProjectFullDto::id).containsExactly(projB.getId());
        assertThat(projects().listAll(admin.getEmail())).extracting(ProjectFullDto::id)
                .containsExactlyInAnyOrder(projA.getId(), projB.getId());
    }

    @Test
    void projectList_aPlainEmployeeWhoManagesNothing_is403() {
        forbidden(() -> projects().listAll(outsider.getEmail()));
    }

    @Test
    void allocations_pmA_cannotReadPmBsProjectByIdOrInTheUnfilteredList() {
        forbidden(() -> allocationService().listAllAs(pmA.getEmail(), projB.getId(), null));

        List<AllocationDto> unfiltered = allocationService().listAllAs(pmA.getEmail(), null, null);
        assertThat(unfiltered).extracting(AllocationDto::projectId).containsOnly(projA.getId());
        assertThat(allocationService().listAllAs(pmA.getEmail(), projA.getId(), null)).isNotEmpty();
    }

    @Test
    void allocations_adminStillReadsAnyProjectAndTheWholeOrg() {
        assertThat(allocationService().listAllAs(admin.getEmail(), projB.getId(), null)).isNotEmpty();
        assertThat(allocationService().listAllAs(admin.getEmail(), null, null)).hasSize(allocations.size());
    }

    // ── capacity-based assignment: PM here, Team Lead there ───────────────────

    private CreateProjectRequest create(Long leadId, Long pmId) {
        return new CreateProjectRequest("Z1", "Z", null, 1L, LocalDate.of(2026, 1, 1), null, leadId, pmId);
    }

    @Test
    void aPmRoleUserCanLeadAProject_andAnEmployeeRoleUserCanBeAPm_butNotBothOnTheSameProject() {
        com.nforceone.sync.org.ProjectType type = new com.nforceone.sync.org.ProjectType();
        type.setId(1L); type.setActive(true);
        when(projectTypeRepository.findById(1L)).thenReturn(Optional.of(type));
        when(projectRepository.existsByCode(any())).thenReturn(false);
        when(projectRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // lead = PM-role user (PM of other projects), PM = EMPLOYEE-role user: both allowed now.
        projects().create(create(pmA.getId(), dheeraj.getId()));

        // the same person as both Team Lead and PM of the SAME project: 400.
        ResponseStatusException same = assertThrows(ResponseStatusException.class,
                () -> projects().create(create(dheeraj.getId(), dheeraj.getId())));
        assertEquals(HttpStatus.BAD_REQUEST, same.getStatusCode());

        // system roles still cannot hold the assignment.
        ResponseStatusException sys = assertThrows(ResponseStatusException.class,
                () -> projects().create(create(admin.getId(), dheeraj.getId())));
        assertEquals(HttpStatus.BAD_REQUEST, sys.getStatusCode());
    }

    @Test
    void assignLead_acceptsAPmRoleUser_butStillNotTheProjectsOwnPm() {
        projA.setPm(pmA);
        when(projectRepository.findById(projA.getId())).thenReturn(Optional.of(projA));
        when(projectRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(allocationRepository.countActiveByEmployeeIdAndProjectId(anyLong(), anyLong(), any())).thenReturn(1L);

        projects().assignLead(projA.getId(), pmB.getId());                       // a PM of another project: fine
        assertEquals(pmB.getId(), projA.getLead().getId());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> projects().assignLead(projA.getId(), pmA.getId()));        // this project's own PM: 400
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void assignableLists_offerBothEmployeeAndPmAccounts() {
        when(userRepository.findByRoleInAndStatusAndDeletedAtIsNullOrderByFullNameAsc(any(), any()))
                .thenReturn(List.of(pmA, ravi));

        assertThat(projects().listAssignableLeads()).hasSize(2);
        assertThat(projects().listAssignableProjectManagers()).hasSize(2);
        verify(userRepository, org.mockito.Mockito.times(2)).findByRoleInAndStatusAndDeletedAtIsNullOrderByFullNameAsc(
                List.of(AppUser.Role.EMPLOYEE, AppUser.Role.PM), AppUser.Status.ACTIVE);
    }
}
