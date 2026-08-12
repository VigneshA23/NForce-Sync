package com.nforceone.sync.eod.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * On-read enrichment for an {@code EodEntry}, computed in {@code ApprovalService} rather than
 * stored. escalated/tlInactivityHours/tlName/tlId are PM-oriented (a TL's own entries would just
 * point back at themself); decidedByName/decidedByRole/decidedAt are role-agnostic — populated
 * for both the TL's and the PM's view whenever the entry has been approved/rejected.
 */
public record EodEntryEnrichment(
        Boolean    escalated,
        Integer    tlInactivityHours,
        String     tlName,
        Long       tlId,
        BigDecimal undertimeHours,
        Boolean    isResubmission,
        String     decidedByName,
        String     decidedByRole,
        OffsetDateTime decidedAt
) {
}
