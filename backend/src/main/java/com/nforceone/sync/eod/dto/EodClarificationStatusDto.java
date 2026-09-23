package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodClarification;

import java.time.OffsetDateTime;

/** Lightweight header — whether an entry currently has an open clarification (and, if so, its
 *  exact NEEDS_RESPONSE/ACKNOWLEDGED/RESOLVED status), fetched independently of EodEntryDto (same
 *  separation Blockers already uses: blocker state isn't embedded in EodEntryDto either, it's
 *  fetched from its own endpoints and cross-referenced). */
public record EodClarificationStatusDto(
        Long           clarificationId,
        boolean        open,
        String         status,
        OffsetDateTime openedAt,
        String         openedByName,
        OffsetDateTime resolvedAt,
        String         resolvedByName
) {
    public static EodClarificationStatusDto none() {
        return new EodClarificationStatusDto(null, false, null, null, null, null, null);
    }

    public static EodClarificationStatusDto from(EodClarification c) {
        return new EodClarificationStatusDto(
                c.getId(),
                c.isOpen(),
                c.getStatus().name(),
                c.getOpenedAt(),
                c.getOpenedBy().getFullName(),
                c.getResolvedAt(),
                c.getResolvedBy() != null ? c.getResolvedBy().getFullName() : null
        );
    }
}
