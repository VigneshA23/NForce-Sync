package com.nforceone.sync.ai.contract;

import com.nforceone.sync.auth.AppUser;

import java.util.Set;

/**
 * Authoritative per-turn context, rebuilt from the database on every request. Nothing here is
 * ever accepted from the client — {@code userId}, {@code email} and {@code role} come from the
 * JWT-authenticated {@link com.nforceone.sync.auth.AppUser} row, and {@code currentPageId} /
 * {@code currentModule} are set only after {@link com.nforceone.sync.ai.navigation.NavigationValidator}
 * confirms the client-supplied page hint is real and reachable by this role.
 *
 * <p>{@code capabilities} carries runtime-derived permission tokens (e.g. {@code "LEADS_PROJECT"})
 * that do not map 1-to-1 to roles — an EMPLOYEE who leads a project holds LEADS_PROJECT, giving
 * them access to the same team-oriented providers that a MANAGER-role user received before that
 * role was removed. The set is derived from live DB data (project.lead_id) on every request.
 */
public record AssistantRequestContext(
        Long userId,
        String email,
        AppUser.Role role,
        String roleLabel,
        String currentPageId,
        String currentModule,
        Set<String> capabilities
) {
    public AssistantRequestContext {
        if (userId == null || email == null || role == null) {
            throw new IllegalArgumentException("userId, email and role are required");
        }
        capabilities = capabilities != null ? Set.copyOf(capabilities) : Set.of();
    }

    public AssistantRequestContext withCurrentPage(String pageId, String module) {
        return new AssistantRequestContext(userId, email, role, roleLabel, pageId, module, capabilities);
    }
}
