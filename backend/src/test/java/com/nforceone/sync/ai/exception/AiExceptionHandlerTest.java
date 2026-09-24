package com.nforceone.sync.ai.exception;

import com.nforceone.sync.ai.contract.AssistantResponse;
import com.nforceone.sync.ai.contract.AssistantResponseType;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Unit-level check of {@link AiExceptionHandler}'s mapping logic (direct method invocation, matching the style of Sync's other handler tests). */
class AiExceptionHandlerTest {

    private final AiExceptionHandler handler = new AiExceptionHandler();

    @Test
    void rateLimitReturns429WithRetryAfterHeaderAndCode() {
        AiRateLimitExceededException ex = new AiRateLimitExceededException(37);

        ResponseEntity<Map<String, Object>> response = handler.handleRateLimit(ex);

        assertEquals(HttpStatus.TOO_MANY_REQUESTS, response.getStatusCode());
        assertEquals("37", response.getHeaders().getFirst(HttpHeaders.RETRY_AFTER));
        assertEquals(AiRateLimitExceededException.CODE, response.getBody().get("code"));
        assertEquals(37L, response.getBody().get("retryAfterSeconds"));
        assertNotNull(response.getBody().get("retryAt"));
        assertNotNull(response.getBody().get("error"));
    }

    @Test
    void rateLimitFloorsRetryAfterAtOneSecond() {
        AiRateLimitExceededException ex = new AiRateLimitExceededException(0);
        ResponseEntity<Map<String, Object>> response = handler.handleRateLimit(ex);
        assertEquals("1", response.getHeaders().getFirst(HttpHeaders.RETRY_AFTER));
    }

    @Test
    void actionDisabledReturns501() {
        ResponseEntity<Map<String, Object>> response =
                handler.handleActionDisabled(new ActionExecutionDisabledException("nope"));
        assertEquals(HttpStatus.NOT_IMPLEMENTED, response.getStatusCode());
        assertNotNull(response.getBody().get("error"));
    }

    @Test
    void responseStatusExceptionMirrorsGlobalExceptionHandlersShape() {
        // /conversations/*, /clear and /feedback throw a plain ResponseStatusException (e.g. 401
        // "User not found") and must get the exact same {"error": reason} shape and real status
        // code as every other Sync endpoint — see the class javadoc for why this can't just fall
        // through to GlobalExceptionHandler.
        ResponseEntity<Map<String, Object>> response =
                handler.handleResponseStatus(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));

        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
        assertEquals("User not found", response.getBody().get("error"));
        assertEquals(1, response.getBody().size(), "must not carry the AssistantResponse shape");
    }

    @Test
    void unexpectedExceptionReturns200WithControlledUnknownBody() {
        // The whole point of this handler: an unexpected failure must never surface as a bare
        // 401/403/500 that would trigger the frontend's session-kill-on-401 interceptor.
        ResponseEntity<AssistantResponse> response = handler.handleUnexpected(new RuntimeException("boom"));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals(AssistantResponseType.UNKNOWN, response.getBody().type());
        assertNotNull(response.getBody().answer());
        assertFalse(response.getBody().answer().isBlank());
    }
}
