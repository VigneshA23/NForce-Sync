package com.nforceone.sync.org;

public record DesignationDto(Long id, String title, boolean active) {
    public static DesignationDto from(Designation d) {
        return new DesignationDto(d.getId(), d.getTitle(), d.isActive());
    }
}
