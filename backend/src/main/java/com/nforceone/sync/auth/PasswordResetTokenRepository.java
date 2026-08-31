package com.nforceone.sync.auth;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {
    // JOIN FETCH the user eagerly: with open-in-view disabled, the repository's transaction
    // closes before the controller touches resetToken.getUser() — a lazy load there throws
    // LazyInitializationException (surfaces as a 500), so the association must load here instead.
    @Query("SELECT t FROM PasswordResetToken t JOIN FETCH t.user WHERE t.token = :token")
    Optional<PasswordResetToken> findByToken(@Param("token") String token);
}
