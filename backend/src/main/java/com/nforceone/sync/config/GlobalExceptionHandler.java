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

    /** The usual {"error": ...} plus the id of the Daily Log line that cannot be removed, so the form can mark it. */
    @ExceptionHandler(com.nforceone.sync.eod.BlockerLineLockedException.class)
    public ResponseEntity<Map<String, Object>> handleBlockerLineLocked(com.nforceone.sync.eod.BlockerLineLockedException ex) {
        return ResponseEntity.status(ex.getStatusCode())
                .body(Map.of("error", ex.getReason(), "lineId", ex.getLineId()));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleResponseStatus(ResponseStatusException ex) {
        String message = ex.getReason() != null ? ex.getReason() : ex.getStatusCode().toString();
        return ResponseEntity.status(ex.getStatusCode())
                .body(Map.of("error", message));
    }

    // A missing or malformed request parameter (e.g. an unparsable date or no `format` on a report
    // export) is the caller's mistake: a 400 that names the parameter, not the catch-all's generic 500.
    @ExceptionHandler(org.springframework.web.bind.MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, Object>> handleMissingParam(
            org.springframework.web.bind.MissingServletRequestParameterException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(Map.of("error", "Missing required parameter: " + ex.getParameterName()));
    }

    @ExceptionHandler(org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> handleParamTypeMismatch(
            org.springframework.web.method.annotation.MethodArgumentTypeMismatchException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(Map.of("error", "Invalid value for parameter '" + ex.getName() + "'"));
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
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", unreadableBodyMessage(ex)));
    }

    /**
     * The message for a request body that could not be read. A value that is not one of an enum's constants (a
     * task status, a day type, a role...) names the field and lists what is accepted — "Invalid status. Use
     * Completed, In Progress, Blocked or Not Started." — instead of the old blanket "Invalid role" that every enum
     * used to get. Anything else unreadable stays "Invalid request body".
     */
    static String unreadableBodyMessage(HttpMessageNotReadableException ex) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (t instanceof tools.jackson.databind.exc.InvalidFormatException ife
                    && ife.getTargetType() != null && ife.getTargetType().isEnum()) {
                return enumMessage(lastFieldOf(ife.getPathReference()), ife.getTargetType().getEnumConstants());
            }
            if (t.getCause() == t) break;
        }
        return "Invalid request body";
    }

    private static String enumMessage(String field, Object[] constants) {
        String noun = humanize(field == null || field.isBlank() ? "value" : field).toLowerCase()
                .replaceFirst("^task status$", "status");   // the request field is taskStatus; users call it Status
        java.util.List<String> labels = new java.util.ArrayList<>();
        for (Object c : constants) labels.add(valueLabel(((Enum<?>) c).name()));
        String list = labels.size() <= 1 ? String.join("", labels)
                : String.join(", ", labels.subList(0, labels.size() - 1)) + " or " + labels.get(labels.size() - 1);
        return "Invalid " + noun + ". Use " + list + ".";
    }

    /** The last quoted property in a Jackson path reference such as {@code Req["logLines"]->List[0]->Line["taskStatus"]}. */
    private static String lastFieldOf(String pathReference) {
        if (pathReference == null) return null;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\\[\"([^\"]+)\"\\]").matcher(pathReference);
        String last = null;
        while (m.find()) last = m.group(1);
        return last;
    }

    /** taskStatus -> "task status". */
    private static String humanize(String camel) {
        return camel.replaceAll("([a-z0-9])([A-Z])", "$1 $2");
    }

    /** IN_PROGRESS -> "In Progress"; a short code such as PM stays as it is. */
    private static String valueLabel(String constant) {
        if (constant.length() <= 3) return constant;
        StringBuilder sb = new StringBuilder();
        for (String word : constant.split("_")) {
            if (sb.length() > 0) sb.append(' ');
            sb.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1).toLowerCase());
        }
        return sb.toString();
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
