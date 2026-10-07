package com.nforceone.sync.eod;

import com.nforceone.sync.approval2.ApprovalPieceRouter;
import com.nforceone.sync.approval2.EodProjectApproval;
import com.nforceone.sync.approval2.EodProjectApprovalRepository;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.eod.dto.EodLogLineDto;
import com.nforceone.sync.eod.dto.SaveEodLogLineRequest;
import com.nforceone.sync.eod.dto.SaveEodRequest;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.TaskCategory;
import com.nforceone.sync.project.TaskCategoryRepository;
import com.nforceone.sync.teamlead.LeadAccessService;
import com.nforceone.sync.utilization.UtilizationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Validates that PLAIN_LOG submit enforces workLocation and nextDayPlan based on dayType,
 * matching the employee form's rules added in the daily-log redesign (Part B).
 */
@ExtendWith(MockitoExtension.class)
class PlainLogFieldValidationTest {

    @Mock EodEntryRepository          entryRepository;
    @Mock EodTaskRepository           taskRepository;
    @Mock AppUserRepository           userRepository;
    @Mock TaskCategoryRepository      categoryRepository;
    @Mock BusinessRuleConfigRepository configRepository;
    @Mock EodLogLineRepository        logLineRepository;
    @Mock EodProjectApprovalRepository projectApprovalRepository;
    @Mock EodAttachmentService        attachmentService;
    @Mock NotificationService         notificationService;
    @Mock AuditLogRepository          auditLogRepository;
    @Mock AllocationRepository        allocationRepository;
    @Mock UtilizationService          utilizationService;
    @Mock LeadAccessService           leadAccessService;
    @Mock EodAccessPolicy             accessPolicy;

    private EodService service;

    private static final String EMAIL = "pm@example.com";

    private AppUser pm;
    private EodEntry entry;
    private TaskCategory category;
    private EodLogLine line;

    @BeforeEach
    void setUp() {
        service = new EodService(
                entryRepository, taskRepository, userRepository,
                null, categoryRepository, null,
                configRepository, null, null,
                attachmentService, notificationService,
                new ApprovalPieceRouter(), projectApprovalRepository,
                accessPolicy, leadAccessService,
                allocationRepository, auditLogRepository, logLineRepository);

        // Success-path tests reach attachmentService after validation; return empty maps.
        lenient().when(attachmentService.loadForEntries(any()))
                .thenReturn(new EodAttachmentService.AttachmentsByScope(java.util.Map.of(), java.util.Map.of()));

        pm = new AppUser();
        pm.setId(1L);
        pm.setRole(AppUser.Role.PM);
        pm.setFullName("PM User");
        pm.setEmail(EMAIL);

        category = new TaskCategory();
        category.setId(10L);
        category.setName("Management");
        category.setScope("MANAGEMENT");
        category.setActive(true);

        entry = new EodEntry();
        entry.setId(100L);
        entry.setEmployee(pm);
        entry.setEntryDate(LocalDate.of(2026, 10, 6));
        entry.setEntryForm(EodEntry.EntryForm.PLAIN_LOG);
        entry.setStatus(EodEntry.Status.DRAFT);
        entry.setCreatedAt(OffsetDateTime.now());
        entry.setDayType(EodEntry.DayType.WORKING_DAY);
        entry.setLogTotalHours(BigDecimal.valueOf(8));

        line = new EodLogLine();
        line.setEntry(entry);
        line.setCategory(category);
        line.setHours(BigDecimal.valueOf(8));
        line.setDescription("Management tasks");
        line.setSortOrder(0);

        BusinessRuleConfig config = new BusinessRuleConfig();
        config.setNonProjectAutoApproveHours(BigDecimal.valueOf(2));
        config.setWorkingHoursPerDay(BigDecimal.valueOf(8));

        lenient().when(userRepository.findByEmailAndDeletedAtIsNull(EMAIL)).thenReturn(Optional.of(pm));
        lenient().when(entryRepository.findWithDetailsById(100L)).thenReturn(Optional.of(entry));
        lenient().when(configRepository.findById(any())).thenReturn(Optional.of(config));
    }

    // ── workLocation ──────────────────────────────────────────────────────────────

