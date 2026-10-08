package com.nforceone.sync.myreports.utilization;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Set;
import java.util.function.Predicate;

import static com.nforceone.sync.myreports.utilization.UtilizationPeriodType.DAY;
import static com.nforceone.sync.myreports.utilization.UtilizationPeriodType.MONTH;
import static com.nforceone.sync.myreports.utilization.UtilizationPeriodType.WEEK;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * October 2026: Thu 1, Fri 2, Sat 3, Sun 4, Mon 5 … Wed 7, Thu 8. September 2026 ends Wed 30.
 */
class UtilizationPeriodTest {

    private static final Predicate<LocalDate> NO_HOLIDAYS = d -> false;

    private static LocalDate d(int month, int day) {
        return LocalDate.of(2026, month, day);
    }

    @Test
    void midWeek_dayWeekAndMonthEndYesterday() {
        LocalDate today = d(10, 8); // Thu

        UtilizationPeriod day = UtilizationPeriod.resolve(DAY, today, NO_HOLIDAYS);
        assertThat(day.hasCompletedDays()).isTrue();
        assertThat(day.from()).isEqualTo(d(10, 7));
        assertThat(day.to()).isEqualTo(d(10, 7));
        assertThat(day.previousFrom()).isEqualTo(d(10, 6));
        assertThat(day.previousTo()).isEqualTo(d(10, 6));

        UtilizationPeriod week = UtilizationPeriod.resolve(WEEK, today, NO_HOLIDAYS);
        assertThat(week.from()).isEqualTo(d(10, 5));   // Monday
        assertThat(week.to()).isEqualTo(d(10, 7));
        assertThat(week.previousFrom()).isEqualTo(d(9, 28));
        assertThat(week.previousTo()).isEqualTo(d(10, 4));

        UtilizationPeriod month = UtilizationPeriod.resolve(MONTH, today, NO_HOLIDAYS);
        assertThat(month.from()).isEqualTo(d(10, 1));
        assertThat(month.to()).isEqualTo(d(10, 7));
        assertThat(month.previousFrom()).isEqualTo(d(9, 1));
        assertThat(month.previousTo()).isEqualTo(d(9, 30));
    }

    @Test
    void firstOfTheMonth_hasNoCompletedDaysForAnyTab() {
        LocalDate today = d(10, 1);
        for (UtilizationPeriodType type : UtilizationPeriodType.values()) {
            UtilizationPeriod p = UtilizationPeriod.resolve(type, today, NO_HOLIDAYS);
            assertThat(p.hasCompletedDays()).as(type.name()).isFalse();
            assertThat(p.from()).isNull();
            assertThat(p.to()).isNull();
            assertThat(p.hasPrevious()).isFalse();
        }
    }

    @Test
    void weekThatCrossesAMonthBoundary_isClippedToTheFirst() {
        LocalDate today = d(10, 2); // Fri; this week's Monday is Sep 28

        UtilizationPeriod week = UtilizationPeriod.resolve(WEEK, today, NO_HOLIDAYS);
        assertThat(week.hasCompletedDays()).isTrue();
        assertThat(week.from()).isEqualTo(d(10, 1));      // not Sep 28
        assertThat(week.to()).isEqualTo(d(10, 1));
        // The comparison week is the real previous calendar week and CAN be outside the month.
        assertThat(week.previousFrom()).isEqualTo(d(9, 21));
        assertThat(week.previousTo()).isEqualTo(d(9, 27));
    }

    @Test
    void dayTabOnTheSecond_comparesAgainstThePreviousMonthsLastWorkingDay() {
        UtilizationPeriod day = UtilizationPeriod.resolve(DAY, d(10, 2), NO_HOLIDAYS);

        assertThat(day.from()).isEqualTo(d(10, 1));
        assertThat(day.previousFrom()).isEqualTo(d(9, 30));
    }

    @Test
    void monday_weekFallsBackToTheLastCompletedWeek() {
        LocalDate today = d(10, 12); // Mon — this week has nothing completed yet

        UtilizationPeriod week = UtilizationPeriod.resolve(WEEK, today, NO_HOLIDAYS);

        assertThat(week.hasCompletedDays()).isTrue();
        assertThat(week.weekFallback()).isTrue();
        assertThat(week.from()).isEqualTo(d(10, 5));      // last week's Monday …
        assertThat(week.to()).isEqualTo(d(10, 9));        // … to its Friday
        // The comparison window for a fallback week is the week before THAT one.
        assertThat(week.previousFrom()).isEqualTo(d(9, 28));
        assertThat(week.previousTo()).isEqualTo(d(10, 4));
    }

    @Test
    void monday_theFifth_fallbackWeekIsClippedToTheFirstOfTheMonth() {
        LocalDate today = d(10, 5); // Mon; the last completed Mon–Fri week is Sep 28 – Oct 2

        UtilizationPeriod week = UtilizationPeriod.resolve(WEEK, today, NO_HOLIDAYS);

        assertThat(week.weekFallback()).isTrue();
        assertThat(week.from()).isEqualTo(d(10, 1));      // not Sep 28
        assertThat(week.to()).isEqualTo(d(10, 2));
        assertThat(week.previousFrom()).isEqualTo(d(9, 21));
        assertThat(week.previousTo()).isEqualTo(d(9, 27));

        UtilizationPeriod day = UtilizationPeriod.resolve(DAY, today, NO_HOLIDAYS);
        assertThat(day.from()).isEqualTo(d(10, 2));       // skips the weekend
        UtilizationPeriod month = UtilizationPeriod.resolve(MONTH, today, NO_HOLIDAYS);
        assertThat(month.from()).isEqualTo(d(10, 1));
        assertThat(month.to()).isEqualTo(d(10, 2));
    }

