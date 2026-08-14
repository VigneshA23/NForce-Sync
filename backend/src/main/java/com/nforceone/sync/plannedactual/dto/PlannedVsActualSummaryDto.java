package com.nforceone.sync.plannedactual.dto;

import java.util.List;

public record PlannedVsActualSummaryDto(
        PlannedVsActualCardsDto cards,
        List<PlannedVsActualProjectRowDto> projectRows,
        List<PlannedVsActualResourceRowDto> resourceRows
) {}
