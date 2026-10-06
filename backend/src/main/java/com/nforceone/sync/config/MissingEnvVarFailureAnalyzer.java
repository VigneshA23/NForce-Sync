package com.nforceone.sync.config;

import org.springframework.boot.diagnostics.AbstractFailureAnalyzer;
import org.springframework.boot.diagnostics.FailureAnalysis;
import org.springframework.util.PlaceholderResolutionException;

public class MissingEnvVarFailureAnalyzer extends AbstractFailureAnalyzer<PlaceholderResolutionException> {

    private static final String REQUIRED = String.join("\n",
            "  SPRING_DATASOURCE_URL      — JDBC URL  (jdbc:postgresql://host/db?sslmode=require)",
            "  SPRING_DATASOURCE_USERNAME — DB username",
            "  SPRING_DATASOURCE_PASSWORD — DB password",
            "  JWT_SECRET                 — HS256 signing secret (minimum 32 characters)"
    );

    @Override
    protected FailureAnalysis analyze(Throwable rootFailure, PlaceholderResolutionException cause) {
        String missing = extractVarName(cause);
        return new FailureAnalysis(
                "Missing required environment variable: " + missing,
                "Set all required environment variables:\n\n" +
                REQUIRED + "\n\n" +
                "For LOCAL DEVELOPMENT — copy the example file and fill in your values:\n" +
                "  cp src/main/resources/application-local.yml.example \\\n" +
                "     src/main/resources/application-local.yml\n\n" +
                "For RAILWAY / PRODUCTION — add the variables in the Railway dashboard → Variables tab.",
                cause
        );
    }

    private String extractVarName(PlaceholderResolutionException e) {
        String msg = e.getMessage();
        if (msg == null) return "unknown";
        int start = msg.indexOf('\'') + 1;
        int end = msg.indexOf('\'', start);
        return (start > 0 && end > start) ? msg.substring(start, end) : "unknown";
    }
}
