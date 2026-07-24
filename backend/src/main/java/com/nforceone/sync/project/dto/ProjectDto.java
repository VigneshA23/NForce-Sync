package com.nforceone.sync.project.dto;

import com.nforceone.sync.project.Project;

public record ProjectDto(Long id, String code, String name, String client) {
    public static ProjectDto from(Project p) {
        return new ProjectDto(p.getId(), p.getCode(), p.getName(), p.getClient());
    }
}
