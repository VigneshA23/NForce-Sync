package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.project.PmScopeService;
import com.nforceone.sync.reporting.ReportingScopeService;
import com.nforceone.sync.teamlead.LeadAccessService;
import org.springframework.stereotype.Component;

@Component
public class EodAccessPolicy {

    private final LeadAccessService leadAccess;
    private final ReportingScopeService reportingScope;

    EodAccessPolicy(LeadAccessService leadAccess, ReportingScopeService reportingScope) {
        this.leadAccess = leadAccess;
        this.reportingScope = reportingScope;
    }

    // ── My Reporting Team > Reports ────────────────────────────────────────────────────────────

    /**
     * May this user open My Reporting Team > Reports at all? Derived from data, never from a role: yes when
     * at least one ACTIVE person reports directly to him (the same definition as the sidebar flag).
     */
    public boolean mayViewReportingTeamReports(AppUser actor) {
        return reportingScope.hasDirectReports(actor.getId());
    }

    /**
     * The employees the actor may list in My Reporting Team > Reports: his current ACTIVE direct reports,
     * plus anyone who has entries in the range whose frozen manager snapshot is the actor (a former report,
     * whose history stays with him). Never himself; empty when he has no direct reports.
     *
     * @param snapshotEmployeeIds employees of the entries found for the actor by the manager snapshot
     */
    public java.util.Set<Long> reportingTeamReportRoster(AppUser actor, java.util.Collection<Long> snapshotEmployeeIds) {
        if (!mayViewReportingTeamReports(actor)) return java.util.Set.of();
        java.util.Set<Long> roster = new java.util.LinkedHashSet<>(reportingScope.directReportIds(actor.getId()));
        roster.addAll(snapshotEmployeeIds);
        roster.remove(actor.getId());
        return roster;
    }

    /** How much of an entry the actor may see. LEAD_SCOPED = only the tasks on projects he leads. */
    enum AccessLevel { NONE, FULL, LEAD_SCOPED }

    boolean canRead(AppUser actor, EodEntry entry) {
        return accessLevel(actor, entry) != AccessLevel.NONE;
    }

    /**
     * May the actor open this attachment? Anyone who can read the entry in full, yes. A lead who reads it
     * only in his own scope may open attachments of tasks on projects he leads (or with no project) — not
     * another lead's, even if he has been handed the attachment id.
     */
    boolean canReadAttachment(AppUser actor, EodAttachment attachment) {
        AccessLevel level = accessLevel(actor, attachment.getEodEntry());
        if (level == AccessLevel.NONE) return false;
        if (level == AccessLevel.FULL) return true;
        EodTask task = attachment.getTask();
        if (task == null || task.getProject() == null) return true;
        return leadAccess.ledProjectIds(actor.getId()).contains(task.getProject().getId());
    }

    AccessLevel accessLevel(AppUser actor, EodEntry entry) {
        if (entry.getEmployee().getId().equals(actor.getId())) return AccessLevel.FULL;
        if (actor.getRole() == AppUser.Role.SUPERADMIN) return AccessLevel.FULL;
        if (actor.getRole() == AppUser.Role.ADMIN) return AccessLevel.FULL;

        if (entry.getEntryForm() == EodEntry.EntryForm.PLAIN_LOG) {
            // Decision 7: plain-log read = owner + RM + reporting tree + Admin + SuperAdmin.
            // PM does not get blanket access — plain logs are not project-scoped.
            return reportingScope.subtreeUserIds(actor.getId()).contains(entry.getEmployee().getId())
                    ? AccessLevel.FULL : AccessLevel.NONE;
        }

        // PROJECT_GROUPED: a PM reads an entry only when it has a task on a project he is PM of (the one
        // PM scope, PmScopeService) — not any entry in the org by id — and the entry's frozen reporting
        // manager sees his report's whole day.
        if (PmScopeService.canReadEntryAsPm(actor, entry)) return AccessLevel.FULL;
        if (entry.getManagerId() != null && entry.getManagerId().equals(actor.getId())) return AccessLevel.FULL;

        // A Team Lead reads an entry only when it has a task on a project he leads or a piece he
        // approves — being allocated to one of his projects is not enough to read a day spent on
        // someone else's. What he sees is scoped to his own projects (see EodEntryDto#scopedToProjects).
        return leadAccess.canReadEntryAsLead(actor.getId(), entry) ? AccessLevel.LEAD_SCOPED : AccessLevel.NONE;
    }
}
