package com.nforceone.sync.ai.eval;

import java.util.List;

/** One fixture from ai-eval/questions.yaml. */
record EvalQuestion(
        String id,
        String role,
        String question,
        String category,
        Expectation expect,
        String why
) {
    record Expectation(
            List<String> type,
            String navigation,
            List<String> knowledge,
            List<String> mustMention,
            List<String> mustMentionAny,
            List<String> mustNotMention
    ) {
    }
}
