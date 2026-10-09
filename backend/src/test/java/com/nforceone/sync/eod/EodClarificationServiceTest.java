package com.nforceone.sync.eod;

import com.nforceone.sync.approval2.EodProjectApproval;
import com.nforceone.sync.approval2.EodProjectApprovalRepository;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.dto.EodClarificationStatusDto;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.project.PmScopeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * EodClarificationService orchestration on top of the piece-based policy: which entry statuses
 * allow opening a round, the opened_by_approver_id snapshot, who is notified (and where the link
 * points) when the employee replies, and the viewer's canOpen / canReply flags.
 */
@ExtendWith(MockitoExtension.class)
class EodClarificationServiceTest {

    @Mock EodEntryRepository entryRepository;
    @Mock EodClarificationRepository clarificationRepository;
    @Mock EodClarificationReplyRepository replyRepository;
    @Mock EodClarificationReplyAttachmentRepository attachmentRepository;
    @Mock EodClarificationReadStateRepository readStateRepository;
    @Mock EodTaskRepository taskRepository;
    @Mock AppUserRepository userRepository;
    @Mock NotificationService notificationService;
    @Mock PmScopeService pmScopeService;
    @Mock EodProjectApprovalRepository pieceRepository;

    private EodClarificationService service;

    private AppUser employee;
    private AppUser lead;
    private AppUser rm;
    private AppUser pm;
    private EodEntry entry;
    private EodProjectApproval leadPiece;

    @BeforeEach
    void setUp() {
        service = new EodClarificationService(1_000_000L, 10_000_000L, entryRepository, clarificationRepository,
                replyRepository, attachmentRepository, readStateRepository, taskRepository, userRepository,
                notificationService, pmScopeService, pieceRepository);

        employee = user(1L, "Akhila S", AppUser.Role.EMPLOYEE);
        lead     = user(3L, "Vignesh A", AppUser.Role.EMPLOYEE);
        rm       = user(2L, "Ramesh A", AppUser.Role.EMPLOYEE);
        pm       = user(4L, "Dheeraj S", AppUser.Role.PM);

        entry = new EodEntry();
        entry.setId(100L);
        entry.setEmployee(employee);
        entry.setManagerId(rm.getId());
        entry.setEntryDate(LocalDate.of(2026, 9, 1));
        entry.setStatus(EodEntry.Status.SUBMITTED);

        leadPiece = piece(1L, lead, EodProjectApproval.Status.PENDING);

        lenient().when(entryRepository.findWithDetailsById(100L)).thenReturn(Optional.of(entry));
        lenient().when(pieceRepository.findByEodEntryId(100L)).thenReturn(List.of(leadPiece));
        lenient().when(clarificationRepository.existsByEodEntryIdAndStatusNot(anyLong(), any())).thenReturn(false);
        lenient().when(clarificationRepository.save(any(EodClarification.class))).thenAnswer(i -> {
            EodClarification c = i.getArgument(0);
            if (c.getId() == null) c.setId(500L);
            return c;
        });
        lenient().when(replyRepository.save(any(EodClarificationReply.class))).thenAnswer(i -> {
            EodClarificationReply r = i.getArgument(0);
            r.setId(900L);
            return r;
        });
        for (AppUser u : List.of(employee, lead, rm, pm)) {
            lenient().when(userRepository.findByEmailAndDeletedAtIsNull(u.getEmail())).thenReturn(Optional.of(u));
        }
    }

    private AppUser user(Long id, String name, AppUser.Role role) {
        AppUser u = new AppUser();
        u.setId(id); u.setFullName(name); u.setRole(role);
        u.setEmail(name.toLowerCase().replace(" ", ".") + "@example.com");
        return u;
    }

    private EodProjectApproval piece(Long id, AppUser approver, EodProjectApproval.Status status) {
        EodProjectApproval p = new EodProjectApproval();
        p.setId(id);
        p.setEodEntry(entry);
        p.setApprover(approver);
        p.setApproverType(EodProjectApproval.ApproverType.LEAD);
        p.setStatus(status);
        return p;
    }

    private EodClarification openRound(AppUser openedBy) {
        EodClarification c = new EodClarification();
        c.setId(500L);
        c.setEodEntry(entry);
        c.setOpenedBy(openedBy);
        c.setOpenedByApprover(openedBy);
        c.setOpenedAt(OffsetDateTime.now());
        c.setStatus(EodClarification.Status.NEEDS_RESPONSE);
        return c;
    }

    // ── open: entry status ────────────────────────────────────────────────────

