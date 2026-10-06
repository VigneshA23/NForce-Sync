package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.reporting.ReportingScopeService;
import com.nforceone.sync.teamlead.LeadAccessService;
import org.springframework.stereotype.Component;

@Component
class EodAccessPolicy {

    private final LeadAccessService leadAccess;
    private final ReportingScopeService reportingScope;

    EodAccessPolicy(LeadAccessService leadAccess, ReportingScopeService reportingScope) {
        this.leadAccess = leadAccess;
        this.reportingScope = reportingScope;
    }

    boolean canRead(AppUser actor, EodEntry entry) {
        if (entry.getEmployee().getId().equals(actor.getId())) return true;
        if (actor.getRole() == AppUser.Role.SUPERADMIN) return true;
        if (actor.getRole() == AppUser.Role.ADMIN) return true;

        if (entry.getEntryForm() == EodEntry.EntryForm.PLAIN_LOG) {
            // Decision 7: plain-log read = owner + RM + reporting tree + Admin + SuperAdmin.
            // PM does not get blanket access — plain logs are not project-scoped.
            return reportingScope.subtreeUserIds(actor.getId())
                    .contains(entry.getEmployee().getId());
        }

        // PROJECT_GROUPED: PM sees all (project-scoped access validated at service layer),
        // lead sees their allocated team members.
        if (actor.getRole() == AppUser.Role.PM) return true;
        return leadAccess.isInLeadTeam(entry.getEmployee().getId(), actor.getId());
    }
}
