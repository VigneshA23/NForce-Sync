package com.nforceone.sync.reports;

import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import com.nforceone.sync.reports.dto.EodByEmployeeEntryDto;
import com.nforceone.sync.reports.dto.EodByEmployeeReportDto;
import com.nforceone.sync.reports.dto.EodByEmployeeRowDto;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.streaming.SXSSFSheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Renders an already-scoped {@link EodByEmployeeReportDto} into a downloadable file. CSV uses one
 * flat row-per-task table (what you'd actually re-sort/pivot in a spreadsheet). Excel and PDF both
 * group by employee — Excel as one sheet per person, PDF as a heading block per person — so a
 * multi-employee download reads as "one person's report per section," not one long mixed table.
 */
@Service
public class ReportExportService {

    /**
     * Dates read the same in a download as they do on screen: the app renders every date as
     * DD-MM-YYYY (frontend lib/date.ts formatDate), so an export showing the raw ISO
     * LocalDate.toString() was the one place that convention broke.
     */
    private static final DateTimeFormatter DISPLAY_DATE = DateTimeFormatter.ofPattern("dd-MM-yyyy");

    private static String displayDate(LocalDate date) {
        return date != null ? date.format(DISPLAY_DATE) : "";
    }

    private static final String[] COLUMNS = {"Employee", "Employee Code", "Entry Date", "Project", "Category", "Hours"};

    public byte[] buildCsv(EodByEmployeeReportDto report) {
        StringBuilder sb = new StringBuilder();
        sb.append(String.join(",", COLUMNS)).append("\r\n");
        for (EodByEmployeeRowDto emp : sortedByName(report)) {
            for (EodByEmployeeEntryDto e : sortedByDate(emp.entries())) {
                sb.append(csvField(emp.employeeName())).append(',')
                  .append(csvField(emp.employeeCode())).append(',')
                  .append(csvField(displayDate(e.date()))).append(',')
                  .append(csvField(e.projectCode())).append(',')
                  .append(csvField(e.categoryName())).append(',')
                  .append(csvField(e.hours() != null ? e.hours().toPlainString() : "0")).append("\r\n");
            }
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    private String csvField(String value) {
        if (value == null) return "";
        String escaped = value.replace("\"", "\"\"");
        return (escaped.contains(",") || escaped.contains("\"") || escaped.contains("\n")) ? "\"" + escaped + "\"" : escaped;
    }

    private static final String[] SHEET_COLUMNS = {"Entry Date", "Project", "Category", "Hours"};

    public byte[] buildExcel(EodByEmployeeReportDto report) {
        try (SXSSFWorkbook workbook = new SXSSFWorkbook()) {
            CellStyle boldStyle = workbook.createCellStyle();
            org.apache.poi.ss.usermodel.Font boldFont = workbook.createFont();
            boldFont.setBold(true);
            boldStyle.setFont(boldFont);

            // A real date cell, not the formatted string the CSV and PDF use: those are read as
            // text anyway, but a spreadsheet column has to stay sortable and filterable as a date.
            // The dd-MM-yyyy data format makes it DISPLAY exactly as the app does whatever the
            // reader's locale, so the two agree without giving up the date semantics.
            CellStyle dateStyle = workbook.createCellStyle();
            dateStyle.setDataFormat(workbook.createDataFormat().getFormat("dd-MM-yyyy"));

            Set<String> usedSheetNames = new HashSet<>();
            for (EodByEmployeeRowDto emp : sortedByName(report)) {
                SXSSFSheet sheet = workbook.createSheet(uniqueSheetName(emp.employeeName(), usedSheetNames));
                writeEmployeeSheet(sheet, emp, boldStyle, dateStyle);
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to build Excel export", e);
        }
    }

    private void writeEmployeeSheet(SXSSFSheet sheet, EodByEmployeeRowDto emp,
                                     CellStyle boldStyle, CellStyle dateStyle) {
        int rowNum = 0;

        Row nameRow = sheet.createRow(rowNum++);
        Cell nameCell = nameRow.createCell(0);
        nameCell.setCellValue(emp.employeeName() + "  (" + emp.employeeCode() + ")");
        nameCell.setCellStyle(boldStyle);

        Row metaRow = sheet.createRow(rowNum++);
        metaRow.createCell(0).setCellValue(String.join(" | ",
                nonBlank(emp.designationName()), "Status: " + emp.status(), nonBlank(emp.client()),
                emp.managerName() != null ? "Reports to " + emp.managerName() : "—"));

        Row totalsRow = sheet.createRow(rowNum++);
        totalsRow.createCell(0).setCellValue("Entries: " + emp.entryCount()
                + "  |  Total hours: " + fmt(emp.totalHours()));

        rowNum++; // blank spacer row

        Row header = sheet.createRow(rowNum++);
        for (int c = 0; c < SHEET_COLUMNS.length; c++) {
            Cell cell = header.createCell(c);
            cell.setCellValue(SHEET_COLUMNS[c]);
            cell.setCellStyle(boldStyle);
        }

        for (EodByEmployeeEntryDto e : sortedByDate(emp.entries())) {
            Row row = sheet.createRow(rowNum++);
            Cell dateCell = row.createCell(0);
            if (e.date() != null) {
                dateCell.setCellValue(e.date());
                dateCell.setCellStyle(dateStyle);
            }
            row.createCell(1).setCellValue(e.projectCode() != null ? e.projectCode() : "");
            row.createCell(2).setCellValue(e.categoryName() != null ? e.categoryName() : "");
            row.createCell(3).setCellValue(e.hours() != null ? e.hours().doubleValue() : 0d);
        }

        for (int c = 0; c < SHEET_COLUMNS.length; c++) {
            sheet.setColumnWidth(c, 22 * 256);
        }
    }

    /** Excel sheet names must be unique, non-blank, ≤31 chars, and free of : \ / ? * [ ]. */
    private String uniqueSheetName(String rawName, Set<String> used) {
        String base = rawName.replaceAll("[:\\\\/?*\\[\\]]", "").trim();
        if (base.isEmpty()) base = "Employee";
        if (base.length() > 31) base = base.substring(0, 31);

        String candidate = base;
        int suffix = 2;
        while (!used.add(candidate)) {
            String suffixStr = "-" + suffix;
            int maxBaseLen = 31 - suffixStr.length();
            candidate = (base.length() > maxBaseLen ? base.substring(0, maxBaseLen) : base) + suffixStr;
            suffix++;
        }
        return candidate;
    }

    public byte[] buildPdf(EodByEmployeeReportDto report) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document document = new Document(PageSize.A4.rotate(), 24, 24, 24, 24);
        try {
            PdfWriter.getInstance(document, out);
            document.open();

            Font titleFont = new Font(Font.HELVETICA, 14, Font.BOLD);
            Font headingFont = new Font(Font.HELVETICA, 11, Font.BOLD);
            Font metaFont = new Font(Font.HELVETICA, 9, Font.NORMAL);
            Font tableHeaderFont = new Font(Font.HELVETICA, 9, Font.BOLD);
            Font tableCellFont = new Font(Font.HELVETICA, 9, Font.NORMAL);

            document.add(new Paragraph("EOD by Employee", titleFont));
            document.add(new Paragraph(" "));

            for (EodByEmployeeRowDto emp : sortedByName(report)) {
                Paragraph heading = new Paragraph(emp.employeeName() + "  (" + emp.employeeCode() + ")", headingFont);
                document.add(heading);

                String meta = String.join(" · ", nonBlank(emp.designationName()), "Status: " + emp.status(),
                        nonBlank(emp.client()), emp.managerName() != null ? "Reports to " + emp.managerName() : "");
                document.add(new Paragraph(meta, metaFont));
                document.add(new Paragraph("Total hours: " + fmt(emp.totalHours())
                        + "  |  Entries: " + emp.entryCount(), metaFont));

                List<EodByEmployeeEntryDto> entries = sortedByDate(emp.entries());
                if (entries.isEmpty()) {
                    document.add(new Paragraph("No EOD entries in this range.", metaFont));
                } else {
                    PdfPTable table = new PdfPTable(new float[]{1.1f, 1.4f, 1.8f, 0.8f});
                    table.setWidthPercentage(100);
                    for (String col : new String[]{"Entry Date", "Project", "Category", "Hours"}) {
                        PdfPCell cell = new PdfPCell(new Phrase(col, tableHeaderFont));
                        cell.setHorizontalAlignment(Element.ALIGN_LEFT);
                        table.addCell(cell);
                    }
                    for (EodByEmployeeEntryDto e : entries) {
                        table.addCell(new Phrase(displayDate(e.date()), tableCellFont));
                        table.addCell(new Phrase(e.projectCode() != null ? e.projectCode() : "—", tableCellFont));
                        table.addCell(new Phrase(e.categoryName() != null ? e.categoryName() : "—", tableCellFont));
                        table.addCell(new Phrase(fmt(e.hours()), tableCellFont));
                    }
                    document.add(table);
                }
                document.add(new Paragraph(" "));
            }
        } finally {
            document.close();
        }
        return out.toByteArray();
    }

    private List<EodByEmployeeRowDto> sortedByName(EodByEmployeeReportDto report) {
        return report.employees().stream()
                .sorted(Comparator.comparing(EodByEmployeeRowDto::employeeName))
                .toList();
    }

    private List<EodByEmployeeEntryDto> sortedByDate(List<EodByEmployeeEntryDto> entries) {
        return entries.stream()
                .sorted(Comparator.comparing(EodByEmployeeEntryDto::date))
                .toList();
    }

    private String nonBlank(String value) {
        return value != null && !value.isBlank() ? value : "—";
    }

    private String fmt(BigDecimal value) {
        return value != null ? value.stripTrailingZeros().toPlainString() : "0";
    }
}
