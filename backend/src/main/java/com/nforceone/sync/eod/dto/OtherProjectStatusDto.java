package com.nforceone.sync.eod.dto;

/**
 * Read-only context on a Team Lead's card: another project's decision on the same split EOD
 * (e.g. "ARENA: REJECTED"). Project name and status only — never task details.
 */
public record OtherProjectStatusDto(String projectName, String status) {}
