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
        boolean active,
        boolean hasEmployeeRecord,
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
        LocalDate joiningDate,
        OffsetDateTime createdAt,
        // Self-service (editable)
        String workMode,
        String phone,
        String dateOfBirth,
        String gender,
        String personalEmail,
        String address,
        String emergencyContactName,
        String emergencyContactPhone,
        String photoDataUrl
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
                u.getStatus() == AppUser.Status.ACTIVE,
                u.getEmployeeCode() != null,
                u.getManager() != null ? u.getManager().getId() : null,
                managerName,
                u.getDepartmentId(),
                departmentName,
                u.getDesignationId(),
                designationName,
                u.getLocationId(),
                locationName,
                u.getEmploymentType(),
                u.getJoiningDate(),
                u.getCreatedAt(),
                u.getWorkMode(),
                u.getPhone(),
                u.getDateOfBirth() != null ? u.getDateOfBirth().toString() : null,
                u.getGender(),
                u.getPersonalEmail(),
                u.getAddress(),
                u.getEmergencyContactName(),
                u.getEmergencyContactPhone(),
                u.getPhotoData()
        );
    }
}
