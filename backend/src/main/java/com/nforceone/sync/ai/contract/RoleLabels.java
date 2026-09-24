package com.nforceone.sync.ai.contract;

import com.nforceone.sync.auth.AppUser;

import java.util.Map;

/**
 * Human-readable labels for {@link AppUser.Role}, used in prompts ("Signed-in user: Team Lead")
 * and in the page registry. Sync has a single-role model (unlike OneHR's audience-bucket split),
 * so this is the only role-label mapping the AI module needs.
 *
 * <p><b>Must stay in sync with two frontend sources of truth</b>, both parity-tested by
 * {@code RoleLabelsParityTest}:
 * <ul>
 *   <li>{@code frontend/src/api/auth.ts} {@code BACKEND_ROLE_MAP} — backend role to UI role key
 *       (confirms MANAGER maps to the UI's "Team Lead").</li>
 *   <li>{@code frontend/src/lib/nav.ts} {@code ROLE_LABELS} — UI role key to display label.</li>
 * </ul>
 */
public final class RoleLabels {

    private static final Map<AppUser.Role, String> LABELS = Map.of(
            AppUser.Role.EMPLOYEE, "Employee",
            AppUser.Role.MANAGER, "Team Lead",
            AppUser.Role.PM, "Project Manager",
            AppUser.Role.DM, "Delivery Manager",
            AppUser.Role.FINANCE, "Finance Admin",
            AppUser.Role.LEADERSHIP, "Leadership Viewer",
            AppUser.Role.ADMIN, "Admin",
            AppUser.Role.SUPERADMIN, "Super Admin"
    );

    private RoleLabels() {
    }

    public static String label(AppUser.Role role) {
        return LABELS.getOrDefault(role, role.name());
    }
}
