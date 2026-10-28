package com.nforceone.sync.reports;

import com.nforceone.sync.reports.dto.EodByEmployeeEntryDto;
import com.nforceone.sync.reports.dto.EodByEmployeeReportDto;
import com.nforceone.sync.reports.dto.EodByEmployeeRowDto;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import org.apache.poi.util.DefaultTempFileCreationStrategy;
import org.apache.poi.util.TempFile;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/** Excel/CSV/PDF export: data shapes that must not break it, and the sheet-name rules Excel enforces. */
class ReportExportServiceTest {

    private static final LocalDate DAY = LocalDate.of(2026, 10, 15);

    private final ReportExportService service = new ReportExportService();

    private static EodByEmployeeEntryDto entry(LocalDate date, String project, String category, String hours) {
        return new EodByEmployeeEntryDto(1L, date, project, category,
                hours == null ? null : new BigDecimal(hours), null, null, "WORKING_DAY");
    }

    private static EodByEmployeeRowDto employee(long id, String name, EodByEmployeeEntryDto... entries) {
        return new EodByEmployeeRowDto(id, name, "NF-2026" + id, "Analyst", List.of(), "Acme", "Boss", "ACTIVE",
                entries.length, BigDecimal.TEN, List.of(entries));
    }

    private static EodByEmployeeReportDto report(EodByEmployeeRowDto... rows) {
        return new EodByEmployeeReportDto(rows.length, 0, BigDecimal.ZERO, List.of(rows));
    }

    /** Opens the bytes as a real .xlsx — fails if the file isn't a valid workbook. */
    private static XSSFWorkbook open(byte[] bytes) throws Exception {
        return new XSSFWorkbook(new ByteArrayInputStream(bytes));
    }

    private static List<String> sheetNames(XSSFWorkbook wb) {
        List<String> names = new ArrayList<>();
        wb.forEach(s -> names.add(s.getSheetName()));
        return names;
    }

    // ── Normal data ────────────────────────────────────────────────────────────

    @Test
    void excel_normalData_oneSheetPerEmployeeWithHeaderAndRows() throws Exception {
        byte[] bytes = service.buildExcel(report(employee(1, "Sai Kumar",
                entry(DAY, "SYNC", "Development", "6.25"))));

        try (XSSFWorkbook wb = open(bytes)) {
            assertEquals(List.of("Sai Kumar"), sheetNames(wb));
            Sheet sheet = wb.getSheetAt(0);
            // rows: name, meta, totals, spacer, header, data
            assertEquals("Entry Date", sheet.getRow(4).getCell(0).getStringCellValue());
            assertEquals("Hours", sheet.getRow(4).getCell(3).getStringCellValue());
            assertEquals(DAY, sheet.getRow(5).getCell(0).getLocalDateTimeCellValue().toLocalDate());
            assertEquals("SYNC", sheet.getRow(5).getCell(1).getStringCellValue());
            assertEquals("Development", sheet.getRow(5).getCell(2).getStringCellValue());
            assertEquals(6.25, sheet.getRow(5).getCell(3).getNumericCellValue());
        }
    }

    @Test
    void allFormats_normalData_produceNonEmptyOutput() {
        EodByEmployeeReportDto r = report(employee(1, "Sai Kumar", entry(DAY, "SYNC", "Development", "6.25")));
        assertTrue(service.buildExcel(r).length > 0);
        assertTrue(service.buildCsv(r).length > 0);
        assertTrue(service.buildPdf(r).length > 0);
    }

    // ── Rows with no project ───────────────────────────────────────────────────

    @Test
    void excel_nullProject_writesABlankCellAndDoesNotBreak() throws Exception {
        byte[] bytes = service.buildExcel(report(employee(1, "Sai Kumar", entry(DAY, null, "Development", "2"))));
        try (XSSFWorkbook wb = open(bytes)) {
            assertEquals("", wb.getSheetAt(0).getRow(5).getCell(1).getStringCellValue());
        }
        assertTrue(service.buildCsv(report(employee(1, "Sai Kumar", entry(DAY, null, "Development", "2")))).length > 0);
    }

