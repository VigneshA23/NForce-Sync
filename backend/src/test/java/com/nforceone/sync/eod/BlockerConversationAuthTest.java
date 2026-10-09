package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.project.Project;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Gap 3: requireLeadOwnsTask must allow the frozen RM, the project lead, and the PM.
 * Everyone else gets 403.
 *
 * Tests call postReplyAsLead (which calls requireLeadOwnsTask internally) with a resolved
 * task because requireNotResolved would block a resolved one — so we use an unresolved task.
 * Verification: 200 path means no exception; 403 path asserts ResponseStatusException.
 */
@ExtendWith(MockitoExtension.class)
class BlockerConversationAuthTest {

    @Mock BlockerReplyRepository replyRepository;
    @Mock BlockerReplyAttachmentRepository attachmentRepository;
    @Mock EodTaskRepository taskRepository;
    @Mock AppUserRepository userRepository;
    @Mock NotificationService notificationService;

    BlockerConversationService service;

    private AppUser employee;
    private AppUser rm;       // frozen reporting manager (entry.managerId)
    private AppUser lead;     // project.lead
    private AppUser pm;       // project.pm
    private AppUser stranger; // unrelated

    private EodEntry entry;
    private EodTask task;
    private Project project;

    @BeforeEach
    void setUp() {
        // maxFileSizeBytes / maxTotalStorageBytes set large — our tests don't attach files
        service = new BlockerConversationService(
                Long.MAX_VALUE, Long.MAX_VALUE,
                replyRepository, attachmentRepository, taskRepository, userRepository, notificationService);

        employee = user(1L, "Akhila S",    "akhila@example.com");
        rm       = user(2L, "Ramesh A",   "ramesh@example.com");
        lead     = user(3L, "Vignesh A",  "vignesh@example.com");
        pm       = user(4L, "Dheeraj S",  "dheeraj@example.com");
        stranger = user(5L, "Other User", "other@example.com");

        project = new Project();
        project.setId(10L);
        project.setName("Nforce Sync");
        project.setLead(lead);
        project.setPm(pm);

        entry = new EodEntry();
        entry.setId(100L);
        entry.setEmployee(employee);
        entry.setManagerId(rm.getId());   // frozen at submit time
        entry.setEntryDate(java.time.LocalDate.of(2026, 9, 4));

        task = new EodTask();
        task.setId(200L);
        task.setEodEntry(entry);
        task.setProject(project);
        task.setTaskStatus(EodTask.TaskStatus.BLOCKED);
        // resolvedAt = null → requireNotResolved passes
    }

    private AppUser user(Long id, String name, String email) {
        AppUser u = new AppUser();
        u.setId(id); u.setFullName(name); u.setEmail(email);
        u.setRole(AppUser.Role.EMPLOYEE);
        return u;
    }

    private void stubUserAndTask(AppUser actor) {
        when(userRepository.findByEmailAndDeletedAtIsNull(actor.getEmail())).thenReturn(Optional.of(actor));
        when(taskRepository.findById(task.getId())).thenReturn(Optional.of(task));
        BlockerReply saved = new BlockerReply();
        saved.setId(999L);
        saved.setTask(task);
        saved.setSender(actor);
        saved.setMessage("test reply");
        saved.setCreatedAt(OffsetDateTime.now());
        when(replyRepository.save(any())).thenReturn(saved);
        when(attachmentRepository.findMetaByReplyIds(any())).thenReturn(List.of());
        when(attachmentRepository.sumFileSize()).thenReturn(0L);
    }

    // ── frozen RM ──────────────────────────────────────────────────────────────

    @Test
    void frozenRm_canReplyAsLead() {
        stubUserAndTask(rm);

        assertDoesNotThrow(() ->
                service.postReplyAsLead(task.getId(), rm.getEmail(), "RM reply", List.of()));
    }

    // ── project lead ───────────────────────────────────────────────────────────

    @Test
    void projectLead_canReplyAsLead() {
        stubUserAndTask(lead);

        assertDoesNotThrow(() ->
                service.postReplyAsLead(task.getId(), lead.getEmail(), "lead reply", List.of()));
    }

    // ── project PM (by assignment): reads, but is read-only ────────────────────────

