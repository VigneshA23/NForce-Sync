package com.nforceone.sync.businessrules;

import java.time.LocalDate;

public record HolidayDto(Long id, String name, LocalDate holidayDate) {
    public static HolidayDto from(Holiday h) {
        return new HolidayDto(h.getId(), h.getName(), h.getHolidayDate());
    }
}