    @Test
    void excel_noProjectsAssignedLabel_isWrittenAsTheProjectCell() throws Exception {
        byte[] bytes = service.buildExcel(report(employee(1, "Sai Kumar",
                entry(DAY, ProjectLabels.NO_PROJECTS_ASSIGNED, "Bench", "8"))));
        try (XSSFWorkbook wb = open(bytes)) {
            assertEquals("No Projects Assigned", wb.getSheetAt(0).getRow(5).getCell(1).getStringCellValue());
        }
    }

    @Test
    void excel_nullCategoryAndHours_doNotBreak() throws Exception {
        byte[] bytes = service.buildExcel(report(employee(1, "Sai Kumar", entry(DAY, "SYNC", null, null))));
        try (XSSFWorkbook wb = open(bytes)) {
            assertEquals(0d, wb.getSheetAt(0).getRow(5).getCell(3).getNumericCellValue());
        }
    }

    // ── No rows ────────────────────────────────────────────────────────────────

    @Test
    void excel_noEmployees_isAValidWorkbookWithANoDataSheetAndTheHeaderRow() throws Exception {
        byte[] bytes = service.buildExcel(report());
        try (XSSFWorkbook wb = open(bytes)) {
            assertEquals(List.of("No data"), sheetNames(wb));
            Sheet sheet = wb.getSheetAt(0);
            assertEquals("Entry Date", sheet.getRow(0).getCell(0).getStringCellValue());
            assertEquals("Project", sheet.getRow(0).getCell(1).getStringCellValue());
            assertTrue(sheet.getRow(1).getCell(0).getStringCellValue().startsWith("No EOD entries"));
        }
    }

    @Test
    void csvAndPdf_noEmployees_stillProduceAFile() {
        assertEquals("Employee,Employee Code,Entry Date,Project,Category,Hours\r\n",
                new String(service.buildCsv(report()), java.nio.charset.StandardCharsets.UTF_8));
        assertTrue(service.buildPdf(report()).length > 0);
    }

    @Test
    void excel_employeeWithNoEntries_getsASheetWithJustTheHeader() throws Exception {
        try (XSSFWorkbook wb = open(service.buildExcel(report(employee(1, "Sai Kumar"))))) {
            assertEquals(List.of("Sai Kumar"), sheetNames(wb));
        }
    }

    // ── Single employee vs all employees ───────────────────────────────────────

    @Test
    void excel_allEmployees_oneSheetEachInNameOrder() throws Exception {
        byte[] bytes = service.buildExcel(report(
                employee(2, "Zara", entry(DAY, "A", "B", "1")),
                employee(1, "Anil", entry(DAY, "A", "B", "1"))));
        try (XSSFWorkbook wb = open(bytes)) {
            assertEquals(List.of("Anil", "Zara"), sheetNames(wb));
        }
    }

    @Test
    void excel_singleEmployee_oneSheet() throws Exception {
        try (XSSFWorkbook wb = open(service.buildExcel(report(employee(2, "Zara", entry(DAY, "A", "B", "1")))))) {
            assertEquals(List.of("Zara"), sheetNames(wb));
        }
    }

    // ── Sheet-name collisions and invalid names ────────────────────────────────

    @Test
    void excel_namesThatDifferOnlyByCase_getDistinctSheets() throws Exception {
        byte[] bytes = service.buildExcel(report(
                employee(1, "Sai Kumar", entry(DAY, "A", "B", "1")),
                employee(2, "SAI KUMAR", entry(DAY, "A", "B", "1"))));
        try (XSSFWorkbook wb = open(bytes)) {
            List<String> names = sheetNames(wb);
            assertEquals(2, names.size());
            assertNotEquals(names.get(0).toLowerCase(), names.get(1).toLowerCase());
        }
    }

