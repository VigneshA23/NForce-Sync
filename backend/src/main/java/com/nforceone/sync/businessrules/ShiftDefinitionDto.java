package com.nforceone.sync.businessrules;

import java.math.BigDecimal;
import java.time.LocalTime;

public record ShiftDefinitionDto(Long id, String name, LocalTime startTime, LocalTime endTime,
                                  /** Hours after endTime the EOD is due; null when not configured. */
                                  BigDecimal eodCutoffHours,
                                  boolean active,
                                  long assignedEmployeeCount) {
    public static ShiftDefinitionDto from(ShiftDefinition s) {
        return from(s, 0L);
    }

    public static ShiftDefinitionDto from(ShiftDefinition s, long assignedEmployeeCount) {
        return new ShiftDefinitionDto(s.getId(), s.getName(), s.getStartTime(), s.getEndTime(),
                s.getEodCutoffHours(), s.isActive(), assignedEmployeeCount);
    }
}
