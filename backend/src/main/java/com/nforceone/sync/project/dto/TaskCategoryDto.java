package com.nforceone.sync.project.dto;

import com.nforceone.sync.project.TaskCategory;

public record TaskCategoryDto(Long id, String name, Boolean isProductive, Boolean active, String scope) {
    public static TaskCategoryDto from(TaskCategory c) {
        return new TaskCategoryDto(c.getId(), c.getName(), c.getIsProductive(), c.getActive(), c.getScope());
    }
}
