package com.nforceone.sync.ai.contract;

import java.util.Locale;
import java.util.Optional;

/** The backend-owned response type contract. Mirrors OneHR's five answer shapes plus UNKNOWN. */
public enum AssistantResponseType {
    HOW_TO,
    EXPLANATION,
    NAVIGATION,
    TROUBLESHOOTING,
    PERMISSION,
    UNKNOWN;

    public static Optional<AssistantResponseType> fromCode(String code) {
        if (code == null || code.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(AssistantResponseType.valueOf(code.trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
