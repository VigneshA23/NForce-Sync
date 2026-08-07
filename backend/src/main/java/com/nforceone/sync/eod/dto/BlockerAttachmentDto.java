package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.BlockerReplyAttachment;

// Metadata only — the file bytes are fetched separately via the attachment download
// endpoint, not inlined here, so loading a thread stays cheap regardless of attachment size.
// `replyId` is only used server-side to group attachments back onto their reply (see
// BlockerConversationService.loadThread) — the frontend DTO doesn't need or use it.
public record BlockerAttachmentDto(
        Long   id,
        String fileName,
        String contentType,
        Long   fileSize,
        Long   replyId
) {
    public static BlockerAttachmentDto from(BlockerReplyAttachment a) {
        return new BlockerAttachmentDto(a.getId(), a.getFileName(), a.getContentType(), a.getFileSize(), a.getReply().getId());
    }
}
