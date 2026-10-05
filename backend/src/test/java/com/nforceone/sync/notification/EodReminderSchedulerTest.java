package com.nforceone.sync.notification;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.Holiday;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.businessrules.ShiftDefinitionRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link EodReminderScheduler#sendRemindersForDate}.
 *
 * <p>Uses a Monday (2026-10-05) as the canonical working day and a Saturday (2026-10-03) for the
 * weekend exclusion case. Real entities are constructed with Lombok setters; all repos are mocked.
 */
@ExtendWith(MockitoExtension.class)
class EodReminderSchedulerTest {

    @Mock ShiftDefinitionRepository shiftRepository;
    @Mock AppUserRepository userRepository;
    @Mock EodEntryRepository entryRepository;
    @Mock BusinessRuleConfigRepository configRepository;
    @Mock HolidayRepository holidayRepository;
    @Mock NotificationRepository notificationRepository;
    @Mock NotificationService notificationService;

    @InjectMocks EodReminderScheduler scheduler;

    // 2026-10-05 = Monday (working day), 2026-10-03 = Saturday
    private static final LocalDate WORK_DAY   = LocalDate.of(2026, 10, 5);
    private static final LocalDate SATURDAY   = LocalDate.of(2026, 10, 3);
    private static final OffsetDateTime CUTOFF = OffsetDateTime.of(2026, 10, 5, 21, 0, 0, 0, ZoneOffset.UTC);

    private AppUser manager;
    private AppUser pm;       // role PM,       manager set
    private AppUser admin2;   // role ADMIN,     manager set
    private AppUser employee; // role EMPLOYEE,  manager set
    private AppUser topAdmin; // role SUPERADMIN, NO manager
    private BusinessRuleConfig satSunConfig;

    @BeforeEach
    void setUp() {
        manager = user(111L, AppUser.Role.ADMIN, null);

        pm       = user(137L, AppUser.Role.PM,        manager);
        admin2   = user(138L, AppUser.Role.ADMIN,     manager);
        employee = user(22L,  AppUser.Role.EMPLOYEE,  manager);
        topAdmin = user(139L, AppUser.Role.SUPERADMIN, null);

        satSunConfig = new BusinessRuleConfig();
        satSunConfig.setWeekendRule(BusinessRuleConfig.WeekendRule.SAT_SUN);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private static AppUser user(Long id, AppUser.Role role, AppUser mgr) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setRole(role);
        u.setStatus(AppUser.Status.ACTIVE);
        u.setManager(mgr);
        return u;
    }

    private static EodEntry entryWithStatus(EodEntry.Status status) {
        EodEntry e = new EodEntry();
        e.setStatus(status);
        return e;
    }

    /** Stubs: all four users visible, no entries, no existing reminders. */
    private void stubAllFour_noEntry_noReminder() {
        when(userRepository.findByStatusAndDeletedAtIsNull(AppUser.Status.ACTIVE))
                .thenReturn(List.of(pm, admin2, employee, topAdmin));
        when(entryRepository.findByEmployeeIdAndEntryDate(any(), eq(WORK_DAY)))
                .thenReturn(Optional.empty());
        when(holidayRepository.findByHolidayDate(WORK_DAY))
                .thenReturn(Optional.empty());
        when(notificationRepository.existsByUserIdAndTypeAndCreatedAtAfter(any(), any(), any()))
                .thenReturn(false);
    }

    // ── tests ─────────────────────────────────────────────────────────────────

    /**
     * Any role with a manager is reminded. SUPERADMIN with no manager is not.
     * Proves: PM (137), ADMIN (138), EMPLOYEE (22) selected; SUPERADMIN (139) excluded.
     */
    @Test
    void allRolesWithManager_reminded_superadminWithoutManager_skipped() {
        stubAllFour_noEntry_noReminder();

        int sent = scheduler.sendRemindersForDate(WORK_DAY, satSunConfig, CUTOFF, "Standard");

        assertThat(sent).isEqualTo(3);
        ArgumentCaptor<Long> idCaptor = ArgumentCaptor.forClass(Long.class);
        verify(notificationService, times(3))
                .send(idCaptor.capture(), eq("EOD_REMINDER"), any(), any(), any());
        assertThat(idCaptor.getAllValues()).containsExactlyInAnyOrder(137L, 138L, 22L);
        assertThat(idCaptor.getAllValues()).doesNotContain(139L);
    }

    /**
     * A user with a SUBMITTED entry owes nothing — no reminder.
     */
    @Test
    void submittedEntry_userExcluded() {
        when(userRepository.findByStatusAndDeletedAtIsNull(AppUser.Status.ACTIVE))
                .thenReturn(List.of(pm));
        when(holidayRepository.findByHolidayDate(WORK_DAY)).thenReturn(Optional.empty());
        when(entryRepository.findByEmployeeIdAndEntryDate(137L, WORK_DAY))
                .thenReturn(Optional.of(entryWithStatus(EodEntry.Status.SUBMITTED)));

        int sent = scheduler.sendRemindersForDate(WORK_DAY, satSunConfig, CUTOFF, "Standard");

        assertThat(sent).isZero();
        verify(notificationService, never()).send(any(), any(), any(), any(), any());
    }

