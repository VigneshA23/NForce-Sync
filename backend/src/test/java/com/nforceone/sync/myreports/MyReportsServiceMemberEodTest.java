package com.nforceone.sync.myreports;

import com.nforceone.sync.approval2.ApprovalPieceService;
import com.nforceone.sync.approval2.EodProjectApprovalRepository;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodService;
import com.nforceone.sync.eod.dto.EodEntryDto;
import com.nforceone.sync.reporting.ReportingScopeService;
import com.nforceone.sync.teamlead.TeamLeadService;
import com.nforceone.sync.teamlead.TeamLeadService.MemberEodLookup;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MyReportsServiceMemberEodTest {

    private static final String MANAGER_EMAIL = "manager@nforceone.com";
    private static final Long MANAGER_ID = 1L;
    private static final Long REPORTEE_ID = 2L;
    private static final Long OUTSIDER_ID = 99L;

    @Mock AppUserRepository userRepository;
    @Mock TeamLeadService teamLeadService;
    @Mock ReportingScopeService reportingScopeService;
    @Mock EodProjectApprovalRepository pieceRepository;
    @Mock ApprovalPieceService approvalPieceService;
    @Mock EodService eodService;

    MyReportsService service;
    AppUser manager;
    AppUser reportee;
    AppUser outsider;

    @BeforeEach
    void setUp() {
        service = new MyReportsService(userRepository, teamLeadService, reportingScopeService,
                pieceRepository, approvalPieceService, eodService);

        manager = user(MANAGER_ID, "Mina Manager", "M-001", MANAGER_EMAIL);
        reportee = user(REPORTEE_ID, "Rae Reportee", "E-002", "rae@nforceone.com");
        outsider = user(OUTSIDER_ID, "Olly Outsider", "E-099", "olly@nforceone.com");

        lenient().when(userRepository.findByEmailAndDeletedAtIsNull(MANAGER_EMAIL)).thenReturn(Optional.of(manager));
        lenient().when(userRepository.existsByManagerIdAndDeletedAtIsNull(MANAGER_ID)).thenReturn(true);
        lenient().when(userRepository.findById(REPORTEE_ID)).thenReturn(Optional.of(reportee));
        lenient().when(userRepository.findById(OUTSIDER_ID)).thenReturn(Optional.of(outsider));
        lenient().when(reportingScopeService.reportingScopeUserIds(MANAGER_ID)).thenReturn(List.of(REPORTEE_ID));
    }

    @Test
    void inScopeSubmittedEntryReturnsFullContents() {
        LocalDate day = LocalDate.now().minusDays(1);
        EodEntry entry = entry(EodEntry.Status.SUBMITTED);
        EodEntryDto dto = mock(EodEntryDto.class);
        when(teamLeadService.lookupMemberEod(REPORTEE_ID, day))
                .thenReturn(new MemberEodLookup("PENDING_APPROVAL", entry));
        when(eodService.toDetailDto(entry)).thenReturn(dto);

        MemberEodDetailDto result = service.getMemberEod(REPORTEE_ID, day, MANAGER_EMAIL);

        assertThat(result.entry()).isSameAs(dto);
        assertThat(result.emptyState()).isNull();
        assertThat(result.status()).isEqualTo("PENDING_APPROVAL");
        assertThat(result.email()).isEqualTo("rae@nforceone.com");
        assertThat(result.fullName()).isEqualTo("Rae Reportee");
    }

    @Test
    void approvedEntryReturnsFullContents() {
        LocalDate day = LocalDate.now().minusDays(3);
        EodEntry entry = entry(EodEntry.Status.APPROVED);
        EodEntryDto dto = mock(EodEntryDto.class);
        when(teamLeadService.lookupMemberEod(REPORTEE_ID, day)).thenReturn(new MemberEodLookup("SUBMITTED", entry));
        when(eodService.toDetailDto(entry)).thenReturn(dto);

        assertThat(service.getMemberEod(REPORTEE_ID, day, MANAGER_EMAIL).entry()).isSameAs(dto);
    }

    @Test
    void outOfScopeEmployeeIsForbiddenAndNothingIsLoaded() {
        assertThatThrownBy(() -> service.getMemberEod(OUTSIDER_ID, LocalDate.now(), MANAGER_EMAIL))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));

        verify(teamLeadService, never()).lookupMemberEod(any(), any());
        verify(eodService, never()).toDetailDto(any());
    }

    @Test
    void noEntryOnPastDayIsMissing() {
        LocalDate day = LocalDate.now().minusDays(2);
        when(teamLeadService.lookupMemberEod(REPORTEE_ID, day)).thenReturn(new MemberEodLookup("MISSING", null));

        MemberEodDetailDto result = service.getMemberEod(REPORTEE_ID, day, MANAGER_EMAIL);

        assertThat(result.entry()).isNull();
        assertThat(result.emptyState()).isEqualTo("MISSING");
        assertThat(result.status()).isEqualTo("MISSING");
        verify(eodService, never()).toDetailDto(any());
    }

    @Test
    void noEntryYetTodayIsNotSubmittedRatherThanMissing() {
        LocalDate today = LocalDate.now();
        when(teamLeadService.lookupMemberEod(REPORTEE_ID, today)).thenReturn(new MemberEodLookup("MISSING", null));

        assertThat(service.getMemberEod(REPORTEE_ID, today, MANAGER_EMAIL).emptyState()).isEqualTo("NOT_SUBMITTED");
    }

    @Test
    void futureDateIsRejectedBeforeAnyLookup() {
        LocalDate tomorrow = LocalDate.now().plusDays(1);

        assertThatThrownBy(() -> service.getMemberEod(REPORTEE_ID, tomorrow, MANAGER_EMAIL))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));

        verify(teamLeadService, never()).lookupMemberEod(any(), any());
    }

    @Test
    void draftEntryNeverExposesContents() {
        LocalDate today = LocalDate.now();
        EodEntry draft = entry(EodEntry.Status.DRAFT);
        // The list counts a draft as Missing — the detail must agree and say "not submitted yet".
        when(teamLeadService.lookupMemberEod(REPORTEE_ID, today)).thenReturn(new MemberEodLookup("MISSING", draft));

        MemberEodDetailDto result = service.getMemberEod(REPORTEE_ID, today, MANAGER_EMAIL);

        assertThat(result.entry()).isNull();
        assertThat(result.emptyState()).isEqualTo("NOT_SUBMITTED");
        assertThat(result.status()).isEqualTo("MISSING");
        verify(eodService, never()).toDetailDto(any());
    }

    @Test
    void draftOnAPastDayIsStillNotSubmittedAndHidden() {
        LocalDate day = LocalDate.now().minusDays(1);
        EodEntry draft = entry(EodEntry.Status.DRAFT);
        when(teamLeadService.lookupMemberEod(REPORTEE_ID, day)).thenReturn(new MemberEodLookup("MISSING", draft));

        MemberEodDetailDto result = service.getMemberEod(REPORTEE_ID, day, MANAGER_EMAIL);

        assertThat(result.entry()).isNull();
        assertThat(result.emptyState()).isEqualTo("NOT_SUBMITTED");
    }

    @Test
    void rejectedEntryIsHiddenBecauseTheListCountsItAsMissing() {
        LocalDate day = LocalDate.now().minusDays(1);
        when(teamLeadService.lookupMemberEod(REPORTEE_ID, day))
                .thenReturn(new MemberEodLookup("MISSING", entry(EodEntry.Status.REJECTED)));

        MemberEodDetailDto result = service.getMemberEod(REPORTEE_ID, day, MANAGER_EMAIL);

        assertThat(result.entry()).isNull();
        assertThat(result.emptyState()).isEqualTo("NOT_SUBMITTED");
    }

    @Test
    void onLeaveWithNoEntryShowsLeaveEmptyState() {
        LocalDate day = LocalDate.now().minusDays(1);
        when(teamLeadService.lookupMemberEod(REPORTEE_ID, day)).thenReturn(new MemberEodLookup("ON_LEAVE", null));

        MemberEodDetailDto result = service.getMemberEod(REPORTEE_ID, day, MANAGER_EMAIL);

        assertThat(result.entry()).isNull();
        assertThat(result.emptyState()).isEqualTo("ON_LEAVE");
    }

    @Test
    void onLeaveWithSubmittedLeaveEntryShowsItsDetails() {
        LocalDate day = LocalDate.now().minusDays(1);
        EodEntry leave = entry(EodEntry.Status.SUBMITTED);
        EodEntryDto dto = mock(EodEntryDto.class);
        when(teamLeadService.lookupMemberEod(REPORTEE_ID, day)).thenReturn(new MemberEodLookup("ON_LEAVE", leave));
        when(eodService.toDetailDto(leave)).thenReturn(dto);

        MemberEodDetailDto result = service.getMemberEod(REPORTEE_ID, day, MANAGER_EMAIL);

        assertThat(result.entry()).isSameAs(dto);
        assertThat(result.emptyState()).isNull();
        assertThat(result.status()).isEqualTo("ON_LEAVE");
    }

    @Test
    void onLeaveWithDraftLeaveEntryDoesNotLeakTheDraft() {
        LocalDate day = LocalDate.now().minusDays(1);
        when(teamLeadService.lookupMemberEod(REPORTEE_ID, day))
                .thenReturn(new MemberEodLookup("ON_LEAVE", entry(EodEntry.Status.DRAFT)));

        MemberEodDetailDto result = service.getMemberEod(REPORTEE_ID, day, MANAGER_EMAIL);

        assertThat(result.entry()).isNull();
        assertThat(result.emptyState()).isEqualTo("ON_LEAVE");
    }

    @Test
    void callerWithNoDirectReportsIsForbidden() {
        when(userRepository.existsByManagerIdAndDeletedAtIsNull(MANAGER_ID)).thenReturn(false);

        assertThatThrownBy(() -> service.getMemberEod(REPORTEE_ID, LocalDate.now(), MANAGER_EMAIL))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
    }

    private static AppUser user(Long id, String name, String code, String email) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setFullName(name);
        u.setEmployeeCode(code);
        u.setEmail(email);
        return u;
    }

    private EodEntry entry(EodEntry.Status status) {
        EodEntry e = new EodEntry();
        e.setId(500L);
        e.setEmployee(reportee);
        e.setStatus(status);
        return e;
    }
}
