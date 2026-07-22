package com.nforceone.sync.admin;

import com.nforceone.sync.admin.dto.RoleInfoDto;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/roles")
@PreAuthorize("hasRole('SUPERADMIN')")
public class RolesController {

    private static final List<RoleInfoDto> ROLES = List.of(
            new RoleInfoDto("EMPLOYEE",   "Employee",        "Standard employee — own profile, timesheets, and leave.",                  false),
            new RoleInfoDto("MANAGER",    "Manager",         "Team management and approval authority.",                                  false),
            new RoleInfoDto("HR",         "HR",              "Human Resources — user onboarding and HR data access.",                    false),
            new RoleInfoDto("SUPERADMIN", "Super Admin",     "Full system access — manages all users, roles, and configuration.",        false),
            new RoleInfoDto("PM",         "Project Manager", "Project and milestone oversight.",                                         false),
            new RoleInfoDto("DM",         "Department Manager", "Department-level oversight and reporting.",                             false),
            new RoleInfoDto("FINANCE",    "Finance",         "Financial data and reports access.",                                       false),
            new RoleInfoDto("LEADERSHIP", "Leadership",      "Executive read-only visibility across all areas.",                         true)
    );

    @GetMapping
    public List<RoleInfoDto> getRoles() {
        return ROLES;
    }
}
