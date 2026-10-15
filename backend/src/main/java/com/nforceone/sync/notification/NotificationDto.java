package com.nforceone.sync.notification;

import java.time.LocalDate;
import java.time.OffsetDateTime;

public record NotificationDto(
        Long id,
        String type,
        String title,
        String message,
        String link,
        boolean read,
        OffsetDateTime createdAt,
        Long employeeId,
        Long pieceId,
        Long eodId,
        LocalDate eodDate
) {
    public static NotificationDto from(Notification n) {
        return new NotificationDto(
                n.getId(),
                n.getType(),
                n.getTitle(),
                n.getMessage(),
                n.getLink(),
                n.isRead(),
                n.getCreatedAt(),
                n.getRelatedEmployeeId(),
                n.getRelatedPieceId(),
                n.getRelatedEodId(),
                n.getRelatedEodDate()
        );
    }
}
