package com.nforceone.sync.org;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateBillingModelRequest(
        @NotBlank @Size(max = 200) String name
) {}
