package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.dto.BlockerReplyDto;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.project.Project;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * A project lead's OWN blocker (raised on a project he leads) is handled by his frozen reporting
 * manager. Covers the conversation side: the lead can never act as reviewer on his own thread
 * (read / reply / edit / delete / attachment), the RM can, a different RM cannot, RM replies are
 * labelled as such for the employee, and the employee's follow-up notification links the RM to
 * the right page.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class BlockerReportingManagerTest {

    @Mock BlockerReplyRepository replyRepository;
    @Mock BlockerReplyAttachmentRepository attachmentRepository;
    @Mock EodTaskRepository taskRepository;
    @Mock AppUserRepository userRepository;
    @Mock NotificationService notificationService;

    private BlockerConversationService service;

    private AppUser vignesh;    // employee AND project lead of SYNC
    private AppUser dheeraj;    // his frozen reporting manager
    private AppUser otherRm;    // someone else's reporting manager
    private Project sync;       // led by vignesh
    private EodTask ownBlocker; // vignesh's blocker on SYNC
    private EodTask ordinary;   // akhila's blocker on SYNC (vignesh is its lead; dheeraj is her RM)
    private AppUser akhila;

    @BeforeEach
    void setUp() {
        service = new BlockerConversationService(Long.MAX_VALUE, Long.MAX_VALUE,
                replyRepository, attachmentRepository, taskRepository, userRepository, notificationService);

        vignesh = user(1L, "Vignesh A");
        dheeraj = user(2L, "Dheeraj S");
        otherRm = user(3L, "Other Rm");
        akhila  = user(4L, "Akhila S");

        sync = new Project();
        sync.setId(10L);
        sync.setName("Nforce Sync");
        sync.setLead(vignesh);

        ownBlocker = blocker(200L, vignesh, dheeraj);
        ordinary   = blocker(201L, akhila, dheeraj);

        for (AppUser u : List.of(vignesh, dheeraj, otherRm, akhila)) {
            when(userRepository.findByEmailAndDeletedAtIsNull(u.getEmail())).thenReturn(Optional.of(u));
        }
        for (EodTask t : List.of(ownBlocker, ordinary)) {
            when(taskRepository.findById(t.getId())).thenReturn(Optional.of(t));
        }
        when(attachmentRepository.findMetaByReplyIds(any())).thenReturn(List.of());
        when(attachmentRepository.sumFileSize()).thenReturn(0L);
        when(replyRepository.save(any())).thenAnswer(i -> {
            BlockerReply r = i.getArgument(0);
            r.setId(900L);
            r.setCreatedAt(OffsetDateTime.now());
            return r;
        });
    }

    private AppUser user(Long id, String name) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setFullName(name);
        u.setEmail(name.toLowerCase().replace(" ", ".") + "@example.com");
        u.setRole(AppUser.Role.EMPLOYEE);
        return u;
    }

    private EodTask blocker(Long taskId, AppUser author, AppUser frozenManager) {
        EodEntry e = new EodEntry();
        e.setId(taskId + 1000);
        e.setEmployee(author);
        e.setManagerId(frozenManager.getId());
        e.setEntryDate(LocalDate.of(2026, 10, 11));
        EodTask t = new EodTask();
        t.setId(taskId);
        t.setEodEntry(e);
        t.setProject(sync);
        t.setTaskStatus(EodTask.TaskStatus.BLOCKED);
        return t;
    }

    private void assertForbidden(org.junit.jupiter.api.function.Executable call) {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, call);
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    // ── the self-gap: a lead never reviews his own blocker ────────────────────

    @Test
    void lead_cannotReadHisOwnBlockersThreadAsReviewer() {
        assertForbidden(() -> service.getThreadForLead(ownBlocker.getId(), vignesh.getEmail()));
    }

    @Test
    void lead_cannotReplyToHisOwnBlockerAsReviewer_andItDoesNotAcknowledgeIt() {
        assertForbidden(() -> service.postReplyAsLead(ownBlocker.getId(), vignesh.getEmail(), "self reply", List.of()));
        assertNull(ownBlocker.getAcknowledgedAt());
        verify(replyRepository, never()).save(any());
    }

    @Test
    void lead_cannotEditOrDeleteRepliesOnHisOwnBlockerAsReviewer() {
        BlockerReply reply = new BlockerReply();
        reply.setId(901L);
        reply.setTask(ownBlocker);
        reply.setSender(vignesh);
        reply.setMessage("old");
        when(replyRepository.findById(901L)).thenReturn(Optional.of(reply));

        assertForbidden(() -> service.editReplyAsLead(901L, vignesh.getEmail(), "new"));
        assertForbidden(() -> service.deleteReplyAsLead(901L, vignesh.getEmail()));
    }

    @Test
    void lead_cannotDownloadAttachmentsOnHisOwnBlockerAsReviewer() {
        BlockerReply reply = new BlockerReply();
        reply.setTask(ownBlocker);
        BlockerReplyAttachment att = new BlockerReplyAttachment();
        att.setId(77L);
        att.setReply(reply);
        when(attachmentRepository.findById(77L)).thenReturn(Optional.of(att));

        assertForbidden(() -> service.getAttachmentForLead(77L, vignesh.getEmail()));
    }

    @Test
    void lead_stillOwnsTheEmployeeSideOfHisOwnThread() {
        assertDoesNotThrow(() -> service.getThreadForEmployee(ownBlocker.getId(), vignesh.getEmail()));
    }

    @Test
    void lead_stillActsAsReviewerOnSomeoneElsesBlockerOnHisProject() {
        assertDoesNotThrow(() -> service.getThreadForLead(ordinary.getId(), vignesh.getEmail()));
        assertDoesNotThrow(() -> service.postReplyAsLead(ordinary.getId(), vignesh.getEmail(), "on it", List.of()));
    }

    // ── the reporting manager handles the lead's own blocker ──────────────────

    @Test
    void rm_canReadAndReplyToHisLeadReportsOwnBlocker() {
        assertDoesNotThrow(() -> service.getThreadForLead(ownBlocker.getId(), dheeraj.getEmail()));
        assertDoesNotThrow(() -> service.postReplyAsLead(ownBlocker.getId(), dheeraj.getEmail(), "Looking into it", List.of()));
        assertNotNull(ownBlocker.getAcknowledgedAt());
        // The employee (the lead) is told, with a link to his own My Blockers page.
        verify(notificationService).send(eq(vignesh.getId()), eq("BLOCKER_REPLY"), any(), any(),
                eq("/blockers?highlight=200"));
    }

    @Test
    void aDifferentRm_getsForbiddenOnTheThread() {
        assertForbidden(() -> service.getThreadForLead(ownBlocker.getId(), otherRm.getEmail()));
        assertForbidden(() -> service.postReplyAsLead(ownBlocker.getId(), otherRm.getEmail(), "hi", List.of()));
    }

    @Test
    void rmReply_isLabelledReportingManager_notTeamLead_forTheEmployee() {
        BlockerReply fromRm = reply(ownBlocker, dheeraj);
        BlockerReply fromProjectLead = reply(ordinary, vignesh);
        BlockerReply fromEmployee = reply(ownBlocker, vignesh);

        assertEquals("REPORTING_MANAGER", BlockerReplyDto.from(fromRm, ownBlocker, List.of()).senderRole());
        assertEquals("TEAM_LEAD", BlockerReplyDto.from(fromProjectLead, ordinary, List.of()).senderRole());
        assertEquals("EMPLOYEE", BlockerReplyDto.from(fromEmployee, ownBlocker, List.of()).senderRole());
    }

    private BlockerReply reply(EodTask t, AppUser sender) {
        BlockerReply r = new BlockerReply();
        r.setId(1L);
        r.setTask(t);
        r.setSender(sender);
        r.setMessage("m");
        r.setCreatedAt(OffsetDateTime.now());
        return r;
    }

    @Test
    void employeeSideThread_showsTheRmsReply_withoutFilteringByReplierRole() {
        BlockerReply fromRm = reply(ownBlocker, dheeraj);
        when(replyRepository.findByTaskIdOrderByCreatedAtAsc(200L)).thenReturn(List.of(fromRm));

        List<BlockerReplyDto> thread = service.getThreadForEmployee(200L, vignesh.getEmail());

        assertEquals(1, thread.size());
        assertEquals("Dheeraj S", thread.get(0).senderName());
        assertEquals("REPORTING_MANAGER", thread.get(0).senderRole());
    }

    // ── employee follow-up notification routing ───────────────────────────────

    @Test
    void employeeFollowUp_onALeadsOwnBlocker_linksTheRmToTheReportingManagerBlockersPage() {
        service.postReplyAsEmployee(200L, vignesh.getEmail(), "any update?", List.of());

        verify(notificationService).send(eq(dheeraj.getId()), eq("BLOCKER_REPLY"), any(), any(),
                eq("/my-reports/blockers?highlight=200"));
    }

    @Test
    void employeeFollowUp_onAnOrdinaryBlocker_keepsTheTeamBlockersLink() {
        service.postReplyAsEmployee(201L, akhila.getEmail(), "any update?", List.of());

        verify(notificationService).send(eq(dheeraj.getId()), eq("BLOCKER_REPLY"), any(), any(),
                eq("/team/blockers?highlight=201"));
    }
}