    @Test
    void submit_working_day_with_lines_requires_work_location() {
        entry.setWorkLocation(null);
        entry.setNextDayPlan("Plan for tomorrow");
        when(logLineRepository.findByEntryIdOrderBySortOrderAscIdAsc(100L)).thenReturn(List.of(line));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.submit(100L, EMAIL));

        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getReason()).contains("Work location is required");
    }

    @Test
    void submit_working_day_no_work_location_required_when_no_lines() {
        // No log lines → leave-day path; workLocation not required (lines.isEmpty())
        entry.setWorkLocation(null);
        entry.setNextDayPlan(null);
        entry.setLogTotalHours(BigDecimal.ZERO); // explicit leave via legacy hours=0
        entry.setDayType(EodEntry.DayType.LEAVE);
        when(logLineRepository.findByEntryIdOrderBySortOrderAscIdAsc(100L)).thenReturn(List.of());

        EodProjectApproval piece = new EodProjectApproval();
        piece.setStatus(EodProjectApproval.Status.APPROVED);
        piece.setApproverType(EodProjectApproval.ApproverType.AUTO_APPROVED);
        piece.setEodEntry(entry);
        piece.setCreatedAt(OffsetDateTime.now());
        piece.setFrozenAt(OffsetDateTime.now());

        when(entryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(projectApprovalRepository.findByEodEntryId(any())).thenReturn(List.of(piece));

        // Should not throw — leave day with no lines skips field validation
        service.submit(100L, EMAIL);
    }

    // ── nextDayPlan ───────────────────────────────────────────────────────────────

    @Test
    void submit_working_day_with_lines_requires_next_day_plan() {
        entry.setWorkLocation("Office");
        entry.setNextDayPlan(null);
        when(logLineRepository.findByEntryIdOrderBySortOrderAscIdAsc(100L)).thenReturn(List.of(line));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.submit(100L, EMAIL));

        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getReason()).contains("Next-day plan is required");
    }

    @Test
    void submit_working_day_blank_next_day_plan_rejected() {
        entry.setWorkLocation("Remote");
        entry.setNextDayPlan("   ");
        when(logLineRepository.findByEntryIdOrderBySortOrderAscIdAsc(100L)).thenReturn(List.of(line));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.submit(100L, EMAIL));

        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getReason()).contains("Next-day plan is required");
    }

    // ── dayType exemptions ────────────────────────────────────────────────────────

    @Test
    void submit_leave_day_skips_work_location_and_plan() {
        entry.setDayType(EodEntry.DayType.LEAVE);
        entry.setWorkLocation(null);
        entry.setNextDayPlan(null);
        entry.setLogTotalHours(BigDecimal.ZERO);
        when(logLineRepository.findByEntryIdOrderBySortOrderAscIdAsc(100L)).thenReturn(List.of());

        EodProjectApproval piece = new EodProjectApproval();
        piece.setStatus(EodProjectApproval.Status.APPROVED);
        piece.setApproverType(EodProjectApproval.ApproverType.AUTO_APPROVED);
        piece.setEodEntry(entry);
        piece.setCreatedAt(OffsetDateTime.now());
        piece.setFrozenAt(OffsetDateTime.now());

        when(entryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(projectApprovalRepository.findByEodEntryId(any())).thenReturn(List.of(piece));

        // Should not throw
        service.submit(100L, EMAIL);
    }

    @Test
    void submit_holiday_skips_work_location_and_plan() {
        entry.setDayType(EodEntry.DayType.HOLIDAY);
        entry.setWorkLocation(null);
        entry.setNextDayPlan(null);
        entry.setLogTotalHours(BigDecimal.ZERO);
        when(logLineRepository.findByEntryIdOrderBySortOrderAscIdAsc(100L)).thenReturn(List.of());

        EodProjectApproval piece = new EodProjectApproval();
        piece.setStatus(EodProjectApproval.Status.APPROVED);
        piece.setApproverType(EodProjectApproval.ApproverType.AUTO_APPROVED);
        piece.setEodEntry(entry);
        piece.setCreatedAt(OffsetDateTime.now());
        piece.setFrozenAt(OffsetDateTime.now());

        when(entryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(projectApprovalRepository.findByEodEntryId(any())).thenReturn(List.of(piece));

        // Should not throw
        service.submit(100L, EMAIL);
    }

    @Test
    void submit_weekend_with_lines_skips_next_day_plan() {
        entry.setDayType(EodEntry.DayType.WEEKEND);
        entry.setWorkLocation(null); // weekend clears workLocation in saveDraft
        entry.setNextDayPlan(null);
        entry.setLogTotalHours(BigDecimal.valueOf(4));
        when(logLineRepository.findByEntryIdOrderBySortOrderAscIdAsc(100L)).thenReturn(List.of(line));

        AppUser manager = new AppUser();
        manager.setId(99L);
        pm.setManager(manager);

        EodProjectApproval piece = new EodProjectApproval();
        piece.setStatus(EodProjectApproval.Status.PENDING);
        piece.setApproverType(EodProjectApproval.ApproverType.REPORTING_MANAGER);
        piece.setApprover(manager);
        piece.setEodEntry(entry);
        piece.setCreatedAt(OffsetDateTime.now());
        piece.setFrozenAt(OffsetDateTime.now());

        when(entryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(projectApprovalRepository.findByEodEntryId(any())).thenReturn(List.of(piece));

        // Should not throw — weekend skips nextDayPlan and workLocation
        service.submit(100L, EMAIL);
    }

    // ── ApprovalPieceRouter leave detection via dayType ───────────────────────────

    @Test
    void router_leave_daytype_auto_approves() {
        ApprovalPieceRouter router = new ApprovalPieceRouter();
        EodEntry leaveEntry = new EodEntry();
        leaveEntry.setEmployee(pm);
        pm.setManager(null);
        leaveEntry.setEntryForm(EodEntry.EntryForm.PLAIN_LOG);
        leaveEntry.setDayType(EodEntry.DayType.LEAVE);
        leaveEntry.setLogTotalHours(BigDecimal.valueOf(8)); // non-zero so old check wouldn't trigger

        BusinessRuleConfig config = new BusinessRuleConfig();
        config.setNonProjectAutoApproveHours(BigDecimal.valueOf(2));

        var specs = router.route(leaveEntry, config);
        assertThat(specs).hasSize(1);
        assertThat(specs.get(0).approverType()).isEqualTo(EodProjectApproval.ApproverType.AUTO_APPROVED);
    }

    @Test
    void router_holiday_daytype_auto_approves() {
        ApprovalPieceRouter router = new ApprovalPieceRouter();
        EodEntry holidayEntry = new EodEntry();
        holidayEntry.setEmployee(pm);
        pm.setManager(null);
        holidayEntry.setEntryForm(EodEntry.EntryForm.PLAIN_LOG);
        holidayEntry.setDayType(EodEntry.DayType.HOLIDAY);
        holidayEntry.setLogTotalHours(BigDecimal.ZERO);

        BusinessRuleConfig config = new BusinessRuleConfig();
        config.setNonProjectAutoApproveHours(BigDecimal.valueOf(2));

        var specs = router.route(holidayEntry, config);
        assertThat(specs).hasSize(1);
        assertThat(specs.get(0).approverType()).isEqualTo(EodProjectApproval.ApproverType.AUTO_APPROVED);
    }
}
