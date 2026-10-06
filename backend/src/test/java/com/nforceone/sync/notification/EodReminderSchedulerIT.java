package com.nforceone.sync.notification;

import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test: calls {@link EodReminderScheduler#sendRemindersForDate} against the live
 * Neon DB and asserts which dynamically-created test users are notified.
 *
 * <p>Creates its own test users in @BeforeEach and deletes them in @AfterEach — no hardcoded IDs.
 * Skipped unless NFORCE_LIVE_DB_IT=true, so {@code ./mvnw test} without the variable stays fast.
 *
 * <p>Logic under test: users with a manager_id are reminded; users without are not.
 */
@SpringBootTest
@ActiveProfiles("local")
@EnabledIfEnvironmentVariable(named = "NFORCE_LIVE_DB_IT", matches = "true")
class EodReminderSchedulerIT {

    @Autowired EodReminderScheduler scheduler;
    @Autowired BusinessRuleConfigRepository configRepository;
    @Autowired JdbcTemplate jdbc;

    /** Future Tuesday — owesEod() always true (no entries can exist for a future date). */
    private static final LocalDate PROBE_DATE = LocalDate.of(2026, 10, 13);

    private static final String HASH = "$2a$10$testItOnlyHashAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

    private Long managerId;
    private List<Long> reporteeIds;
    private Long noManagerId;

    @BeforeEach
    void createTestUsers() {
        managerId = jdbc.queryForObject(
                "INSERT INTO app_user (full_name, email, password_hash, role, employee_code, manager_id, created_by)"
                        + " VALUES ('IT Mgr','it-mgr-it@nforceone.com',?,  'EMPLOYEE','NF-99990001',NULL,NULL)"
                        + " RETURNING id",
                Long.class, HASH);

        reporteeIds = new ArrayList<>();
        Object[][] reportees = {
            {"IT PM",   "it-pm-it@nforceone.com",   "PM",       "NF-99990002"},
            {"IT Adm",  "it-adm-it@nforceone.com",  "ADMIN",    "NF-99990003"},
            {"IT Emp",  "it-emp-it@nforceone.com",  "EMPLOYEE", "NF-99990004"},
        };
        for (Object[] r : reportees) {
            Long id = jdbc.queryForObject(
                    "INSERT INTO app_user (full_name, email, password_hash, role, employee_code, manager_id, created_by)"
                            + " VALUES (?,?,?::text,?,?::text,?,NULL)"
                            + " RETURNING id",
                    Long.class, r[0], r[1], HASH, r[2], r[3], managerId);
            reporteeIds.add(id);
        }

        noManagerId = jdbc.queryForObject(
                "INSERT INTO app_user (full_name, email, password_hash, role, employee_code, manager_id, created_by)"
                        + " VALUES ('IT Top','it-top-it@nforceone.com',?,'SUPERADMIN','NF-99990005',NULL,NULL)"
                        + " RETURNING id",
                Long.class, HASH);
    }

    @AfterEach
    void deleteTestUsers() {
        String allIds = Stream.concat(reporteeIds.stream(), Stream.of(managerId, noManagerId))
                .map(String::valueOf).collect(Collectors.joining(","));
        jdbc.update("DELETE FROM notification WHERE user_id IN (" + allIds + ")");
        jdbc.update("UPDATE app_user SET manager_id = NULL WHERE id IN (" + allIds + ")");
        jdbc.update("DELETE FROM app_user WHERE id IN (" + allIds + ")");
    }

    @Test
    void remindedSet_isReporteesOnly_notNoManagerUser() {
        BusinessRuleConfig config = configRepository.findById(1L)
                .orElseThrow(() -> new IllegalStateException("business_rule_config id=1 missing"));

        OffsetDateTime cutoffSince = OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(5);

        String allIds = Stream.concat(reporteeIds.stream(), Stream.of(managerId, noManagerId))
                .map(String::valueOf).collect(Collectors.joining(","));

        List<Map<String, Object>> notifiedRows;
        try {
            scheduler.sendRemindersForDate(PROBE_DATE, config, cutoffSince, "IT Test");

            notifiedRows = jdbc.queryForList(
                    "SELECT user_id, message FROM notification"
                            + " WHERE user_id IN (" + allIds + ") AND type='EOD_REMINDER'"
                            + " AND created_at > ? ORDER BY user_id",
                    cutoffSince);
        } finally {
            jdbc.update("DELETE FROM notification WHERE type='EOD_REMINDER' AND user_id IN (" + allIds + ") AND created_at > ?",
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
                .as("Users with a reporting manager must be reminded")
                .containsExactlyInAnyOrder(reporteeIds.toArray(new Long[0]));

        assertThat(notifiedIds)
                .as("Users with no manager must not be reminded")
                .doesNotContain(noManagerId);
    }
}
