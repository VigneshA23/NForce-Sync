package com.nforceone.sync.eod;

import com.nforceone.sync.eod.dto.BlockerAttachmentDto;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BlockerReplyAttachmentRepository extends JpaRepository<BlockerReplyAttachment, Long> {

    // Metadata-only projection — keeps a thread load cheap regardless of attachment size,
    // since the entity's `data` column is never selected here.
    @Query("select new com.nforceone.sync.eod.dto.BlockerAttachmentDto(a.id, a.fileName, a.contentType, a.fileSize, a.reply.id) " +
           "from BlockerReplyAttachment a where a.reply.id in :replyIds")
    List<BlockerAttachmentDto> findMetaByReplyIds(@Param("replyIds") List<Long> replyIds);
}
