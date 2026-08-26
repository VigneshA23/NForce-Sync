package com.nforceone.sync.project.dto;

import com.nforceone.sync.auth.AppUser;

/**
 * An employee offered for allocation.
 *
 * <p>The reporting manager rides along because a project is only allocatable to an employee when
 * its Team Lead IS that manager — the allocation form filters its Project list on exactly this.
 * {@code managerName} is display-only, for naming the manager when no project qualifies. Both are
 * nullable: {@link AppUser#getManager()} is.
 */
public record EmployeeRefDto(Long id, String fullName, String employeeCode,
                             Long managerId, String managerName) {
    public static EmployeeRefDto from(AppUser u) {
        AppUser manager = u.getManager();
        return new EmployeeRefDto(u.getId(), u.getFullName(), u.getEmployeeCode(),
                manager != null ? manager.getId() : null,
                manager != null ? manager.getFullName() : null);
    }
}
