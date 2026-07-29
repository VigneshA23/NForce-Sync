package com.nforceone.sync.admin.dto;

import java.util.List;
import java.util.Map;

public record AdminStatsDto(
        long totalUsers,
        long activeUsers,
        long inactiveUsers,
        List<String> inactiveUserNames,
        Map<String, Long> usersByRole,
        List<AuditLogDto> recentAuditEvents,
        long auditEventsLast24h
) {}