    @Test
    void excel_namesWithApostropheAtTheEdges_areAccepted() throws Exception {
        byte[] bytes = service.buildExcel(report(
                employee(1, "'Sai", entry(DAY, "A", "B", "1")),
                employee(2, "Kumar'", entry(DAY, "A", "B", "1")),
                employee(3, "O'Brien", entry(DAY, "A", "B", "1"))));
        try (XSSFWorkbook wb = open(bytes)) {
            assertEquals(List.of("'Sai".substring(1), "Kumar", "O'Brien").stream().sorted().toList(),
                    sheetNames(wb).stream().sorted().toList());
        }
    }

    @Test
    void excel_nullOrBlankEmployeeName_doesNotBreak() throws Exception {
        byte[] bytes = service.buildExcel(report(
                employee(1, null, entry(DAY, "A", "B", "1")),
                employee(2, "   ", entry(DAY, "A", "B", "1"))));
        try (XSSFWorkbook wb = open(bytes)) {
            assertEquals(2, wb.getNumberOfSheets());
        }
        assertTrue(service.buildPdf(report(employee(1, null, entry(DAY, "A", "B", "1")))).length > 0);
    }

    @Test
    void allFormats_aRowWithNoDate_doesNotBreakTheExport() throws Exception {
        EodByEmployeeReportDto r = report(employee(1, "Sai Kumar",
                entry(DAY, "A", "B", "1"), entry(null, "A", "B", "1")));
        try (XSSFWorkbook wb = open(service.buildExcel(r))) {
            // The dated row sorts first, the undated one last (blank date cell).
            assertEquals(DAY, wb.getSheetAt(0).getRow(5).getCell(0).getLocalDateTimeCellValue().toLocalDate());
        }
        assertTrue(service.buildCsv(r).length > 0);
        assertTrue(service.buildPdf(r).length > 0);
    }

    // ── uniqueSheetName rules ──────────────────────────────────────────────────

    private static String name(String raw, Set<String> used) {
        return ReportExportService.uniqueSheetName(raw, used);
    }

    @Test
    void sheetName_stripsInvalidCharacters() {
        assertEquals("ABCD", name("A:B/C\\D?*[]", new HashSet<>()));
    }

    @Test
    void sheetName_neverNullOrBlank() {
        assertEquals("Employee", name(null, new HashSet<>()));
        assertEquals("Employee", name("   ", new HashSet<>()));
        assertEquals("Employee", name("[]", new HashSet<>()));
        assertEquals("Employee", name("''", new HashSet<>()));
    }

    @Test
    void sheetName_atMost31Characters_andNoTrailingApostropheAfterTruncation() {
        String longName = "x".repeat(30) + "'" + "tail";
        String result = name(longName, new HashSet<>());
        assertTrue(result.length() <= 31);
        assertFalse(result.endsWith("'"));
    }

    @Test
    void sheetName_uniqueIgnoringCase_andSuffixStaysWithin31() {
        Set<String> used = new HashSet<>();
        String a = name("x".repeat(40), used);
        String b = name("X".repeat(40), used);
        String c = name("x".repeat(40), used);
        assertEquals(3, Set.of(a.toLowerCase(), b.toLowerCase(), c.toLowerCase()).size());
        assertTrue(a.length() <= 31 && b.length() <= 31 && c.length() <= 31);
    }

    @Test
    void sheetName_reservedHistory_isRenamed() {
        assertNotEquals("history", name("History", new HashSet<>()).toLowerCase());
    }

    // ── Environment and failure behaviour ──────────────────────────────────────

