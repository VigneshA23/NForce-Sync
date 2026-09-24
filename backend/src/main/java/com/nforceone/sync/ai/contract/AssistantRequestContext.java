package com.nforceone.sync.ai.contract;

import com.nforceone.sync.auth.AppUser;

/**
 * Authoritative per-turn context, rebuilt from the database on every request. Nothing here is
 * ever accepted from the client — {@code userId}, {@code email} and {@code role} come from the
 * JWT-authenticated {@link com.nforceone.sync.auth.AppUser} row, and {@code currentPageId} /
 * {@code currentModule} are set only after {@link com.nforceone.sync.ai.navigation.NavigationValidator}
 * confirms the client-supplied page hint is real and reachable by this role.
 *
 * <p>Sync has a single-role model, so unlike OneHR there is no separate "audience bucket set" vs
 * "shell role" split — {@code role} alone gates both knowledge retrieval and navigation.
 */
public record AssistantRequestContext(
        Long userId,
        String email,
        AppUser.Role role,
        String roleLabel,
        String currentPageId,
        String currentModule
) {
    public AssistantRequestContext {
        if (userId == null || email == null || role == null) {
            throw new IllegalArgumentException("userId, email and role are required");
        }
    }

    public AssistantRequestContext withCurrentPage(String pageId, String module) {
        return new AssistantRequestContext(userId, email, role, roleLabel, pageId, module);
    }
}
