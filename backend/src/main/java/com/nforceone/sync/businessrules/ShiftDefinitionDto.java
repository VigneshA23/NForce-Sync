package com.nforceone.sync.businessrules;

import java.time.LocalTime;

public record ShiftDefinitionDto(Long id, String name, LocalTime startTime, LocalTime endTime, boolean active,
                                  long assignedEmployeeCount) {
    public static ShiftDefinitionDto from(ShiftDefinition s) {
        return from(s, 0L);
    }

    public static ShiftDefinitionDto from(ShiftDefinition s, long assignedEmployeeCount) {
        return new ShiftDefinitionDto(s.getId(), s.getName(), s.getStartTime(), s.getEndTime(), s.isActive(),
                assignedEmployeeCount);
    }
}