    @Test
    void projectPm_assignedByCapacity_cannotReplyAsLead_403() {
        // `pm` has role EMPLOYEE but is the project's PM: acting in the PM capacity, so read-only.
        when(userRepository.findByEmailAndDeletedAtIsNull(pm.getEmail())).thenReturn(Optional.of(pm));
        when(taskRepository.findById(task.getId())).thenReturn(Optional.of(task));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.postReplyAsLead(task.getId(), pm.getEmail(), "PM reply", List.of()));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertTrue(ex.getReason().contains("read-only view of blockers"), ex.getReason());
        verify(replyRepository, never()).save(any());
    }

    @Test
    void projectPm_assignedByCapacity_canStillReadTheThread() {
        when(userRepository.findByEmailAndDeletedAtIsNull(pm.getEmail())).thenReturn(Optional.of(pm));
        when(taskRepository.findById(task.getId())).thenReturn(Optional.of(task));

        assertDoesNotThrow(() -> service.getThreadForLead(task.getId(), pm.getEmail()));
    }

    @Test
    void someoneWhoIsBothTheLeadAndTheProjectPm_keepsWriteAccessAsTheLead() {
        project.setPm(lead);   // the same user holds both capacities: the Team Lead one still allows replies
        stubUserAndTask(lead);

        assertDoesNotThrow(() -> service.postReplyAsLead(task.getId(), lead.getEmail(), "as lead", List.of()));
    }

    // ── stranger ───────────────────────────────────────────────────────────────

    @Test
    void unrelatedUser_gets403() {
        when(userRepository.findByEmailAndDeletedAtIsNull(stranger.getEmail()))
                .thenReturn(Optional.of(stranger));
        when(taskRepository.findById(task.getId())).thenReturn(Optional.of(task));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.postReplyAsLead(task.getId(), stranger.getEmail(), "nope", List.of()));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    // ── entry owner (employee endpoint only) ──────────────────────────────────

    @Test
    void employee_canReplyAsEmployee() {
        when(userRepository.findByEmailAndDeletedAtIsNull(employee.getEmail()))
                .thenReturn(Optional.of(employee));
        when(taskRepository.findById(task.getId())).thenReturn(Optional.of(task));
        BlockerReply saved = new BlockerReply();
        saved.setId(888L);
        saved.setTask(task);
        saved.setSender(employee);
        saved.setMessage("employee reply");
        saved.setCreatedAt(OffsetDateTime.now());
        when(replyRepository.save(any())).thenReturn(saved);
        when(attachmentRepository.findMetaByReplyIds(any())).thenReturn(List.of());
        when(attachmentRepository.sumFileSize()).thenReturn(0L);

        assertDoesNotThrow(() ->
                service.postReplyAsEmployee(task.getId(), employee.getEmail(), "employee reply", List.of()));
    }

    @Test
    void stranger_cannotReplyAsEmployee() {
        when(userRepository.findByEmailAndDeletedAtIsNull(stranger.getEmail()))
                .thenReturn(Optional.of(stranger));
        when(taskRepository.findById(task.getId())).thenReturn(Optional.of(task));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.postReplyAsEmployee(task.getId(), stranger.getEmail(), "nope", List.of()));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    // ── lead-reply notifies employee ───────────────────────────────────────────

    @Test
    void leadReply_notifiesEmployee_notLead() {
        stubUserAndTask(lead);

        service.postReplyAsLead(task.getId(), lead.getEmail(), "lead reply", List.of());

        verify(notificationService).send(eq(employee.getId()), eq("BLOCKER_REPLY"), anyString(), anyString(), anyString());
        verify(notificationService, never()).send(eq(lead.getId()), any(), any(), any(), any());
    }

    // ── Project Managers (role PM) are read-only on blockers ─────────────────────

    /** A PM-role user who is also the project's PM — the exact case that used to be allowed to reply. */
    private AppUser pmRoleOnTheProject() {
        AppUser pmRole = user(6L, "Surya T", "surya@example.com");
        pmRole.setRole(AppUser.Role.PM);
        project.setPm(pmRole);
        return pmRole;
    }

    @Test
    void pmRole_cannotPostAReply_403() {
        AppUser pmRole = pmRoleOnTheProject();
        when(userRepository.findByEmailAndDeletedAtIsNull(pmRole.getEmail())).thenReturn(Optional.of(pmRole));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.postReplyAsLead(task.getId(), pmRole.getEmail(), "hello", List.of()));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertTrue(ex.getReason().contains("read-only view of blockers"), ex.getReason());
        verify(replyRepository, never()).save(any());
        verify(notificationService, never()).send(any(), any(), any(), any(), any());
    }

    @Test
    void pmRole_cannotEditOrDeleteAReply_403() {
        AppUser pmRole = pmRoleOnTheProject();
        when(userRepository.findByEmailAndDeletedAtIsNull(pmRole.getEmail())).thenReturn(Optional.of(pmRole));

        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
                () -> service.editReplyAsLead(1L, pmRole.getEmail(), "edited")).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
                () -> service.deleteReplyAsLead(1L, pmRole.getEmail())).getStatusCode());
        verify(replyRepository, never()).save(any());
        verify(replyRepository, never()).delete(any());
    }

    @Test
    void pmRole_canStillReadTheThread() {
        AppUser pmRole = pmRoleOnTheProject();
        when(userRepository.findByEmailAndDeletedAtIsNull(pmRole.getEmail())).thenReturn(Optional.of(pmRole));
        when(taskRepository.findById(task.getId())).thenReturn(Optional.of(task));

        assertDoesNotThrow(() -> service.getThreadForLead(task.getId(), pmRole.getEmail()));
    }

    @Test
    void aNonPmRoleUserWhoIsOnlyTheProjectPm_isReadOnlyToo_403() {
        // Anyone can be a project's PM by assignment, not only a user with role PM — same rule for both.
        when(userRepository.findByEmailAndDeletedAtIsNull(pm.getEmail())).thenReturn(Optional.of(pm));
        when(taskRepository.findById(task.getId())).thenReturn(Optional.of(task));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.postReplyAsLead(task.getId(), pm.getEmail(), "assigned PM", List.of()));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }
}
