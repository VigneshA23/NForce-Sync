package com.nforceone.sync.config;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.Map;

@Configuration
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @Bean
    public ObjectMapper objectMapper() {
        // Jackson 3 (Spring Boot 4): Java time support is built in; no JavaTimeModule needed.
        return JsonMapper.builder().build();
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleResponseStatus(ResponseStatusException ex) {
        String message = ex.getReason() != null ? ex.getReason() : ex.getStatusCode().toString();
        return ResponseEntity.status(ex.getStatusCode())
                .body(Map.of("error", message));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> fieldErrors = new HashMap<>();
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            fieldErrors.put(fe.getField(), fe.getDefaultMessage());
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(Map.of("error", "Validation failed", "fields", fieldErrors));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnreadableBody(HttpMessageNotReadableException ex) {
        String detail = ex.getMessage();
        String msg = (detail != null && detail.contains("not one of the values accepted for Enum class"))
                ? "Invalid role"
                : "Invalid request body";
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", msg));
    }

    // A @PreAuthorize denial throws AccessDeniedException from inside the controller method
    // invocation, which this @RestControllerAdvice would otherwise catch via the generic
    // handler below — bypassing SecurityConfig's accessDeniedHandler and turning every
    // authorization failure into a misleading 500. Handling it explicitly here, with the same
    // {"error":"Forbidden"} body SecurityConfig uses for filter-level denials, keeps every
    // authorization failure (method- or filter-level) consistent as a real 403.
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Forbidden"));
    }

    // Catch-all for anything that isn't an explicit ResponseStatusException/validation failure —
    // a DB constraint violation, a mapping bug, etc. Without this, such an exception falls through
    // to Spring Boot's default /error handling, which returns the same bare
    // {"error":"Internal Server Error"} with nothing in the response to diagnose it by. This logs
    // the full exception server-side (where it can actually be traced) while keeping the response
    // free of internal details such as SQL, table/column names, or stack traces.
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleUnexpected(Exception ex) {
        log.error("Unhandled exception while processing request", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "Something went wrong. Please try again or contact support."));
    }
}
