package com.nforceone.sync.approval2;

import com.nforceone.sync.approval2.dto.ApprovalPieceDto;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.eod.dto.EodLogLineDto;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.TaskCategory;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies that TaskLineDto includes the task description field and that
 * PLAIN_LOG field mapping (logSummary, logNotes, logLines, workLocation,
 * nextDayPlan, remarks) is complete.
 */
class ApprovalPieceDescriptionTest {

    // ── helpers ───────────────────────────────────────────────────────────────

    private static AppUser employee() {
        AppUser u = new AppUser();
        u.setId(1L);
        u.setRole(AppUser.Role.EMPLOYEE);
        u.setFullName("Test User");
        u.setEmployeeCode("NF-TEST01");
        return u;
    }

    private static EodProjectApproval projectPiece(EodEntry entry, AppUser approver,
                                                    EodProjectApproval.ApproverType type) {
        EodProjectApproval p = new EodProjectApproval();
        p.setId(100L);
        p.setApprover(approver);
        p.setApproverType(type);
        p.setStatus(EodProjectApproval.Status.PENDING);
        p.setFrozenAt(OffsetDateTime.of(2026, 10, 1, 9, 0, 0, 0, ZoneOffset.UTC));
        p.setCreatedAt(p.getFrozenAt());
        p.setEodEntry(entry);
        return p;
    }

    private static EodEntry plainLogEntry() {
        EodEntry e = new EodEntry();
        e.setId(200L);
        e.setEmployee(employee());
        e.setEntryDate(LocalDate.of(2026, 10, 1));
        e.setEntryForm(EodEntry.EntryForm.PLAIN_LOG);
        e.setStatus(EodEntry.Status.SUBMITTED);
        e.setLogSummary("Managed scope and sprint planning");
        e.setLogTotalHours(BigDecimal.valueOf(8));
        e.setLogNotes("No blockers today");
        e.setNextDayPlan("Continue sprint review");
        e.setRemarks("Late start due to all-hands");
        e.setWorkLocation("HOME");
        return e;
    }

    private static EodEntry projectGroupedEntry() {
        EodEntry e = new EodEntry();
        e.setId(300L);
        e.setEmployee(employee());
        e.setEntryDate(LocalDate.of(2026, 10, 1));
        e.setEntryForm(EodEntry.EntryForm.PROJECT_GROUPED);
        e.setStatus(EodEntry.Status.SUBMITTED);
        return e;
    }

    private static EodTask task(EodEntry entry, String code, String projectName,
                                String category, BigDecimal hours, String description) {
        Project proj = new Project();
        proj.setId(10L);
        proj.setCode(code);
        proj.setName(projectName);

        TaskCategory cat = new TaskCategory();
        cat.setName(category);

        EodTask t = new EodTask();
        t.setId(500L);
        t.setEodEntry(entry);
        t.setProject(proj);
        t.setTaskCategory(cat);
        t.setHours(hours);
        t.setDescription(description);
        return t;
    }

    // ── (1) taskLinesFor — description is included ────────────────────────────

    @Test
    void taskLinesFor_includesDescription() {
        EodEntry entry = projectGroupedEntry();
        EodTask t = task(entry, "NSYNC", "NForce Sync", "Development", BigDecimal.valueOf(4), "Implemented approval API");

        List<ApprovalPieceDto.TaskLineDto> lines = ApprovalPieceDto.taskLinesFor(List.of(t), 10L);

        assertThat(lines).hasSize(1);
        assertThat(lines.get(0).description()).isEqualTo("Implemented approval API");
    }

    @Test
    void taskLinesFor_nullDescription_returnsNull() {
        EodEntry entry = projectGroupedEntry();
        EodTask t = task(entry, "NSYNC", "NForce Sync", "Review", BigDecimal.valueOf(2), null);

        List<ApprovalPieceDto.TaskLineDto> lines = ApprovalPieceDto.taskLinesFor(List.of(t), 10L);

        assertThat(lines).hasSize(1);
        assertThat(lines.get(0).description()).isNull();
    }

