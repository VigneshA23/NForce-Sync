package com.nforceone.sync.eod.dto;

import java.math.BigDecimal;

/**
 * PM-only, on-read enrichment for an {@code EodEntry} — escalation, undertime, and the
 * employee's TL, computed in {@code ApprovalService} rather than stored. Never populated for
 * the Team Lead's own view of an entry.
 */
public record EodEntryEnrichment(
        Boolean    escalated,
        Integer    tlInactivityHours,
        String     tlName,
        Long       tlId,
        BigDecimal undertimeHours,
        Boolean    isResubmission
) {
}
