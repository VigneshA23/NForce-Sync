package com.nforceone.sync.eod;

import com.nforceone.sync.approval2.EodProjectApproval;
import com.nforceone.sync.approval2.EodProjectApprovalRepository;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.dto.EodClarificationReplyDto;
import com.nforceone.sync.eod.dto.EodClarificationStatusDto;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.project.PmScopeService;
import com.nforceone.sync.project.Project;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Clarification state is per piece (one project + one lead). An employee on SYNC and ARENA submits one EOD;
 * each project's lead can open, drive and resolve a round of their own, and neither sees nor touches the
 * other's. Rounds live in an in-memory list behind the mocked repository so state changes made by the
 * service (open / resolve) are what the later assertions observe.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EodClarificationPerPieceTest {

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

    private static final EodClarification.Status RESOLVED = EodClarification.Status.RESOLVED;

    private EodClarificationService service;
    private AppUser employee, syncLead, arenaLead;
    private EodEntry entry;
    private EodProjectApproval syncPiece, arenaPiece;
    private final List<EodClarification> rounds = new ArrayList<>();
    private final List<EodClarificationReply> replies = new ArrayList<>();
    private long nextId = 500;

    @BeforeEach
    void setUp() {
        service = new EodClarificationService(1_000_000L, 10_000_000L, entryRepository, clarificationRepository,
                replyRepository, attachmentRepository, readStateRepository, taskRepository, userRepository,
                notificationService, pmScopeService, pieceRepository);

        employee  = user(1L, "Sravani Pilla");
        syncLead  = user(3L, "Vignesh Appani");
        arenaLead = user(5L, "Akash T");

        entry = new EodEntry();
        entry.setId(100L);
        entry.setEmployee(employee);
        entry.setEntryDate(LocalDate.of(2026, 10, 9));
        entry.setStatus(EodEntry.Status.SUBMITTED);

        syncPiece  = piece(1L, syncLead, "SYNC");
        arenaPiece = piece(2L, arenaLead, "ARENA");

        when(entryRepository.findWithDetailsById(100L)).thenReturn(Optional.of(entry));
        when(pieceRepository.findByEodEntryId(100L)).thenReturn(List.of(syncPiece, arenaPiece));
        for (AppUser u : List.of(employee, syncLead, arenaLead)) {
            when(userRepository.findByEmailAndDeletedAtIsNull(u.getEmail())).thenReturn(Optional.of(u));
        }

        when(clarificationRepository.save(any(EodClarification.class))).thenAnswer(i -> {
            EodClarification c = i.getArgument(0);
            if (c.getId() == null) {
                c.setId(nextId++);
                rounds.add(0, c);
            }
            return c;
        });
        when(clarificationRepository.findByEodEntryIdOrderByOpenedAtDesc(100L)).thenAnswer(i -> List.copyOf(rounds));
        when(clarificationRepository.findById(anyLong())).thenAnswer(i ->
                rounds.stream().filter(c -> c.getId().equals(i.getArgument(0))).findFirst());
        when(clarificationRepository.existsByPiece_IdAndStatusNot(anyLong(), any())).thenAnswer(i ->
                rounds.stream().anyMatch(c -> c.getPiece() != null && c.getPiece().getId().equals(i.getArgument(0))
                        && c.getStatus() != RESOLVED));
        when(clarificationRepository.existsByEodEntryIdAndPieceIsNullAndStatusNotAndOpenedBy_Id(anyLong(), any(), anyLong())).thenAnswer(i ->
                rounds.stream().anyMatch(c -> c.getPiece() == null && c.getStatus() != RESOLVED
                        && c.getOpenedBy().getId().equals(i.getArgument(2))));
        when(replyRepository.save(any(EodClarificationReply.class))).thenAnswer(i -> {
            EodClarificationReply r = i.getArgument(0);
            r.setId(nextId++);
            replies.add(r);
            return r;
        });
        when(replyRepository.findByClarificationIdOrderByCreatedAtAsc(anyLong())).thenAnswer(i ->
                replies.stream().filter(r -> r.getClarification().getId().equals(i.getArgument(0))).toList());
    }

    private AppUser user(Long id, String name) {
        AppUser u = new AppUser();
        u.setId(id); u.setFullName(name); u.setRole(AppUser.Role.EMPLOYEE);
        u.setEmail(name.toLowerCase().replace(" ", ".") + "@example.com");
        return u;
    }

    private EodProjectApproval piece(Long id, AppUser approver, String projectName) {
        Project project = new Project();
        project.setId(100L + id);
        project.setName(projectName);
        EodProjectApproval p = new EodProjectApproval();
        p.setId(id);
        p.setEodEntry(entry);
        p.setProject(project);
        p.setApprover(approver);
        p.setApproverType(EodProjectApproval.ApproverType.LEAD);
        p.setStatus(EodProjectApproval.Status.PENDING);
        return p;
    }

    private EodClarificationStatusDto open(AppUser lead) {
        return service.open(100L, lead.getEmail(), null);
    }

    private EodClarification roundOn(EodProjectApproval piece) {
        return rounds.stream().filter(c -> c.getPiece() != null && c.getPiece().getId().equals(piece.getId()))
                .findFirst().orElseThrow();
    }

    private static HttpStatus statusOf(ResponseStatusException e) {
        return HttpStatus.valueOf(e.getStatusCode().value());
    }

    // ── ARENA opens: SYNC is unaffected ──────────────────────────────────────

    @Test
    void arenaLeadOpens_roundIsTiedToArenasPiece_andSyncLeadSeesNoRoundOrBadge() {
        EodClarificationStatusDto opened = open(arenaLead);

        assertThat(opened.open()).isTrue();
        assertThat(opened.pieceId()).isEqualTo(2L);
        assertThat(opened.projectName()).isEqualTo("ARENA");

        // SYNC's card: no round on SYNC's piece, and SYNC may still open one of their own.
        EodClarificationStatusDto syncCard = service.getStatusForPiece(100L, syncLead.getEmail(), syncPiece.getId());
        assertThat(syncCard.open()).isFalse();
        assertThat(syncCard.clarificationId()).isNull();
        assertThat(syncCard.canOpen()).isTrue();
        // ...and SYNC's own status view does not surface ARENA's round at all.
        assertThat(service.getStatus(100L, syncLead.getEmail()).open()).isFalse();
    }

    @Test
    void arenaOpens_onlyTheEmployeeIsNotified_neverSyncsLead() {
        open(arenaLead);

        verify(notificationService).send(eq(employee.getId()), eq("EOD_CLARIFICATION_REQUESTED"),
                anyString(), anyString(), anyString());
        verify(notificationService, never()).send(eq(syncLead.getId()), anyString(), anyString(), anyString(), anyString());
    }

    // ── blocked until resolved, then unblocked (observed through the gate the approve call reads) ──

    @Test
    void arenaPieceIsBlockedWhileItsRoundIsOpen_andUnblockedOnceResolved_syncNeverBlocked() {
        open(arenaLead);

        assertThat(clarificationRepository.existsByPiece_IdAndStatusNot(arenaPiece.getId(), RESOLVED)).isTrue();
        assertThat(clarificationRepository.existsByPiece_IdAndStatusNot(syncPiece.getId(), RESOLVED)).isFalse();

        service.setStatus(100L, arenaLead.getEmail(), "RESOLVED");

        assertThat(clarificationRepository.existsByPiece_IdAndStatusNot(arenaPiece.getId(), RESOLVED)).isFalse();
    }

    // ── both leads open at once; resolving one leaves the other ──────────────

    @Test
    void bothLeadsCanHaveOpenRoundsAtOnce_resolvingOneDoesNotResolveTheOther() {
        open(arenaLead);
        open(syncLead);   // must not 409 because ARENA's round is open

        assertThat(rounds).hasSize(2);
        assertThat(roundOn(syncPiece).isOpen()).isTrue();
        assertThat(roundOn(arenaPiece).isOpen()).isTrue();

        service.setStatus(100L, arenaLead.getEmail(), "RESOLVED");

        assertThat(roundOn(arenaPiece).getStatus()).isEqualTo(RESOLVED);
        assertThat(roundOn(syncPiece).getStatus()).isEqualTo(EodClarification.Status.NEEDS_RESPONSE);
        assertThat(clarificationRepository.existsByPiece_IdAndStatusNot(syncPiece.getId(), RESOLVED)).isTrue();
    }

    @Test
    void aSecondRoundOnTheSamePieceIsStillRefused() {
        open(arenaLead);

        assertEquals(HttpStatus.CONFLICT, statusOf(assertThrows(ResponseStatusException.class, () -> open(arenaLead))));
    }

    @Test
    void aLeadCannotOpenARoundOnAnotherLeadsPiece() {
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.open(100L, syncLead.getEmail(), null, List.of(), arenaPiece.getId()));

        assertEquals(HttpStatus.FORBIDDEN, statusOf(e));
        assertThat(rounds).isEmpty();
    }

    // ── thread isolation ─────────────────────────────────────────────────────

    @Test
    void eachLeadSeesOnlyTheirOwnThread_andCannotReadOrPostInTheOthers() {
        open(arenaLead);
        open(syncLead);
        Long arenaRound = roundOn(arenaPiece).getId();
        Long syncRound = roundOn(syncPiece).getId();
        service.reply(100L, arenaLead.getEmail(), "arena question", null);
        service.reply(100L, syncLead.getEmail(), "sync question", null);

        // Each lead's default view is their own thread only.
        assertThat(service.getThread(100L, syncLead.getEmail()))
                .extracting(EodClarificationReplyDto::message).containsExactly("sync question");
        assertThat(service.getThread(100L, arenaLead.getEmail()))
                .extracting(EodClarificationReplyDto::message).containsExactly("arena question");

        // Asking for the other project's thread by id is refused — read, post, status change and mark-read.
        assertEquals(HttpStatus.FORBIDDEN, statusOf(assertThrows(ResponseStatusException.class,
                () -> service.getThread(100L, syncLead.getEmail(), arenaRound))));
        assertEquals(HttpStatus.FORBIDDEN, statusOf(assertThrows(ResponseStatusException.class,
                () -> service.getStatus(100L, syncLead.getEmail(), arenaRound))));
        assertEquals(HttpStatus.FORBIDDEN, statusOf(assertThrows(ResponseStatusException.class,
                () -> service.reply(100L, syncLead.getEmail(), "intruding", null, arenaRound))));
        assertEquals(HttpStatus.FORBIDDEN, statusOf(assertThrows(ResponseStatusException.class,
                () -> service.setStatus(100L, syncLead.getEmail(), "RESOLVED", arenaRound))));
        assertThat(roundOn(arenaPiece).isOpen()).isTrue();
        assertThat(replies).extracting(EodClarificationReply::getMessage)
                .containsExactlyInAnyOrder("arena question", "sync question");

        service.markRead(100L, syncLead.getEmail());
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<EodClarificationReadState>> saved = ArgumentCaptor.forClass(List.class);
        verify(readStateRepository).saveAll(saved.capture());
        assertThat(saved.getValue()).extracting(s -> s.getClarification().getId()).containsExactly(syncRound);
    }

    @Test
    void aLeadWithNoRoundOfHisOwn_getsForbiddenNotAccess_whenAnotherProjectsRoundIsOpen() {
        open(arenaLead);

        assertEquals(HttpStatus.FORBIDDEN, statusOf(assertThrows(ResponseStatusException.class,
                () -> service.reply(100L, syncLead.getEmail(), "hello", null))));
        assertEquals(HttpStatus.FORBIDDEN, statusOf(assertThrows(ResponseStatusException.class,
                () -> service.setStatus(100L, syncLead.getEmail(), "RESOLVED"))));
        assertThat(service.getThread(100L, syncLead.getEmail())).isEmpty();
    }

    @Test
    void theEmployeeSeesEveryThreadOnTheirOwnEod_andRepliesIntoTheOneTheyPick() {
        open(arenaLead);
        open(syncLead);
        Long arenaRound = roundOn(arenaPiece).getId();
        Long syncRound = roundOn(syncPiece).getId();

        assertThat(service.getStatus(100L, employee.getEmail(), arenaRound).projectName()).isEqualTo("ARENA");
        assertThat(service.getStatus(100L, employee.getEmail(), syncRound).projectName()).isEqualTo("SYNC");

        service.reply(100L, employee.getEmail(), "answer for arena", null, arenaRound);

        assertThat(service.getThread(100L, arenaLead.getEmail()))
                .extracting(EodClarificationReplyDto::message).containsExactly("answer for arena");
        assertThat(service.getThread(100L, syncLead.getEmail())).isEmpty();
    }

    @Test
    void anEmployeeReplyNotifiesOnlyTheLeadWhoAsked_neverTheOtherProjectsLead() {
        open(arenaLead);
        open(syncLead);

        service.reply(100L, employee.getEmail(), "answer for arena", null, roundOn(arenaPiece).getId());

        verify(notificationService).send(eq(arenaLead.getId()), eq("EOD_CLARIFICATION_REPLY"),
                anyString(), anyString(), anyString());
        verify(notificationService, never()).send(eq(syncLead.getId()), eq("EOD_CLARIFICATION_REPLY"),
                anyString(), anyString(), anyString());
    }

    // ── three projects on one EOD, each with its own lead ────────────────────

    @Test
    void threeProjectsOnOneEod_eachLeadIsIsolated_andResolvingOneLeavesTheOtherTwoOpen() {
        AppUser pulseLead = user(7L, "Dheeraj S");
        when(userRepository.findByEmailAndDeletedAtIsNull(pulseLead.getEmail())).thenReturn(Optional.of(pulseLead));
        EodProjectApproval pulsePiece = piece(3L, pulseLead, "PULSE");
        when(pieceRepository.findByEodEntryId(100L)).thenReturn(List.of(syncPiece, arenaPiece, pulsePiece));

        open(syncLead);
        open(arenaLead);
        open(pulseLead);
        assertThat(rounds).hasSize(3);
        assertThat(rounds).extracting(c -> c.getPiece().getId()).containsExactlyInAnyOrder(1L, 2L, 3L);

        // Each lead sees exactly one round — their own — and cannot reach either of the other two by id.
        for (var pair : List.of(
                java.util.Map.entry(syncLead, syncPiece), java.util.Map.entry(arenaLead, arenaPiece),
                java.util.Map.entry(pulseLead, pulsePiece))) {
            AppUser lead = pair.getKey();
            EodClarification own = roundOn(pair.getValue());
            assertThat(service.getStatus(100L, lead.getEmail()).clarificationId()).isEqualTo(own.getId());
            for (EodClarification other : rounds) {
                if (other == own) continue;
                assertEquals(HttpStatus.FORBIDDEN, statusOf(assertThrows(ResponseStatusException.class,
                        () -> service.getThread(100L, lead.getEmail(), other.getId()))));
                assertEquals(HttpStatus.FORBIDDEN, statusOf(assertThrows(ResponseStatusException.class,
                        () -> service.reply(100L, lead.getEmail(), "intruding", null, other.getId()))));
            }
        }

        // The employee sees all three, labelled by project.
        assertThat(rounds.stream().map(c -> service.getStatus(100L, employee.getEmail(), c.getId()).projectName()))
                .containsExactlyInAnyOrder("SYNC", "ARENA", "PULSE");

        // Resolving the middle project's round leaves the other two open and blocking their own pieces.
        service.setStatus(100L, arenaLead.getEmail(), "RESOLVED");
        assertThat(roundOn(arenaPiece).getStatus()).isEqualTo(RESOLVED);
        assertThat(roundOn(syncPiece).isOpen()).isTrue();
        assertThat(roundOn(pulsePiece).isOpen()).isTrue();
        assertThat(clarificationRepository.existsByPiece_IdAndStatusNot(arenaPiece.getId(), RESOLVED)).isFalse();
        assertThat(clarificationRepository.existsByPiece_IdAndStatusNot(syncPiece.getId(), RESOLVED)).isTrue();
        assertThat(clarificationRepository.existsByPiece_IdAndStatusNot(pulsePiece.getId(), RESOLVED)).isTrue();

        // An employee reply into the third round pings only the third lead.
        service.reply(100L, employee.getEmail(), "for pulse", null, roundOn(pulsePiece).getId());
        verify(notificationService).send(eq(pulseLead.getId()), eq("EOD_CLARIFICATION_REPLY"), anyString(), anyString(), anyString());
        verify(notificationService, never()).send(eq(syncLead.getId()), eq("EOD_CLARIFICATION_REPLY"), anyString(), anyString(), anyString());
        verify(notificationService, never()).send(eq(arenaLead.getId()), eq("EOD_CLARIFICATION_REPLY"), anyString(), anyString(), anyString());
    }

    // ── security: pieceId on open must belong to the requesting lead ─────────

    @Test
    void openWithAPieceIdThatDoesNotExist_isForbidden_andCreatesNothing() {
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.open(100L, syncLead.getEmail(), null, List.of(), 9999L));

        assertEquals(HttpStatus.FORBIDDEN, statusOf(e));
        assertThat(rounds).isEmpty();
    }

    @Test
    void openWithAPieceIdThatIsNoLongerPending_isForbidden() {
        arenaPiece.setStatus(EodProjectApproval.Status.APPROVED);   // nothing left to clarify on ARENA

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.open(100L, arenaLead.getEmail(), null, List.of(), arenaPiece.getId()));

        assertEquals(HttpStatus.FORBIDDEN, statusOf(e));
        assertThat(rounds).isEmpty();
    }

    @Test
    void theEmployeeCannotOpenARoundOnTheirOwnEod_evenWithAPieceId() {
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.open(100L, employee.getEmail(), null, List.of(), syncPiece.getId()));

        assertEquals(HttpStatus.FORBIDDEN, statusOf(e));
        assertThat(rounds).isEmpty();
    }

    @Test
    void aLeadOfTwoProjects_mayChooseEitherOfHisOwnPieces_butNeverSomeoneElses() {
        // One lead holds BOTH the SYNC and a second piece; ARENA belongs to another lead.
        EodProjectApproval secondOfMine = piece(4L, syncLead, "SYNC-API");
        when(pieceRepository.findByEodEntryId(100L)).thenReturn(List.of(syncPiece, secondOfMine, arenaPiece));

        service.open(100L, syncLead.getEmail(), null, List.of(), secondOfMine.getId());
        assertThat(rounds).hasSize(1);
        assertThat(rounds.get(0).getPiece().getId()).isEqualTo(4L);

        // His other own piece is still free for a round of its own.
        service.open(100L, syncLead.getEmail(), null, List.of(), syncPiece.getId());
        assertThat(rounds).hasSize(2);

        // ...but ARENA's piece is not his: 403, no third round.
        assertEquals(HttpStatus.FORBIDDEN, statusOf(assertThrows(ResponseStatusException.class,
                () -> service.open(100L, syncLead.getEmail(), null, List.of(), arenaPiece.getId()))));
        assertThat(rounds).hasSize(2);
    }

    // ── mark-read is per round ───────────────────────────────────────────────

    @Test
    void markingOneRoundRead_leavesTheOtherProjectsRoundUnread() {
        open(arenaLead);
        open(syncLead);
        Long arenaRound = roundOn(arenaPiece).getId();

        service.markRead(100L, employee.getEmail(), arenaRound);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<EodClarificationReadState>> saved = ArgumentCaptor.forClass(List.class);
        verify(readStateRepository).saveAll(saved.capture());
        assertThat(saved.getValue()).extracting(s -> s.getClarification().getId()).containsExactly(arenaRound);
    }

    @Test
    void aLeadCannotMarkAnotherProjectsRoundRead() {
        open(arenaLead);

        assertEquals(HttpStatus.FORBIDDEN, statusOf(assertThrows(ResponseStatusException.class,
                () -> service.markRead(100L, syncLead.getEmail(), roundOn(arenaPiece).getId()))));
        verify(readStateRepository, never()).saveAll(any());
    }

    // ── legacy round (no piece): its opener's alone ──────────────────────────

    /** A round opened before per-piece rounds existed (piece_id NULL), by the ARENA lead. */
    private EodClarification legacyRoundBy(AppUser opener) {
        EodClarification legacy = new EodClarification();
        legacy.setId(nextId++);
        legacy.setEodEntry(entry);
        legacy.setOpenedBy(opener);
        legacy.setOpenedByApprover(opener);
        legacy.setOpenedAt(OffsetDateTime.now());
        legacy.setStatus(EodClarification.Status.NEEDS_RESPONSE);
        rounds.add(legacy);
        return legacy;
    }

    @Test
    void aLegacyRound_isInvisibleToAnotherLead_cannotBePostedInOrResolved_andDoesNotStopThemOpeningTheirOwn() {
        EodClarification legacy = legacyRoundBy(arenaLead);

        // The second lead sees nothing: no status, no thread, no inbox-style access by id.
        EodClarificationStatusDto syncView = service.getStatus(100L, syncLead.getEmail());
        assertThat(syncView.open()).isFalse();
        assertThat(syncView.clarificationId()).isNull();
        assertThat(service.getThread(100L, syncLead.getEmail())).isEmpty();
        assertEquals(HttpStatus.FORBIDDEN, statusOf(assertThrows(ResponseStatusException.class,
                () -> service.getThread(100L, syncLead.getEmail(), legacy.getId()))));
        assertEquals(HttpStatus.FORBIDDEN, statusOf(assertThrows(ResponseStatusException.class,
                () -> service.reply(100L, syncLead.getEmail(), "intruding", null, legacy.getId()))));
        assertEquals(HttpStatus.FORBIDDEN, statusOf(assertThrows(ResponseStatusException.class,
                () -> service.setStatus(100L, syncLead.getEmail(), "RESOLVED", legacy.getId()))));
        assertEquals(HttpStatus.FORBIDDEN, statusOf(assertThrows(ResponseStatusException.class,
                () -> service.markRead(100L, syncLead.getEmail(), legacy.getId()))));
        assertThat(legacy.isOpen()).isTrue();
        assertThat(replies).isEmpty();

        // ...and it does not get in the way of their own round.
        EodClarificationStatusDto opened = open(syncLead);
        assertThat(opened.open()).isTrue();
        assertThat(opened.pieceId()).isEqualTo(1L);
        // The gate service-side is covered in ApprovalPieceClarificationGateTest: a legacy round blocks only its
        // opener's pieces, so the second lead's approve/reject is never blocked by it.
        assertThat(clarificationRepository.existsByEodEntryIdAndPieceIsNullAndStatusNotAndOpenedBy_Id(
                100L, RESOLVED, syncLead.getId())).isFalse();
    }

    @Test
    void aLegacyRound_stillWorksForItsOpenerAndTheEmployee() {
        EodClarification legacy = legacyRoundBy(arenaLead);

        // Opener: reads, posts, and can resolve.
        assertThat(service.getStatus(100L, arenaLead.getEmail()).open()).isTrue();
        service.reply(100L, arenaLead.getEmail(), "what is the status?", null);
        assertThat(service.getThread(100L, arenaLead.getEmail()))
                .extracting(EodClarificationReplyDto::message).containsExactly("what is the status?");

        // Employee: reads and answers; the reply pings the opener only, never the other project's lead.
        assertThat(service.getThread(100L, employee.getEmail(), legacy.getId())).hasSize(1);
        service.reply(100L, employee.getEmail(), "here you go", null, legacy.getId());
        verify(notificationService).send(eq(arenaLead.getId()), eq("EOD_CLARIFICATION_REPLY"), anyString(), anyString(), anyString());
        verify(notificationService, never()).send(eq(syncLead.getId()), eq("EOD_CLARIFICATION_REPLY"), anyString(), anyString(), anyString());

        service.setStatus(100L, arenaLead.getEmail(), "RESOLVED");
        assertThat(legacy.getStatus()).isEqualTo(RESOLVED);
    }

    @Test
    void aLegacyRound_isReadOnlyVisibleToTheFrozenReportingManager_justLikeAPieceKeyedRound() {
        AppUser rm = user(9L, "Ramesh A");
        when(userRepository.findByEmailAndDeletedAtIsNull(rm.getEmail())).thenReturn(Optional.of(rm));
        entry.setManagerId(rm.getId());
        legacyRoundBy(arenaLead);
        open(syncLead);   // a piece-keyed round on the same entry

        // The read-only RM sees both kinds of round (as before for piece-keyed rounds), and can act on neither.
        EodClarificationStatusDto view = service.getStatus(100L, rm.getEmail());
        assertThat(view.open()).isTrue();
        assertThat(view.canReply()).isFalse();
        assertThat(view.canResolve()).isFalse();
        assertThat(rounds.stream().filter(c -> c.getPiece() == null).map(c ->
                service.getStatus(100L, rm.getEmail(), c.getId()).clarificationId())).hasSize(1).doesNotContainNull();
        assertEquals(HttpStatus.FORBIDDEN, statusOf(assertThrows(ResponseStatusException.class,
                () -> service.reply(100L, rm.getEmail(), "x", null))));
    }

    @Test
    void aLegacyRound_appliesToTheOpenersPieces_notToAPieceEscalatedAwayFromHim() {
        AppUser pm = user(30L, "PM P");
        legacyRoundBy(arenaLead);

        // The ARENA piece is still the opener's: the legacy round applies to its card.
        assertThat(service.getStatusForPiece(100L, employee.getEmail(), arenaPiece.getId()).open()).isTrue();
        // SYNC's piece is another lead's: it never does.
        assertThat(service.getStatusForPiece(100L, employee.getEmail(), syncPiece.getId()).open()).isFalse();

        // Escalate the ARENA piece to a PM: it is no longer held by the opener, so the round no longer applies.
        arenaPiece.setEscalatedTo(pm);
        assertThat(service.getStatusForPiece(100L, employee.getEmail(), arenaPiece.getId()).open()).isFalse();
    }

    @Test
    void anOpenersLegacyRound_stopsThatLeadOpeningAnotherPieceRound_butNotAnyoneElse() {
        legacyRoundBy(arenaLead);

        assertEquals(HttpStatus.CONFLICT, statusOf(assertThrows(ResponseStatusException.class, () -> open(arenaLead))));
        assertThat(open(syncLead).open()).isTrue();
    }
}
