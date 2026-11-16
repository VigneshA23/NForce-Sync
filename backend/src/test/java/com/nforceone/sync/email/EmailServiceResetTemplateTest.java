package com.nforceone.sync.email;

import com.nforceone.sync.auth.PasswordResetPolicy;
import com.nforceone.sync.config.BusinessClock;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.*;

/** The "Password Reset Request" email: validity headline + exact expiry sub line, from the shared policy. */
class EmailServiceResetTemplateTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private static EmailService service(int ttlMinutes) {
        PasswordResetPolicy policy = new PasswordResetPolicy(ttlMinutes, new BusinessClock(IST, Clock.systemUTC()));
        AppBaseUrlResolver urls = new AppBaseUrlResolver("https://app.example.test", "https://app.example.test");
        return new EmailService(urls, policy);
    }

    // Sent 4:37 PM IST == 11:07 UTC, so it expires 4:47 PM IST == 11:17 UTC.
    private static final OffsetDateTime EXPIRES = OffsetDateTime.of(2026, 11, 16, 11, 17, 0, 0, ZoneOffset.UTC);

    @Test
    void showsExpiresInMinutesAndValidUntilWithAmPmAndZone() {
        String html = service(10).buildResetHtml("Asha Rao", "asha@x.com", "NFSync@123456", "tok", EXPIRES);
        assertTrue(html.contains("Expires in 10 minutes"), "headline");
        assertTrue(html.contains("Valid until 4:47 PM IST"), "sub line");
    }

    @Test
    void oldExpiresOnBlockAndUtcMorningTimeAreGone() {
        String html = service(10).buildResetHtml("Asha Rao", "asha@x.com", "NFSync@123456", "tok", EXPIRES);
        assertFalse(html.contains("EXPIRES ON"));
        assertFalse(html.contains("11:17"), "the UTC wall clock must never be displayed");
        assertFalse(html.contains("Nov 16, 2026"));
    }

    @Test
    void validityLengthFollowsTheSharedPolicyValue() {
        String html = service(15).buildResetHtml("Asha Rao", "asha@x.com", "NFSync@123456", "tok", EXPIRES);
        assertTrue(html.contains("Expires in 15 minutes"));
        assertFalse(html.contains("Expires in 10 minutes"));
    }

    @Test
    void ctaLinkCarriesTheResetToken() {
        String html = service(10).buildResetHtml("Asha Rao", "asha@x.com", "NFSync@123456", "tok123", EXPIRES);
        assertTrue(html.contains("/login?resetToken=tok123"));
    }
}
