package com.nforceone.sync.reports;

/**
 * Labels for an entry that carries no project. Kept together (and mirrored by the frontend's lib/projectLabels.ts)
 * so the two spellings are easy to unify later.
 */
public final class ProjectLabels {

    /** My EOD History > Project column. Rendered by the frontend; listed here so both spellings live side by side. */
    public static final String NO_PROJECT_ASSIGNED = "No project assigned";

    /** Reporting Manager > Reports > EOD by employee — the on-screen rows and the Excel / PDF / CSV exports. */
    public static final String NO_PROJECTS_ASSIGNED = "No Projects Assigned";

    private ProjectLabels() {}
}
