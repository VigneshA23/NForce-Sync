package com.nforceone.sync.teamlead;

import com.nforceone.sync.approval2.EodProjectApprovalRepository;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.ShiftDefinitionRepository;
import com.nforceone.sync.config.BusinessClock;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.org.DesignationRepository;
import com.nforceone.sync.project.Allocation;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectLabel;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.reports.TeamEodByEmployeeReportService;
import com.nforceone.sync.reports.dto.EodByEmployeeReportDto;
import com.nforceone.sync.reports.dto.EodByEmployeeRowDto;
import com.nforceone.sync.reports.dto.TeamReportFiltersDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Team Lead scope on what a member's row names: only the projects the lead leads. A lead may also be PM on other
 * projects and a reporting manager for some people, but each section shows only its own set; here "led" means
 * {@code project.lead_id}, the definition LeadTeamPolicy already owns.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LeadProjectScopeTest {

    private static final LocalDate DAY = LocalDate.of(2026, 10, 28);

    @Mock AllocationRepository allocationRepository;
    @Mock ProjectRepository projectRepository;
    @Mock EodProjectApprovalRepository pieceRepository;
    @Mock AppUserRepository appUserRepository;
    @Mock EodEntryRepository eodEntryRepository;
    @Mock DesignationRepository designationRepository;
    @Mock ShiftDefinitionRepository shiftRepository;
    @Mock LeadTeamPolicy leadTeamPolicy;

    private Project sync, onehr, arena, pulse, traction, qforce;
    private AppUser vignesh, jaspreet, sravani;

    @BeforeEach
    void setUp() {
        vignesh = user(160L, "Vignesh Appani", AppUser.Role.EMPLOYEE);
        jaspreet = user(1L, "Jaspreet Kour", AppUser.Role.EMPLOYEE);
        sravani = user(2L, "Sravani Pilla", AppUser.Role.EMPLOYEE);
        sync = project(88L, "SYNC", "Nforce Sync", "Acme", vignesh);
        onehr = project(89L, "ONEHR", "Nforce OneHR", "Acme", vignesh);
        arena = project(91L, "ARENA", "Nforce Arena", "Globex", null);
        pulse = project(96L, "PULSE", "Nforce Pulse", "Initech", null);
        traction = project(90L, "TRACTION", "Nforce Traction", "Initech", null);
        qforce = project(97L, "QFORCE AI", "QForce AI", "Umbrella", null);
    }

    private static AppUser user(Long id, String name, AppUser.Role role) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setFullName(name);
        u.setRole(role);
        u.setStatus(AppUser.Status.ACTIVE);
        u.setEmployeeCode("NF-" + id);
        return u;
    }

    private static Project project(Long id, String code, String name, String client, AppUser lead) {
        Project p = new Project();
        p.setId(id);
        p.setCode(code);
        p.setName(name);
        p.setClient(client);
        p.setLead(lead);
        return p;
    }

    private static Allocation alloc(AppUser emp, Project p) {
        Allocation a = new Allocation();
        a.setEmployee(emp);
        a.setProject(p);
        a.setEffectiveFrom(DAY.minusDays(30));
        return a;
    }

    // ── The label ──────────────────────────────────────────────────────────────

    @Test
    void label_isCodeDashName_andDegradesGracefully() {
        assertEquals("SYNC — Nforce Sync", ProjectLabel.of(sync));
        assertEquals("Nforce Sync", ProjectLabel.of(null, "Nforce Sync"));
        assertEquals("SYNC", ProjectLabel.of("SYNC", " "));
        assertEquals("", ProjectLabel.of(null, null));
    }

    // ── Member rows ────────────────────────────────────────────────────────────

    @Test
    void leadOfTwoProjects_memberOnLedAndNonLed_rowsNameOnlyTheLedOnes() {
        Set<Long> led = Set.of(sync.getId(), onehr.getId());
        Map<Long, List<String>> labels = TeamLeadService.projectLabelsByEmployee(List.of(
                alloc(jaspreet, arena), alloc(jaspreet, onehr), alloc(jaspreet, pulse), alloc(jaspreet, sync),
                alloc(sravani, arena), alloc(sravani, sync)), led);

        assertEquals(List.of("ONEHR — Nforce OneHR", "SYNC — Nforce Sync"), labels.get(jaspreet.getId()));
        assertEquals(List.of("SYNC — Nforce Sync"), labels.get(sravani.getId()));
    }

    @Test
    void reportingManagerSection_noScope_keepsEveryProject() {
        Map<Long, List<String>> labels = TeamLeadService.projectLabelsByEmployee(List.of(
                alloc(jaspreet, arena), alloc(jaspreet, sync)), null);
        assertEquals(List.of("ARENA — Nforce Arena", "SYNC — Nforce Sync"), labels.get(jaspreet.getId()));
    }

    @Test
    void leadOfNoProjects_namesNothing() {
        Map<Long, List<String>> labels = TeamLeadService.projectLabelsByEmployee(List.of(
                alloc(jaspreet, arena), alloc(jaspreet, sync)), Set.of());
        assertTrue(labels.isEmpty());
    }

    @Test
    void sameProjectTwice_isListedOnce() {
        Map<Long, List<String>> labels = TeamLeadService.projectLabelsByEmployee(List.of(
                alloc(jaspreet, sync), alloc(jaspreet, sync)), Set.of(sync.getId()));
        assertEquals(List.of("SYNC — Nforce Sync"), labels.get(jaspreet.getId()));
    }

    @Test
    void leadOnOneProjectAndPmOnAnother_leadSectionShowsOnlyTheLedProject() {
        // Dheeraj leads PULSE and TRACTION and is PM of QFORCE AI. The Team Lead scope is project.lead_id only.
        AppUser dheeraj = user(159L, "Dheeraj S", AppUser.Role.EMPLOYEE);
        pulse.setLead(dheeraj);
        traction.setLead(dheeraj);
        qforce.setPm(dheeraj);
        when(projectRepository.findByLeadIdOrderByNameAsc(dheeraj.getId())).thenReturn(List.of(traction, pulse));
        LeadTeamPolicy policy = new LeadTeamPolicy(allocationRepository, projectRepository, pieceRepository);

        Set<Long> led = policy.ledProjectIds(dheeraj.getId());
        assertEquals(Set.of(pulse.getId(), traction.getId()), led);
        assertFalse(led.contains(qforce.getId()));

        Map<Long, List<String>> labels = TeamLeadService.projectLabelsByEmployee(
                List.of(alloc(jaspreet, qforce), alloc(jaspreet, pulse)), led);
        assertEquals(List.of("PULSE — Nforce Pulse"), labels.get(jaspreet.getId()));
    }

    // ── Team Reports: project codes, client and the Client dropdown ───────────

    private TeamEodByEmployeeReportService reportService() {
        return new TeamEodByEmployeeReportService(appUserRepository, allocationRepository, eodEntryRepository,
                designationRepository, shiftRepository, projectRepository, leadTeamPolicy,
                new BusinessClock(BusinessClock.DEFAULT_ZONE));
    }

    private void asLead(AppUser lead, Set<Long> led, List<AppUser> team) {
        when(appUserRepository.findByEmailAndDeletedAtIsNull("lead@nforceone.com")).thenReturn(Optional.of(lead));
        when(projectRepository.existsByLeadIdAndStatus(lead.getId(), Project.Status.ACTIVE)).thenReturn(true);
        when(leadTeamPolicy.ledProjectIds(lead.getId())).thenReturn(led);
        when(leadTeamPolicy.teamMembers(lead.getId())).thenReturn(team);
        when(projectRepository.findByLeadIdOrderByNameAsc(lead.getId())).thenReturn(List.of(onehr, sync));
        when(shiftRepository.findAll()).thenReturn(List.of());
        when(eodEntryRepository.findWithTasksByEmployeeIdInAndEntryDateBetween(any(), any(), any())).thenReturn(List.of());
    }

    @Test
    void clientDropdown_offersOnlyTheClientsOfLedProjects() {
        asLead(vignesh, Set.of(sync.getId(), onehr.getId()), List.of(jaspreet, sravani));
        when(allocationRepository.findByEmployeeIdIn(any())).thenReturn(List.of(
                alloc(jaspreet, sync), alloc(jaspreet, arena), alloc(sravani, pulse)));

        TeamReportFiltersDto filters = reportService().getFilters("lead@nforceone.com");

        assertEquals(List.of("Acme"), filters.clients());   // not Globex or Initech
        assertEquals(List.of("Nforce OneHR", "Nforce Sync"),
                filters.projects().stream().map(p -> p.name()).toList());
    }

    @Test
    void clientDropdown_superAdminKeepsTheTeamWideList() {
        AppUser admin = user(155L, "Ramesh", AppUser.Role.SUPERADMIN);
        asLead(admin, Set.of(), List.of());
        when(appUserRepository.findAll()).thenReturn(List.of(admin, jaspreet));   // Super Admin's "team" is everyone
        when(allocationRepository.findByEmployeeIdIn(any()))
                .thenReturn(List.of(alloc(jaspreet, sync), alloc(jaspreet, arena)));

        assertEquals(List.of("Acme", "Globex"), reportService().getFilters("lead@nforceone.com").clients());
    }

    @Test
    void reportRow_namesOnlyLedProjectCodesAndClient() {
        asLead(vignesh, Set.of(sync.getId()), List.of(jaspreet));
        // ARENA sorts before SYNC by name, so unscoped it would be the row's primary project and client.
        when(allocationRepository.findActiveInRangeForEmployees(any(), any(), any()))
                .thenReturn(List.of(alloc(jaspreet, arena), alloc(jaspreet, sync)));

        EodByEmployeeReportDto report =
                reportService().getReport("lead@nforceone.com", DAY, DAY, null, null, null, null);

        EodByEmployeeRowDto row = report.employees().get(0);
        assertEquals(List.of("SYNC"), row.projectCodes());
        assertEquals("Acme", row.client());
    }
}
