package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodClarificationReplyAttachment;

// Metadata only, mirrors BlockerAttachmentDto — file bytes are fetched separately via the
// attachment download endpoint, not inlined here.
public record EodClarificationAttachmentDto(
        Long   id,
        String fileName,
        String contentType,
        Long   fileSize,
        Long   replyId
) {
    public static EodClarificationAttachmentDto from(EodClarificationReplyAttachment a) {
        return new EodClarificationAttachmentDto(a.getId(), a.getFileName(), a.getContentType(), a.getFileSize(), a.getReply().getId());
    }
}
