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
        long auditEventsLast24h,
        // Org breakdowns (active users only, keyed by resolved name — "Unassigned" for a
        // null department/location)
        Map<String, Long> usersByDepartment,
        Map<String, Long> usersByLocation,
        // Org Masters snapshot — Admin owns these records but they weren't reflected anywhere
        // on this dashboard before
        long departmentCount,
        long designationCount,
        long locationCount,
        // New joiners in the last 7 days
        long newUsersLast7Days,
        List<String> newUserNames,
        // Today's EOD submission snapshot — see EodEntryRepository.countDistinctSubmittedEmployeesOnDate
        // for why this is a simpler definition than the org-wide EOD compliance calculation
        long eodSubmittedToday,
        long eodExpectedToday
) {}
