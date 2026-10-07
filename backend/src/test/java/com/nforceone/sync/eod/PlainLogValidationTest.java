package com.nforceone.sync.eod;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

class PlainLogValidationTest {

    private static final String VALID_SUMMARY = "Reviewed sprint backlog and aligned with team";

    // ── Hours: null / range ────────────────────────────────────────────────────

    @Test
    void null_hours_rejected() {
        assertNotNull(PlainLogValidation.validateLegacy(null, VALID_SUMMARY, null));
    }

    @Test
    void negative_hours_rejected() {
        assertNotNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(-0.25), VALID_SUMMARY, null));
    }

    @Test
    void hours_above_24_rejected() {
        assertNotNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(24.25), VALID_SUMMARY, null));
    }

    @Test
    void hours_exactly_24_accepted() {
        assertNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(24), VALID_SUMMARY, null));
    }

    // ── Hours: 0.25-step granularity ─────────────────────────────────────────

    @Test
    void non_quarter_hours_rejected() {
        assertNotNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(7.1), VALID_SUMMARY, null));
    }

    @Test
    void quarter_hours_accepted() {
        assertNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(7.25), VALID_SUMMARY, null));
        assertNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(7.5), VALID_SUMMARY, null));
        assertNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(7.75), VALID_SUMMARY, null));
    }

    // ── Hours == 0: leave day ─────────────────────────────────────────────────

    @Test
    void hours_zero_is_leave_and_summary_optional() {
        // No summary supplied — still valid as a leave day.
        assertNull(PlainLogValidation.validateLegacy(BigDecimal.ZERO, null, null));
    }

    @Test
    void hours_zero_with_summary_also_valid() {
        assertNull(PlainLogValidation.validateLegacy(BigDecimal.ZERO, "optional note", null));
    }

    // ── Summary: required when hours > 0 ─────────────────────────────────────

    @Test
    void null_summary_when_working_rejected() {
        assertNotNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(8), null, null));
    }

    @Test
    void blank_summary_when_working_rejected() {
        assertNotNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(8), "   ", null));
    }

    @Test
    void summary_below_20_chars_rejected() {
        assertNotNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(8), "Too short", null));
    }

    @Test
    void summary_exactly_20_chars_accepted() {
        String s = "A".repeat(20);
        assertNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(8), s, null));
    }

    @Test
    void summary_above_4000_chars_rejected() {
        String s = "A".repeat(4001);
        assertNotNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(8), s, null));
    }

    @Test
    void summary_exactly_4000_chars_accepted() {
        String s = "A".repeat(4000);
        assertNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(8), s, null));
    }

    // ── Notes length ─────────────────────────────────────────────────────────

    @Test
    void notes_above_8000_chars_rejected() {
        String notes = "N".repeat(8001);
        assertNotNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(8), VALID_SUMMARY, notes));
    }

    @Test
    void notes_exactly_8000_chars_accepted() {
        String notes = "N".repeat(8000);
        assertNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(8), VALID_SUMMARY, notes));
    }

    @Test
    void null_notes_accepted() {
        assertNull(PlainLogValidation.validateLegacy(BigDecimal.valueOf(8), VALID_SUMMARY, null));
    }

    // ── Happy path ───────────────────────────────────────────────────────────

    @Test
    void valid_working_day_passes() {
        assertNull(PlainLogValidation.validateLegacy(
                BigDecimal.valueOf(8), VALID_SUMMARY, "Some extra notes"));
    }
}
