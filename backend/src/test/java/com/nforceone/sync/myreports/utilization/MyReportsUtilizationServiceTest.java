package com.nforceone.sync.myreports.utilization;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.myreports.utilization.UtilizationDtos.*;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.TaskCategory;
import com.nforceone.sync.reporting.ReportingScopeService;
import com.nforceone.sync.utilization.UtilSnapshotRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;

/**
 * "Today" is Thursday 2026-10-08, so the latest completed working day is Wed Oct 7.
 * Team: A 8h approved (100%), B submitted-but-pending (0%), C nothing submitted, D approved full-day
 * leave on Oct 7, E 9h approved (112.5%). F (id 99) is outside the caller's reporting scope.
 */
@ExtendWith(MockitoExtension.class)
class MyReportsUtilizationServiceTest {

    private static final String MANAGER_EMAIL = "manager@nforceone.com";
    private static final Long MANAGER_ID = 1000L;
    private static final Long A = 1L, B = 2L, C = 3L, D = 4L, E = 5L, OUTSIDER = 99L;

    private static final LocalDate OCT_1 = LocalDate.of(2026, 10, 1);
    private static final LocalDate OCT_5 = LocalDate.of(2026, 10, 5);
    private static final LocalDate OCT_6 = LocalDate.of(2026, 10, 6);
    private static final LocalDate OCT_7 = LocalDate.of(2026, 10, 7);
    private static final LocalDate OCT_8 = LocalDate.of(2026, 10, 8);

    @Mock AppUserRepository userRepository;
    @Mock EodEntryRepository entryRepository;
    @Mock UtilSnapshotRepository snapshotRepository;
    @Mock HolidayRepository holidayRepository;
    @Mock BusinessRuleConfigRepository configRepository;
    @Mock ReportingScopeService reportingScope;

    private final Map<Long, AppUser> users = new java.util.HashMap<>();
    private final List<EodEntry> allEntries = new ArrayList<>();
    private long nextTaskId = 1;

    private MyReportsUtilizationService serviceAt(LocalDate today) {
        Clock clock = Clock.fixed(Instant.parse(today + "T06:00:00Z"), ZoneOffset.UTC);
        return new MyReportsUtilizationService(userRepository, entryRepository, snapshotRepository,
                holidayRepository, configRepository,
                new UtilizationAccessPolicy(userRepository, reportingScope), clock);
    }

    private MyReportsUtilizationService service() {
        return serviceAt(OCT_8);
    }

    @BeforeEach
    void setUp() {
        AppUser manager = user(MANAGER_ID, "Mina Manager", "M-1");
        users.put(MANAGER_ID, manager);
        for (long id : new long[]{A, B, C, D, E, OUTSIDER}) {
            users.put(id, user(id, "Member " + (char) ('A' + id - 1), "E-" + id));
        }
        users.get(OUTSIDER).setFullName("Olly Outsider");

        BusinessRuleConfig config = new BusinessRuleConfig();
        config.setWorkingHoursPerDay(new BigDecimal("8"));
        config.setUnderutilizedThresholdPct(new BigDecimal("60"));
        config.setOverloadedThresholdPct(new BigDecimal("100"));

        lenient().when(userRepository.findByEmailAndDeletedAtIsNull(MANAGER_EMAIL)).thenReturn(Optional.of(manager));
        lenient().when(userRepository.existsByManagerIdAndDeletedAtIsNull(MANAGER_ID)).thenReturn(true);
        lenient().when(userRepository.findAllById(anyList())).thenAnswer(inv -> {
            List<Long> ids = inv.getArgument(0);
            return ids.stream().map(users::get).toList();
        });
        lenient().when(userRepository.findById(any(Long.class))).thenAnswer(inv -> Optional.ofNullable(users.get(inv.<Long>getArgument(0))));
        lenient().when(reportingScope.reportingScopeUserIds(MANAGER_ID)).thenReturn(List.of(A, B, C, D, E));
        lenient().when(configRepository.findById(1L)).thenReturn(Optional.of(config));
        lenient().when(holidayRepository.findByHolidayDateBetween(any(), any())).thenReturn(List.of());
        lenient().when(snapshotRepository.findByEmployeeIdInAndSnapshotDateBetween(anyList(), any(), any()))
                .thenReturn(List.of());
        // Behaves like the real query: only the requested employees and dates.
        lenient().when(entryRepository.findWithTasksByEmployeeIdInAndEntryDateBetween(anyList(), any(), any()))
                .thenAnswer(inv -> {
                    List<Long> ids = inv.getArgument(0);
                    LocalDate from = inv.getArgument(1);
                    LocalDate to = inv.getArgument(2);
                    return allEntries.stream()
                            .filter(e -> ids.contains(e.getEmployee().getId()))
                            .filter(e -> !e.getEntryDate().isBefore(from) && !e.getEntryDate().isAfter(to))
                            .collect(Collectors.toList());
                });

        seedTeamOnOct7();
    }

