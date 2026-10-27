package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.project.Project;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Something that can BE a blocker: an {@link EodTask} (Submit EOD, a BLOCKED task on a project) or an
 * {@link EodLogLine} (Daily Log, a BLOCKED line, no project). The Blockers module — reply threads, read state,
 * Acknowledge / Resolve, the reporting manager's page, the employee's My Blockers — works against this, so a
 * Daily Log blocker needs no phantom eod_task row and Submit EOD's rows behave exactly as before.
 *
 * <p>The getters named {@code get...} that also exist as plain entity fields (acknowledged / resolved markers,
 * blockerReason) are satisfied by the entities' own Lombok accessors; the {@code getBlocker...} ones are the
 * form-neutral view.
 */
public interface BlockerSubject {

    /** The one id the API uses for this blocker — see {@link BlockerKey}. */
    Long getBlockerKey();

    EodEntry getBlockerEntry();

    /** The project it was raised on; null for a Daily Log blocker (the reporting manager handles those). */
    Project getBlockerProject();

    /** What the blocker is about, for notification text and the blocker row. */
    String getBlockerDescription();

    String getBlockerReason();

    BigDecimal getBlockerHours();

    String getBlockerCategoryName();

    /** Submit EOD tasks only; a Daily Log line has none. */
    String getSupportNeeded();

    OffsetDateTime getAcknowledgedAt();
    void setAcknowledgedAt(OffsetDateTime value);
    AppUser getAcknowledgedBy();
    void setAcknowledgedBy(AppUser value);
    OffsetDateTime getResolvedAt();
    void setResolvedAt(OffsetDateTime value);
    AppUser getResolvedBy();
    void setResolvedBy(AppUser value);

    /** "RESOLVED" / "ACKNOWLEDGED" / "NEEDS_RESPONSE" — one definition for tasks and lines alike. */
    default String getBlockerStatus() {
        if (getResolvedAt() != null) return "RESOLVED";
        if (getAcknowledgedAt() != null) return "ACKNOWLEDGED";
        return "NEEDS_RESPONSE";
    }
}
