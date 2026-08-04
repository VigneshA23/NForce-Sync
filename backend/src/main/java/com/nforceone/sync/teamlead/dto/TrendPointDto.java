package com.nforceone.sync.teamlead.dto;

import java.time.LocalDate;

// workingDay is false for weekends/company holidays — value is always null on those days;
// callers must never render a computed percentage for a non-working day even if value
// happens to be non-null (e.g. a stale snapshot row), so the flag is explicit rather than
// inferred from value == null (which also legitimately happens on a real working day with
// no team members averaged in yet).
public record TrendPointDto(LocalDate date, Double value, boolean workingDay) {}
