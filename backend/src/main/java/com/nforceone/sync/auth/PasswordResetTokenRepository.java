package com.nforceone.sync.auth;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import java.util.Optional;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {
    // JOIN FETCH the user eagerly: with open-in-view disabled, the repository's transaction
    // closes before the controller touches resetToken.getUser() — a lazy load there throws
    // LazyInitializationException (surfaces as a 500), so the association must load here instead.
    @Query("SELECT t FROM PasswordResetToken t JOIN FETCH t.user WHERE t.token = :token")
    Optional<PasswordResetToken> findByToken(@Param("token") String token);

    /** The most recently issued token — the one whose expiry governs the user's current temporary password. */
    Optional<PasswordResetToken> findFirstByUserIdOrderByIdDesc(Long userId);

    /**
     * Retires every outstanding link for the user. Called when a new reset is issued (so the previous
     * link stops working at once) and when the user sets a real password.
     */
    @Transactional
    // No clearAutomatically: callers hold a managed AppUser they go on to modify, and clearing the
    // persistence context would detach it. No token entity is loaded in these flows, so nothing goes stale.
    @Modifying(flushAutomatically = true)
    @Query("UPDATE PasswordResetToken t SET t.used = true WHERE t.user.id = :userId AND t.used = false")
    int invalidateAllForUser(@Param("userId") Long userId);
}
