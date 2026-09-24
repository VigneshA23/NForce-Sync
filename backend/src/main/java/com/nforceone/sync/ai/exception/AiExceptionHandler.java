package com.nforceone.sync.ai.exception;

import com.nforceone.sync.ai.contract.AssistantResponse;
import com.nforceone.sync.ai.contract.AssistantResponseType;
import com.nforceone.sync.ai.contract.ConfidenceLevel;
import com.nforceone.sync.ai.controller.AiAssistantController;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Exception mapping scoped to {@link AiAssistantController} only — {@code assignableTypes}
 * guarantees it never changes how any other Sync endpoint behaves.
 *
 * <p>This exists because of a documented, repo-specific hazard (see backend/CLAUDE.md's
 * "Debugging gotchas"): an exception that escapes a controller method and is forwarded to
 * Spring Boot's default {@code /error} handling can surface as a bare {@code 401
 * {"error":"Unauthorized"}}, indistinguishable from a real auth failure. In Sync's frontend
 * (client.ts), ANY non-login 401 clears the session and hard-redirects to {@code /login}. A user
 * would be signed out of the entire application because they asked the chatbot a question that
 * happened to hit a bug — unacceptable, so nothing from this controller may ever reach {@code /error}.
 *
 * <p>Two layers of defense, both required:
 * <ol>
 *   <li>{@link AiAssistantController#chat} wraps its own orchestration call in a
 *       {@code catch (Throwable)} and returns a controlled {@link AssistantResponse} directly —
 *       the primary defense, since it never leaves the method frame at all.</li>
 *   <li>This advice is the second line: anything that still escapes (e.g. from admin endpoints,
 *       or an exception thrown during argument resolution before the controller body runs) is
 *       caught here and always gets a real JSON body, never a bare status forwarded to
 *       {@code /error}.</li>
 * </ol>
 *
 * <p>The single deliberate exception to "always 200" is {@link AiRateLimitExceededException},
 * which the rate-limiting requirement asks to be a distinguishable, conventional status with
 * retry information — a real {@code 429} with a JSON body, which (per the same client.ts
 * interceptor) does not trip the 401 session-kill guard.
 *
 * <p><b>Why {@link ResponseStatusException} has its own handler here, not just the catch-all:</b>
 * this advice is scoped to {@link AiAssistantController} specifically, and Spring resolves
 * {@code @ExceptionHandler}s by first narrowing to advice beans applicable to the controller,
 * then picking the best match <i>within</i> that bean — so this class's own {@code Exception.class}
 * catch-all would shadow {@code GlobalExceptionHandler}'s {@code ResponseStatusException} handler
 * for every endpoint in this controller, not just {@code /chat}. That is correct for {@code /chat}
 * (which always wants HTTP 200 with a controlled body — see its own try/catch), but wrong for
 * {@code /conversations/*} and {@code /feedback}, which throw a plain
 * {@code ResponseStatusException} (e.g. 401 "User not found") and must get the same
 * {@code {"error": reason}} shape and real status code every other Sync endpoint gets. Mirroring
 * that handling here, rather than falling through, keeps it correct without duplicating it badly.
 */
@RestControllerAdvice(assignableTypes = AiAssistantController.class)
public class AiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(AiExceptionHandler.class);

    @ExceptionHandler(AiRateLimitExceededException.class)
    public ResponseEntity<Map<String, Object>> handleRateLimit(AiRateLimitExceededException ex) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "You have reached the AI Assistant usage limit. Please try again shortly.");
        body.put("code", AiRateLimitExceededException.CODE);
        body.put("retryAfterSeconds", ex.getRetryAfterSeconds());
        body.put("retryAt", ex.getRetryAt().toString());
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(ex.getRetryAfterSeconds()))
                .body(body);
    }

    // Mirrors GlobalExceptionHandler's ResponseStatusException handling exactly — see class
    // javadoc for why this controller needs its own copy rather than falling through to it.
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleResponseStatus(ResponseStatusException ex) {
        String message = ex.getReason() != null ? ex.getReason() : ex.getStatusCode().toString();
        return ResponseEntity.status(ex.getStatusCode()).body(Map.of("error", message));
    }

    // Defensive only — no endpoint in this controller accepts an ActionRequest, so this can only
    // be reached by a future wiring mistake, not by any client input. See ai/action/package-info.
    @ExceptionHandler(ActionExecutionDisabledException.class)
    public ResponseEntity<Map<String, Object>> handleActionDisabled(ActionExecutionDisabledException ex) {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED)
                .body(Map.of("error", "The assistant cannot perform actions."));
    }

    // Last resort for anything genuinely unexpected that still reaches here (see class javadoc).
    // Always HTTP 200 with a controlled UNKNOWN body — never a bare status, never 401/403/500.
    @ExceptionHandler(Exception.class)
    public ResponseEntity<AssistantResponse> handleUnexpected(Exception ex) {
        log.error("Unhandled exception in AI assistant request", ex);
        AssistantResponse response = new AssistantResponse(
                AssistantResponseType.UNKNOWN,
                "The assistant ran into a problem and could not answer that. Please try again in a moment.",
                null, null, null, ConfidenceLevel.LOW, null, null);
        return ResponseEntity.ok(response);
    }
}
