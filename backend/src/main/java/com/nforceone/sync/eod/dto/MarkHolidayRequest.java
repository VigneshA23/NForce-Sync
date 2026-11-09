package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodEntry;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/** Auto-records a holiday. entryForm is only read when no entry exists yet, same as on a first draft save. */
public record MarkHolidayRequest(
        @NotNull(message = "Entry date is required") LocalDate entryDate,
        EodEntry.EntryForm entryForm) {
}
