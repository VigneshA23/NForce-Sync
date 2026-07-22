package com.nforceone.sync.admin.dto;

public record RoleInfoDto(
        String key,
        String displayName,
        String description,
        boolean isReadOnly
) {}