    private void seedTeamOnOct7() {
        entry(A, OCT_7, EodEntry.Status.APPROVED, EodEntry.DayType.WORKING_DAY, true, "8");
        entry(B, OCT_7, EodEntry.Status.SUBMITTED, EodEntry.DayType.WORKING_DAY, true, "8");   // pending only
        // C: nothing at all
        entry(D, OCT_7, EodEntry.Status.APPROVED, EodEntry.DayType.LEAVE, false, "8");          // approved full-day leave
        entry(E, OCT_7, EodEntry.Status.APPROVED, EodEntry.DayType.WORKING_DAY, true, "9");
    }

    // ── summary ──────────────────────────────────────────────────────────────────────

    @Test
    void daySummary_averageCountsZeroPercentMembersAndExcludesUnavailableOnes() {
        UtilizationSummaryDto s = service().getSummary("day", MANAGER_EMAIL);

        assertThat(s.period()).isEqualTo("day");
        assertThat(s.noCompletedDays()).isFalse();
        assertThat(s.from()).isEqualTo(OCT_7);
        assertThat(s.to()).isEqualTo(OCT_7);

        // A 100 + B 0 + C 0 + E 112.5, over FOUR members (D is unavailable, not dropped for lack of data).
        assertThat(s.averageUtilizationPct()).isEqualByComparingTo("53.13");
        assertThat(s.counts()).isEqualTo(new StatusCounts(1, 1, 1, 1));
        assertThat(s.excludedCount()).isEqualTo(1);
        assertThat(s.totalMembers()).isEqualTo(5);
        assertThat(s.members()).hasSize(5);

        int counted = s.counts().optimal() + s.counts().under() + s.counts().over() + s.counts().none();
        assertThat(counted + s.excludedCount()).isEqualTo(s.totalMembers());
    }

    @Test
    void daySummary_returnsTheConfiguredThresholdsAndStandardHours() {
        UtilizationSummaryDto s = service().getSummary("day", MANAGER_EMAIL);

        assertThat(s.thresholds().underPct()).isEqualByComparingTo("60");
        assertThat(s.thresholds().overPct()).isEqualByComparingTo("100");
        assertThat(s.standardHoursPerDay()).isEqualByComparingTo("8");
    }

    @Test
    void pendingOnlyMemberIsUnderNotNone_andFlagsAwaitingApproval() {
        Map<Long, MemberUtilizationDto> byId = byId(service().getSummary("day", MANAGER_EMAIL));

        MemberUtilizationDto pending = byId.get(B);
        assertThat(pending.status()).isEqualTo(UtilizationStatus.UNDER);
        assertThat(pending.utilizationPct()).isEqualByComparingTo("0");
        assertThat(pending.hours()).isEqualByComparingTo("0");
        assertThat(pending.loggedDays()).isEqualTo(1);
        assertThat(pending.hasPendingApproval()).isTrue();

        MemberUtilizationDto nothing = byId.get(C);
        assertThat(nothing.status()).isEqualTo(UtilizationStatus.NONE);
        assertThat(nothing.utilizationPct()).isEqualByComparingTo("0");
        assertThat(nothing.hasPendingApproval()).isFalse();
    }

