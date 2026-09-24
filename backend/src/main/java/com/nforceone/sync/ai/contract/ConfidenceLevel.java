package com.nforceone.sync.ai.contract;

import java.util.Locale;
import java.util.Optional;

public enum ConfidenceLevel {
    HIGH,
    MEDIUM,
    LOW;

    public static Optional<ConfidenceLevel> fromCode(String code) {
        if (code == null || code.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(ConfidenceLevel.valueOf(code.trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
