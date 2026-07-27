package com.nforceone.sync.org;

public record OrgLocationDto(Long id, String name, boolean active) {
    public static OrgLocationDto from(OrgLocation l) {
        return new OrgLocationDto(l.getId(), l.getName(), l.isActive());
    }
}
