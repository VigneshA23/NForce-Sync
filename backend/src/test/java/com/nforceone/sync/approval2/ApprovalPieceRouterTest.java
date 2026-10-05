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

class ApprovalPieceRouterTest {

    private final ApprovalPieceRouter router = new ApprovalPieceRouter();

    private AppUser employee;
    private AppUser manager;
    private BusinessRuleConfig config;

    @BeforeEach
    void setUp() {
        manager = new AppUser();
        manager.setId(10L);
        manager.setFullName("Reporting Manager");

        employee = new AppUser();
        employee.setId(1L);
        employee.setFullName("Employee");
        employee.setRole(AppUser.Role.PM);

        config = new BusinessRuleConfig();
        config.setNonProjectAutoApproveHours(BigDecimal.valueOf(2));
    }

    // ── PLAIN_LOG routing ──────────────────────────────────────────────────────

    @Test
    void plain_log_with_reporting_manager_routes_to_rm() {
        employee.setManager(manager);
        EodEntry entry = plainLogEntry(employee, BigDecimal.valueOf(8));

        List<ApprovalPieceSpec> specs = router.route(entry, config);

        assertEquals(1, specs.size());
        ApprovalPieceSpec spec = specs.get(0);
        assertEquals(EodProjectApproval.ApproverType.REPORTING_MANAGER, spec.approverType());
        assertEquals(manager.getId(), spec.approver().getId());
        assertEquals(EodProjectApproval.Status.PENDING, spec.status());
    }

    @Test
    void plain_log_without_reporting_manager_routes_to_admin_group() {
        employee.setManager(null);
        EodEntry entry = plainLogEntry(employee, BigDecimal.valueOf(8));

        List<ApprovalPieceSpec> specs = router.route(entry, config);

        assertEquals(1, specs.size());
        ApprovalPieceSpec spec = specs.get(0);
        assertEquals(EodProjectApproval.ApproverType.ADMIN_GROUP, spec.approverType());
        assertNull(spec.approver());
        assertEquals(EodProjectApproval.Status.PENDING, spec.status());
    }

    @Test
    void plain_log_hours_zero_routes_to_auto_approved() {
        employee.setManager(manager);
        EodEntry entry = plainLogEntry(employee, BigDecimal.ZERO);

        List<ApprovalPieceSpec> specs = router.route(entry, config);

        assertEquals(1, specs.size());
        ApprovalPieceSpec spec = specs.get(0);
        assertEquals(EodProjectApproval.ApproverType.AUTO_APPROVED, spec.approverType());
        assertEquals(EodProjectApproval.Status.APPROVED, spec.status());
        assertNull(spec.approver());
    }

    // ── PROJECT_GROUPED routing ────────────────────────────────────────────────

    @Test
    void project_task_routes_to_project_lead() {
        AppUser lead = new AppUser();
        lead.setId(20L);

        Project project = new Project();
        project.setId(100L);
        project.setLead(lead);

        employee.setManager(manager);
        EodEntry entry = projectEntry(employee, project, BigDecimal.valueOf(4));

        List<ApprovalPieceSpec> specs = router.route(entry, config);

        assertEquals(1, specs.size());
        ApprovalPieceSpec spec = specs.get(0);
        assertEquals(EodProjectApproval.ApproverType.LEAD, spec.approverType());
        assertEquals(lead.getId(), spec.approver().getId());
    }

    @Test
    void project_task_when_lead_is_employee_routes_to_rm() {
        // Employee is the lead — escalates to their RM.
        Project project = new Project();
        project.setId(100L);
        project.setLead(employee);

        employee.setManager(manager);
        EodEntry entry = projectEntry(employee, project, BigDecimal.valueOf(4));

        List<ApprovalPieceSpec> specs = router.route(entry, config);

        assertEquals(1, specs.size());
        ApprovalPieceSpec spec = specs.get(0);
        assertEquals(EodProjectApproval.ApproverType.REPORTING_MANAGER, spec.approverType());
        assertEquals(manager.getId(), spec.approver().getId());
    }

    @Test
    void project_task_with_no_lead_routes_to_pm() {
        AppUser pm = new AppUser();
        pm.setId(30L);

        Project project = new Project();
        project.setId(100L);
        project.setLead(null);
        project.setPm(pm);

        EodEntry entry = projectEntry(employee, project, BigDecimal.valueOf(4));

        List<ApprovalPieceSpec> specs = router.route(entry, config);

        assertEquals(1, specs.size());
        ApprovalPieceSpec spec = specs.get(0);
        assertEquals(EodProjectApproval.ApproverType.PM, spec.approverType());
        assertEquals(pm.getId(), spec.approver().getId());
    }

    @Test
    void non_project_hours_below_threshold_auto_approved() {
        config.setNonProjectAutoApproveHours(BigDecimal.valueOf(2));
        EodEntry entry = projectEntry(employee, null, BigDecimal.valueOf(1));

        List<ApprovalPieceSpec> specs = router.route(entry, config);

        assertEquals(1, specs.size());
        assertEquals(EodProjectApproval.ApproverType.AUTO_APPROVED, specs.get(0).approverType());
    }

    @Test
    void non_project_hours_above_threshold_routes_to_rm() {
        config.setNonProjectAutoApproveHours(BigDecimal.valueOf(2));
        employee.setManager(manager);
        EodEntry entry = projectEntry(employee, null, BigDecimal.valueOf(3));

        List<ApprovalPieceSpec> specs = router.route(entry, config);

        assertEquals(1, specs.size());
        ApprovalPieceSpec spec = specs.get(0);
        assertEquals(EodProjectApproval.ApproverType.REPORTING_MANAGER, spec.approverType());
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private static EodEntry plainLogEntry(AppUser employee, BigDecimal hours) {
        EodEntry entry = new EodEntry();
        entry.setEmployee(employee);
        entry.setEntryForm(EodEntry.EntryForm.PLAIN_LOG);
        entry.setLogTotalHours(hours);
        return entry;
    }

    private static EodEntry projectEntry(AppUser employee, Project project, BigDecimal hours) {
        EodTask task = new EodTask();
        task.setProject(project);
        task.setHours(hours);

        EodEntry entry = new EodEntry();
        entry.setEmployee(employee);
        entry.setEntryForm(EodEntry.EntryForm.PROJECT_GROUPED);
        entry.getTasks().add(task);
        return entry;
    }
}
