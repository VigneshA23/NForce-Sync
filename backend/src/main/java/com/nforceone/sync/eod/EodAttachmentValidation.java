package com.nforceone.sync.eod;

import java.util.Locale;
import java.util.Set;

/**
 * Pure validation rules for an attachment upload — no DB/Spring dependency, so it's directly
 * unit-testable the same way UtilizationCalculator is. Shared by EodAttachmentService and
 * BlockerConversationService (same package); each owns everything that needs a repository
 * (counts, ownership, its own storage-total sum) or config (@Value limits).
 */
final class EodAttachmentValidation {
    private EodAttachmentValidation() {}

    // Kept in sync with ALLOWED_ATTACHMENT_TYPES in the frontend (eodAttachments.ts, used by both
    // SubmitEOD.tsx and BlockerThread.tsx).
    static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "image/png", "image/jpeg", "image/webp", "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    /**
     * @return a user-facing error message if the file fails type or size validation, or null if
     *         it passes. Content-type is checked case-insensitively; a null/blank type is always
     *         rejected (never trust an absent type as "fine").
     */
    static String validate(String fileName, String contentType, long fileSize, long maxFileSizeBytes) {
        String normalized = contentType == null ? null : contentType.trim().toLowerCase(Locale.ROOT);
        if (normalized == null || normalized.isEmpty() || !ALLOWED_CONTENT_TYPES.contains(normalized)) {
            return "\"" + displayName(fileName) + "\" is not a supported file type. "
                    + "Allowed: PNG, JPG/JPEG, WEBP, PDF, DOC/DOCX, XLS/XLSX.";
        }
        if (fileSize > maxFileSizeBytes) {
            return "\"" + displayName(fileName) + "\" exceeds the "
                    + (maxFileSizeBytes / (1024 * 1024)) + " MB attachment limit";
        }
        return null;
    }

    /**
     * @return true if accepting {@code incomingFileSize} more bytes would push the app's total
     *         EOD attachment storage over {@code maxTotalStorageBytes} — see
     *         EodAttachmentService.assertStorageAvailable for the caller and its caveats.
     */
    static boolean exceedsStorageCap(long currentTotalBytes, long incomingFileSize, long maxTotalStorageBytes) {
        return currentTotalBytes + incomingFileSize > maxTotalStorageBytes;
    }

    private static String displayName(String fileName) {
        return fileName == null || fileName.isBlank() ? "file" : fileName;
    }
}
