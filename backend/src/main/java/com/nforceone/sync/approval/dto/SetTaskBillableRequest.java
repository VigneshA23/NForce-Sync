package com.nforceone.sync.approval.dto;

import jakarta.validation.constraints.NotNull;

public record SetTaskBillableRequest(@NotNull Boolean isBillable) {}