    /**
     * APPROVED entry also satisfies the submission requirement.
     */
    @Test
    void approvedEntry_userExcluded() {
        when(userRepository.findByStatusAndDeletedAtIsNull(AppUser.Status.ACTIVE))
                .thenReturn(List.of(pm));
        when(holidayRepository.findByHolidayDate(WORK_DAY)).thenReturn(Optional.empty());
        when(entryRepository.findByEmployeeIdAndEntryDate(137L, WORK_DAY))
                .thenReturn(Optional.of(entryWithStatus(EodEntry.Status.APPROVED)));

        int sent = scheduler.sendRemindersForDate(WORK_DAY, satSunConfig, CUTOFF, "Standard");

        assertThat(sent).isZero();
        verify(notificationService, never()).send(any(), any(), any(), any(), any());
    }

    /**
     * A DRAFT entry counts as still owed — reminder sent.
     */
    @Test
    void draftEntry_userStillOwes_reminded() {
        when(userRepository.findByStatusAndDeletedAtIsNull(AppUser.Status.ACTIVE))
                .thenReturn(List.of(pm));
        when(holidayRepository.findByHolidayDate(WORK_DAY)).thenReturn(Optional.empty());
        when(entryRepository.findByEmployeeIdAndEntryDate(137L, WORK_DAY))
                .thenReturn(Optional.of(entryWithStatus(EodEntry.Status.DRAFT)));
        when(notificationRepository.existsByUserIdAndTypeAndCreatedAtAfter(any(), any(), any()))
                .thenReturn(false);

        int sent = scheduler.sendRemindersForDate(WORK_DAY, satSunConfig, CUTOFF, "Standard");

        assertThat(sent).isEqualTo(1);
        verify(notificationService).send(eq(137L), eq("EOD_REMINDER"), any(), any(), any());
    }

    /**
     * Saturday with SAT_SUN rule — isNonWorkingDay returns true, user repo never queried.
     */
    @Test
    void saturday_satSunRule_noReminders_repoNotQueried() {
        int sent = scheduler.sendRemindersForDate(SATURDAY, satSunConfig, CUTOFF, "Standard");

        assertThat(sent).isZero();
        verify(userRepository, never()).findByStatusAndDeletedAtIsNull(any());
        verify(notificationService, never()).send(any(), any(), any(), any(), any());
    }

    /**
     * A declared holiday — no reminders, user repo not queried.
     */
    @Test
    void holiday_noReminders_repoNotQueried() {
        Holiday h = new Holiday();
        h.setHolidayDate(WORK_DAY);
        when(holidayRepository.findByHolidayDate(WORK_DAY)).thenReturn(Optional.of(h));

        int sent = scheduler.sendRemindersForDate(WORK_DAY, satSunConfig, CUTOFF, "Standard");

        assertThat(sent).isZero();
        verify(userRepository, never()).findByStatusAndDeletedAtIsNull(any());
        verify(notificationService, never()).send(any(), any(), any(), any(), any());
    }

    /**
     * Idempotency: an EOD_REMINDER already delivered since the cutoff suppresses a new one.
     */
    @Test
    void idempotent_alreadyRemindedSinceCutoff_skipped() {
        when(userRepository.findByStatusAndDeletedAtIsNull(AppUser.Status.ACTIVE))
                .thenReturn(List.of(pm));
        when(holidayRepository.findByHolidayDate(WORK_DAY)).thenReturn(Optional.empty());
        when(entryRepository.findByEmployeeIdAndEntryDate(137L, WORK_DAY))
                .thenReturn(Optional.empty());
        when(notificationRepository.existsByUserIdAndTypeAndCreatedAtAfter(
                eq(137L), eq("EOD_REMINDER"), any()))
                .thenReturn(true);

        int sent = scheduler.sendRemindersForDate(WORK_DAY, satSunConfig, CUTOFF, "Standard");

        assertThat(sent).isZero();
        verify(notificationService, never()).send(any(), any(), any(), any(), any());
    }

    /**
     * Sunday — always a non-working day regardless of the weekend rule.
     */
    @Test
    void sunday_alwaysNonWorkingDay() {
        LocalDate sunday = LocalDate.of(2026, 10, 4);

        int sent = scheduler.sendRemindersForDate(sunday, satSunConfig, CUTOFF, "Standard");

        assertThat(sent).isZero();
        verify(notificationService, never()).send(any(), any(), any(), any(), any());
    }

    /**
     * Saturday with SUN_ONLY rule — Saturday is a working day, reminders proceed.
     */
    @Test
    void saturday_sunOnlyRule_treatedAsWorkingDay() {
        BusinessRuleConfig sunOnly = new BusinessRuleConfig();
        sunOnly.setWeekendRule(BusinessRuleConfig.WeekendRule.SUN_ONLY);

        when(userRepository.findByStatusAndDeletedAtIsNull(AppUser.Status.ACTIVE))
                .thenReturn(List.of(pm));
        when(holidayRepository.findByHolidayDate(SATURDAY)).thenReturn(Optional.empty());
        when(entryRepository.findByEmployeeIdAndEntryDate(137L, SATURDAY))
                .thenReturn(Optional.empty());
        when(notificationRepository.existsByUserIdAndTypeAndCreatedAtAfter(any(), any(), any()))
                .thenReturn(false);

        int sent = scheduler.sendRemindersForDate(SATURDAY, sunOnly, CUTOFF, "Standard");

        assertThat(sent).isEqualTo(1);
    }
}
