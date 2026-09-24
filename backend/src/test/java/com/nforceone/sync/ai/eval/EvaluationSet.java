package com.nforceone.sync.ai.eval;

import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Loads and parses {@code ai-eval/questions.yaml} from the test classpath. */
final class EvaluationSet {

    private EvaluationSet() {
    }

    @SuppressWarnings("unchecked")
    static List<EvalQuestion> load() {
        Map<String, Object> root;
        try (InputStream in = EvaluationSet.class.getClassLoader().getResourceAsStream("ai-eval/questions.yaml")) {
            if (in == null) {
                throw new IllegalStateException("ai-eval/questions.yaml not found on the test classpath");
            }
            root = (Map<String, Object>) new Yaml().load(in);
        } catch (IOException e) {
            throw new IllegalStateException("failed to read ai-eval/questions.yaml", e);
        }

        List<Map<String, Object>> rawQuestions = (List<Map<String, Object>>) root.get("questions");
        List<EvalQuestion> questions = new ArrayList<>();
        for (Map<String, Object> q : rawQuestions) {
            questions.add(parseQuestion(q));
        }
        return questions;
    }

    @SuppressWarnings("unchecked")
    private static EvalQuestion parseQuestion(Map<String, Object> q) {
        Map<String, Object> expectMap = (Map<String, Object>) q.get("expect");
        EvalQuestion.Expectation expect = new EvalQuestion.Expectation(
                stringList(expectMap.get("type")),
                stringOf(expectMap.get("navigation")),
                stringList(expectMap.get("knowledge")),
                stringList(expectMap.get("mustMention")),
                stringList(expectMap.get("mustMentionAny")),
                stringList(expectMap.get("mustNotMention")));

        return new EvalQuestion(
                stringOf(q.get("id")),
                stringOf(q.get("role")),
                stringOf(q.get("question")),
                stringOf(q.get("category")),
                expect,
                stringOf(q.get("why")));
    }

    private static List<String> stringList(Object raw) {
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        List<String> result = new ArrayList<>(list.size());
        for (Object item : list) {
            if (item != null) {
                result.add(item.toString());
            }
        }
        return result;
    }

    private static String stringOf(Object value) {
        return value == null ? null : value.toString();
    }
}
