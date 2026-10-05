package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.teamlead.LeadAccessService;
import org.springframework.stereotype.Component;

/**
 * Shared read-access rule for an EOD entry (and, by extension, its tasks and attachments) — the
 * employee who owns it, a manager-tier role, or any user who leads a project the entry's
 * employee is actively allocated to. Extracted out of EodService so EodAttachmentService enforces
 * the exact same policy rather than keeping a second copy that could drift; EodService.canReadEntry
 * delegates here too.
 */
@Component
class EodAccessPolicy {

    private final LeadAccessService leadAccess;

    EodAccessPolicy(LeadAccessService leadAccess) {
        this.leadAccess = leadAccess;
    }

    boolean canRead(AppUser actor, EodEntry entry) {
        if (entry.getEmployee().getId().equals(actor.getId())) return true;
        if (actor.getRole() == AppUser.Role.MANAGER)    return true;
        if (actor.getRole() == AppUser.Role.SUPERADMIN) return true;
        if (actor.getRole() == AppUser.Role.DM)         return true;
        if (actor.getRole() == AppUser.Role.LEADERSHIP) return true;
        if (actor.getRole() == AppUser.Role.PM)         return true;
        return leadAccess.isInLeadTeam(entry.getEmployee().getId(), actor.getId());
    }
}
