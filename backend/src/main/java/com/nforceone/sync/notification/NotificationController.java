package com.nforceone.sync.notification;

import org.springframework.data.domain.Page;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    public Page<NotificationDto> list(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "20") int size) {
        return notificationService.list(email(), page, Math.min(size, 100));
    }

    @GetMapping("/unread-count")
    public Map<String, Long> unreadCount() {
        return notificationService.unreadCount(email());
    }

    @PatchMapping("/{id}/read")
    public void markRead(@PathVariable Long id) {
        notificationService.markRead(id, email());
    }

    @PatchMapping("/read-all")
    public void markAllRead() {
        notificationService.markAllRead(email());
    }

    private String email() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
