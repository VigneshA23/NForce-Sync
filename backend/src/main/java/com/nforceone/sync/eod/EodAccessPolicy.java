package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;

/**
 * Shared read-access rule for an EOD entry (and, by extension, its tasks and attachments) — the
 * employee who owns it, or a manager-tier role. Extracted out of EodService so
 * EodAttachmentService enforces the exact same policy rather than keeping a second copy that
 * could drift; EodService.canReadEntry delegates here too.
 */
final class EodAccessPolicy {
    private EodAccessPolicy() {}

    static boolean canRead(AppUser actor, EodEntry entry) {
        if (entry.getEmployee().getId().equals(actor.getId())) return true;
        return actor.getRole() == AppUser.Role.MANAGER
            || actor.getRole() == AppUser.Role.SUPERADMIN
            || actor.getRole() == AppUser.Role.DM
            || actor.getRole() == AppUser.Role.LEADERSHIP
            || actor.getRole() == AppUser.Role.PM;
    }
}
