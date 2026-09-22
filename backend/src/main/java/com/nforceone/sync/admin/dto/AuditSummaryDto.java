package com.nforceone.sync.admin.dto;

/** Backs the Audit Log page's 7-card KPI strip — counts scoped to whatever filters are currently
 *  applied (same Specification as the list endpoint), not the global total. {@code other} covers
 *  every action outside the 5 named buckets (e.g. a future action type never mapped here). */
public record AuditSummaryDto(
        long total,
        long create,
        long update,
        long delete,
        long activate,
        long deactivate,
        long other
) {
}
