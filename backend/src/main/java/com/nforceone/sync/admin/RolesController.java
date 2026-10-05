package com.nforceone.sync.admin;

import com.nforceone.sync.admin.dto.RoleInfoDto;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

// Role metadata is part of Admin's role-management responsibility now.
@RestController
@RequestMapping("/api/roles")
@PreAuthorize("hasRole('ADMIN')")
public class RolesController {

    private static final List<RoleInfoDto> ROLES = List.of(
            new RoleInfoDto("EMPLOYEE",   "Employee",        "Standard employee — own profile, timesheets, and leave.",                  false),
            new RoleInfoDto("PM",         "Project Manager", "Project and milestone oversight.",                                         false),
            new RoleInfoDto("ADMIN",      "Admin",           "User administration — manages accounts, roles, and access.",               false),
            new RoleInfoDto("SUPERADMIN", "Super Admin",     "System-wide operational oversight — monitoring and cross-team visibility.", false)
    );

    @GetMapping
    public List<RoleInfoDto> getRoles() {
        return ROLES;
    }
}
