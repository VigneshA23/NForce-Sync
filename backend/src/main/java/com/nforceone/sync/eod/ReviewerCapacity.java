package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.project.PmScopeService;
import com.nforceone.sync.project.Project;

import java.util.Collection;
import java.util.Objects;

/**
 * The capacity in which someone speaks on an entry or blocker, for the label shown beside his name in a
 * conversation: "Team Lead" (leads a project the item is on), "Reporting Manager" (the entry's frozen
 * manager), "Project Manager" (PM of one of its projects), otherwise his account role. Wording is the same on
 * the reviewer and the employee side; the employee-facing UI addresses the group as "your reviewer".
 */
public final class ReviewerCapacity {
    private ReviewerCapacity() {}

    public static final String EMPLOYEE = "Employee";
    public static final String TEAM_LEAD = "Team Lead";
    public static final String REPORTING_MANAGER = "Reporting Manager";
    public static final String PROJECT_MANAGER = "Project Manager";

    public static String label(AppUser sender, EodEntry entry, Collection<Project> projects) {
        if (sender.getId().equals(entry.getEmployee().getId())) return EMPLOYEE;
        if (projects.stream().filter(Objects::nonNull)
                .anyMatch(p -> p.getLead() != null && p.getLead().getId().equals(sender.getId()))) return TEAM_LEAD;
        if (sender.getId().equals(entry.getManagerId())) return REPORTING_MANAGER;
        if (projects.stream().anyMatch(p -> PmScopeService.isPmOf(sender, p))) return PROJECT_MANAGER;
        return accountRoleLabel(sender);
    }

    public static String accountRoleLabel(AppUser u) {
        return switch (u.getRole()) {
            case SUPERADMIN -> "Super Admin";
            case ADMIN -> "Admin";
            case PM -> "Project Manager";
            default -> "Reviewer";
        };
    }
}
