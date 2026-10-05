package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodEntry;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record SaveEodRequest(
        @NotNull(message = "Entry date is required")
        LocalDate entryDate,

        /** Null is tolerated and treated as WORKING_DAY, so older clients keep working. */
        EodEntry.DayType dayType,

        /** Time adjustment, WORKING_DAY only. Both null when none is requested. */
        EodEntry.TimeAdjustmentType timeAdjustmentType,
        Integer timeAdjustmentMinutes,

        String workLocation,

        /** Capped at 300 characters, matching MAX_TEXT_LEN on the Submit EOD form. */
        @Size(max = 300) String nextDayPlan,
        @Size(max = 300) String remarks,

        /** @Valid is required for the per-task constraints (description/blockerReason length) to
         *  be checked at all — without it, Bean Validation does not descend into the list. */
        @Valid List<SaveEodTaskRequest> tasks,

        /** IDs of attachments (already uploaded via the separate upload endpoint) that should be
         *  associated with the overall EOD entry — null/empty is fine. See
         *  EodAttachmentService.reassignForSave for how these get (re-)pointed on every save. */
        List<Long> attachmentIds,

        // ── PLAIN_LOG fields ────────────────────────────────────────────────────────
        // Persisted once at draft creation; ignored on subsequent saves of an existing entry.
        EodEntry.EntryForm entryForm,

        // Required when logTotalHours > 0; optional when hours == 0 (leave / no-work day).
        // 20–4000 characters, trimmed. Enforced at submit time, not draft save.
        @Size(max = 4000) String logSummary,

        // 0.00–24.00 in 0.25-hour increments. 0 signals a leave day (AUTO_APPROVED).
        BigDecimal logTotalHours,

        // Optional additional context. No SQL column length limit; capped at 8000 here.
        @Size(max = 8000) String logNotes
) {}
