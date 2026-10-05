package com.nforceone.sync.ai.contract;

import com.nforceone.sync.auth.AppUser;

import java.util.Map;

public final class RoleLabels {

    private static final Map<AppUser.Role, String> LABELS = Map.of(
            AppUser.Role.EMPLOYEE,   "Employee",
            AppUser.Role.PM,         "Project Manager",
            AppUser.Role.ADMIN,      "Admin",
            AppUser.Role.SUPERADMIN, "Super Admin"
    );

    private RoleLabels() {
    }

    public static String label(AppUser.Role role) {
        return LABELS.getOrDefault(role, role.name());
    }
}