    @Test
    void memberOnApprovedLeaveForTheWholePeriodIsUnavailableWithNoPercentage() {
        MemberUtilizationDto d = byId(service().getSummary("day", MANAGER_EMAIL)).get(D);

        assertThat(d.status()).isEqualTo(UtilizationStatus.UNAVAILABLE);
        assertThat(d.utilizationPct()).isNull();
        assertThat(d.availableDays()).isZero();
    }

    @Test
    void daySummary_deltaIsAgainstThePreviousWorkingDay() {
        UtilizationSummaryDto s = service().getSummary("day", MANAGER_EMAIL);

        assertThat(s.previousFrom()).isEqualTo(OCT_6);
        assertThat(s.previousTo()).isEqualTo(OCT_6);
        // Nobody logged anything on Oct 6 and nobody was on leave, so all five sit at 0%.
        assertThat(s.previousAverageUtilizationPct()).isEqualByComparingTo("0");
        assertThat(s.deltaPoints()).isEqualByComparingTo("53.13");
    }

    @Test
    void weekSummary_dividesByEveryAvailableDayAndALeaveDayEntryIsNotLoggedHours() {
        // Oct 5, 6, 7 are completed working days this week.
        UtilizationSummaryDto s = service().getSummary("week", MANAGER_EMAIL);
        Map<Long, MemberUtilizationDto> byId = byId(s);

        assertThat(s.from()).isEqualTo(OCT_5);
        assertThat(s.to()).isEqualTo(OCT_7);
        assertThat(byId.get(A).utilizationPct()).isEqualByComparingTo("33.33");   // 8h / (8h × 3)
        assertThat(byId.get(A).avgHoursPerDay()).isEqualByComparingTo("2.67");
        assertThat(byId.get(A).status()).isEqualTo(UtilizationStatus.UNDER);

        // D's only entry is the leave day (not an available day), so nothing was "logged" on a day
        // they could have worked: 2 available days, 0 hours → no hours logged — but still counted.
        MemberUtilizationDto d = byId.get(D);
        assertThat(d.availableDays()).isEqualTo(2);
        assertThat(d.status()).isEqualTo(UtilizationStatus.NONE);

        assertThat(s.excludedCount()).isZero();
        assertThat(s.counts().optimal() + s.counts().under() + s.counts().over() + s.counts().none())
                .isEqualTo(s.totalMembers());
    }

    @Test
    void weekSummaryOnAMonday_fallsBackToLastWeekAndSaysSo() {
        LocalDate monday = LocalDate.of(2026, 10, 12);

        UtilizationSummaryDto s = serviceAt(monday).getSummary("week", MANAGER_EMAIL);

        assertThat(s.noCompletedDays()).isFalse();
        assertThat(s.weekFallback()).isTrue();
        assertThat(s.from()).isEqualTo(OCT_5);
        assertThat(s.to()).isEqualTo(LocalDate.of(2026, 10, 9));
        assertThat(s.previousFrom()).isEqualTo(LocalDate.of(2026, 9, 28));   // the week before the fallback week
        assertThat(s.previousTo()).isEqualTo(LocalDate.of(2026, 10, 4));
        assertThat(byId(s).get(A).utilizationPct()).isEqualByComparingTo("20.00"); // 8h / (8h × 5 days)
        // Only the Week tab ever falls back.
        assertThat(serviceAt(monday).getSummary("day", MANAGER_EMAIL).weekFallback()).isFalse();
        assertThat(serviceAt(monday).getSummary("month", MANAGER_EMAIL).weekFallback()).isFalse();
        assertThat(service().getSummary("week", MANAGER_EMAIL).weekFallback()).isFalse();
    }

