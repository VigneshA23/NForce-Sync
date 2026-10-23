package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.eod.dto.SaveEodLogLineRequest;
import com.nforceone.sync.eod.dto.SaveEodRequest;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.TaskCategory;
import com.nforceone.sync.project.TaskCategoryRepository;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Drafts are lenient about a line's description; submit is not.
 *
 * <p>A draft is autosaved while the user types, so an empty or short description must not make the save fail
 * (it used to, silently dropping the whole draft). The "required, 3+ characters" rule lives in
 * {@link PlainLogValidation}, which {@code EodService.submit} runs against the persisted lines — it is untouched.
 * The upper bound (4000) still applies to drafts.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PlainLogDraftTest {

    private static final LocalDate FRI = LocalDate.of(2026, 10, 9); // a weekday in the past
    private static final long ENTRY_ID = 77L;

    @Mock EodEntryRepository entryRepository;
    @Mock AppUserRepository userRepository;
    @Mock EodLogLineRepository logLineRepository;
    @Mock AllocationRepository allocationRepository;
    @Mock TaskCategoryRepository categoryRepository;
    @Mock BusinessRuleConfigRepository configRepository;
    @Mock HolidayRepository holidayRepository;
    @Mock EodAttachmentService attachmentService;

    private EodService service;
    private AppUser pm;
    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @BeforeEach
    void setUp() {
        service = new EodService(entryRepository, null, userRepository, null, categoryRepository, null,
                configRepository, null, holidayRepository, attachmentService, null, null, null, null, null,
                allocationRepository, null, logLineRepository, org.mockito.Mockito.mock(BenchModePolicy.class));

        pm = new AppUser();
        pm.setId(1L);
        pm.setRole(AppUser.Role.PM);
        AppUser boss = new AppUser();
        boss.setId(900L);
        pm.setManager(boss);

        BusinessRuleConfig config = new BusinessRuleConfig();
        config.setWeekendRule(BusinessRuleConfig.WeekendRule.SAT_SUN);
        when(configRepository.findById(1L)).thenReturn(Optional.of(config));
        when(userRepository.findByEmailAndDeletedAtIsNull(anyString())).thenReturn(Optional.of(pm));
        when(entryRepository.findByEmployeeIdAndEntryDate(any(), any())).thenReturn(Optional.empty());
        when(allocationRepository.findEmployeeIdsAllocatedOn(anyList(), any())).thenReturn(Set.of());
        when(entryRepository.save(any(EodEntry.class))).thenAnswer(inv -> {
            EodEntry e = inv.getArgument(0);
            e.setId(ENTRY_ID);
            return e;
        });
        TaskCategory category = new TaskCategory();
        category.setId(5L);
        category.setName("Meetings");
        category.setScope("MANAGEMENT");
        category.setActive(true);
        when(categoryRepository.findById(5L)).thenReturn(Optional.of(category));
        when(attachmentService.loadForEntries(anyList()))
                .thenReturn(new EodAttachmentService.AttachmentsByScope(Map.of(), Map.of()));
    }

    private SaveEodRequest draftWith(String description) {
        SaveEodLogLineRequest line = new SaveEodLogLineRequest(5L, new BigDecimal("2.00"), description, 0);
        return new SaveEodRequest(FRI, EodEntry.DayType.WORKING_DAY, null, null, "Office", null, "Plan", null,
                List.of(), List.of(), EodEntry.EntryForm.PLAIN_LOG, List.of(line), null, null, null);
    }

    // ── the DTO: only the upper bound is checked ──────────────────────────────

    private int violations(String description) {
        return validator.validate(new SaveEodLogLineRequest(5L, new BigDecimal("1.00"), description, 0)).size();
    }

    @Test
    void draftLine_acceptsNullEmptyWhitespaceAndShortDescriptions() {
        assertEquals(0, violations(null));
        assertEquals(0, violations(""));
        assertEquals(0, violations("   "));
        assertEquals(0, violations("ab"));
        assertEquals(0, violations("abc"));
    }

    @Test
    void draftLine_stillEnforcesTheMaximumLength() {
        assertEquals(0, violations("x".repeat(4000)));
        assertEquals(1, violations("x".repeat(4001)));
    }

    @Test
    void otherLineConstraintsAreUnchanged() {
        assertTrue(validator.validate(new SaveEodLogLineRequest(null, new BigDecimal("1.00"), "abc", 0)).size() > 0);
        assertTrue(validator.validate(new SaveEodLogLineRequest(5L, new BigDecimal("0.10"), "abc", 0)).size() > 0);
        assertTrue(validator.validate(new SaveEodLogLineRequest(5L, new BigDecimal("25"), "abc", 0)).size() > 0);
    }

    // ── a draft saves; the same draft cannot be submitted ─────────────────────

    @Test
    void draftWithEmptyDescription_saves_andSubmittingThatDraftIsRejectedWithARowNumberedMessage() {
        // Save the draft with an empty description.
        assertDoesNotThrow(() -> service.saveDraft(draftWith(""), "pm@x.y"));

        ArgumentCaptor<EodLogLine> saved = ArgumentCaptor.forClass(EodLogLine.class);
        verify(logLineRepository).save(saved.capture());
        assertEquals("", saved.getValue().getDescription());

        // Submit that same draft: the persisted line is read back and PlainLogValidation rejects it.
        EodEntry entry = new EodEntry();
        entry.setId(ENTRY_ID);
        entry.setEmployee(pm);
        entry.setEntryDate(FRI);
        entry.setStatus(EodEntry.Status.DRAFT);
        entry.setEntryForm(EodEntry.EntryForm.PLAIN_LOG);
        entry.setDayType(EodEntry.DayType.WORKING_DAY);
        entry.setWorkLocation("Office");
        entry.setNextDayPlan("Plan");
        when(entryRepository.findWithDetailsById(ENTRY_ID)).thenReturn(Optional.of(entry));
        when(logLineRepository.findByEntryIdOrderBySortOrderAscIdAsc(ENTRY_ID)).thenReturn(List.of(saved.getValue()));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.submit(ENTRY_ID, "pm@x.y"));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertEquals("Row 1: description is required.", ex.getReason());
    }

    @Test
    void draftWithNoDescriptionAtAll_savesAsEmpty_insteadOfFailing() {
        assertDoesNotThrow(() -> service.saveDraft(draftWith(null), "pm@x.y"));
        ArgumentCaptor<EodLogLine> saved = ArgumentCaptor.forClass(EodLogLine.class);
        verify(logLineRepository).save(saved.capture());
        assertEquals("", saved.getValue().getDescription());
    }

    @Test
    void draftWithAShortDescription_saves_andSubmitIsStillRejected() {
        assertDoesNotThrow(() -> service.saveDraft(draftWith("ab"), "pm@x.y"));
        ArgumentCaptor<EodLogLine> saved = ArgumentCaptor.forClass(EodLogLine.class);
        verify(logLineRepository).save(saved.capture());

        String error = PlainLogValidation.validate(
                List.of(new SaveEodLogLineRequest(5L, saved.getValue().getHours(), saved.getValue().getDescription(), 0)), null);
        assertEquals("Row 1: description must be at least 3 characters.", error);
    }
}
