package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.eod.dto.EodEntryDto;
import com.nforceone.sync.eod.dto.EodTaskDto;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.TaskCategory;
import com.nforceone.sync.reporting.ReportingScopeService;
import com.nforceone.sync.teamlead.LeadAccessService;
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
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Entry read for a Team Lead: only the tasks on his own projects plus one aggregate "other projects"
 * hours figure — never another lead's project names or task details — and 403 only when he has no
 * task or piece on the entry. Roles with access today keep the full entry.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EodEntryLeadScopeTest {

    @Mock EodEntryRepository entryRepository;
    @Mock com.nforceone.sync.auth.AppUserRepository userRepository;
    @Mock EodAttachmentService attachmentService;
    @Mock LeadAccessService leadAccess;
    @Mock ReportingScopeService reportingScope;
    @Mock NotificationService notificationService;

    private EodService service;

    private AppUser owner, leadA, leadB, rm, pm, admin;
    private Project projA, projB;
    private EodEntry shared;   // Akhila: 4h on A (led by leadA), 3h on B (led by leadB), 1h leave

    @BeforeEach
    void setUp() {
        // Constructor order: entryRepo, taskRepo, userRepo, projectRepo, categoryRepo, actionRepo, configRepo,
        // shiftRepo, holidayRepo, attachmentService, notificationService, approvalPieceRouter, projectApprovalRepo,
        // accessPolicy, leadAccess, allocationRepo, auditLogRepo, logLineRepo
        EodAccessPolicy policy = new EodAccessPolicy(leadAccess, reportingScope);
        service = new EodService(entryRepository, null, userRepository, null, null, null, null, null, null,
                attachmentService, notificationService, null, null, policy, leadAccess, null, null, null);

        owner = user(1L, AppUser.Role.EMPLOYEE, "Akhila S");
        leadA = user(2L, AppUser.Role.EMPLOYEE, "Lead A");
        leadB = user(3L, AppUser.Role.EMPLOYEE, "Lead B");
        rm    = user(4L, AppUser.Role.EMPLOYEE, "Dheeraj S");
        pm    = user(5L, AppUser.Role.PM, "Pm P");
        admin = user(6L, AppUser.Role.ADMIN, "Admin Ad");

        projA = project(10L, "SYNC", "Nforce Sync");
        projB = project(20L, "ARENA", "Nforce Arena");

        shared = new EodEntry();
        shared.setId(100L);
        shared.setEmployee(owner);
        shared.setManagerId(rm.getId());
        shared.setEntryDate(LocalDate.of(2026, 10, 9));
        shared.setStatus(EodEntry.Status.SUBMITTED);
        shared.setEntryForm(EodEntry.EntryForm.PROJECT_GROUPED);
        shared.getTasks().add(task(1L, projA, "4.00", "Sync work"));
        shared.getTasks().add(task(2L, projB, "3.00", "Arena secret work"));
        shared.getTasks().add(task(3L, null, "1.00", "Leave"));

        when(entryRepository.findWithDetailsById(100L)).thenReturn(Optional.of(shared));
        when(attachmentService.loadForEntries(anyList()))
                .thenReturn(new EodAttachmentService.AttachmentsByScope(Map.of(), Map.of()));
        when(leadAccess.ledProjectIds(leadA.getId())).thenReturn(Set.of(10L));
        when(leadAccess.ledProjectIds(leadB.getId())).thenReturn(Set.of(20L));
        when(leadAccess.canReadEntryAsLead(leadA.getId(), shared)).thenReturn(true);
        when(leadAccess.canReadEntryAsLead(leadB.getId(), shared)).thenReturn(true);
        for (AppUser u : List.of(owner, leadA, leadB, rm, pm, admin)) {
            when(userRepository.findByEmailAndDeletedAtIsNull(u.getEmail())).thenReturn(Optional.of(u));
        }
    }

    private AppUser user(Long id, AppUser.Role role, String name) {
        AppUser u = new AppUser();
        u.setId(id); u.setRole(role); u.setFullName(name);
        u.setEmail(name.toLowerCase().replace(" ", ".") + "@example.com");
        return u;
    }

    private Project project(Long id, String code, String name) {
        Project p = new Project(); p.setId(id); p.setCode(code); p.setName(name); return p;
    }

    private EodTask task(Long id, Project p, String hours, String description) {
        EodTask t = new EodTask();
        t.setId(id);
        t.setProject(p);
        t.setHours(new BigDecimal(hours));
        t.setDescription(description);
        if (p == null) {
            TaskCategory leave = new TaskCategory();
            leave.setName("Leave");
            t.setTaskCategory(leave);
        }
        return t;
    }

    // ── the scoped view ───────────────────────────────────────────────────────

    @Test
    void leadA_seesOnlyHisProjectsTasks_plusAnAggregateForTheRest() {
        EodEntryDto dto = service.getEntry(100L, leadA.getEmail());

        List<String> codes = dto.tasks().stream().map(EodTaskDto::projectCode).toList();
        assertTrue(codes.contains("SYNC"));
        assertFalse(codes.contains("ARENA"), "no other-project code");
        assertEquals(2, dto.tasks().size(), "SYNC + the project-less leave row");
        assertEquals(0, new BigDecimal("3.00").compareTo(dto.otherProjectsHours()));
        assertTrue(dto.tasks().stream().noneMatch(t -> "Arena secret work".equals(t.description())));
    }

    @Test
    void leadB_seesTheMirrorImage() {
        EodEntryDto dto = service.getEntry(100L, leadB.getEmail());

        assertEquals(java.util.Arrays.asList("ARENA", null), dto.tasks().stream().map(EodTaskDto::projectCode).toList());
        assertEquals(0, new BigDecimal("4.00").compareTo(dto.otherProjectsHours()));
    }

    @Test
    void aLeadWithNoTaskOrPieceOnTheEntry_gets403() {
        AppUser leadC = user(7L, AppUser.Role.EMPLOYEE, "Lead C");
        when(userRepository.findByEmailAndDeletedAtIsNull(leadC.getEmail())).thenReturn(Optional.of(leadC));
        when(leadAccess.canReadEntryAsLead(leadC.getId(), shared)).thenReturn(false);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.getEntry(100L, leadC.getEmail()));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    // ── roles that have access today keep the full entry ──────────────────────

    @Test
    void owner_frozenRm_pm_andAdmin_seeEverything() {
        for (AppUser full : List.of(owner, rm, pm, admin)) {
            EodEntryDto dto = service.getEntry(100L, full.getEmail());
            assertEquals(3, dto.tasks().size(), full.getFullName());
            assertNull(dto.otherProjectsHours(), full.getFullName());
        }
    }

    // ── the list path ─────────────────────────────────────────────────────────

    @Test
    void listForAMember_isFilteredAndScopedForALead() {
        when(leadAccess.isInLeadTeam(owner.getId(), leadA.getId())).thenReturn(true);
        EodEntry elsewhere = new EodEntry();           // a day Akhila spent only on project B
        elsewhere.setId(101L);
        elsewhere.setEmployee(owner);
        elsewhere.setEntryDate(LocalDate.of(2026, 10, 8));
        elsewhere.setStatus(EodEntry.Status.SUBMITTED);
        elsewhere.setEntryForm(EodEntry.EntryForm.PROJECT_GROUPED);
        elsewhere.getTasks().add(task(9L, projB, "8.00", "More arena"));
        when(leadAccess.canReadEntryAsLead(leadA.getId(), elsewhere)).thenReturn(false);
        when(entryRepository.findByEmployeeIdAndEntryDateBetweenOrderByEntryDateDesc(eq(owner.getId()), any(), any()))
                .thenReturn(List.of(shared, elsewhere));

        List<EodEntryDto> list = service.listEntries(owner.getId(), LocalDate.of(2026, 10, 1),
                LocalDate.of(2026, 10, 12), false, leadA.getEmail());

        assertEquals(1, list.size(), "the day with nothing on his project is not returned");
        assertEquals(100L, list.get(0).id());
        assertFalse(list.get(0).tasks().stream().anyMatch(t -> "ARENA".equals(t.projectCode())));
        assertNotNull(list.get(0).otherProjectsHours());
    }


    // ── attachments follow the same scope ─────────────────────────────────────

    private EodAttachment attachmentOn(EodTask task) {
        EodAttachment a = new EodAttachment();
        a.setEodEntry(shared);
        a.setTask(task);
        return a;
    }

    @Test
    void aLead_mayOpenAnAttachmentOnHisProject_butNotOnAnotherLeadsProject_orAnyone_elses() {
        EodAccessPolicy policy = new EodAccessPolicy(leadAccess, reportingScope);
        EodAttachment onA = attachmentOn(shared.getTasks().get(0));   // project A
        EodAttachment onB = attachmentOn(shared.getTasks().get(1));   // project B

        assertTrue(policy.canReadAttachment(leadA, onA));
        assertFalse(policy.canReadAttachment(leadA, onB), "another lead's project attachment, even by id");
        assertTrue(policy.canReadAttachment(leadB, onB));
        assertFalse(policy.canReadAttachment(leadB, onA));
        assertTrue(policy.canReadAttachment(rm, onB), "the frozen RM sees the whole day");
        assertTrue(policy.canReadAttachment(owner, onB));
    }

    private static <T> T eq(T value) { return org.mockito.ArgumentMatchers.eq(value); }
}
