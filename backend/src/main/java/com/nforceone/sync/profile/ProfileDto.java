package com.nforceone.sync.profile;

import com.nforceone.sync.auth.AppUser;
import java.time.LocalDate;
import java.time.OffsetDateTime;

public record ProfileDto(
        Long id,
        String fullName,
        String email,
        String role,
        String employeeCode,
        String status,
        // HR-controlled (read-only)
        Long   managerId,
        String managerName,
        Long   departmentId,
        String departmentName,
        Long   designationId,
        String designationName,
        Long   locationId,
        String locationName,
        String employmentType,
        String workMode,
        LocalDate joiningDate,
        OffsetDateTime createdAt,
        // Self-service (editable)
        String phone,
        String emergencyContactName,
        String emergencyContactPhone
) {
    public static ProfileDto from(AppUser u,
                                   String managerName,
                                   String departmentName,
                                   String designationName,
                                   String locationName) {
        return new ProfileDto(
                u.getId(),
                u.getFullName(),
                u.getEmail(),
                u.getRole().name(),
                u.getEmployeeCode(),
                u.getStatus().name(),
                u.getManager() != null ? u.getManager().getId() : null,
                managerName,
                u.getDepartmentId(),
                departmentName,
                u.getDesignationId(),
                designationName,
                u.getLocationId(),
                locationName,
                u.getEmploymentType(),
                u.getWorkMode(),
                u.getJoiningDate(),
                u.getCreatedAt(),
                u.getPhone(),
                u.getEmergencyContactName(),
                u.getEmergencyContactPhone()
        );
    }
}