    /**
     * A locked-down container (read-only or missing /tmp) must not break Excel: the streaming SXSSF writer opened
     * a temp file per sheet and failed there; the in-memory workbook needs none. The directory is a path
     * beneath a regular file, so nothing can ever be created in it. POI caches its temp dir, so its strategy is
     * pointed at the bad path as well as the system properties.
     */
    @Test
    void excel_worksWhenTheTempDirectoryIsNotWritable(@TempDir Path tmp) throws Exception {
        Path aFile = Files.createFile(tmp.resolve("not-a-dir"));
        File unusable = aFile.resolve("tmp").toFile();

        String oldTmp = System.getProperty("java.io.tmpdir");
        String oldPoiTmp = System.getProperty("poi.tmpdir");
        System.setProperty("java.io.tmpdir", unusable.getPath());
        System.setProperty("poi.tmpdir", unusable.getPath());
        TempFile.setTempFileCreationStrategy(new DefaultTempFileCreationStrategy(unusable));
        try {
            byte[] bytes = service.buildExcel(report(
                    employee(1, "Sai Kumar", entry(DAY, "SYNC", "Development", "6.25")),
                    employee(2, "Asha Rao", entry(DAY, "SYNC", "Testing", "4"))));
            try (XSSFWorkbook wb = open(bytes)) {
                assertEquals(List.of("Asha Rao", "Sai Kumar"), sheetNames(wb));
            }
        } finally {
            restore("java.io.tmpdir", oldTmp);
            restore("poi.tmpdir", oldPoiTmp);
            TempFile.setTempFileCreationStrategy(new DefaultTempFileCreationStrategy());
        }
    }

    private static void restore(String key, String value) {
        if (value == null) System.clearProperty(key); else System.setProperty(key, value);
    }

    @Test
    void excel_overTheRowCap_isRefusedWithAClearMessage() {
        List<EodByEmployeeEntryDto> many = new ArrayList<>();
        for (int i = 0; i <= ReportExportService.MAX_EXCEL_ROWS; i++) many.add(entry(DAY, "SYNC", "Development", "1"));
        EodByEmployeeRowDto big = new EodByEmployeeRowDto(1L, "Sai Kumar", "NF-1", "Analyst", List.of(), "Acme",
                "Boss", "ACTIVE", many.size(), BigDecimal.TEN, many);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.buildExcel(report(big)));
        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, ex.getStatusCode());
        assertTrue(ex.getReason().contains("Narrow the date range"), ex.getReason());
    }

    @Test
    void excel_atTheRowCap_stillBuilds() throws Exception {
        List<EodByEmployeeEntryDto> many = new ArrayList<>();
        for (int i = 0; i < 2_000; i++) many.add(entry(DAY, "SYNC", "Development", "1"));
        EodByEmployeeRowDto emp = new EodByEmployeeRowDto(1L, "Sai Kumar", "NF-1", "Analyst", List.of(), "Acme",
                "Boss", "ACTIVE", many.size(), BigDecimal.TEN, many);
        try (XSSFWorkbook wb = open(service.buildExcel(report(emp)))) {
            // name, meta, totals and header rows (the spacer row is never created) plus the data rows
            assertEquals(2_000 + 4, wb.getSheetAt(0).getPhysicalNumberOfRows());
        }
    }

    @Test
    void excel_unexpectedFailure_returnsASpecificSafeMessageWithAReference() {
        // A null element in the entries list throws inside the writer.
        List<EodByEmployeeEntryDto> poisoned = Arrays.asList(entry(DAY, "SYNC", "Dev", "1"), null);
        EodByEmployeeRowDto emp = new EodByEmployeeRowDto(1L, "Sai Kumar", "NF-1", "Analyst", List.of(), "Acme",
                "Boss", "ACTIVE", 2, BigDecimal.TEN, poisoned);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.buildExcel(report(emp)));
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, ex.getStatusCode());
        String msg = ex.getReason();
        assertTrue(msg.startsWith("Excel export failed: "), msg);
        assertTrue(msg.matches(".*\\(ref [0-9a-f]{8}\\)$"), msg);
        // Nothing of the exception's own text, class names or frames reaches the client.
        assertFalse(msg.contains("NullPointer") || msg.contains("Cannot invoke") || msg.contains("com.nforceone"), msg);
    }
}
