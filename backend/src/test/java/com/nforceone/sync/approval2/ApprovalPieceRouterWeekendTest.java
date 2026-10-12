package com.nforceone.sync.approval2;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.project.Project;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** A no-work weekend must auto-approve (never sit SUBMITTED with no approver); real work must not. */
class ApprovalPieceRouterWeekendTest {

    private final ApprovalPieceRouter router = new ApprovalPieceRouter();
    private AppUser employee;
    private AppUser manager;
    private BusinessRuleConfig config;

    @BeforeEach
    void setUp() {
        manager = new AppUser();
        manager.setId(10L);
        employee = new AppUser();
        employee.setId(1L);
        employee.setManager(manager);
        config = new BusinessRuleConfig();
        config.setNonProjectAutoApproveHours(BigDecimal.valueOf(2));
    }

    private EodEntry weekend(EodEntry.EntryForm form, boolean worked) {
        EodEntry e = new EodEntry();
        e.setEmployee(employee);
        e.setEntryForm(form);
        e.setDayType(EodEntry.DayType.WEEKEND);
        e.setWeekendWorked(worked);
        return e;
    }

    @Test
    void projectGrouped_noWorkWeekend_isOneAutoApprovedPiece() {
        List<ApprovalPieceSpec> specs = router.route(weekend(EodEntry.EntryForm.PROJECT_GROUPED, false), config);
        assertEquals(1, specs.size());
        assertEquals(EodProjectApproval.ApproverType.AUTO_APPROVED, specs.get(0).approverType());
        assertEquals(EodProjectApproval.Status.APPROVED, specs.get(0).status());
    }

    @Test
    void projectGrouped_workedWeekend_routesToProjectApprover() {
        Project p = new Project();
        p.setId(5L);
        AppUser pm = new AppUser();
        pm.setId(7L);
        p.setPm(pm);
        EodEntry e = weekend(EodEntry.EntryForm.PROJECT_GROUPED, true);
        EodTask t = new EodTask();
        t.setProject(p);
        t.setHours(BigDecimal.valueOf(3));
        e.getTasks().add(t);

        List<ApprovalPieceSpec> specs = router.route(e, config);
        assertEquals(1, specs.size());
        assertEquals(EodProjectApproval.Status.PENDING, specs.get(0).status());
    }

    @Test
    void plainLog_noWorkWeekend_autoApproves() {
        EodEntry e = weekend(EodEntry.EntryForm.PLAIN_LOG, false);
        e.setLogTotalHours(null);
        List<ApprovalPieceSpec> specs = router.route(e, config);
        assertEquals(EodProjectApproval.ApproverType.AUTO_APPROVED, specs.get(0).approverType());
    }

    @Test
    void plainLog_weekendWithHours_stillGoesToReportingManager_evenBeforeBackfill() {
        EodEntry e = weekend(EodEntry.EntryForm.PLAIN_LOG, false); // old row: flag still false
        e.setLogTotalHours(BigDecimal.valueOf(3));
        List<ApprovalPieceSpec> specs = router.route(e, config);
        assertEquals(EodProjectApproval.ApproverType.REPORTING_MANAGER, specs.get(0).approverType());
        assertEquals(EodProjectApproval.Status.PENDING, specs.get(0).status());
    }
}
