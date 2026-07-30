package com.nforceone.sync.notification;

import java.time.OffsetDateTime;

public record NotificationDto(
        Long id,
        String type,
        String title,
        String message,
        String link,
        boolean read,
        OffsetDateTime createdAt
) {
    public static NotificationDto from(Notification n) {
        return new NotificationDto(
                n.getId(),
                n.getType(),
                n.getTitle(),
                n.getMessage(),
                n.getLink(),
                n.isRead(),
                n.getCreatedAt()
        );
    }
}
