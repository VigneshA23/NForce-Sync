package com.nforceone.sync.reports.dto;

import java.time.LocalDate;

/** {@code status} is one of SUBMITTED, MISSED, HOLIDAY, WEEKEND, LEAVE. */
public record MissingEodDayDto(LocalDate date, String status) {
}
