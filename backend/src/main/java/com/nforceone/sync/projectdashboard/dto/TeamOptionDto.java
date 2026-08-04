package com.nforceone.sync.projectdashboard.dto;

/** A "team" is every employee reporting to the same manager — there is no dedicated Team entity. */
public record TeamOptionDto(Long managerId, String managerName) {}
