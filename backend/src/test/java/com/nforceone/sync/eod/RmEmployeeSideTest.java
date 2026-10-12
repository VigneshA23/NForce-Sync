package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.dto.EodClarificationReplyDto;
import com.nforceone.sync.myreports.MyReportsService;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.reporting.ReportingScopeService;
import com.nforceone.sync.teamlead.TeamLeadService;
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
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

/**
 * The reporting-manager / report relationship from both sides: the report's unread state on My Blockers, the
 * capacity labels on conversation messages (reviewer wording is neutral, the sender is named with his
 * capacity), and My Reporting Team's three people pages being scoped to DIRECT reports only.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RmEmployeeSideTest {

    @Mock BlockerReadStateRepository readStateRepository;
    @Mock EodTaskRepository taskRepository;
    @Mock AppUserRepository userRepository;
    @Mock TeamLeadService teamLeadService;
    @Mock ReportingScopeService reportingScopeService;

    private AppUser suhita, naveen, otherRm, leadUser;
    private Project project;
    private EodEntry entry;
    private EodTask blocker;

    @BeforeEach
    void setUp() {
        suhita = user(1L, "Suhita", AppUser.Role.PM);          // reports to Naveen, role is not EMPLOYEE
        naveen = user(2L, "Naveen", AppUser.Role.SUPERADMIN);  // her reporting manager
        otherRm = user(3L, "Other RM", AppUser.Role.EMPLOYEE);
        leadUser = user(4L, "Vignesh", AppUser.Role.EMPLOYEE);
        for (AppUser u : List.of(suhita, naveen, otherRm, leadUser)) {
            when(userRepository.findByEmailAndDeletedAtIsNull(u.getEmail())).thenReturn(Optional.of(u));
        }
        project = new Project();
        project.setId(10L);
        project.setLead(leadUser);
        entry = new EodEntry();
        entry.setId(100L);
        entry.setEmployee(suhita);
        entry.setManagerId(naveen.getId());
        blocker = new EodTask();
        blocker.setId(200L);
        blocker.setEodEntry(entry);
        blocker.setProject(project);
        when(taskRepository.findById(200L)).thenReturn(Optional.of(blocker));
        when(readStateRepository.save(any())).thenAnswer(i -> i.getArgument(0));
    }

    private static AppUser user(Long id, String name, AppUser.Role role) {
        AppUser u = new AppUser();
        u.setId(id); u.setFullName(name); u.setRole(role);
        u.setEmail(name.toLowerCase().replace(" ", ".") + "@example.com");
        return u;
    }

    // ── My Blockers unread (employee side, any role) ──────────────────────────

    private BlockerReadService readService() {
        return new BlockerReadService(readStateRepository, taskRepository, userRepository);
    }

    @Test
    void unreadCount_isTheViewersOwnBlockersWithAReviewerReply_forAnyAccountRole() {
        when(readStateRepository.countUnreadBlockersForEmployee(suhita.getId())).thenReturn(2L);

        assertEquals(2L, readService().unreadCount(suhita.getEmail()));   // role PM, not EMPLOYEE
        verify(readStateRepository).countUnreadBlockersForEmployee(suhita.getId());
        verify(readStateRepository, never()).countUnreadBlockersForEmployee(naveen.getId());
    }

    @Test
    void openingTheThread_marksItRead_forTheEmployeeWhoRaisedIt() {
        when(readStateRepository.findByTaskIdAndUserId(200L, suhita.getId())).thenReturn(Optional.empty());

        readService().markRead(200L, suhita.getEmail());

        ArgumentCaptor<BlockerReadState> saved = ArgumentCaptor.forClass(BlockerReadState.class);
        verify(readStateRepository).save(saved.capture());
        assertSame(suhita, saved.getValue().getUser());
        assertSame(blocker, saved.getValue().getTask());
        assertNotNull(saved.getValue().getLastReadAt());
    }

    @Test
    void reopening_updatesTheExistingRow_notANewOne() {
        BlockerReadState existing = new BlockerReadState();
        existing.setTask(blocker);
        existing.setUser(suhita);
        existing.setLastReadAt(OffsetDateTime.now().minusDays(1));
        when(readStateRepository.findByTaskIdAndUserId(200L, suhita.getId())).thenReturn(Optional.of(existing));

        readService().markRead(200L, suhita.getEmail());

        verify(readStateRepository).save(existing);
        assertTrue(existing.getLastReadAt().isAfter(OffsetDateTime.now().minusMinutes(1)));
    }

    @Test
    void aDifferentUser_cannotMarkSomeoneElsesBlockerRead_includingTheRm() {
        for (AppUser other : List.of(otherRm, naveen)) {
            ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                    () -> readService().markRead(200L, other.getEmail()));
            assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        }
        verify(readStateRepository, never()).save(any());
    }

    // ── capacity labels ───────────────────────────────────────────────────────

    private EodClarificationReplyDto clarificationReplyFrom(AppUser sender, EodEntry e) {
        EodClarification c = new EodClarification();
        c.setEodEntry(e);
        EodClarificationReply r = new EodClarificationReply();
        r.setId(1L);
        r.setClarification(c);
        r.setSender(sender);
        r.setMessage("m");
        r.setCreatedAt(OffsetDateTime.now());
        return EodClarificationReplyDto.from(r, c, List.of());
    }

    @Test
    void clarificationReply_fromTheReportingManager_isLabelledByCapacity_notTeamLead() {
        EodTask t = new EodTask();
        t.setEodEntry(entry);
        t.setProject(project);
        entry.getTasks().add(t);

        EodClarificationReplyDto rm = clarificationReplyFrom(naveen, entry);
        assertEquals("Reporting Manager", rm.senderLabel());
        assertEquals("REPORTING_MANAGER", rm.senderRole());
        assertEquals("Naveen", rm.senderName());

        EodClarificationReplyDto lead = clarificationReplyFrom(leadUser, entry);
        assertEquals("Team Lead", lead.senderLabel());
        assertEquals("TEAM_LEAD", lead.senderRole());

        assertEquals("Employee", clarificationReplyFrom(suhita, entry).senderLabel());
    }

    @Test
    void aSenderWithNoCapacityOnTheEntry_fallsBackToTheAccountRole() {
        entry.setManagerId(otherRm.getId());   // Naveen is not her RM on this entry
        EodClarificationReplyDto dto = clarificationReplyFrom(naveen, entry);
        assertEquals("Super Admin", dto.senderLabel());
    }

    // ── Team Overview / EOD Status / Utilization: direct reports only ─────────

    private MyReportsService myReports() {
        return new MyReportsService(userRepository, teamLeadService, reportingScopeService, null, null, null, null);
    }

    @Test
    void myReports_peoplePages_useDirectReportsOnly_neverTheWiderV105Scope() {
        when(userRepository.existsByManagerIdAndDeletedAtIsNull(naveen.getId())).thenReturn(true);
        when(reportingScopeService.directReportIds(naveen.getId())).thenReturn(List.of(suhita.getId()));
        // The wide resolver (subtree + led-project members) would also return indirect reports and others.
        when(reportingScopeService.reportingScopeUserIds(naveen.getId())).thenReturn(List.of(suhita.getId(), 77L, 88L));

        LocalDate d = LocalDate.of(2026, 10, 12);
        myReports().getSummary(d, d, naveen.getEmail());
        myReports().getMemberStatuses(d, d, naveen.getEmail());

        verify(teamLeadService).getSummaryForScope(d, d, List.of(suhita.getId()));
        verify(teamLeadService).getMemberStatusesForScope(d, d, List.of(suhita.getId()));
        verify(reportingScopeService, never()).reportingScopeUserIds(anyLong());
    }

    @Test
    void myReports_aMemberOutsideTheDirectReports_is403_evenIfInTheWiderScope() {
        when(userRepository.existsByManagerIdAndDeletedAtIsNull(naveen.getId())).thenReturn(true);
        when(reportingScopeService.directReportIds(naveen.getId())).thenReturn(List.of(suhita.getId()));
        when(reportingScopeService.reportingScopeUserIds(naveen.getId())).thenReturn(List.of(suhita.getId(), 77L));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> myReports().getMemberEod(77L, LocalDate.of(2026, 10, 12), naveen.getEmail()));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    @Test
    void aDifferentRm_withNoDirectReports_getsNothing() {
        when(userRepository.existsByManagerIdAndDeletedAtIsNull(otherRm.getId())).thenReturn(false);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> myReports().getSummary(LocalDate.now(), LocalDate.now(), otherRm.getEmail()));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }
}
