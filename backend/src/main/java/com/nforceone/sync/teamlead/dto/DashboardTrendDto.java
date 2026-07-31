package com.nforceone.sync.teamlead.dto;

import java.util.List;

// Powers the sparklines on the Team Lead Dashboard KPI cards. Each list is ordered
// oldest -> newest and has exactly `days` points (one per calendar day, including
// non-working days — the frontend decides how to render gaps).
public record DashboardTrendDto(
        List<TrendPointDto> avgUtilization,
        List<TrendPointDto> submittedCount,
        List<TrendPointDto> pendingApprovalCount,
        List<TrendPointDto> blockersCount
) {}
