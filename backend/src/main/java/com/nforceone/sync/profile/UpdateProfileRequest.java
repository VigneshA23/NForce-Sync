package com.nforceone.sync.profile;

import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        @Size(max = 30)  String phone,
        @Size(max = 200) String emergencyContactName,
        @Size(max = 30)  String emergencyContactPhone,
        @Size(max = 50)  String workMode,
        @Size(max = 200) String personalEmail,
        @Size(max = 50)  String gender,
                         String dateOfBirth,
                         String address
) {}
