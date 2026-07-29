package com.nforceone.sync.project.dto;

import com.nforceone.sync.auth.AppUser;

/** An employee offered for allocation. */
public record EmployeeRefDto(Long id, String fullName, String employeeCode) {
    public static EmployeeRefDto from(AppUser u) {
        return new EmployeeRefDto(u.getId(), u.getFullName(), u.getEmployeeCode());
    }
}
