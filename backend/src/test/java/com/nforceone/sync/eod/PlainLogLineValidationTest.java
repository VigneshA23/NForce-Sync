package com.nforceone.sync.eod;

import com.nforceone.sync.eod.dto.SaveEodLogLineRequest;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for PlainLogValidation — V110 line-item path and legacy path.
 */
class PlainLogLineValidationTest {

    // ── leave day ────────────────────────────────────────────────────────────────

    @Test
    void emptyLines_isLeaveDay_valid() {
        assertNull(PlainLogValidation.validate(List.of(), null));
    }

    @Test
    void nullLines_treatedAsLeave_valid() {
        assertNull(PlainLogValidation.validate(null, null));
    }

    @Test
    void leaveDay_notesTooLong_error() {
        String longNotes = "x".repeat(8001);
        assertNotNull(PlainLogValidation.validate(List.of(), longNotes));
    }

    // ── single valid line ─────────────────────────────────────────────────────────

    @Test
    void singleLine_valid() {
        var line = line(BigDecimal.valueOf(2.25), "Reviewed pull requests for the sprint");
        assertNull(PlainLogValidation.validate(List.of(line), null));
    }

    @Test
    void multipleLines_valid() {
        var lines = List.of(
                line(BigDecimal.valueOf(3.0), "Planning and strategy for Q4"),
                line(BigDecimal.valueOf(2.5), "Client stakeholder call"),
                line(BigDecimal.valueOf(1.25), "Documentation review")
        );
        assertNull(PlainLogValidation.validate(lines, null));
    }

    // ── hours validation ─────────────────────────────────────────────────────────

    @Test
    void zeroHoursOnLine_error() {
        var line = line(BigDecimal.ZERO, "Something");
        assertNotNull(PlainLogValidation.validate(List.of(line), null));
    }

    @Test
    void negativeHoursOnLine_error() {
        var line = line(BigDecimal.valueOf(-1), "Something");
        assertNotNull(PlainLogValidation.validate(List.of(line), null));
    }

    @Test
    void hoursExceed24OnLine_error() {
        var line = line(BigDecimal.valueOf(25), "Something");
        assertNotNull(PlainLogValidation.validate(List.of(line), null));
    }

    @Test
    void nonQuarterHoursOnLine_error() {
        var line = line(BigDecimal.valueOf(2.3), "Something");
        assertNotNull(PlainLogValidation.validate(List.of(line), null));
    }

    @Test
    void quarterHour_0_25_valid() {
        var line = line(BigDecimal.valueOf(0.25), "Short task done");
        assertNull(PlainLogValidation.validate(List.of(line), null));
    }

    @Test
    void totalHoursExceed24_error() {
        var lines = List.of(
                line(BigDecimal.valueOf(12), "Morning"),
                line(BigDecimal.valueOf(13), "Afternoon")
        );
        assertNotNull(PlainLogValidation.validate(lines, null));
    }

    @Test
    void totalHoursExactly24_valid() {
        var lines = List.of(
                line(BigDecimal.valueOf(12), "First half"),
                line(BigDecimal.valueOf(12), "Second half")
        );
        assertNull(PlainLogValidation.validate(lines, null));
    }

    // ── description validation ────────────────────────────────────────────────────

    @Test
    void blankDescription_error() {
        var line = line(BigDecimal.ONE, "   ");
        assertNotNull(PlainLogValidation.validate(List.of(line), null));
    }

    @Test
    void descriptionTooShort_error() {
        var line = line(BigDecimal.ONE, "ab");
        assertNotNull(PlainLogValidation.validate(List.of(line), null));
    }

    @Test
    void descriptionTooLong_error() {
        var line = line(BigDecimal.ONE, "x".repeat(4001));
        assertNotNull(PlainLogValidation.validate(List.of(line), null));
    }

    @Test
    void descriptionExactlyMax_valid() {
        var line = line(BigDecimal.ONE, "x".repeat(4000));
        assertNull(PlainLogValidation.validate(List.of(line), null));
    }

    // ── legacy path ──────────────────────────────────────────────────────────────

    @Test
    void legacy_leave_valid() {
        assertNull(PlainLogValidation.validateLegacy(BigDecimal.ZERO, null, null));
    }

    @Test
    void legacy_workDay_summaryRequired() {
        assertNotNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(8), null, null));
    }

    @Test
    void legacy_workDay_summaryTooShort() {
        assertNotNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(8), "short", null));
    }

    @Test
    void legacy_workDay_validSummary() {
        assertNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(8), "A valid work summary of at least 20 characters", null));
    }

    @Test
    void legacy_nonQuarterHours_error() {
        assertNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(8.5), "A valid summary of more than twenty chars", null));
        assertNotNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(8.3), "A valid summary of more than twenty chars", null));
    }

    // ── helpers ───────────────────────────────────────────────────────────────────

    private static SaveEodLogLineRequest line(BigDecimal hours, String description) {
        return new SaveEodLogLineRequest(1L, hours, description, 0);
    }
}
