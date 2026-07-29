package com.nforceone.sync.businessrules;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public record CreateHolidayRequest(
        @NotBlank @Size(max = 200) String name,
        @NotNull LocalDate holidayDate
) {}
