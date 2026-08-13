package com.nforceone.sync.notification;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    Page<Notification> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);

    long countByUserIdAndReadFalse(Long userId);

    /**
     * Whether this user already received a notification of {@code type} since {@code after}.
     *
     * Used by the EOD reminder job as its idempotency check instead of a "did I run in this
     * window" flag: keyed off the cutoff instant, it still holds after a restart, and a reminder
     * a manager already sent by hand counts as covering the same deadline.
     */
    boolean existsByUserIdAndTypeAndCreatedAtAfter(Long userId, String type,
                                                    java.time.OffsetDateTime after);

    @Modifying
    @Query("UPDATE Notification n SET n.read = true WHERE n.id = :id AND n.user.id = :userId")
    int markRead(Long id, Long userId);

    @Modifying
    @Query("UPDATE Notification n SET n.read = true WHERE n.user.id = :userId AND n.read = false")
    void markAllRead(Long userId);
}