    @Test
    void open_onSubmittedEntry_succeeds_andSnapshotsTheApprover() {
        EodClarificationStatusDto dto = service.open(100L, lead.getEmail(), null);

        assertTrue(dto.open());
        ArgumentCaptor<EodClarification> saved = ArgumentCaptor.forClass(EodClarification.class);
        verify(clarificationRepository).save(saved.capture());
        assertSame(lead, saved.getValue().getOpenedBy());
        assertSame(lead, saved.getValue().getOpenedByApprover());
        verify(notificationService).send(eq(employee.getId()), eq("EOD_CLARIFICATION_REQUESTED"),
                anyString(), anyString(), anyString());
    }

    @Test
    void open_onPartiallyApprovedEntry_succeedsForApproverOfAStillPendingPiece() {
        entry.setStatus(EodEntry.Status.PARTIALLY_APPROVED);
        EodProjectApproval done = piece(2L, rm, EodProjectApproval.Status.APPROVED);
        when(pieceRepository.findByEodEntryId(100L)).thenReturn(List.of(done, leadPiece));

        assertTrue(service.open(100L, lead.getEmail(), null).open());
        verify(clarificationRepository).save(any(EodClarification.class));
    }

    @Test
    void open_onPartiallyApprovedEntry_isDeniedToApproverOfAnAlreadyApprovedPiece() {
        entry.setStatus(EodEntry.Status.PARTIALLY_APPROVED);
        EodProjectApproval done = piece(2L, rm, EodProjectApproval.Status.APPROVED);
        when(pieceRepository.findByEodEntryId(100L)).thenReturn(List.of(done, leadPiece));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.open(100L, rm.getEmail(), null));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        verify(clarificationRepository, never()).save(any());
    }

    @Test
    void open_onApprovedOrRejectedEntry_gets409() {
        for (EodEntry.Status status : List.of(EodEntry.Status.APPROVED, EodEntry.Status.REJECTED,
                EodEntry.Status.DRAFT, EodEntry.Status.MISSED)) {
            entry.setStatus(status);
            ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                    () -> service.open(100L, lead.getEmail(), null), status.name());
            assertEquals(HttpStatus.CONFLICT, ex.getStatusCode(), status.name());
        }
        verify(clarificationRepository, never()).save(any());
    }

    @Test
    void open_onOwnEod_isForbidden_evenWhenOwnerIsAPieceApprover() {
        leadPiece.setApprover(employee);
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.open(100L, employee.getEmail(), null));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        verify(clarificationRepository, never()).save(any());
    }

    @Test
    void open_byNonApproverRm_isForbidden() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.open(100L, rm.getEmail(), null));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    // ── reply: who is notified, and where ─────────────────────────────────────

    @Test
    void employeeReply_notifiesTheCurrentApprover_notThePreviousOpener() {
        AppUser previousLead = user(8L, "Previous Lead", AppUser.Role.EMPLOYEE);
        when(clarificationRepository.findByEodEntryIdAndStatusNot(100L, EodClarification.Status.RESOLVED))
                .thenReturn(Optional.of(openRound(previousLead)));   // round opened by the old approver
        // The piece has since moved to `lead`.

        service.reply(100L, employee.getEmail(), "Here is the detail", null);

        verify(notificationService).send(eq(lead.getId()), eq("EOD_CLARIFICATION_REPLY"), anyString(), anyString(),
                eq("/team/eod-inbox?highlight=100"));
        verify(notificationService, never()).send(eq(previousLead.getId()), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void employeeReply_notifiesLeadAndEscalatedPm_eachWithTheirOwnInboxLink() {
        leadPiece.setEscalatedTo(pm);
        when(clarificationRepository.findByEodEntryIdAndStatusNot(100L, EodClarification.Status.RESOLVED))
                .thenReturn(Optional.of(openRound(lead)));

        service.reply(100L, employee.getEmail(), "Here is the detail", null);

        verify(notificationService).send(eq(lead.getId()), eq("EOD_CLARIFICATION_REPLY"), anyString(), anyString(),
                eq("/team/eod-inbox?highlight=100"));
        verify(notificationService).send(eq(pm.getId()), eq("EOD_CLARIFICATION_REPLY"), anyString(), anyString(),
                eq("/projects/eod-inbox?highlight=100"));
    }

    @Test
    void employeeReply_deduplicatesAnApproverHoldingSeveralPieces() {
        EodProjectApproval second = piece(2L, lead, EodProjectApproval.Status.PENDING);
        when(pieceRepository.findByEodEntryId(100L)).thenReturn(List.of(leadPiece, second));
        when(clarificationRepository.findByEodEntryIdAndStatusNot(100L, EodClarification.Status.RESOLVED))
                .thenReturn(Optional.of(openRound(lead)));

        service.reply(100L, employee.getEmail(), "Here is the detail", null);

        verify(notificationService, times(1)).send(eq(lead.getId()), eq("EOD_CLARIFICATION_REPLY"),
                anyString(), anyString(), anyString());
    }

    @Test
    void reviewerReply_isDeniedToReadOnlyRm() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.reply(100L, rm.getEmail(), "hi", null));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        verify(replyRepository, never()).save(any());
    }

    // ── dual-role user: own EOD never appears in the reviewer-side lists ──────

    private EodClarification roundOn(Long entryId, Long roundId, AppUser owner, AppUser openedBy) {
        EodEntry e = new EodEntry();
        e.setId(entryId);
        e.setEmployee(owner);
        e.setEntryDate(LocalDate.of(2026, 9, 1));
        e.setStatus(EodEntry.Status.SUBMITTED);
        EodClarification c = new EodClarification();
        c.setId(roundId);
        c.setEodEntry(e);
        c.setOpenedBy(openedBy);
        c.setOpenedAt(OffsetDateTime.now());
        c.setStatus(EodClarification.Status.NEEDS_RESPONSE);
        return c;
    }

    @Test
    void listForLead_dropsTheViewersOwnEntry_butKeepsAReportsEntry() {
        // `lead` is both an employee (own entry 200, reviewed by someone else) and a reviewer of
        // `employee`'s entry 100. Even if the query returned both, only the report's survives.
        AppUser otherReviewer = user(9L, "Other Reviewer", AppUser.Role.EMPLOYEE);
        EodClarification own    = roundOn(200L, 501L, lead, otherReviewer);
        EodClarification report = roundOn(100L, 502L, employee, lead);
        when(clarificationRepository.findOpenForReviewer(lead.getId())).thenReturn(List.of(own, report));

        var items = service.listForLead(lead.getEmail(), true);

        assertEquals(1, items.size());
        assertEquals(100L, items.get(0).eodEntryId());
    }

    @Test
    void listForLead_resolvedTab_alsoDropsTheViewersOwnEntry() {
        AppUser otherReviewer = user(9L, "Other Reviewer", AppUser.Role.EMPLOYEE);
        EodClarification own = roundOn(200L, 501L, lead, otherReviewer);
        own.setStatus(EodClarification.Status.RESOLVED);
        when(clarificationRepository.findResolvedForReviewer(lead.getId())).thenReturn(List.of(own));

        assertTrue(service.listForLead(lead.getEmail(), false).isEmpty());
    }

    @Test
    void listForPm_dropsThePmsOwnEntry() {
        EodClarification own = roundOn(300L, 503L, pm, lead);
        EodClarification report = roundOn(100L, 502L, employee, lead);
        when(clarificationRepository.findOpenByPmId(pm.getId())).thenReturn(List.of(own, report));

        var items = service.listForPm(pm.getEmail(), true);

        assertEquals(List.of(100L), items.stream().map(i -> i.eodEntryId()).toList());
    }

    @Test
    void listForEmployee_stillShowsTheViewersOwnEntry() {
        AppUser otherReviewer = user(9L, "Other Reviewer", AppUser.Role.EMPLOYEE);
        EodClarification own = roundOn(200L, 501L, lead, otherReviewer);
        when(clarificationRepository.findByEodEntry_Employee_IdAndStatusNotOrderByOpenedAtDesc(
                lead.getId(), EodClarification.Status.RESOLVED)).thenReturn(List.of(own));

        var items = service.listForEmployee(lead.getEmail(), true);

        assertEquals(List.of(200L), items.stream().map(i -> i.eodEntryId()).toList());
    }

    // ── viewer flags ──────────────────────────────────────────────────────────

    @Test
    void getStatus_readOnlyRm_canReadButCannotOpenOrReply() {
        EodClarificationStatusDto none = service.getStatus(100L, rm.getEmail());
        assertFalse(none.canOpen());
        assertFalse(none.canReply());

        when(clarificationRepository.findFirstByEodEntryIdOrderByOpenedAtDesc(100L))
                .thenReturn(Optional.of(openRound(lead)));
        EodClarificationStatusDto open = service.getStatus(100L, rm.getEmail());
        assertTrue(open.open());
        assertFalse(open.canOpen());
        assertFalse(open.canReply());
        assertFalse(open.canResolve());
    }

    @Test
    void getStatus_approverCanOpenWhenNoRound_andReplyWhenOpen() {
        assertTrue(service.getStatus(100L, lead.getEmail()).canOpen());

        when(clarificationRepository.findFirstByEodEntryIdOrderByOpenedAtDesc(100L))
                .thenReturn(Optional.of(openRound(lead)));
        EodClarificationStatusDto open = service.getStatus(100L, lead.getEmail());
        assertFalse(open.canOpen());
        assertTrue(open.canReply());
        assertTrue(open.canResolve());
    }

    @Test
    void getStatus_owner_canReplyButNeverOpen() {
        assertFalse(service.getStatus(100L, employee.getEmail()).canOpen());

        when(clarificationRepository.findFirstByEodEntryIdOrderByOpenedAtDesc(100L))
                .thenReturn(Optional.of(openRound(lead)));
        EodClarificationStatusDto open = service.getStatus(100L, employee.getEmail());
        assertFalse(open.canOpen());
        assertTrue(open.canReply());
    }

    @Test
    void getStatus_owner_canReplyButNeverResolve() {
        when(clarificationRepository.findFirstByEodEntryIdOrderByOpenedAtDesc(100L))
                .thenReturn(Optional.of(openRound(lead)));
        EodClarificationStatusDto dto = service.getStatus(100L, employee.getEmail());
        assertTrue(dto.canReply());
        assertFalse(dto.canResolve());
    }

    @Test
    void getStatus_canResolve_isReviewerOnly_acrossViewers() {
        // Make `pm` a genuine read-only observer: PM of a project the entry has a task on.
        com.nforceone.sync.project.Project project = new com.nforceone.sync.project.Project();
        project.setId(10L);
        project.setPm(pm);
        EodTask task = new EodTask();
        task.setProject(project);
        entry.getTasks().add(task);

        when(clarificationRepository.findFirstByEodEntryIdOrderByOpenedAtDesc(100L))
                .thenReturn(Optional.of(openRound(lead)));

        assertTrue(service.getStatus(100L, lead.getEmail()).canResolve());       // pending-piece approver
        assertFalse(service.getStatus(100L, employee.getEmail()).canResolve());  // owner
        assertFalse(service.getStatus(100L, rm.getEmail()).canResolve());        // read-only reporting manager
        assertFalse(service.getStatus(100L, pm.getEmail()).canResolve());        // observer PM

        leadPiece.setEscalatedTo(pm);                                            // even as the escalated approver...
        assertFalse(service.getStatus(100L, pm.getEmail()).canResolve());        // ...a Project Manager is read-only
    }

    @Test
    void getStatus_noRound_hasNothingToResolve() {
        EodClarificationStatusDto dto = service.getStatus(100L, lead.getEmail());
        assertFalse(dto.canResolve());
        assertFalse(dto.canReply());
        assertTrue(dto.canOpen());
    }

    @Test
    void getStatus_resolvedRound_staysReadable_andReviewerMayOpenANewOne() {
        EodClarification resolved = openRound(lead);
        resolved.setStatus(EodClarification.Status.RESOLVED);
        resolved.setResolvedAt(OffsetDateTime.now());
        resolved.setResolvedBy(lead);
        when(clarificationRepository.findFirstByEodEntryIdOrderByOpenedAtDesc(100L)).thenReturn(Optional.of(resolved));

        EodClarificationStatusDto asReviewer = service.getStatus(100L, lead.getEmail());
        assertEquals(500L, asReviewer.clarificationId());
        assertFalse(asReviewer.open());
        assertEquals("RESOLVED", asReviewer.status());
        assertFalse(asReviewer.canReply());
        assertFalse(asReviewer.canResolve());
        assertTrue(asReviewer.canOpen());          // a new round can be started later

        EodClarificationStatusDto asOwner = service.getStatus(100L, employee.getEmail());
        assertFalse(asOwner.canOpen());
        assertFalse(asOwner.canReply());
        assertFalse(asOwner.canResolve());
    }

    // ── open with a first message (chat popup) ────────────────────────────────

    @Test
    void openWithFirstMessage_createsTheRoundAndExactlyOneReply_andOneNotification() {
        EodClarificationStatusDto dto = service.open(100L, lead.getEmail(), "Can you explain the 6h on task 2?", List.of());

        assertTrue(dto.open());
        verify(clarificationRepository).save(any(EodClarification.class));
        ArgumentCaptor<EodClarificationReply> reply = ArgumentCaptor.forClass(EodClarificationReply.class);
        verify(replyRepository, times(1)).save(reply.capture());
        assertEquals("Can you explain the 6h on task 2?", reply.getValue().getMessage());
        assertSame(lead, reply.getValue().getSender());
        // One notification only — REQUESTED — never a second "reply" one for the opening message.
        verify(notificationService, times(1)).send(anyLong(), anyString(), anyString(), anyString(), anyString());
        verify(notificationService).send(eq(employee.getId()), eq("EOD_CLARIFICATION_REQUESTED"),
                anyString(), anyString(), anyString());
    }

    @Test
    void openWithRejectedAttachment_gets400_andCreatesNoRound() {
        org.springframework.mock.web.MockMultipartFile bad = new org.springframework.mock.web.MockMultipartFile(
                "files", "payload.exe", "application/x-msdownload", new byte[]{1, 2, 3});

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.open(100L, lead.getEmail(), "see attached", List.of(bad)));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verify(clarificationRepository, never()).save(any());   // validated before the round exists
        verify(replyRepository, never()).save(any());
        verify(notificationService, never()).send(anyLong(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void openWhileARoundIsAlreadyOpen_gets409() {
        when(clarificationRepository.existsByEodEntryIdAndStatusNot(100L, EodClarification.Status.RESOLVED))
                .thenReturn(true);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.open(100L, lead.getEmail(), "again?", List.of()));

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        verify(replyRepository, never()).save(any());
    }

    @Test
    void openWithFirstMessage_onOwnEod_isForbidden_andSavesNothing() {
        leadPiece.setApprover(employee);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.open(100L, employee.getEmail(), "asking myself", List.of()));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        verify(clarificationRepository, never()).save(any());
        verify(replyRepository, never()).save(any());
    }

    @Test
    void openWithFirstMessage_afterAResolvedRound_startsAFreshRound() {
        // The latest round is resolved, so there is no OPEN round to conflict with (the default
        // existsBy… stub is false) and the reviewer may open another.
        EodClarification resolved = openRound(lead);
        resolved.setStatus(EodClarification.Status.RESOLVED);
        lenient().when(clarificationRepository.findFirstByEodEntryIdOrderByOpenedAtDesc(100L)).thenReturn(Optional.of(resolved));

        assertTrue(service.open(100L, lead.getEmail(), "one more question", List.of()).open());
        verify(replyRepository, times(1)).save(any(EodClarificationReply.class));
    }

    // ── Project Managers (role PM) are read-only: 403 on every write, reads still work ──

    /** Makes `pm` the PM of a project the entry has a task on, and the escalated approver of the lead's piece. */
    private void pmIsEscalatedApproverAndProjectPm() {
        com.nforceone.sync.project.Project project = new com.nforceone.sync.project.Project();
        project.setId(10L);
        project.setPm(pm);
        EodTask task = new EodTask();
        task.setProject(project);
        entry.getTasks().add(task);
        leadPiece.setEscalatedTo(pm);
    }

    @Test
    void pmRole_cannotOpenAClarification_403_andNothingIsSaved() {
        pmIsEscalatedApproverAndProjectPm();
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.open(100L, pm.getEmail(), "why 6h?", List.of()));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertTrue(ex.getReason().contains("read-only"), ex.getReason());
        verify(clarificationRepository, never()).save(any());
        verify(replyRepository, never()).save(any());
        verify(notificationService, never()).send(anyLong(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void pmRole_cannotReplyIntoAnOpenThread_403_andNothingIsSaved() {
        pmIsEscalatedApproverAndProjectPm();
        // No open-round stub: the read-only check fires before the round is even looked up.
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.reply(100L, pm.getEmail(), "I will answer", null));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        verify(replyRepository, never()).save(any());
    }

    @Test
    void pmRole_cannotResolveOrChangeTheStatus_403() {
        pmIsEscalatedApproverAndProjectPm();
        ResponseStatusException resolve = assertThrows(ResponseStatusException.class,
                () -> service.setStatus(100L, pm.getEmail(), "RESOLVED"));
        ResponseStatusException ack = assertThrows(ResponseStatusException.class,
                () -> service.setStatus(100L, pm.getEmail(), "ACKNOWLEDGED"));
        assertEquals(HttpStatus.FORBIDDEN, resolve.getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, ack.getStatusCode());
        verify(clarificationRepository, never()).save(any());
    }

    @Test
    void pmRole_canStillReadTheStatusAndTheThread_andAllWriteFlagsAreFalse() {
        pmIsEscalatedApproverAndProjectPm();
        when(clarificationRepository.findFirstByEodEntryIdOrderByOpenedAtDesc(100L))
                .thenReturn(Optional.of(openRound(lead)));
        EodClarificationStatusDto dto = service.getStatus(100L, pm.getEmail());
        assertTrue(dto.open());                 // can see that a round exists
        assertFalse(dto.canOpen());
        assertFalse(dto.canReply());
        assertFalse(dto.canResolve());
        assertDoesNotThrow(() -> service.getThread(100L, pm.getEmail()));
    }
}
