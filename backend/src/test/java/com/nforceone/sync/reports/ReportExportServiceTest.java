package com.nforceone.sync.reports;

import com.nforceone.sync.reports.dto.EodByEmployeeEntryDto;
import com.nforceone.sync.reports.dto.EodByEmployeeReportDto;
import com.nforceone.sync.reports.dto.EodByEmployeeRowDto;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
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
}
