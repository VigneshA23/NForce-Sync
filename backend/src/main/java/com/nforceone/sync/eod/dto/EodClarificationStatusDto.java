package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodClarification;

import java.time.OffsetDateTime;

/** Lightweight header for an entry's LATEST clarification round — open (NEEDS_RESPONSE /
 *  ACKNOWLEDGED) or the most recent RESOLVED one, so a resolved thread stays readable. With no
 *  round at all, every field is null/false apart from the viewer flags. Fetched independently of
 *  EodEntryDto (same separation Blockers already uses).
 *
 *  {@code canOpen} / {@code canReply} / {@code canResolve} are the VIEWER's own capabilities,
 *  computed server-side by EodClarificationAccessPolicy so the UI never re-derives approver rules:
 *  <ul>
 *    <li>canOpen    — may start a new round (no open round; a reviewer with a pending piece, never the owner);</li>
 *    <li>canReply   — may post into the open round (owner as employee, or a reviewer);</li>
 *    <li>canResolve — may resolve the open round (a reviewer only; never the owner).</li>
 *  </ul>
 *  A read-only RM / PM gets all three false. {@code open} is false for a resolved round. */
public record EodClarificationStatusDto(
        Long           clarificationId,
        boolean        open,
        String         status,
        OffsetDateTime openedAt,
        String         openedByName,
        OffsetDateTime resolvedAt,
        String         resolvedByName,
        boolean        canOpen,
        boolean        canReply,
        boolean        canResolve
) {
    public static EodClarificationStatusDto none(boolean canOpen) {
        return new EodClarificationStatusDto(null, false, null, null, null, null, null, canOpen, false, false);
    }

    public static EodClarificationStatusDto from(EodClarification c, boolean canOpen, boolean canReply,
                                                  boolean canResolve) {
        return new EodClarificationStatusDto(
                c.getId(),
                c.isOpen(),
                c.getStatus().name(),
                c.getOpenedAt(),
                c.getOpenedBy().getFullName(),
                c.getResolvedAt(),
                c.getResolvedBy() != null ? c.getResolvedBy().getFullName() : null,
                canOpen,
                canReply,
                canResolve
        );
    }
}
