package com.nforceone.sync.org;

public record DepartmentDto(Long id, String name, boolean active) {
    public static DepartmentDto from(Department d) {
        return new DepartmentDto(d.getId(), d.getName(), d.isActive());
    }
}
