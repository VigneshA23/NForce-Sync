package com.nforceone.sync.projectdashboard.dto;

import java.util.List;

public record ProjectDashboardSummaryDto(
        DashboardSummaryCardsDto cards,
        List<ProjectUtilizationRowDto> projectUtilization,
        List<ResourceUtilizationRowDto> resourceUtilization,
        BillableSplitDto billableSplit,
        PlannedVsActualDto plannedVsActual,
        List<MissingEodRowDto> missingEod,
        List<TaskCategoryUtilizationRowDto> taskCategoryBreakdown,
        List<UtilizationTrendPointDto> utilizationTrend
) {}
