package com.nforceone.sync.team.dto;

import java.math.BigDecimal;
import java.util.List;

public record DashboardStatsDto(
        int              pendingApprovalsCount,
        BigDecimal       teamUtilizationAvg,     // null = no data or all-N/A
        int              blockersCount,
        int              membersSubmittedToday,
        int              teamSize,
        List<MemberStatusDto> members
) {}
