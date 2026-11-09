package com.nforceone.sync.eod;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface EodAttachmentRepository extends JpaRepository<EodAttachment, Long> {

    // EOD-level attachments for a single entry (task IS NULL) — batched alongside the tasks'
    // own attachments below rather than N+1 per entry when building EodEntryDto.
    @Query("SELECT a FROM EodAttachment a WHERE a.eodEntry.id = :entryId AND a.task IS NULL")
    List<EodAttachment> findEntryLevelByEntryId(@Param("entryId") Long entryId);

    // Every attachment (entry-level and task-level) for a set of entries, in one query — used
    // when listing multiple entries at once (history, approvals lists) to avoid N+1.
    //
    // A constructor-expression projection, deliberately NOT `List<EodAttachment>`: EodAttachment.data
    // is a plain (non-@Lob, non-lazy) byte[] column, so selecting the entity pulls every matched
    // attachment's full file bytes into memory on every list/dashboard/history load — for entries
    // with a handful of near-the-cap (10 MB) files this made a metadata-only listing transfer tens
    // of MB per request and, against the Neon endpoint's latency, made this call hang for minutes.
    // This projection's generated SQL never selects the `data` column at all.
    @Query("""
            SELECT new com.nforceone.sync.eod.EodAttachmentRow(
                a.id, a.eodEntry.id, a.task.id, a.originalFileName, a.contentType, a.fileSize,
                a.uploadedBy.fullName, a.createdAt)
            FROM EodAttachment a
            WHERE a.eodEntry.id IN :entryIds
            """)
    List<EodAttachmentRow> findByEodEntryIdIn(@Param("entryIds") List<Long> entryIds);

    // Ownership-scoped lookup: never fetch an attachment by ID alone without also confirming
    // which entry it belongs to — this is the IDOR guard every caller (download/delete/reassign)
    // goes through.
    Optional<EodAttachment> findByIdAndEodEntryId(Long id, Long entryId);

    // Used by EodAttachmentService.reassignForSave to validate that a batch of attachment IDs
    // the client is asking to re-point all genuinely belong to this entry, before touching any.
    List<EodAttachment> findByIdInAndEodEntryId(List<Long> ids, Long entryId);

    long countByEodEntryIdAndTaskIsNull(Long entryId);

    long countByTaskId(Long taskId);

    // App-wide total, across every attachment regardless of owner — backs the storage-capacity
    // guard in EodAttachmentService.upload. COALESCE covers the empty-table case: SUM over zero
    // rows is SQL NULL, which would otherwise unbox to a NullPointerException here.
    @Query("SELECT COALESCE(SUM(a.fileSize), 0) FROM EodAttachment a")
    long sumFileSize();

    /** Every attachment (entry- and task-level) of one entry, in one statement and without loading file bytes. */
    @org.springframework.data.jpa.repository.Modifying
    @Query("DELETE FROM EodAttachment a WHERE a.eodEntry.id = :entryId")
    void deleteAllByEntryId(@Param("entryId") Long entryId);
}
