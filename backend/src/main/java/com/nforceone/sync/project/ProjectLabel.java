package com.nforceone.sync.project;

/**
 * The one display label for a project: "{code} — {name}", as in the project pickers elsewhere in the app. Kept in one
 * place so every list that names a project (Team Utilization's rows, its Project filter, ...) spells it the same way
 * and a filter option can be matched to a row by plain string equality.
 */
public final class ProjectLabel {

    private ProjectLabel() {}

    public static String of(Project project) {
        return of(project.getCode(), project.getName());
    }

    public static String of(String code, String name) {
        boolean hasCode = code != null && !code.isBlank();
        boolean hasName = name != null && !name.isBlank();
        if (hasCode && hasName) return code + " — " + name;
        if (hasName) return name;
        return hasCode ? code : "";
    }
}
