package com.nforceone.sync.approval2;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.project.Project;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Pure routing function — no DB writes. Takes a submitted entry and its tasks,
 * returns one ApprovalPieceSpec per piece to create.
 */
@Service
public class ApprovalPieceRouter {

    public List<ApprovalPieceSpec> route(EodEntry entry, BusinessRuleConfig config) {
        AppUser employee = entry.getEmployee();
        AppUser reportingManager = employee.getManager();

        if (entry.getEntryForm() == EodEntry.EntryForm.PLAIN_LOG) {
            boolean isLeave = entry.getLogTotalHours() != null
                    && entry.getLogTotalHours().compareTo(BigDecimal.ZERO) == 0;
            return List.of(plainLogPiece(reportingManager, isLeave));
        }

        return routeProjectGrouped(entry, employee, reportingManager, config);
    }

    private ApprovalPieceSpec plainLogPiece(AppUser reportingManager, boolean isLeave) {
        if (isLeave) {
            // Leave day: auto-approved immediately, no review needed.
            return new ApprovalPieceSpec(null, null,
                    EodProjectApproval.ApproverType.AUTO_APPROVED,
                    EodProjectApproval.Status.APPROVED);
        }
        if (reportingManager != null) {
            return new ApprovalPieceSpec(null, reportingManager,
                    EodProjectApproval.ApproverType.REPORTING_MANAGER,
                    EodProjectApproval.Status.PENDING);
        }
        return new ApprovalPieceSpec(null, null,
                EodProjectApproval.ApproverType.ADMIN_GROUP,
                EodProjectApproval.Status.PENDING);
    }

    private List<ApprovalPieceSpec> routeProjectGrouped(EodEntry entry, AppUser employee,
                                                          AppUser reportingManager,
                                                          BusinessRuleConfig config) {
        List<ApprovalPieceSpec> specs = new ArrayList<>();
        Map<Long, Project> projectsById = new LinkedHashMap<>();
        BigDecimal nonProjectHours = BigDecimal.ZERO;

        for (EodTask task : entry.getTasks()) {
            if (task.getProject() != null) {
                projectsById.putIfAbsent(task.getProject().getId(), task.getProject());
            } else {
                if (task.getHours() != null) {
                    nonProjectHours = nonProjectHours.add(task.getHours());
                }
            }
        }

        for (Project project : projectsById.values()) {
            specs.add(routeProjectPiece(project, employee, reportingManager));
        }

        if (nonProjectHours.compareTo(BigDecimal.ZERO) > 0) {
            specs.add(routeNonProjectPiece(nonProjectHours, reportingManager, config));
        }

        return specs;
    }

    private ApprovalPieceSpec routeProjectPiece(Project project, AppUser employee,
                                                  AppUser reportingManager) {
        AppUser lead = project.getLead();

        if (lead == null) {
            return new ApprovalPieceSpec(project, project.getPm(),
                    EodProjectApproval.ApproverType.PM,
                    EodProjectApproval.Status.PENDING);
        }

        if (lead.getId().equals(employee.getId())) {
            // Employee is the lead — route up to their RM
            return reportingManagerOrAdminGroup(project, reportingManager);
        }

        return new ApprovalPieceSpec(project, lead,
                EodProjectApproval.ApproverType.LEAD,
                EodProjectApproval.Status.PENDING);
    }

    private ApprovalPieceSpec routeNonProjectPiece(BigDecimal hours, AppUser reportingManager,
                                                     BusinessRuleConfig config) {
        BigDecimal threshold = config.getNonProjectAutoApproveHours();
        if (hours.compareTo(threshold) <= 0) {
            return new ApprovalPieceSpec(null, null,
                    EodProjectApproval.ApproverType.AUTO_APPROVED,
                    EodProjectApproval.Status.APPROVED);
        }
        return reportingManagerOrAdminGroup(null, reportingManager);
    }

    private ApprovalPieceSpec reportingManagerOrAdminGroup(Project project, AppUser reportingManager) {
        if (reportingManager != null) {
            return new ApprovalPieceSpec(project, reportingManager,
                    EodProjectApproval.ApproverType.REPORTING_MANAGER,
                    EodProjectApproval.Status.PENDING);
        }
        return new ApprovalPieceSpec(project, null,
                EodProjectApproval.ApproverType.ADMIN_GROUP,
                EodProjectApproval.Status.PENDING);
    }
}
