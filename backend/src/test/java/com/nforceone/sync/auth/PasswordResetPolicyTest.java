package com.nforceone.sync.auth;

import com.nforceone.sync.config.BusinessClock;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.*;

/** The expiry line in the reset email: correct clock time, AM/PM and zone label, derived from a UTC instant. */
class PasswordResetPolicyTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private static PasswordResetPolicy policy(int ttl, Instant start) {
        return new PasswordResetPolicy(ttl, new BusinessClock(IST, new MutableClock(start)));
    }

    /** Expiry text for a link sent at the given IST wall-clock time on 2026-11-16. */
    private static String validUntilForSentAtIst(int hour, int minute) {
        Instant sent = OffsetDateTime.of(2026, 11, 16, hour, minute, 0, 0, ZoneOffset.ofHoursMinutes(5, 30)).toInstant();
        PasswordResetPolicy p = policy(10, sent);
        return p.formatValidUntil(p.expiryFor(sent));
    }

    @Test
    void reportedBug_sentAt437pmIst_showsFourFortySevenPmIst() {
        assertEquals("4:47 PM IST", validUntilForSentAtIst(16, 37));
    }

    @Test
    void reportedBug_sentAt425pmIst_isNotShownAsUtcMorningTime() {
        // The bug printed "11:05 AM" (the UTC wall clock) with no label for a 4:25 PM IST email.
        String shown = validUntilForSentAtIst(16, 25);
        assertEquals("4:35 PM IST", shown);
        assertFalse(shown.startsWith("11:"));
    }

    @Test
    void acrossNoon_elevenFiftyFiveAmToTwelveOhFivePm() {
        assertEquals("12:05 PM IST", validUntilForSentAtIst(11, 55));
    }

    @Test
    void justBeforeNoon() {
        assertEquals("11:59 AM IST", validUntilForSentAtIst(11, 49));
    }

    @Test
    void acrossMidnight_elevenFiftyFivePmToTwelveOhFiveAm() {
        assertEquals("12:05 AM IST", validUntilForSentAtIst(23, 55));
    }

    @Test
    void utcToIstConversion_usesAHalfHourOffset() {
        // 11:05 UTC is 16:35 IST. Stored as UTC, shown as IST.
        OffsetDateTime stored = OffsetDateTime.of(2026, 11, 16, 11, 5, 0, 0, ZoneOffset.UTC);
        assertEquals("4:35 PM IST", PasswordResetPolicy.formatValidUntil(stored, IST));
    }

    @Test
    void sameInstantInUtcCarriesTheUtcLabel() {
        OffsetDateTime stored = OffsetDateTime.of(2026, 11, 16, 11, 5, 0, 0, ZoneOffset.UTC);
        assertEquals("11:05 AM UTC", PasswordResetPolicy.formatValidUntil(stored, ZoneOffset.UTC));
    }

    @Test
    void formatDoesNotDependOnTheJvmDefaultZone() {
        java.util.TimeZone original = java.util.TimeZone.getDefault();
        try {
            OffsetDateTime stored = OffsetDateTime.of(2026, 11, 16, 11, 5, 0, 0, ZoneOffset.UTC);
            for (String zone : new String[]{"UTC", "America/Los_Angeles", "Asia/Tokyo"}) {
                java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone(zone));
                assertEquals("4:35 PM IST", PasswordResetPolicy.formatValidUntil(stored, IST));
            }
        } finally {
            java.util.TimeZone.setDefault(original);
        }
    }

    @Test
    void storedExpiryIsUtcAndExactlyTtlAfterSent() {
        Instant sent = Instant.parse("2026-11-16T11:07:00Z");
        OffsetDateTime expiry = policy(10, sent).expiryFor(sent);
        assertEquals(ZoneOffset.UTC, expiry.getOffset());
        assertEquals(Duration.ofMinutes(10), Duration.between(sent, expiry.toInstant()));
    }

    @Test
    void displayedExpiryIsAlwaysLaterThanSentTime() {
        // Every minute of a full day, including both noon and midnight rollovers.
        Instant start = Instant.parse("2026-11-16T00:00:00Z");
        for (int m = 0; m < 24 * 60; m++) {
            Instant sent = start.plus(Duration.ofMinutes(m));
            PasswordResetPolicy p = policy(10, sent);
            OffsetDateTime expiry = p.expiryFor(sent);
            assertTrue(expiry.toInstant().isAfter(sent), "expiry must follow send at minute " + m);
            // …and the wall clock shown is the sent wall clock + 10 minutes (modulo midnight).
            LocalTime sentLocal = sent.atZone(IST).toLocalTime();
            LocalTime shown = expiry.toInstant().atZone(IST).toLocalTime();
            assertEquals(sentLocal.plusMinutes(10), shown);
        }
    }

    @Test
    void ttlComesFromOneValue() {
        assertEquals(10, policy(10, Instant.EPOCH).ttlMinutes());
        assertEquals(15, policy(15, Instant.EPOCH).ttlMinutes());
        assertThrows(IllegalArgumentException.class, () -> policy(0, Instant.EPOCH));
    }

    @Test
    void expiryBoundary_validJustBefore_expiredAtAndAfter() {
        Instant sent = Instant.parse("2026-11-16T11:07:00Z");
        PasswordResetPolicy p = policy(10, sent);
        OffsetDateTime expiry = p.expiryFor(sent);
        assertFalse(p.isExpired(expiry, sent.plusSeconds(599)));
        assertTrue(p.isExpired(expiry, sent.plusSeconds(600)));
        assertTrue(p.isExpired(expiry, sent.plusSeconds(601)));
    }
}
