package com.nforceone.sync.auth;

import com.nforceone.sync.config.BusinessClock;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * The one definition of how long a password-reset link / temporary password lives, and of how that
 * expiry is shown to a person. The backend validation (token status, login) and the email template
 * both read from here, so the number in the email and the number enforced cannot drift apart.
 *
 * <p>Expiry instants are computed from one "sent at" instant and stored in UTC. They are converted
 * to a display zone only when formatted, and the formatter is always given an explicit zone — it
 * never falls back to the JVM default, which is IST on a laptop and UTC on the deployed hosts.
 * That default was the cause of "Expires On: 11:05 AM" in an email sent at 4:25 PM IST.
 *
 * <p>Configured by {@code app.password-reset.ttl-minutes} (env {@code PASSWORD_RESET_TTL_MINUTES}),
 * identical across QA and Prod; the display zone is {@code app.business-zone}, via {@link BusinessClock}.
 */
@Component
public class PasswordResetPolicy {

    public static final int DEFAULT_TTL_MINUTES = 10;

    /** "4:47 PM IST" — 12-hour clock, AM/PM and zone abbreviation always present, English month/AM-PM text. */
    private static final DateTimeFormatter VALID_UNTIL_FORMAT =
            DateTimeFormatter.ofPattern("h:mm a z", Locale.ENGLISH);

    private final int ttlMinutes;
    private final BusinessClock businessClock;

    @Autowired
    public PasswordResetPolicy(@Value("${app.password-reset.ttl-minutes:" + DEFAULT_TTL_MINUTES + "}") int ttlMinutes,
                               BusinessClock businessClock) {
        if (ttlMinutes < 1) {
            throw new IllegalArgumentException("app.password-reset.ttl-minutes must be at least 1, was " + ttlMinutes);
        }
        this.ttlMinutes = ttlMinutes;
        this.businessClock = businessClock;
    }

    public int ttlMinutes() {
        return ttlMinutes;
    }

    /** The current instant, from the same clock the rest of the app uses. */
    public Instant now() {
        return businessClock.instant();
    }

    /** sentAt + TTL, as a UTC offset date-time ready to store. */
    public OffsetDateTime expiryFor(Instant sentAt) {
        return sentAt.plus(Duration.ofMinutes(ttlMinutes)).atOffset(ZoneOffset.UTC);
    }

    /** True once {@code expiresAt} is no longer in the future. Compares instants, never formatted text. */
    public boolean isExpired(OffsetDateTime expiresAt, Instant now) {
        return !expiresAt.toInstant().isAfter(now);
    }

    /**
     * The zone the expiry is shown in. No per-user timezone exists on {@code app_user} yet, so this is the
     * business zone (Asia/Kolkata unless {@code app.business-zone} says otherwise). A recipient-specific zone
     * can replace this call site later without changing the formatter.
     */
    public ZoneId displayZone() {
        return businessClock.zone();
    }

    public String formatValidUntil(OffsetDateTime expiresAt) {
        return formatValidUntil(expiresAt, displayZone());
    }

    /** "4:47 PM IST" for the given instant in the given zone. The zone is mandatory — there is no default. */
    public static String formatValidUntil(OffsetDateTime expiresAt, ZoneId zone) {
        // A bare ZoneOffset prints as "Z" (UTC) or "+05:30"; the region id gives a real label ("UTC").
        ZoneId labelled = zone instanceof ZoneOffset off && off.getTotalSeconds() == 0 ? ZoneId.of("UTC") : zone;
        return VALID_UNTIL_FORMAT.format(expiresAt.toInstant().atZone(labelled));
    }
}
