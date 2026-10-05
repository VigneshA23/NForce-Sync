package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.teamlead.LeadAccessService;
import org.springframework.stereotype.Component;

@Component
class EodAccessPolicy {

    private final LeadAccessService leadAccess;

    EodAccessPolicy(LeadAccessService leadAccess) {
        this.leadAccess = leadAccess;
    }

    boolean canRead(AppUser actor, EodEntry entry) {
        if (entry.getEmployee().getId().equals(actor.getId())) return true;
        if (actor.getRole() == AppUser.Role.SUPERADMIN) return true;
        if (actor.getRole() == AppUser.Role.ADMIN)      return true;
        if (actor.getRole() == AppUser.Role.PM)         return true;
        return leadAccess.isInLeadTeam(entry.getEmployee().getId(), actor.getId());
    }
}
