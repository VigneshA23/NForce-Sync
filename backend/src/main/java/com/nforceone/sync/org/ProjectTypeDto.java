package com.nforceone.sync.org;

/**
 * @param employeeCount distinct employees currently allocated to a project of this type. Passed in
 *                      rather than derived, so the list endpoint resolves every count in one
 *                      grouped query instead of one per row.
 */
public record ProjectTypeDto(
        Long id,
        String name,
        boolean requiresClient,
        boolean active,
        long employeeCount
) {
    public static ProjectTypeDto from(ProjectType t, long employeeCount) {
        return new ProjectTypeDto(t.getId(), t.getName(), t.isRequiresClient(),
                t.isActive(), employeeCount);
    }
}