    @Test
    void mondayThatIsTheSecondOfTheMonth_hasNoCompletedDayAtAll() {
        // Nov 2 2026 is a Monday and Nov 1 is a Sunday: nothing in November has completed.
        UtilizationPeriod week = UtilizationPeriod.resolve(WEEK, d(11, 2), NO_HOLIDAYS);

        assertThat(week.hasCompletedDays()).isFalse();
        assertThat(week.weekFallback()).isFalse();
        assertThat(week.from()).isNull();
    }

    @Test
    void mondayThatIsTheThirdOfTheMonth_hasNoCompletedDayAtAll() {
        // Aug 3 2026 is a Monday; Aug 1 is a Saturday and Aug 2 a Sunday.
        UtilizationPeriod week = UtilizationPeriod.resolve(WEEK, LocalDate.of(2026, 8, 3), NO_HOLIDAYS);

        assertThat(week.hasCompletedDays()).isFalse();
        assertThat(week.weekFallback()).isFalse();
    }

    @Test
    void mondayThatIsTheFourth_fallbackWeekHoldsOnlyTheMonthsFirstFriday() {
        // Mon Jan 4 2027: the last completed Mon–Fri week is Dec 28 – Jan 1, of which only Jan 1 is in January.
        LocalDate today = LocalDate.of(2027, 1, 4);

        UtilizationPeriod week = UtilizationPeriod.resolve(WEEK, today, NO_HOLIDAYS);

        assertThat(week.weekFallback()).isTrue();
        assertThat(week.from()).isEqualTo(LocalDate.of(2027, 1, 1));
        assertThat(week.to()).isEqualTo(LocalDate.of(2027, 1, 1));
        assertThat(week.previousFrom()).isEqualTo(LocalDate.of(2026, 12, 21));
        assertThat(week.previousTo()).isEqualTo(LocalDate.of(2026, 12, 27));
    }

    @Test
    void mondayHoliday_alsoFallsBackBecauseTheCurrentWeekHasNothingCompleted() {
        Set<LocalDate> holidays = Set.of(d(10, 12));

        UtilizationPeriod week = UtilizationPeriod.resolve(WEEK, d(10, 13), holidays::contains); // Tue

        assertThat(week.weekFallback()).isTrue();
        assertThat(week.from()).isEqualTo(d(10, 5));
        assertThat(week.to()).isEqualTo(d(10, 9));
    }

    @Test
    void fallbackWeekWithNoCompletedWorkingDayInsideTheMonth_isNoCompletedDays() {
        // Last week (Oct 5–9) was entirely holidays, so there is no completed week to fall back to.
        Set<LocalDate> holidays = Set.of(d(10, 5), d(10, 6), d(10, 7), d(10, 8), d(10, 9));

        UtilizationPeriod week = UtilizationPeriod.resolve(WEEK, d(10, 12), holidays::contains);

        assertThat(week.hasCompletedDays()).isFalse();
        assertThat(week.weekFallback()).isFalse();
    }

    @Test
    void anOrdinaryCurrentWeekIsNeverFlaggedAsFallback() {
        assertThat(UtilizationPeriod.resolve(WEEK, d(10, 8), NO_HOLIDAYS).weekFallback()).isFalse();
        assertThat(UtilizationPeriod.resolve(WEEK, d(10, 2), NO_HOLIDAYS).weekFallback()).isFalse(); // clipped, not fallback
        assertThat(UtilizationPeriod.resolve(DAY, d(10, 12), NO_HOLIDAYS).weekFallback()).isFalse();
        assertThat(UtilizationPeriod.resolve(MONTH, d(10, 12), NO_HOLIDAYS).weekFallback()).isFalse();
    }

    @Test
    void holidaysAreSkippedWhenFindingTheLatestCompletedDay() {
        Set<LocalDate> holidays = Set.of(d(10, 7));

        UtilizationPeriod day = UtilizationPeriod.resolve(DAY, d(10, 8), holidays::contains);

        assertThat(day.from()).isEqualTo(d(10, 6));
        assertThat(day.previousFrom()).isEqualTo(d(10, 5));
    }

    @Test
    void monthWhoseEveryCompletedDayIsAHoliday_hasNoCompletedDays() {
        Set<LocalDate> holidays = Set.of(d(10, 1), d(10, 2));

        UtilizationPeriod month = UtilizationPeriod.resolve(MONTH, d(10, 3), holidays::contains);

        assertThat(month.hasCompletedDays()).isFalse();
    }

    @Test
    void weekendIsNeverTheLatestCompletedDay() {
        UtilizationPeriod day = UtilizationPeriod.resolve(DAY, d(10, 12), NO_HOLIDAYS); // Mon 12th

        assertThat(day.from()).isEqualTo(d(10, 9));       // Fri
    }

    @Test
    void parsesPeriodParamCaseInsensitivelyAndRejectsGarbage() {
        assertThat(UtilizationPeriodType.parse("Week")).isEqualTo(WEEK);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> UtilizationPeriodType.parse("year"))
                .hasMessageContaining("period must be one of");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> UtilizationPeriodType.parse(null))
                .hasMessageContaining("period must be one of");
    }
}
