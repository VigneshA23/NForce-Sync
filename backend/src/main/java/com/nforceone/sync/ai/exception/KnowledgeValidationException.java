package com.nforceone.sync.ai.exception;

import java.util.List;

/**
 * Thrown by {@code KnowledgeSchemaValidator} when one or more authored knowledge units fail
 * validation. Carries every problem found (not just the first), so a reindex reports the whole
 * list of things to fix in one pass.
 */
public class KnowledgeValidationException extends RuntimeException {

    private final List<String> problems;

    public KnowledgeValidationException(List<String> problems) {
        super(problems.size() + " knowledge validation problem(s): " + String.join("; ", problems));
        this.problems = List.copyOf(problems);
    }

    public List<String> getProblems() {
        return problems;
    }
}
