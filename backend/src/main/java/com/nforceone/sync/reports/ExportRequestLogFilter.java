package com.nforceone.sync.reports;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

/**
 * Leaves a log line for every report export that does not succeed. A 5xx already gets a stack trace from
 * GlobalExceptionHandler, but a 4xx (bad parameter, wrong scope, 401/403) is a normal response that logged
 * nothing, so a failed download could leave no trace at all. Runs ahead of the security chain so it also
 * sees the requests Spring Security rejects. Logs the status and the query (dates, filters, format) only —
 * never the Authorization header.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class ExportRequestLogFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(ExportRequestLogFilter.class);

    /** The three Reports pages' export endpoints: PM, Team Lead, Reporting Manager. */
    static final Set<String> EXPORT_PATHS = Set.of(
            "/api/reports/eod-by-employee/export",
            "/api/team-reports/eod-by-employee/export",
            "/api/my-reports/eod-by-employee/export");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !EXPORT_PATHS.contains(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        try {
            chain.doFilter(request, response);
        } catch (ServletException | IOException | RuntimeException e) {
            log.error("Report export {} {} failed before a response was written", request.getMethod(), describe(request), e);
            throw e;
        }
        int status = response.getStatus();
        if (status >= 500) {
            log.error("Report export {} {} -> {}", request.getMethod(), describe(request), status);
        } else if (status >= 400) {
            log.warn("Report export {} {} -> {}", request.getMethod(), describe(request), status);
        }
    }

    private static String describe(HttpServletRequest request) {
        String query = request.getQueryString();
        return query == null ? request.getRequestURI() : request.getRequestURI() + "?" + query;
    }
}
