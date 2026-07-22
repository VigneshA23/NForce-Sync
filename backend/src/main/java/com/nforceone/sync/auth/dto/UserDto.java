package com.nforceone.sync.auth.dto;

import com.nforceone.sync.auth.AppUser;

public record UserDto(
        Long   id,
        String fullName,
        String email,
        String role,
        Long   employeeCode,
        String status
) {
    public static UserDto from(AppUser user) {
        return new UserDto(
                user.getId(),
                user.getFullName(),
                user.getEmail(),
                user.getRole().name(),
                user.getEmployeeCode(),
                user.getStatus().name()
        );
    }
}
