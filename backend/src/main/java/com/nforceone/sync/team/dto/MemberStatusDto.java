package com.nforceone.sync.team.dto;

public record MemberStatusDto(
        Long   id,
        String fullName,
        Long   employeeCode,
        String todayStatus   // SUBMITTED | APPROVED | DRAFT | REJECTED | CHANGES_REQUESTED | MISSING
) {}
