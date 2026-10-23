package com.nforceone.sync.config;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;

/**
 * The business's wall clock. Shift times and EOD dates are stored zoneless and mean "local time at the
 * workplace", so "now" and "today" must be read in that same zone — not the JVM default, which is IST on a
 * developer machine and UTC on the deployed host.
 *
 * <p>The zone comes from {@code app.business-zone} (default Asia/Kolkata). It deliberately does not touch the
 * JVM or Hibernate zone: existing {@code LocalDateTime} rows were written in the host's zone and must keep
 * reading the same way. Every method also has a {@link ZoneId} overload so a per-employee or per-shift zone can
 * be passed later without changing callers' shape.
 */
@Component
public class BusinessClock {

    public static final String DEFAULT_ZONE = "Asia/Kolkata";

    private final ZoneId zone;
    private final Clock clock;

    @Autowired
    public BusinessClock(@Value("${app.business-zone:" + DEFAULT_ZONE + "}") String zoneId) {
        this(ZoneId.of(zoneId), Clock.systemUTC());
    }

    /** For tests: a fixed or offset {@link Clock} (its own zone is ignored) and an explicit zone. */
    public BusinessClock(ZoneId zone, Clock clock) {
        this.zone = zone;
        this.clock = clock;
    }

    public ZoneId zone() {
        return zone;
    }

    public Instant instant() {
        return clock.instant();
    }

    /** The current wall-clock date-time at the business zone — what a shift time is compared against. */
    public LocalDateTime now() {
        return now(zone);
    }

    public LocalDateTime now(ZoneId zone) {
        return LocalDateTime.ofInstant(clock.instant(), zone);
    }

    /** Today's date at the business zone. */
    public LocalDate today() {
        return today(zone);
    }

    public LocalDate today(ZoneId zone) {
        return LocalDate.ofInstant(clock.instant(), zone);
    }

    /** The absolute instant a business-zone wall-clock value denotes. */
    public Instant toInstant(LocalDateTime local) {
        return toInstant(local, zone);
    }

    public Instant toInstant(LocalDateTime local, ZoneId zone) {
        return local.atZone(zone).toInstant();
    }

    /** The current instant as an offset date-time in the business zone (serialises as ISO-8601 with offset). */
    public OffsetDateTime nowOffset() {
        return clock.instant().atZone(zone).toOffsetDateTime();
    }

    public OffsetDateTime toOffset(LocalDateTime local) {
        return local.atZone(zone).toOffsetDateTime();
    }
}