    @Test
    void mondayThatIsTheSecondOrThird_weekIsNoCompletedDaysNotAFallback() {
        UtilizationSummaryDto s = serviceAt(LocalDate.of(2026, 11, 2)).getSummary("week", MANAGER_EMAIL);

        assertThat(s.noCompletedDays()).isTrue();
        assertThat(s.weekFallback()).isFalse();
        assertThat(s.members()).isEmpty();
    }

    @Test
    void monthSummaryUtilizationEqualsTheAggregateOfTheDaysEndpoint() {
        // Give the team varied, multi-day data so the two endpoints are compared on something real.
        entry(A, OCT_1, EodEntry.Status.APPROVED, EodEntry.DayType.WORKING_DAY, true, "4");
        entry(A, LocalDate.of(2026, 10, 2), EodEntry.Status.APPROVED, EodEntry.DayType.WORKING_DAY, true, "12");
        entry(A, OCT_5, EodEntry.Status.SUBMITTED, EodEntry.DayType.WORKING_DAY, true, "8");     // pending: 0h
        entry(E, OCT_6, EodEntry.Status.APPROVED, EodEntry.DayType.WORKING_DAY, true, "5");
        entry(C, OCT_6, EodEntry.Status.APPROVED, EodEntry.DayType.WORKING_DAY, false, "8");     // non-productive: 0h
        entry(D, OCT_1, EodEntry.Status.APPROVED, EodEntry.DayType.LEAVE, false, "8");           // a second leave day

        MyReportsUtilizationService svc = service();
        UtilizationSummaryDto month = svc.getSummary("month", MANAGER_EMAIL);
        assertThat(month.from()).isEqualTo(OCT_1);
        assertThat(month.to()).isEqualTo(OCT_7);

        for (Long id : List.of(A, B, C, D, E)) {
            UtilizationDaysDto days = svc.getDays(id, OCT_1, LocalDate.of(2026, 10, 31), MANAGER_EMAIL);

            // Aggregate the /days values over the summary's own window: every selectable, non-leave day.
            List<UtilizationDayDto> counted = days.days().stream()
                    .filter(x -> !x.date().isBefore(month.from()) && !x.date().isAfter(month.to()))
                    .filter(x -> x.selectable() && !x.leave())
                    .toList();
            BigDecimal hours = counted.stream().map(UtilizationDayDto::hours).reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal fromDays = counted.isEmpty() ? null
                    : com.nforceone.sync.utilization.UtilizationCalculator.computeUtilizationPct(
                            hours, month.standardHoursPerDay().multiply(BigDecimal.valueOf(counted.size())));

            MemberUtilizationDto row = byId(month).get(id);
            if (fromDays == null) {
                assertThat(row.utilizationPct()).as("member %s", id).isNull();
            } else {
                assertThat(row.utilizationPct()).as("member %s", id).isEqualByComparingTo(fromDays);
            }
            assertThat(row.availableDays()).as("member %s available days", id).isEqualTo(counted.size());
            assertThat(row.hours()).as("member %s hours", id).isEqualByComparingTo(hours);
        }
        // Sanity: the fixture really does exercise differing values (not all zero).
        assertThat(byId(month).get(A).utilizationPct()).isEqualByComparingTo("60.00");  // (4 + 12 + 8)h / (8h × 5 days)
    }

    @Test
    void noCompletedDaysYetThisMonth_returnsAnExplicitEmptyResult() {
        UtilizationSummaryDto s = serviceAt(OCT_1).getSummary("month", MANAGER_EMAIL);

        assertThat(s.noCompletedDays()).isTrue();
        assertThat(s.from()).isNull();
        assertThat(s.members()).isEmpty();
        assertThat(s.averageUtilizationPct()).isNull();
        assertThat(s.counts()).isEqualTo(new StatusCounts(0, 0, 0, 0));
        assertThat(s.totalMembers()).isEqualTo(5);
        verifyNoInteractions(entryRepository);
    }

