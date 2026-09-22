package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodClarification;
import com.nforceone.sync.eod.EodClarificationReply;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/** One row of the "EOD Inbox" list/table (Team Lead full view, PM read-only view) — an entry that
 *  currently has (or previously had) a clarification round open against it. projectNames,
 *  categoryNames, replyCount, lastMessage/lastMessageAt/lastMessageSenderName/lastMessageSenderRole
 *  are enrichment fields the service layer fills in from batch lookups (see
 *  EodClarificationService#enrich) rather than columns on EodClarification itself — the inbox
 *  table needs a message preview, a reply count, a last-reply-sender cell and a "most recent
 *  activity" sort key that openedAt alone can't give once a thread has replies. */
public record EodInboxItemDto(
        Long           clarificationId,
        Long           eodEntryId,
        Long           employeeId,
        String         employeeName,
        String         employeeCode,
        String         projectName,
        List<String>   projectNames,
        List<String>   categoryNames,
        LocalDate      entryDate,
        boolean        open,
        String         status,
        OffsetDateTime openedAt,
        String         openedByName,
        OffsetDateTime resolvedAt,
        String         resolvedByName,
        int            replyCount,
        String         lastMessage,
        OffsetDateTime lastMessageAt,
        String         lastMessageSenderName,
        String         lastMessageSenderRole,
        boolean        unread
) {
    /** @param viewerLastReadAt the viewing user's last_read_at for this round (null if never
     *                          opened) — used with lastReply/openedAt to derive `unread`; see
     *                          EodClarificationService#enrich. */
    public static EodInboxItemDto from(EodClarification c, List<String> projectNames, List<String> categoryNames,
                                        int replyCount, EodClarificationReply lastReply,
                                        Long viewerId, OffsetDateTime viewerLastReadAt) {
        var entry = c.getEodEntry();
        boolean lastSenderIsEmployee = lastReply != null
                && lastReply.getSender().getId().equals(entry.getEmployee().getId());

        // "Latest message" for unread purposes is the last reply, or — for a freshly opened round
        // with no replies yet — the round's own opening (authored by openedBy).
        Long lastActivitySenderId = lastReply != null ? lastReply.getSender().getId() : c.getOpenedBy().getId();
        OffsetDateTime lastActivityAt = lastReply != null ? lastReply.getCreatedAt() : c.getOpenedAt();
        boolean unread = !lastActivitySenderId.equals(viewerId)
                && (viewerLastReadAt == null || viewerLastReadAt.isBefore(lastActivityAt));

        return new EodInboxItemDto(
                c.getId(),
                entry.getId(),
                entry.getEmployee().getId(),
                entry.getEmployee().getFullName(),
                entry.getEmployee().getEmployeeCode(),
                projectNames.isEmpty() ? null : projectNames.get(0),
                projectNames,
                categoryNames,
                entry.getEntryDate(),
                c.isOpen(),
                c.getStatus().name(),
                c.getOpenedAt(),
                c.getOpenedBy().getFullName(),
                c.getResolvedAt(),
                c.getResolvedBy() != null ? c.getResolvedBy().getFullName() : null,
                replyCount,
                lastReply != null ? lastReply.getMessage() : null,
                lastActivityAt,
                lastReply != null ? lastReply.getSender().getFullName() : null,
                lastReply != null ? (lastSenderIsEmployee ? "EMPLOYEE" : "TEAM_LEAD") : null,
                unread
        );
    }
}
