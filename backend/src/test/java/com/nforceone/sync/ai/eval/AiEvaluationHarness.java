package com.nforceone.sync.ai.eval;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Live evaluation over real HTTP against a running Sync backend, real logins, and real Mistral
 * calls — costs money, so it is skipped unless credentials are supplied. It <b>reports</b> a
 * scorecard rather than asserting: answers are model output, and the same question can pass then
 * fail without a line of code changing, so this never fails the build.
 *
 * <pre>
 * AI_EVAL_BASE_URL=http://localhost:8080 \
 * AI_EVAL_EMPLOYEE=employee@nforceone.com:ChangeMe123! \
 * AI_EVAL_MANAGER=teamlead@nforceone.com:ChangeMe123! \
 * AI_EVAL_PM=projectmanager@nforceone.com:ChangeMe123! \
 * AI_EVAL_ADMIN=useradmin@nforceone.com:ChangeMe123! \
 * AI_EVAL_SUPERADMIN=superadmin@nforceone.com:ChangeMe123! \
 *   mvn test -Dtest=AiEvaluationHarness -DfailIfNoSpecifiedTests=false
 * </pre>
 *
 * It goes over HTTP and logs in with real credentials rather than constructing a context, so JWT
 * auth, the role lookup, retrieval and navigation authorisation are all exercised exactly as a
 * browser would — matching OneHR's equivalent harness design.
 *
 * <p><b>Never runs as part of a plain {@code mvn test}</b>, on two independent layers: this
 * class's name doesn't match Surefire's default discovery pattern (Surefire only auto-runs
 * {@code *Test}/{@code *Tests}/{@code Test*}/{@code *TestCase}, so a full test run never even
 * discovers {@code AiEvaluationHarness} — confirmed empirically, not just by convention), and even
 * when run explicitly by name (as the {@code -Dtest=AiEvaluationHarness} command above does), the
 * {@link Assumptions#assumeTrue} calls abort it immediately if the env vars aren't set.
 */
@Tag("ai-eval")
class AiEvaluationHarness {

    @Test
    void runEvaluationSet() throws Exception {
        String baseUrl = System.getenv("AI_EVAL_BASE_URL");
        assumeTrue(baseUrl != null && !baseUrl.isBlank(), "AI_EVAL_BASE_URL not set — skipping live evaluation");

        Map<String, String> credentialsByRole = new HashMap<>();
        for (String role : List.of("EMPLOYEE", "MANAGER", "PM", "DM", "FINANCE", "LEADERSHIP", "ADMIN", "SUPERADMIN")) {
            String cred = System.getenv("AI_EVAL_" + role);
            if (cred != null && !cred.isBlank()) {
                credentialsByRole.put(role, cred);
            }
        }
        assumeTrue(!credentialsByRole.isEmpty(), "no AI_EVAL_<ROLE> credentials set — skipping live evaluation");

        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        JsonMapper mapper = JsonMapper.builder().build();
        Map<String, String> tokenByRole = new HashMap<>();

        List<EvalQuestion> questions = EvaluationSet.load();
        int total = 0;
        int passed = 0;
        List<String> failures = new ArrayList<>();
        List<String> skipped = new ArrayList<>();

        for (EvalQuestion question : questions) {
            String credential = credentialsByRole.get(question.role());
            if (credential == null) {
                skipped.add(question.id() + " (no test user for role " + question.role() + ")");
                continue;
            }
            total++;

            String token = tokenByRole.computeIfAbsent(question.role(),
                    role -> login(client, mapper, baseUrl, credential));
            if (token == null) {
                failures.add(question.id() + ": login failed for role " + question.role());
                continue;
            }

            JsonNode response;
            try {
                response = chat(client, mapper, baseUrl, token, question.question());
            } catch (Exception e) {
                failures.add(question.id() + ": chat call failed — " + e.getMessage());
                continue;
            }

            List<String> problems = judge(question, response);
            if (problems.isEmpty()) {
                passed++;
            } else {
                failures.add(question.id() + ": " + String.join("; ", problems)
                        + " [question=\"" + question.question() + "\"]");
            }
        }

        System.out.println("=".repeat(70));
        System.out.println("AI EVALUATION SCORECARD: " + passed + " / " + total + " passed"
                + (skipped.isEmpty() ? "" : " (" + skipped.size() + " skipped, no test user for that role)"));
        System.out.println("=".repeat(70));
        for (String failure : failures) {
            System.out.println("FAIL  " + failure);
        }
        for (String s : skipped) {
            System.out.println("SKIP  " + s);
        }
        System.out.println("=".repeat(70));
        // Deliberately no assertion — see class javadoc.
    }

    private static String login(HttpClient client, JsonMapper mapper, String baseUrl, String credential) {
        try {
            String[] parts = credential.split(":", 2);
            String body = mapper.writeValueAsString(Map.of("email", parts[0], "password", parts[1]));
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/api/auth/login"))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                return null;
            }
            return mapper.readTree(response.body()).path("token").asString(null);
        } catch (Exception e) {
            return null;
        }
    }

    private static JsonNode chat(HttpClient client, JsonMapper mapper, String baseUrl, String token, String question)
            throws Exception {
        String body = mapper.writeValueAsString(Map.of("message", question));
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/ai-assistant/chat"))
                .timeout(Duration.ofSeconds(60))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + token)
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IllegalStateException("HTTP " + response.statusCode() + ": " + response.body());
        }
        return mapper.readTree(response.body());
    }

    private static List<String> judge(EvalQuestion question, JsonNode response) {
        List<String> problems = new ArrayList<>();
        EvalQuestion.Expectation expect = question.expect();

        String actualType = response.path("type").asString("");
        if (!expect.type().isEmpty() && !expect.type().contains(actualType)) {
            problems.add("type was " + actualType + ", expected one of " + expect.type());
        }

        JsonNode navNode = response.path("navigation");
        String actualPageId = navNode.isObject() ? navNode.path("pageId").asString(null) : null;
        if ("none".equals(expect.navigation())) {
            if (actualPageId != null) {
                problems.add("expected no navigation, got pageId " + actualPageId);
            }
        } else if (expect.navigation() != null) {
            if (!expect.navigation().equals(actualPageId)) {
                problems.add("expected navigation " + expect.navigation() + ", got " + actualPageId);
            }
        }

        String answer = response.path("answer").asString("").toLowerCase(Locale.ROOT);
        for (String must : expect.mustMention()) {
            if (!answer.contains(must.toLowerCase(Locale.ROOT))) {
                problems.add("answer did not mention \"" + must + "\"");
            }
        }
        if (!expect.mustMentionAny().isEmpty()
                && expect.mustMentionAny().stream().noneMatch(s -> answer.contains(s.toLowerCase(Locale.ROOT)))) {
            problems.add("answer mentioned none of " + expect.mustMentionAny());
        }
        for (String mustNot : expect.mustNotMention()) {
            if (answer.contains(mustNot.toLowerCase(Locale.ROOT))) {
                problems.add("answer wrongly mentioned \"" + mustNot + "\"");
            }
        }

        return problems;
    }
}
