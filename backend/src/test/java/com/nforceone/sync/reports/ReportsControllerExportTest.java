package com.nforceone.sync.reports;

import com.nforceone.sync.config.BusinessClock;
import com.nforceone.sync.reports.dto.EodByEmployeeEntryDto;
import com.nforceone.sync.reports.dto.EodByEmployeeReportDto;
import com.nforceone.sync.reports.dto.EodByEmployeeRowDto;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** The PM export endpoint end to end (minus HTTP): "Download" for one employee versus "Download all". */
class ReportsControllerExportTest {

    private static final LocalDate FROM = LocalDate.of(2026, 10, 1);
    private static final LocalDate TO = LocalDate.of(2026, 10, 31);

    private final EodByEmployeeReportService reportService = mock(EodByEmployeeReportService.class);
    private final ReportsController controller = new ReportsController(
            reportService, new ReportExportService(), mock(MissingEodReportService.class), mock(BusinessClock.class));

    private static EodByEmployeeRowDto employee(long id, String name, String project) {
        EodByEmployeeEntryDto e = new EodByEmployeeEntryDto(id, FROM, project, "Development", BigDecimal.valueOf(2), null, null, "WORKING_DAY");
        return new EodByEmployeeRowDto(id, name, "NF-" + id, null, List.of(), null, null, "ACTIVE", 1, BigDecimal.valueOf(2), List.of(e));
    }

    private void serve(EodByEmployeeRowDto... rows) {
        when(reportService.getReport(any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(new EodByEmployeeReportDto(rows.length, rows.length, BigDecimal.TEN, List.of(rows)));
    }

    private ResponseEntity<byte[]> export(List<Long> employeeIds, String format) {
        return controller.exportEodByEmployee(FROM, TO, null, null, null, null, null, employeeIds, format);
    }

    private static int sheetCount(ResponseEntity<byte[]> response) throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook(new ByteArrayInputStream(response.getBody()))) {
            return wb.getNumberOfSheets();
        }
    }

    @BeforeEach
    void authenticate() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("pm@nforceone.com", null, List.of()));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void downloadAll_excel_hasASheetPerEmployeeAndTheReportName() throws Exception {
        serve(employee(1, "Anil Rao", "SYNC"), employee(2, "Zara Khan", null));

        ResponseEntity<byte[]> response = export(null, "EXCEL");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(2, sheetCount(response));
        String disposition = response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION);
        assertTrue(disposition.contains("eod-by-employee-1st-Oct-2026-to-31st-Oct-2026.xlsx"), disposition);
        assertEquals("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                response.getHeaders().getContentType().toString());
    }

    @Test
    void downloadOneEmployee_excel_hasOnlyThatEmployeeAndIsNamedAfterThem() throws Exception {
        serve(employee(1, "Anil Rao", "SYNC"), employee(2, "Zara Khan", "SYNC"));

        ResponseEntity<byte[]> response = export(List.of(2L), "EXCEL");

        assertEquals(1, sheetCount(response));
        String disposition = response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION);
        assertTrue(disposition.contains("Zara"), disposition);
        assertFalse(disposition.contains("eod-by-employee"), disposition);
        assertTrue(disposition.endsWith(".xlsx\"") || disposition.contains(".xlsx"), disposition);
    }

    @Test
    void noRows_excel_isStillAValidWorkbook() throws Exception {
        serve();

        ResponseEntity<byte[]> response = export(null, "EXCEL");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(1, sheetCount(response));   // the "No data" sheet
    }

    @Test
    void employeeIdsThatMatchNobody_excel_isStillAValidWorkbook() throws Exception {
        serve(employee(1, "Anil Rao", "SYNC"));

        ResponseEntity<byte[]> response = export(List.of(99L), "EXCEL");

        assertEquals(1, sheetCount(response));
    }

    @Test
    void csvAndPdf_workForBothDownloadModes() {
        serve(employee(1, "Anil Rao", "SYNC"), employee(2, "Zara Khan", "SYNC"));
        for (String format : List.of("CSV", "PDF")) {
            assertTrue(export(null, format).getBody().length > 0, format + " all");
            assertTrue(export(List.of(1L), format).getBody().length > 0, format + " single");
        }
    }

    @Test
    void unsupportedFormat_isA400WithAMessage() {
        serve(employee(1, "Anil Rao", "SYNC"));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> export(null, "DOCX"));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("DOCX"));
    }
}
