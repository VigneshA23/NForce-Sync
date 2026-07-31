package com.nforceone.sync.teamlead.dto;

import java.math.BigDecimal;

public record MemberEodStatusDto(
        Long       id,
        String     fullName,
        String     employeeCode,
        String     status,          // SUBMITTED | PENDING_APPROVAL | MISSING | ON_LEAVE
        Long       eodEntryId,      // null if no entry today — used to fetch inline detail via GET /api/eod/{id}
        String     projectName,     // today's project — null if no entry, "Multiple projects" if >1 distinct
        BigDecimal utilizationPct,  // null if not computed yet (no approved entry / snapshot)
        boolean    underutilized,
        boolean    overloaded,
        boolean    hasOpenBlocker
) {}
