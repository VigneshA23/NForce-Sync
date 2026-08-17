package com.nforceone.sync.auth;

import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.OptionalInt;

/**
 * Account Lockout — temporarily blocks sign-in for one account after too many consecutive failures.
 *
 * <p>Lives in its own transactional service rather than in {@link AuthController} because the
 * failure path runs inside a caught {@code BadCredentialsException}, where the controller has no
 * transaction of its own to write the counter with.
 *
 * <p>The lock is per account, not per browser: the counter is a column on {@code app_user}, so it
 * survives a refresh, a new tab, and direct API calls, and locking one account never affects
 * anyone else's sign-in.
 */
@Service
@Transactional
public class AccountLockoutService {

    /** Used only if the singleton business-rule row is somehow missing. */
    private static final int DEFAULT_ATTEMPT_THRESHOLD = 5;
    private static final int DEFAULT_DURATION_MINUTES  = 15;
    private static final long CONFIG_ID = 1L;

    private final AppUserRepository userRepository;
    private final BusinessRuleConfigRepository configRepository;

    public AccountLockoutService(AppUserRepository userRepository,
                                 BusinessRuleConfigRepository configRepository) {
        this.userRepository   = userRepository;
        this.configRepository = configRepository;
    }

    /**
     * Seconds until the account's lock expires, or empty when it is not locked (including for an
     * email that has no account — an unknown address must stay indistinguishable from a wrong
     * password).
     */
    @Transactional(readOnly = true)
    public Optional<Long> lockedSecondsRemaining(String email) {
        return findUser(email).flatMap(user -> {
            OffsetDateTime until = user.getLockedUntil();
            if (until == null || !until.isAfter(OffsetDateTime.now())) return Optional.empty();
            // Round up: 0.4s remaining should still read as "1 second", never as "unlocked".
            long seconds = Duration.between(OffsetDateTime.now(), until).toSeconds();
            return Optional.of(Math.max(1, seconds));
        });
    }

    /**
     * Records one failed sign-in and applies the lock once the threshold is reached.
     *
     * <p>There is nothing to count for an email with no account, so the result is empty rather than
     * a fabricated allowance — a countdown toward a lockout that can never happen is noise for
     * someone who simply mistyped their address. (This does let a caller distinguish a real account
     * from an unknown one; that trade-off is already accepted here, since the lockout response
     * itself only ever applies to accounts that exist.)
     *
     * @return attempts remaining before the lock, 0 if this failure just triggered it, or empty when
     *         the email has no account.
     */
    public OptionalInt recordFailure(String email) {
        int threshold = threshold();
        Optional<AppUser> found = findUser(email);
        if (found.isEmpty()) return OptionalInt.empty();

        AppUser user = found.get();
        int attempts = user.getFailedLoginAttempts() + 1;

        if (attempts >= threshold) {
            // Counter resets as the lock is applied, so the next window starts clean rather than
            // re-locking on the very first failure after expiry.
            user.setFailedLoginAttempts(0);
            user.setLockedUntil(OffsetDateTime.now().plusMinutes(durationMinutes()));
            userRepository.save(user);
            return OptionalInt.of(0);
        }

        user.setFailedLoginAttempts(attempts);
        userRepository.save(user);
        return OptionalInt.of(threshold - attempts);
    }

    /** Clears lockout state after a successful sign-in. */
    public void recordSuccess(String email) {
        findUser(email).ifPresent(this::clear);
    }

    /**
     * Clears lockout state for an account whose password was just reset or changed — the lock screen
     * offers "Reset password" as the way out, so it has to actually release the lock.
     */
    public void clearLock(AppUser user) {
        clear(user);
    }

    /** Minutes the lock lasts, per current business rules — read fresh so edits apply immediately. */
    public int durationMinutes() {
        return config().map(BusinessRuleConfig::getLockoutDurationMinutes)
                .orElse(DEFAULT_DURATION_MINUTES);
    }

    /** Consecutive failures required to lock, per current business rules. */
    public int threshold() {
        return config().map(BusinessRuleConfig::getLockoutAttemptThreshold)
                .orElse(DEFAULT_ATTEMPT_THRESHOLD);
    }

    private void clear(AppUser user) {
        if (user.getFailedLoginAttempts() == 0 && user.getLockedUntil() == null) return;
        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);
        userRepository.save(user);
    }

    private Optional<BusinessRuleConfig> config() {
        return configRepository.findById(CONFIG_ID);
    }

    // Deleted-aware, per the convention documented on AppUserRepository: an email can be reused
    // after a soft delete, so the deleted-inclusive findByEmail can match several rows and blow up
    // an Optional query.
    private Optional<AppUser> findUser(String email) {
        if (email == null || email.isBlank()) return Optional.empty();
        return userRepository.findByEmailAndDeletedAtIsNull(email);
    }
}
