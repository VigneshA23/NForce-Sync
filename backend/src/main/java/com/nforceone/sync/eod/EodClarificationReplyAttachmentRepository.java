package com.nforceone.sync.eod;

import com.nforceone.sync.eod.dto.EodClarificationAttachmentDto;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface EodClarificationReplyAttachmentRepository extends JpaRepository<EodClarificationReplyAttachment, Long> {

    // Metadata-only projection — keeps a thread load cheap regardless of attachment size, mirrors
    // BlockerReplyAttachmentRepository.findMetaByReplyIds.
    @Query("select new com.nforceone.sync.eod.dto.EodClarificationAttachmentDto(a.id, a.fileName, a.contentType, a.fileSize, a.reply.id) " +
           "from EodClarificationReplyAttachment a where a.reply.id in :replyIds")
    List<EodClarificationAttachmentDto> findMetaByReplyIds(@Param("replyIds") List<Long> replyIds);

    // App-wide total across every clarification reply attachment — backs the shared storage-
    // capacity guard, mirrors BlockerReplyAttachmentRepository.sumFileSize. Deliberately a
    // separate running total from Blockers' own sumFileSize (two independent attachment tables),
    // not a combined one — each feature's own attachments count only against itself.
    @Query("SELECT COALESCE(SUM(a.fileSize), 0) FROM EodClarificationReplyAttachment a")
    long sumFileSize();
}
