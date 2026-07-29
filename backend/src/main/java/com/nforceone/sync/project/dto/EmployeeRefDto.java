package com.nforceone.sync.project.dto;

import com.nforceone.sync.auth.AppUser;

/**
 * An employee offered for allocation, carrying the percentage they are already
 * committed to today so the New Allocation form can show remaining headroom
 * before anything is submitted.
 */
public record EmployeeRefDto(
        Long id,
        String fullName,
        String employeeCode,
        Integer currentAllocationPct
) {
    public static EmployeeRefDto from(AppUser u, int currentAllocationPct) {
        return new EmployeeRefDto(u.getId(), u.getFullName(), u.getEmployeeCode(), currentAllocationPct);
    }
}
