package com.nforceone.sync.search;

import java.util.List;

public record SearchResultDto(List<UserResult> users, List<ProjectResult> projects) {

    public record UserResult(Long id, String fullName, String email, String role, String employeeCode) {}

    public record ProjectResult(Long id, String code, String name, String status) {}
}
