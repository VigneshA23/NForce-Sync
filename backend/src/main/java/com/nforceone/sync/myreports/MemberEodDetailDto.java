package com.nforceone.sync.myreports;

import com.nforceone.sync.eod.dto.EodEntryDto;

import java.time.LocalDate;

/**
 * One reportee's EOD for one date, as the Team EOD Status detail page shows it.
 *
 * <p>{@code status} is the same four-value status the list row carries. {@code entry} is non-null
 * only when there is a real, submitted report to show; otherwise {@code emptyState} says why:
 * <ul>
 *   <li>{@code MISSING} — deadline passed, nothing submitted</li>
 *   <li>{@code NOT_SUBMITTED} — a draft / returned-for-rework entry exists, or it is still today
 *       with nothing filed. Drafts are never exposed.</li>
 *   <li>{@code ON_LEAVE} — leave or holiday with no submitted entry to show</li>
 * </ul>
 */
public record MemberEodDetailDto(
        Long         employeeId,
        String       fullName,
        String       employeeCode,
        String       email,
        LocalDate    date,
        String       status,
        String       emptyState,
        EodEntryDto  entry
) {}
