package com.nforceone.sync.ai.action;

/** Metadata describing one input an {@link ActionDefinition} would take, once actions exist. */
public record ActionParameter(
        String name,
        String type,
        String description,
        boolean required,
        String validationRule
) {
}
