package com.nforceone.sync.teamlead.dto;

import java.math.BigDecimal;
import java.util.List;

public record MemberEodStatusDto(
        Long       id,
        String     fullName,
        String     employeeCode,
        String     status,          // SUBMITTED | PENDING_APPROVAL | MISSING | ON_LEAVE
        Long       eodEntryId,      // null if no entry today — used to fetch inline detail via GET /api/eod/{id}
        List<String> projectNames,  // distinct project names logged against the entry; empty if no entry
        BigDecimal utilizationPct,  // null if not computed yet (no approved entry / snapshot)
        boolean    underutilized,
        boolean    overloaded,
        boolean    hasOpenBlocker
) {}
