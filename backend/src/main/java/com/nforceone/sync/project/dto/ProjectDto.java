package com.nforceone.sync.project.dto;

import com.nforceone.sync.project.Project;

public record ProjectDto(
        Long id,
        String code,
        String name,
        String client,
        /**
         * Whether a task row on this project may be marked billable. Computed here rather than
         * shipping projectType/billingModel separately, so the rule has exactly one definition
         * and the client cannot drift from what EodService enforces on save.
         *
         * A missing billing model counts the same as an inactive one — there is nothing to bill
         * against either way.
         */
        boolean billableAllowed
) {
    public static ProjectDto from(Project p) {
        return new ProjectDto(p.getId(), p.getCode(), p.getName(), p.getClient(), billableAllowed(p));
    }

    /**
     * Whether EOD time on this project may be flagged billable. Also called by EodService, which
     * forces {@code isBillable} to false when this returns false — so this is the single definition
     * of the rule.
     *
     * <p>Driven by the project type's {@code billableAllowed} flag (V51) rather than a hardcoded
     * "CLIENT", so a Super Admin renaming or adding a type cannot silently change billing.
     */
    public static boolean billableAllowed(Project p) {
        return p.getProjectType() != null
                && p.getProjectType().isBillableAllowed()
                && p.getBillingModel() != null
                && p.getBillingModel().isActive();
    }
}