    @Test
    void taskLinesFor_setsProjectCodeCategoryHours() {
        EodEntry entry = projectGroupedEntry();
        EodTask t = task(entry, "NSYNC", "NForce Sync", "Planning", BigDecimal.valueOf(3.5), "Sprint planning");

        List<ApprovalPieceDto.TaskLineDto> lines = ApprovalPieceDto.taskLinesFor(List.of(t), 10L);

        ApprovalPieceDto.TaskLineDto line = lines.get(0);
        assertThat(line.projectCode()).isEqualTo("NSYNC");
        assertThat(line.projectName()).isEqualTo("NForce Sync");
        assertThat(line.categoryName()).isEqualTo("Planning");
        assertThat(line.hours()).isEqualByComparingTo(BigDecimal.valueOf(3.5));
        assertThat(line.description()).isEqualTo("Sprint planning");
    }

    // ── (2) PLAIN_LOG from() — all fields mapped ──────────────────────────────

    @Test
    void from_plainLog_mapsAllLogFields() {
        EodEntry entry = plainLogEntry();
        AppUser approver = employee();
        approver.setId(2L);
        EodProjectApproval piece = projectPiece(entry, approver,
                EodProjectApproval.ApproverType.REPORTING_MANAGER);

        ApprovalPieceDto dto = ApprovalPieceDto.from(piece, List.of());

        assertThat(dto.entryForm()).isEqualTo("PLAIN_LOG");
        assertThat(dto.logSummary()).isEqualTo("Managed scope and sprint planning");
        assertThat(dto.logTotalHours()).isEqualByComparingTo(BigDecimal.valueOf(8));
        assertThat(dto.logNotes()).isEqualTo("No blockers today");
        assertThat(dto.nextDayPlan()).isEqualTo("Continue sprint review");
        assertThat(dto.remarks()).isEqualTo("Late start due to all-hands");
        assertThat(dto.workLocation()).isEqualTo("HOME");
        assertThat(dto.taskLines()).isEmpty(); // PLAIN_LOG never has task lines
    }

    @Test
    void from_plainLog_withLogLines_preservesThem() {
        EodEntry entry = plainLogEntry();
        AppUser approver = employee();
        approver.setId(2L);
        EodProjectApproval piece = projectPiece(entry, approver,
                EodProjectApproval.ApproverType.REPORTING_MANAGER);

        // Simulate two V110 log line DTOs (id, categoryId, categoryName, hours, description, sortOrder)
        EodLogLineDto ln1 = new EodLogLineDto(null, null, "Development", BigDecimal.valueOf(4), "Feature work", 0);
        EodLogLineDto ln2 = new EodLogLineDto(null, null, "Review",      BigDecimal.valueOf(2), "Code review",  1);

        ApprovalPieceDto dto = ApprovalPieceDto.from(piece, List.of(ln1, ln2));

        assertThat(dto.logLines()).hasSize(2);
        assertThat(dto.logLines().get(0).categoryName()).isEqualTo("Development");
        assertThat(dto.logLines().get(0).description()).isEqualTo("Feature work");
        assertThat(dto.logLines().get(1).categoryName()).isEqualTo("Review");
    }

    @Test
    void from_projectGrouped_logFieldsAreNull() {
        EodEntry entry = projectGroupedEntry();
        AppUser approver = employee();
        approver.setId(2L);

        Project proj = new Project();
        proj.setId(10L);
        proj.setName("NForce Sync");

        EodProjectApproval piece = projectPiece(entry, approver,
                EodProjectApproval.ApproverType.LEAD);
        piece.setProject(proj);

        ApprovalPieceDto dto = ApprovalPieceDto.from(piece, List.of());

        assertThat(dto.entryForm()).isEqualTo("PROJECT_GROUPED");
        assertThat(dto.logSummary()).isNull();
        assertThat(dto.logTotalHours()).isNull();
        assertThat(dto.logNotes()).isNull();
        assertThat(dto.nextDayPlan()).isNull();
        assertThat(dto.remarks()).isNull();
        assertThat(dto.workLocation()).isNull();
        assertThat(dto.logLines()).isEmpty();
    }
}
