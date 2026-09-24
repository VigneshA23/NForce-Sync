package com.nforceone.sync.ai.contract;

import com.nforceone.sync.auth.AppUser;

import java.util.Set;

/**
 * One role-variant of a page in the authoritative registry. A single {@code pageId} (e.g.
 * "dashboard") has one {@link PageReference} per role whose route/label/placeholder-status
 * differs for that role — mirroring how {@code nav.ts} and {@code App.tsx} are actually organised.
 */
public record PageReference(
        String pageId,
        String module,
        Set<AppUser.Role> roles,
        String label,
        String route,
        String description,
        boolean placeholder
) {
}
