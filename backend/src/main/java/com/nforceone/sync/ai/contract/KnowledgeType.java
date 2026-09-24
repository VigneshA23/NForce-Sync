package com.nforceone.sync.ai.contract;

import java.util.Locale;
import java.util.Optional;

/** Classification of a knowledge unit. Mirrors OneHR's nine types. */
public enum KnowledgeType {
    FOUNDATION,
    ROLE,
    MODULE,
    PAGE,
    ACTION,
    WORKFLOW,
    ERROR,
    FAQ,
    TERM;

    public static Optional<KnowledgeType> fromCode(String code) {
        if (code == null || code.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(KnowledgeType.valueOf(code.trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
