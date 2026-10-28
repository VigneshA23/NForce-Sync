package com.nforceone.sync.reports;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.*;

/** Failed report exports must leave a log line — a 4xx used to leave nothing at all. */
class ExportRequestLogFilterTest {

    private final ExportRequestLogFilter filter = new ExportRequestLogFilter();
    private final Logger logger = (Logger) LoggerFactory.getLogger(ExportRequestLogFilter.class);
    private final ListAppender<ILoggingEvent> appender = new ListAppender<>();

    @BeforeEach
    void attach() {
        appender.start();
        logger.addAppender(appender);
    }

    @AfterEach
    void detach() {
        logger.detachAppender(appender);
    }

    private MockHttpServletRequest request(String uri, String query) {
        MockHttpServletRequest r = new MockHttpServletRequest("GET", uri);
        r.setQueryString(query);
        return r;
    }

    @Test
    void a403OnAnExportEndpoint_isLoggedAsAWarningWithTheQuery() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request("/api/reports/eod-by-employee/export", "from=2026-10-01&format=EXCEL"), response,
                (req, res) -> ((MockHttpServletResponse) res).setStatus(403));

        assertEquals(1, appender.list.size());
        assertEquals(Level.WARN, appender.list.get(0).getLevel());
        String message = appender.list.get(0).getFormattedMessage();
        assertTrue(message.contains("-> 403") && message.contains("format=EXCEL"), message);
    }

    @Test
    void a500_isLoggedAsAnError() throws Exception {
        filter.doFilter(request("/api/my-reports/eod-by-employee/export", null), new MockHttpServletResponse(),
                (req, res) -> ((MockHttpServletResponse) res).setStatus(500));

        assertEquals(Level.ERROR, appender.list.get(0).getLevel());
    }

    @Test
    void anExceptionFromTheChain_isLoggedWithItsStackTraceAndRethrown() {
        assertThrows(ServletException.class, () -> filter.doFilter(
                request("/api/team-reports/eod-by-employee/export", null), new MockHttpServletResponse(),
                (req, res) -> { throw new ServletException("boom"); }));

        assertEquals(Level.ERROR, appender.list.get(0).getLevel());
        assertNotNull(appender.list.get(0).getThrowableProxy());
    }

    @Test
    void aSuccessfulExport_logsNothing() throws Exception {
        filter.doFilter(request("/api/reports/eod-by-employee/export", null), new MockHttpServletResponse(),
                (req, res) -> ((MockHttpServletResponse) res).setStatus(200));

        assertTrue(appender.list.isEmpty());
    }

    @Test
    void otherEndpoints_areLeftAlone() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request("/api/reports/eod-by-employee", null), response,
                (req, res) -> ((MockHttpServletResponse) res).setStatus(403));

        assertTrue(appender.list.isEmpty());
    }
}
