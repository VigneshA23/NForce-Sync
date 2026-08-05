package com.nforceone.sync.teamlead.dto;

import java.time.OffsetDateTime;
import java.util.List;

// Supplements MemberEodStatusDto/TeamUtilDto (status, projectNames, utilization, hours —
// already fetched by the Team Utilization page's list view) with the extra fields only the
// per-member detail panel needs, so those aren't duplicated across two endpoints.
public record TeamMemberDetailDto(
        Long   employeeId,
        String designation,   // null if not configured for this user
        int    workingDays,   // scheduled business days in the same window as `trend` (length
                               // varies with the requested `days`) — calendar-only, independent
                               // of whether anything was submitted/approved
        int    loggedDays,    // of those *working* days (see workingDays above), how many have an
                               // APPROVED entry — an entry approved for a weekend/holiday date does
                               // not count, so this can never exceed workingDays
        OffsetDateTime lastApprovedEodAt, // null if this employee has never had an entry approved
        List<TrendPointDto> trend
) {}