    @Test
    void summaryNeverIncludesAnEmployeeOutsideTheReportingScope() {
        UtilizationSummaryDto s = service().getSummary("month", MANAGER_EMAIL);

        assertThat(s.members()).extracting(MemberUtilizationDto::id).doesNotContain(OUTSIDER);
    }

    @Test
    void summaryRejectsAnUnknownPeriod() {
        assertThatThrownBy(() -> service().getSummary("year", MANAGER_EMAIL))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    // ── permissions ──────────────────────────────────────────────────────────────────

    @Test
    void daysForAnOutOfScopeEmployeeIsForbiddenAndNothingIsLoaded() {
        assertThatThrownBy(() -> service().getDays(OUTSIDER, OCT_1, OCT_8, MANAGER_EMAIL))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));

        verifyNoInteractions(entryRepository, snapshotRepository);
    }

    @Test
    void entriesForAnOutOfScopeEmployeeIsForbiddenAndNothingIsLoaded() {
        assertThatThrownBy(() -> service().getEntries(OUTSIDER, OCT_7, MANAGER_EMAIL))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));

        verifyNoInteractions(entryRepository, snapshotRepository);
    }

    @Test
    void aCallerWithNoDirectReportsIsForbiddenEverywhere() {
        org.mockito.Mockito.when(userRepository.existsByManagerIdAndDeletedAtIsNull(MANAGER_ID)).thenReturn(false);

        assertThatThrownBy(() -> service().getSummary("day", MANAGER_EMAIL))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
        assertThatThrownBy(() -> service().getDays(A, OCT_1, OCT_8, MANAGER_EMAIL))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service().getEntries(A, OCT_7, MANAGER_EMAIL))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoMoreInteractions(entryRepository);
    }

    // ── /days ────────────────────────────────────────────────────────────────────────

    @Test
    void days_flagsWeekendFutureAndLeaveAndOnlyWorkedPastDaysAreSelectable() {
        LocalDate month1 = OCT_1, monthEnd = LocalDate.of(2026, 10, 31);

        UtilizationDaysDto aDays = service().getDays(A, month1, monthEnd, MANAGER_EMAIL);
        Map<LocalDate, UtilizationDayDto> a = aDays.days().stream()
                .collect(Collectors.toMap(UtilizationDayDto::date, x -> x));

        assertThat(aDays.days()).hasSize(31);
        assertThat(a.get(LocalDate.of(2026, 10, 3)).weekend()).isTrue();
        assertThat(a.get(LocalDate.of(2026, 10, 3)).selectable()).isFalse();
        assertThat(a.get(LocalDate.of(2026, 10, 3)).status()).isNull();
        assertThat(a.get(LocalDate.of(2026, 10, 15)).future()).isTrue();
        assertThat(a.get(LocalDate.of(2026, 10, 15)).selectable()).isFalse();
        assertThat(a.get(OCT_8).today()).isTrue();
        assertThat(a.get(OCT_7).selectable()).isTrue();
        assertThat(a.get(OCT_7).utilizationPct()).isEqualByComparingTo("100");
        assertThat(a.get(OCT_7).status()).isEqualTo(UtilizationStatus.OPTIMAL);
        assertThat(a.get(OCT_6).status()).isEqualTo(UtilizationStatus.NONE);

        Map<LocalDate, UtilizationDayDto> dDays = service().getDays(D, month1, monthEnd, MANAGER_EMAIL).days().stream()
                .collect(Collectors.toMap(UtilizationDayDto::date, x -> x));
        assertThat(dDays.get(OCT_7).leave()).isTrue();
        assertThat(dDays.get(OCT_7).selectable()).isTrue();                       // leave days stay clickable
        assertThat(dDays.get(OCT_7).status()).isEqualTo(UtilizationStatus.UNAVAILABLE);
        assertThat(dDays.get(OCT_7).utilizationPct()).isNull();
    }

    @Test
    void days_holidayIsNotSelectable() {
        org.mockito.Mockito.when(holidayRepository.findByHolidayDateBetween(any(), any()))
                .thenReturn(List.of(holiday(OCT_6)));

        UtilizationDayDto day = service().getDays(A, OCT_5, OCT_7, MANAGER_EMAIL).days().stream()
                .filter(x -> x.date().equals(OCT_6)).findFirst().orElseThrow();

        assertThat(day.holiday()).isTrue();
        assertThat(day.selectable()).isFalse();
        assertThat(day.status()).isNull();
    }

    @Test
    void days_rejectsRangesOutsideTheCurrentMonthAndBackwardsRanges() {
        assertThatThrownBy(() -> service().getDays(A, LocalDate.of(2026, 9, 28), OCT_7, MANAGER_EMAIL))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
        assertThatThrownBy(() -> service().getDays(A, OCT_7, OCT_5, MANAGER_EMAIL))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    // ── /entries ─────────────────────────────────────────────────────────────────────

    @Test
    void entries_listsProjectCategoryDescriptionHoursAndTheProductiveFlag() {
        UtilizationEntriesDto r = service().getEntries(A, OCT_7, MANAGER_EMAIL);

        assertThat(r.entryStatus()).isEqualTo("APPROVED");
        assertThat(r.dayType()).isEqualTo("WORKING_DAY");
        assertThat(r.entries()).hasSize(1);
        UtilizationEntryDto e = r.entries().get(0);
        assertThat(e.projectCode()).isEqualTo("PRJ-1");
        assertThat(e.projectName()).isEqualTo("Project One");
        assertThat(e.category()).isEqualTo("Development");
        assertThat(e.description()).isEqualTo("Did the work");
        assertThat(e.hours()).isEqualByComparingTo("8");
        assertThat(e.productive()).isTrue();
        assertThat(r.totalHours()).isEqualByComparingTo("8");
        assertThat(r.utilizationPct()).isEqualByComparingTo("100");
        assertThat(r.status()).isEqualTo(UtilizationStatus.OPTIMAL);
        assertThat(r.thresholds().overPct()).isEqualByComparingTo("100");
    }

    @Test
    void entries_nonProductiveHoursAreListedButDoNotCountTowardUtilization() {
        entry(C, OCT_7, EodEntry.Status.APPROVED, EodEntry.DayType.WORKING_DAY, false, "8");

        UtilizationEntriesDto r = service().getEntries(C, OCT_7, MANAGER_EMAIL);

        assertThat(r.entries()).hasSize(1);
        assertThat(r.entries().get(0).productive()).isFalse();
        assertThat(r.totalHours()).isEqualByComparingTo("8");
        assertThat(r.approvedProductiveHours()).isEqualByComparingTo("0");
        assertThat(r.utilizationPct()).isEqualByComparingTo("0");
        assertThat(r.status()).isEqualTo(UtilizationStatus.UNDER);
    }

    @Test
    void entries_pendingEntryShowsItsContentsAtZeroPercentWithTheAwaitingFlag() {
        UtilizationEntriesDto r = service().getEntries(B, OCT_7, MANAGER_EMAIL);

        assertThat(r.entryStatus()).isEqualTo("SUBMITTED");
        assertThat(r.entries()).hasSize(1);
        assertThat(r.utilizationPct()).isEqualByComparingTo("0");
        assertThat(r.status()).isEqualTo(UtilizationStatus.UNDER);
        assertThat(r.hasPendingApproval()).isTrue();
    }

    @Test
    void entries_draftAndRejectedEntriesNeverExposeContents() {
        entry(C, OCT_6, EodEntry.Status.DRAFT, EodEntry.DayType.WORKING_DAY, true, "8");
        entry(D, OCT_6, EodEntry.Status.REJECTED, EodEntry.DayType.WORKING_DAY, true, "8");

        UtilizationEntriesDto draft = service().getEntries(C, OCT_6, MANAGER_EMAIL);
        UtilizationEntriesDto rejected = service().getEntries(D, OCT_6, MANAGER_EMAIL);

        for (UtilizationEntriesDto r : List.of(draft, rejected)) {
            assertThat(r.entries()).isEmpty();
            assertThat(r.entryStatus()).isNull();
            assertThat(r.dayType()).isNull();
            assertThat(r.status()).isEqualTo(UtilizationStatus.NONE);
        }
    }

    @Test
    void entries_noEntryOnAWorkingDayIsNone() {
        UtilizationEntriesDto r = service().getEntries(C, OCT_7, MANAGER_EMAIL);

        assertThat(r.entries()).isEmpty();
        assertThat(r.status()).isEqualTo(UtilizationStatus.NONE);
        assertThat(r.utilizationPct()).isEqualByComparingTo("0");
    }

    @Test
    void entries_approvedLeaveDayIsFlaggedAndUnavailable() {
        UtilizationEntriesDto r = service().getEntries(D, OCT_7, MANAGER_EMAIL);

        assertThat(r.leave()).isTrue();
        assertThat(r.dayType()).isEqualTo("LEAVE");
        assertThat(r.status()).isEqualTo(UtilizationStatus.UNAVAILABLE);
        assertThat(r.utilizationPct()).isNull();
    }

    @Test
    void entries_weekendHasNoStatusOrPercentage() {
        UtilizationEntriesDto r = service().getEntries(A, LocalDate.of(2026, 10, 3), MANAGER_EMAIL);

        assertThat(r.weekend()).isTrue();
        assertThat(r.status()).isNull();
        assertThat(r.utilizationPct()).isNull();
    }

    @Test
    void entries_futureDateAndOtherMonthAreBadRequests() {
        assertThatThrownBy(() -> service().getEntries(A, LocalDate.of(2026, 10, 9), MANAGER_EMAIL))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
        assertThatThrownBy(() -> service().getEntries(A, LocalDate.of(2026, 9, 30), MANAGER_EMAIL))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    // ── helpers ──────────────────────────────────────────────────────────────────────

    private static Map<Long, MemberUtilizationDto> byId(UtilizationSummaryDto s) {
        return s.members().stream().collect(Collectors.toMap(MemberUtilizationDto::id, m -> m));
    }

    private static AppUser user(Long id, String name, String code) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setFullName(name);
        u.setEmployeeCode(code);
        u.setEmail(code.toLowerCase() + "@nforceone.com");
        u.setStatus(AppUser.Status.ACTIVE);
        return u;
    }

    private static com.nforceone.sync.businessrules.Holiday holiday(LocalDate date) {
        com.nforceone.sync.businessrules.Holiday h = new com.nforceone.sync.businessrules.Holiday();
        h.setHolidayDate(date);
        return h;
    }

    private void entry(Long employeeId, LocalDate date, EodEntry.Status status, EodEntry.DayType dayType,
                       boolean productive, String hours) {
        allEntries.removeIf(e -> e.getEmployee().getId().equals(employeeId) && e.getEntryDate().equals(date));

        TaskCategory category = new TaskCategory();
        category.setName(productive ? "Development" : "Training");
        category.setIsProductive(productive);
        Project project = new Project();
        project.setCode("PRJ-1");
        project.setName("Project One");

        EodTask task = new EodTask();
        task.setId(nextTaskId++);
        task.setProject(project);
        task.setTaskCategory(category);
        task.setDescription("Did the work");
        task.setHours(new BigDecimal(hours));

        EodEntry e = new EodEntry();
        e.setId(nextTaskId * 100);
        e.setEmployee(users.get(employeeId));
        e.setEntryDate(date);
        e.setStatus(status);
        e.setDayType(dayType);
        e.setTasks(new ArrayList<>(List.of(task)));
        allEntries.add(e);
    }
}
