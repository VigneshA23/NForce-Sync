package com.nforceone.sync.teamlead;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.BlockerConversationService;
import com.nforceone.sync.eod.BlockerKey;
import com.nforceone.sync.eod.BlockerReplyAttachmentRepository;
import com.nforceone.sync.eod.BlockerReply;
import com.nforceone.sync.eod.BlockerReplyRepository;
import com.nforceone.sync.eod.BlockerSubjects;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodLogLine;
import com.nforceone.sync.eod.EodLogLineRepository;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.eod.EodTaskRepository;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.project.TaskCategory;
import com.nforceone.sync.teamlead.dto.BlockerStatusRequest;
import com.nforceone.sync.teamlead.dto.TeamBlockerDto;
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
import java.util.Optional;
import java.util.concurrent.Executor;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * A Blocked Daily Log line is a blocker routed to the author's reporting manager. It has no project, so no Team
 * Lead owns it: the manager reads it, replies, acknowledges and resolves it; a lead and a Project Manager cannot
 * act on it; its thread, read state and resolve lock work like a Submit EOD blocker's. Submit EOD blockers are
 * unchanged (the regression block at the end).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DailyLogBlockerRoutingTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 12);
    private static final LocalDate FRIDAY = LocalDate.of(2026, 10, 9);

    @Mock AppUserRepository userRepository;
    @Mock EodTaskRepository taskRepository;
    @Mock EodLogLineRepository logLineRepository;
    @Mock BlockerReplyRepository replyRepository;
    @Mock BlockerReplyAttachmentRepository attachmentRepository;
    @Mock NotificationService notificationService;
    @Mock ProjectRepository projectRepository;

    private TeamLeadService service;
    private BlockerConversationService conversation;

    private AppUser sai;        // bench employee — the author
    private AppUser dheeraj;    // sai's reporting manager
    private AppUser otherRm;    // someone else's manager
    private AppUser vignesh;    // a Team Lead of some project, unrelated to sai
    private AppUser pm;         // project PM of some project
    private EodLogLine blocker; // sai's Blocked Daily Log line (no project)
    private Long key;

    @BeforeEach
    void setUp() {
        BlockerSubjects subjects = new BlockerSubjects(taskRepository, logLineRepository, replyRepository);
        service = new TeamLeadService(userRepository, null, taskRepository, null, null, null,
                null, null, replyRepository, notificationService, null, projectRepository,
                new LeadTeamPolicy(null, null, null), (Executor) Runnable::run,
                new com.nforceone.sync.config.BusinessClock(com.nforceone.sync.config.BusinessClock.DEFAULT_ZONE), subjects);
        conversation = new BlockerConversationService(Long.MAX_VALUE, Long.MAX_VALUE, replyRepository,
                attachmentRepository, userRepository, notificationService, subjects);

        sai = user(1L, "Sai", AppUser.Role.EMPLOYEE);
        dheeraj = user(2L, "Dheeraj S", AppUser.Role.EMPLOYEE);
        otherRm = user(3L, "Other Rm", AppUser.Role.EMPLOYEE);
        vignesh = user(4L, "Vignesh A", AppUser.Role.EMPLOYEE);
        pm = user(5L, "Pm User", AppUser.Role.PM);
        for (AppUser u : List.of(sai, dheeraj, otherRm, vignesh, pm)) {
            when(userRepository.findByEmailAndDeletedAtIsNull(u.getEmail())).thenReturn(Optional.of(u));
        }
        when(userRepository.existsByManagerIdAndDeletedAtIsNull(dheeraj.getId())).thenReturn(true);
        when(userRepository.existsByManagerIdAndDeletedAtIsNull(otherRm.getId())).thenReturn(true);
        when(projectRepository.existsByLeadIdAndStatus(vignesh.getId(), Project.Status.ACTIVE)).thenReturn(true);
        when(projectRepository.existsByPmIdAndStatus(pm.getId(), Project.Status.ACTIVE)).thenReturn(true);

        blocker = line(7L, sai);
        key = blocker.getBlockerKey();
        when(logLineRepository.findById(7L)).thenReturn(Optional.of(blocker));
        when(logLineRepository.save(any(EodLogLine.class))).thenAnswer(i -> i.getArgument(0));
        when(replyRepository.save(any(BlockerReply.class))).thenAnswer(i -> {
            BlockerReply r = i.getArgument(0);
            if (r.getId() == null) r.setId(1L);
            return r;
        });
    }

    private AppUser user(Long id, String name, AppUser.Role role) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setFullName(name);
        u.setRole(role);
        u.setEmail(name.toLowerCase().replace(" ", ".") + "@example.com");
        return u;
    }

    private EodLogLine line(Long lineId, AppUser author) {
        EodEntry e = new EodEntry();
        e.setId(lineId + 1000);
        e.setEmployee(author);
        e.setManagerId(dheeraj.getId());      // frozen at submit
        e.setEntryDate(FRIDAY);
        e.setStatus(EodEntry.Status.SUBMITTED);
        e.setEntryForm(EodEntry.EntryForm.PLAIN_LOG);
        TaskCategory c = new TaskCategory();
        c.setId(5L);
        c.setName("Training");
        EodLogLine l = new EodLogLine();
        l.setId(lineId);
        l.setEntry(e);
        l.setCategory(c);
        l.setHours(new BigDecimal("8.0"));
        l.setDescription("Course work");
        l.setTaskStatus(EodTask.TaskStatus.BLOCKED);
        l.setBlockerReason("Waiting on a licence");
        return l;
    }

    private void assertForbidden(org.junit.jupiter.api.function.Executable call) {
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class, call).getStatusCode());
    }

    // ── identity: a line id never collides with a task id ────────────────────────

    @Test
    void aDailyLogBlockerUsesTheNegativeOfItsLineId_aTaskKeepsItsOwnId() {
        assertEquals(-7L, BlockerKey.ofLine(7L));
        assertTrue(BlockerKey.isLine(-7L));
        assertEquals(7L, BlockerKey.lineId(-7L));
        assertFalse(BlockerKey.isLine(7L));
        assertEquals(7L, BlockerKey.taskId(7L));
        assertEquals(-7L, blocker.getBlockerKey());
    }

    // ── the reporting manager's Blockers page ────────────────────────────────────

    @Test
    void theManagerSeesADailyLogBlocker_withNoProject_andNoOtherManagerDoes() {
        when(taskRepository.findBlockedForReportingManager(eq(dheeraj.getId()), any(), any(), any(), any())).thenReturn(List.of());
        when(logLineRepository.findBlockedForReportingManager(eq(dheeraj.getId()), any(), any(), any(), any()))
                .thenReturn(List.of(blocker));
        when(logLineRepository.findBlockedForReportingManager(eq(otherRm.getId()), any(), any(), any(), any()))
                .thenReturn(List.of());

        List<TeamBlockerDto> mine = service.getBlockersForReportingManager(TODAY, TODAY, dheeraj.getId(), true);
        assertEquals(1, mine.size());
        TeamBlockerDto dto = mine.get(0);
        assertEquals(-7L, dto.taskId());
        assertNull(dto.projectCode());
        assertNull(dto.projectName());
        assertEquals("Training", dto.categoryName());
        assertEquals("Waiting on a licence", dto.blockerReason());
        assertEquals("NEEDS_RESPONSE", dto.status());
        assertEquals("Sai", dto.employeeName());
        assertTrue(service.getBlockersForReportingManager(TODAY, TODAY, otherRm.getId(), true).isEmpty());
    }

    @Test
    void theManagersPageMergesBothKindsNewestFirst() {
        EodTask task = new EodTask();
        task.setId(50L);
        EodEntry te = new EodEntry();
        te.setId(1050L);
        te.setEmployee(sai);
        te.setManagerId(dheeraj.getId());
        te.setEntryDate(FRIDAY.minusDays(3));
        te.setStatus(EodEntry.Status.SUBMITTED);
        task.setEodEntry(te);
        task.setTaskStatus(EodTask.TaskStatus.BLOCKED);
        when(taskRepository.findBlockedForReportingManager(eq(dheeraj.getId()), any(), any(), any(), any())).thenReturn(List.of(task));
        when(logLineRepository.findBlockedForReportingManager(eq(dheeraj.getId()), any(), any(), any(), any()))
                .thenReturn(List.of(blocker));

        List<TeamBlockerDto> all = service.getBlockersForReportingManager(TODAY, TODAY, dheeraj.getId(), true);
        assertEquals(List.of(-7L, 50L), all.stream().map(TeamBlockerDto::taskId).toList());
    }

    @Test
    void aTeamLeadsPageNeverIncludesDailyLogBlockers_theyHaveNoProject() {
        when(taskRepository.findBlockedForProjectLead(any(), any(), any(), any(), any())).thenReturn(List.of());
        service.getBlockers(TODAY, TODAY, vignesh.getEmail(), true, null);
        verifyNoInteractions(logLineRepository);
    }

    // ── who may act on it ────────────────────────────────────────────────────────

    @Test
    void theManagerMayReadAcknowledgeAndResolve() {
        assertEquals(-7L, service.getBlockerByIdForReportingManager(key, dheeraj).taskId());

        TeamBlockerDto acked = service.acknowledgeBlocker(key, dheeraj.getEmail());
        assertEquals("ACKNOWLEDGED", acked.status());
        assertEquals(dheeraj, blocker.getAcknowledgedBy());

        TeamBlockerDto resolved = service.setBlockerStatus(key, dheeraj.getEmail(), new BlockerStatusRequest("RESOLVED"));
        assertEquals("RESOLVED", resolved.status());
        assertNotNull(blocker.getResolvedAt());
        verify(notificationService).send(eq(sai.getId()), eq("BLOCKER_RESOLVED"), any(), any(), eq("/blockers?highlight=-7"));
    }

    @Test
    void resolvedIsTerminal_andLocksTheThread() {
        service.setBlockerStatus(key, dheeraj.getEmail(), new BlockerStatusRequest("RESOLVED"));
        assertEquals(HttpStatus.CONFLICT, assertThrows(ResponseStatusException.class,
                () -> service.setBlockerStatus(key, dheeraj.getEmail(), new BlockerStatusRequest("NEEDS_RESPONSE"))).getStatusCode());
        assertEquals(HttpStatus.CONFLICT, assertThrows(ResponseStatusException.class,
                () -> conversation.postReplyAsLead(key, dheeraj.getEmail(), "any update?", List.of())).getStatusCode());
        assertEquals(HttpStatus.CONFLICT, assertThrows(ResponseStatusException.class,
                () -> conversation.postReplyAsEmployee(key, sai.getEmail(), "still stuck", List.of())).getStatusCode());
    }

    @Test
    void noOneElseMayAct_notAnotherManager_notALead_notAPm_notTheAuthor() {
        for (AppUser outsider : List.of(otherRm, vignesh, pm, sai)) {
            assertForbidden(() -> service.acknowledgeBlocker(key, outsider.getEmail()));
            assertForbidden(() -> service.setBlockerStatus(key, outsider.getEmail(), new BlockerStatusRequest("RESOLVED")));
        }
        assertForbidden(() -> service.getBlockerByIdForReportingManager(key, otherRm));
        assertForbidden(() -> service.getBlockerByIdForReportingManager(key, sai));
        assertNull(blocker.getAcknowledgedAt());
    }

    // ── the reply thread, both ways, and carry-over of the unread state ──────────

    @Test
    void theManagerRepliesAndTheEmployeeIsNotifiedOnMyBlockers_andTheBlockerIsAcknowledged() {
        conversation.postReplyAsLead(key, dheeraj.getEmail(), "Ordering it today", List.of());

        assertNotNull(blocker.getAcknowledgedAt(), "no project lead exists, so the manager's reply is the response");
        verify(notificationService).send(eq(sai.getId()), eq("BLOCKER_REPLY"), any(), any(), eq("/blockers?highlight=-7"));
        org.mockito.ArgumentCaptor<BlockerReply> saved = org.mockito.ArgumentCaptor.forClass(BlockerReply.class);
        verify(replyRepository).save(saved.capture());
        assertNull(saved.getValue().getTask());
        assertSame(blocker, saved.getValue().getLogLine());
    }

    @Test
    void theEmployeeRepliesAndTheManagerIsNotifiedOnMyReportingTeamBlockers_reopeningIt() {
        blocker.setAcknowledgedAt(java.time.OffsetDateTime.now());
        blocker.setAcknowledgedBy(dheeraj);

        conversation.postReplyAsEmployee(key, sai.getEmail(), "Licence arrived, thanks", List.of());

        assertNull(blocker.getAcknowledgedAt(), "last responder wins: the employee's reply re-opens it");
        verify(notificationService).send(eq(dheeraj.getId()), eq("BLOCKER_REPLY"), any(), any(),
                eq("/my-reports/blockers?highlight=-7"));
    }

    @Test
    void theThreadIsReadableByTheManagerAndTheAuthorOnly() {
        when(replyRepository.findByLogLineIdOrderByCreatedAtAsc(7L)).thenReturn(List.of());
        assertTrue(conversation.getThreadForLead(key, dheeraj.getEmail()).isEmpty());
        assertTrue(conversation.getThreadForEmployee(key, sai.getEmail()).isEmpty());
        assertForbidden(() -> conversation.getThreadForLead(key, otherRm.getEmail()));
        assertForbidden(() -> conversation.getThreadForLead(key, sai.getEmail()));
        assertForbidden(() -> conversation.getThreadForEmployee(key, dheeraj.getEmail()));
    }

    @Test
    void aMissingBlockerIsA404() {
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
                () -> service.acknowledgeBlocker(-999L, dheeraj.getEmail())).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
                () -> conversation.getThreadForEmployee(999L, sai.getEmail())).getStatusCode());
    }

    // ── regression: an allocated employee's Submit EOD blocker is routed exactly as before ──

    @Test
    void aSubmitEodBlockerStillBelongsToItsProjectLead_andTheManagerStillCannotResolveIt() {
        Project sync = new Project();
        sync.setId(10L);
        sync.setName("Nforce Sync");
        sync.setLead(vignesh);
        EodEntry e = new EodEntry();
        e.setId(1051L);
        e.setEmployee(sai);
        e.setManagerId(dheeraj.getId());
        e.setEntryDate(FRIDAY);
        e.setStatus(EodEntry.Status.SUBMITTED);
        EodTask task = new EodTask();
        task.setId(51L);
        task.setEodEntry(e);
        task.setProject(sync);
        task.setTaskStatus(EodTask.TaskStatus.BLOCKED);
        when(taskRepository.findById(51L)).thenReturn(Optional.of(task));
        when(taskRepository.save(any(EodTask.class))).thenAnswer(i -> i.getArgument(0));

        // The project's lead acknowledges and resolves it.
        assertEquals("ACKNOWLEDGED", service.acknowledgeBlocker(51L, vignesh.getEmail()).status());
        // The reporting manager, not the project's lead, still may not.
        assertForbidden(() -> service.setBlockerStatus(51L, dheeraj.getEmail(), new BlockerStatusRequest("RESOLVED")));
        // The lead's list is task-only; a task id is positive and never reads a log line.
        verify(logLineRepository, never()).findById(any());
    }

    @Test
    void aSubmitEodBlockerThreadStillKeysOnTheTask() {
        when(replyRepository.findByTaskIdOrderByCreatedAtAsc(51L)).thenReturn(List.of());
        Project sync = new Project();
        sync.setId(10L);
        sync.setLead(vignesh);
        EodEntry e = new EodEntry();
        e.setId(1051L);
        e.setEmployee(sai);
        e.setManagerId(dheeraj.getId());
        EodTask task = new EodTask();
        task.setId(51L);
        task.setEodEntry(e);
        task.setProject(sync);
        when(taskRepository.findById(51L)).thenReturn(Optional.of(task));
        assertTrue(conversation.getThreadForEmployee(51L, sai.getEmail()).isEmpty());
        verify(replyRepository).findByTaskIdOrderByCreatedAtAsc(51L);
        verify(replyRepository, never()).findByLogLineIdOrderByCreatedAtAsc(anyLong());
    }

    private static long anyLong() { return org.mockito.ArgumentMatchers.anyLong(); }
}
