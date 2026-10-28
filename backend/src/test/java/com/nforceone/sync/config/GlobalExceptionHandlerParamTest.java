package com.nforceone.sync.config;

import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.time.LocalDate;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** A bad or missing request parameter (e.g. an export's `format` or a malformed date) is a clear 400, not a generic 500. */
class GlobalExceptionHandlerParamTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void missingParameter_is400NamingTheParameter() {
        ResponseEntity<Map<String, Object>> response = handler.handleMissingParam(
                new MissingServletRequestParameterException("format", "String"));

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("Missing required parameter: format", response.getBody().get("error"));
    }

    @Test
    void malformedParameter_is400NamingTheParameter() throws Exception {
        MethodParameter parameter = new MethodParameter(
                GlobalExceptionHandlerParamTest.class.getDeclaredMethod("endpoint", LocalDate.class), 0);
        ResponseEntity<Map<String, Object>> response = handler.handleParamTypeMismatch(
                new MethodArgumentTypeMismatchException("31-10-2026", LocalDate.class, "from", parameter, null));

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("Invalid value for parameter 'from'", response.getBody().get("error"));
    }

    @SuppressWarnings("unused")
    private void endpoint(LocalDate from) {
    }
}
