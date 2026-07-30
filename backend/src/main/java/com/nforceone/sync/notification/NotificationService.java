package com.nforceone.sync.notification;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.Map;

@Service
@Transactional
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final NotificationRepository notificationRepository;
    private final AppUserRepository userRepository;

    public NotificationService(NotificationRepository notificationRepository,
                               AppUserRepository userRepository) {
        this.notificationRepository = notificationRepository;
        this.userRepository         = userRepository;
    }

    // ── Public trigger API (called from other services) ──────────────────────

    public void send(Long userId, String type, String title, String message, String link) {
        try {
            AppUser user = userRepository.findById(userId).orElse(null);
            if (user == null || user.getDeletedAt() != null) return;

            Notification n = new Notification();
            n.setUser(user);
            n.setType(type);
            n.setTitle(title);
            n.setMessage(message);
            n.setLink(link);
            n.setCreatedAt(OffsetDateTime.now());
            notificationRepository.save(n);
        } catch (Exception ex) {
            // Notification failures must never abort the triggering transaction
            log.error("Failed to create notification for userId={}: {}", userId, ex.getMessage());
        }
    }

    // ── Reader endpoints ─────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public Page<NotificationDto> list(String email, int page, int size) {
        Long userId = requireUserId(email);
        return notificationRepository
                .findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(page, size))
                .map(NotificationDto::from);
    }

    @Transactional(readOnly = true)
    public Map<String, Long> unreadCount(String email) {
        Long userId = requireUserId(email);
        return Map.of("count", notificationRepository.countByUserIdAndReadFalse(userId));
    }

    // ── Mutations ────────────────────────────────────────────────────────────

    public void markRead(Long id, String email) {
        Long userId = requireUserId(email);
        int updated = notificationRepository.markRead(id, userId);
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "Notification not found or does not belong to you");
        }
    }

    public void markAllRead(String email) {
        Long userId = requireUserId(email);
        notificationRepository.markAllRead(userId);
    }

    // ── Private ──────────────────────────────────────────────────────────────

    private Long requireUserId(String email) {
        return userRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"))
                .getId();
    }
}
