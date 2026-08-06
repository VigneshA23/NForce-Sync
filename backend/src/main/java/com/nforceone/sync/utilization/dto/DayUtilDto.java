package com.nforceone.sync.utilization.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/** One day's resolved utilization — batched equivalent of calling
 *  UtilizationService.resolveUtilizationPct() once per day, without the N+1 queries. */
public record DayUtilDto(
        LocalDate date,
        boolean workingDay,
        BigDecimal utilizationPct,
        boolean hasApprovedEntry
) {}
