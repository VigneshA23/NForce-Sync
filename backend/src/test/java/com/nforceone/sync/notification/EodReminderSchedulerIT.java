package com.nforceone.sync.notification;

import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test: calls {@link EodReminderScheduler#sendRemindersForDate} against the live
 * Neon DB and asserts which of the four test users are notified.
 *
 * <p>Uses 2026-10-06 (Tuesday, future date) as the probe — no entries exist for it, so
 * owesEod() always returns true. cutoffSince is set to just before the call so existing old
 * EOD_REMINDER rows in the DB do not trigger idempotency suppression.
 *
 * <p>Expected outcome:
 * <ul>
 *   <li>137 samplepm       (PM,         manager_id=111) → REMINDED</li>
 *   <li>138 sampleadmin2   (ADMIN,      manager_id=111) → REMINDED</li>
 *   <li>22  sampleemployee (EMPLOYEE,   manager_id=111) → REMINDED</li>
 *   <li>139 sampletopadmin (SUPERADMIN, manager_id=NULL) → SKIPPED</li>
 * </ul>
 */
@SpringBootTest
@ActiveProfiles("local")
class EodReminderSchedulerIT {

    @Autowired EodReminderScheduler scheduler;
    @Autowired BusinessRuleConfigRepository configRepository;
    @Autowired JdbcTemplate jdbc;

    /** Future Tuesday — owesEod() always true (no entries can exist for a future date). */
    private static final LocalDate PROBE_DATE = LocalDate.of(2026, 10, 6);

    @Test
    void remindedSet_isPm_admin2_employee_notTopAdmin() {
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM eod_entry WHERE employee_id IN (137,138,22,139) AND entry_date = ?",
                Integer.class, PROBE_DATE))
                .as("Probe date must have no existing entries for test users")
                .isZero();

        BusinessRuleConfig config = configRepository.findById(1L)
                .orElseThrow(() -> new IllegalStateException("business_rule_config id=1 missing"));

        // cutoffSince = just before this call so OLD EOD_REMINDER rows don't trigger idempotency.
        // Only a reminder created in the last 5 seconds would count as "already covered."
        OffsetDateTime cutoffSince = OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(5);

        List<Map<String, Object>> notifiedRows;
        try {
            scheduler.sendRemindersForDate(PROBE_DATE, config, cutoffSince, "IT Test");

            // Query BEFORE cleanup so we can assert on what was inserted.
            notifiedRows = jdbc.queryForList(
                    "SELECT user_id, message FROM notification "
                            + "WHERE user_id IN (137,138,22,139) AND type='EOD_REMINDER' "
                            + "AND created_at > ? ORDER BY user_id",
                    cutoffSince);
        } finally {
            // Remove all EOD_REMINDER notifications this test created.
            jdbc.update("DELETE FROM notification WHERE type='EOD_REMINDER' AND created_at > ?",
                    cutoffSince);
        }

        System.out.println("=== EodReminderSchedulerIT ===");
        for (Map<String, Object> row : notifiedRows) {
            System.out.printf("  user_id=%-4s  message=%s%n", row.get("user_id"), row.get("message"));
        }

        List<Long> notifiedIds = notifiedRows.stream()
                .map(r -> ((Number) r.get("user_id")).longValue())
                .toList();

        assertThat(notifiedIds)
                .as("PM, Admin, Employee (all with manager) must be reminded")
                .containsExactlyInAnyOrder(137L, 138L, 22L);

        assertThat(notifiedIds)
                .as("SUPERADMIN with no manager must not be reminded")
                .doesNotContain(139L);
    }
}
