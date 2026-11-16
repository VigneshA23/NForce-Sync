package com.nforceone.sync.auth;

import com.nforceone.sync.admin.UserService;
import com.nforceone.sync.auth.dto.ForgotPasswordRequest;
import com.nforceone.sync.auth.dto.LoginRequest;
import com.nforceone.sync.config.BusinessClock;
import com.nforceone.sync.eod.BenchModePolicy;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.PmScopeService;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.reporting.ReportingScopeService;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Sign-in with a reset-issued temporary password, the reset-link status check, and the request-a-new-link
 * endpoint. Time moves via {@link MutableClock}; expiry is always the stored UTC instant.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AuthControllerResetFlowTest {

    private static final Instant SENT = Instant.parse("2026-11-16T11:07:00Z"); // 4:37 PM IST

    @Mock AuthenticationManager authenticationManager;
    @Mock JwtService jwtService;
    @Mock AppUserRepository appUserRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock UserService userService;
    @Mock AccountLockoutService accountLockoutService;
    @Mock PasswordResetTokenRepository tokenRepository;
    @Mock ProjectRepository projectRepository;
    @Mock AllocationRepository allocationRepository;
    @Mock PmScopeService pmScopeService;
    @Mock ReportingScopeService reportingScopeService;
    @Mock BenchModePolicy benchModePolicy;

    private MutableClock clock;
    private PasswordResetPolicy policy;
    private AuthController controller;
    private AppUser user;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(SENT);
        policy = new PasswordResetPolicy(10, new BusinessClock(ZoneId.of("Asia/Kolkata"), clock));
        controller = new AuthController(authenticationManager, jwtService, appUserRepository, passwordEncoder,
                userService, accountLockoutService, tokenRepository, projectRepository, allocationRepository,
                pmScopeService, reportingScopeService, benchModePolicy, policy,
                new ResetRequestRateLimiter(3, Duration.ofMinutes(15)));

        user = new AppUser();
        user.setId(7L);
        user.setFullName("Asha Rao");
        user.setEmail("asha@x.com");
        user.setRole(AppUser.Role.EMPLOYEE);
        user.setStatus(AppUser.Status.ACTIVE);
        user.setMustChangePassword(true);
        user.setCreatedAt(OffsetDateTime.parse("2026-01-01T00:00:00Z"));

        when(appUserRepository.findByEmailAndDeletedAtIsNull("asha@x.com")).thenReturn(Optional.of(user));
        when(accountLockoutService.lockedSecondsRemaining(any())).thenReturn(Optional.empty());
        when(authenticationManager.authenticate(any(UsernamePasswordAuthenticationToken.class)))
                .thenAnswer(i -> new UsernamePasswordAuthenticationToken(new AppUserDetails(user), "x"));
        when(jwtService.generateToken(any())).thenReturn("jwt");
    }

    private PasswordResetToken token(String value, OffsetDateTime expiresAt, boolean used) {
        PasswordResetToken t = new PasswordResetToken();
        t.setUser(user);
        t.setToken(value);
        t.setExpiresAt(expiresAt);
        t.setUsed(used);
        return t;
    }

    /** Issues a token exactly as UserService does: sentAt + policy TTL, in UTC. */
    private PasswordResetToken issue(String value) {
        PasswordResetToken t = token(value, policy.expiryFor(clock.instant()), false);
        when(tokenRepository.findFirstByUserIdOrderByIdDesc(7L)).thenReturn(Optional.of(t));
        when(tokenRepository.findByToken(value)).thenReturn(Optional.of(t));
        return t;
    }

    private ResponseEntity<?> login() {
        return controller.login(new LoginRequest("asha@x.com", "NFSync@123456"));
    }

    // ── login with the temporary password ───────────────────────────────────

    @Test
    void tempPasswordLoginWorksWithinTenMinutes() {
        issue("tok");
        clock.advance(Duration.ofMinutes(9).plusSeconds(59));
        assertEquals(HttpStatus.OK, login().getStatusCode());
    }

    @Test
    void tempPasswordLoginFailsAfterTenMinutes() {
        issue("tok");
        clock.advance(Duration.ofMinutes(10));
        ResponseEntity<?> res = login();

        assertEquals(HttpStatus.UNAUTHORIZED, res.getStatusCode());
        @SuppressWarnings("unchecked") Map<String, Object> body = (Map<String, Object>) res.getBody();
        assertEquals("TEMP_PASSWORD_EXPIRED", body.get("code"));
        verify(jwtService, never()).generateToken(any());
        // An expired temp password is not a bad-password attempt — it must not feed the lockout counter.
        verify(accountLockoutService, never()).recordFailure(any());
    }

    @Test
    void wrongPasswordAfterExpiryStillJustFailsAsBadCredentials() {
        issue("tok");
        clock.advance(Duration.ofMinutes(30));
        when(authenticationManager.authenticate(any(UsernamePasswordAuthenticationToken.class)))
                .thenThrow(new org.springframework.security.authentication.BadCredentialsException("bad"));
        assertEquals(HttpStatus.UNAUTHORIZED, login().getStatusCode()); // generic path; no expiry probing
    }

    @Test
    void newTempPasswordWorksEvenThoughAnOlderOneExpired() {
        // Old token retired (used) and expired; the newest one is live.
        issue("old");
        clock.advance(Duration.ofMinutes(11));
        issue("new");
        assertEquals(HttpStatus.OK, login().getStatusCode());
    }

    @Test
    void userWithoutAnyResetToken_isUnaffected() {
        when(tokenRepository.findFirstByUserIdOrderByIdDesc(7L)).thenReturn(Optional.empty());
        clock.advance(Duration.ofDays(30));
        assertEquals(HttpStatus.OK, login().getStatusCode());
    }

    @Test
    void ordinaryPasswordIsNeverExpiredByAResetToken() {
        user.setMustChangePassword(false);
        issue("tok");
        clock.advance(Duration.ofDays(1));
        assertEquals(HttpStatus.OK, login().getStatusCode());
    }

    // ── the emailed link ───────────────────────────────────────────────────

    @Test
    void linkIsValidWithinTenMinutes() {
        issue("tok");
        clock.advance(Duration.ofMinutes(9));
        assertEquals(true, controller.resetPasswordTokenStatus("tok").getBody().get("valid"));
    }

    @Test
    void linkOpenedAfterExpiryIsReportedInvalid() {
        issue("tok");
        clock.advance(Duration.ofMinutes(10).plusSeconds(1));
        assertEquals(false, controller.resetPasswordTokenStatus("tok").getBody().get("valid"));
    }

    @Test
    void usedOrUnknownLinkIsReportedInvalid() {
        PasswordResetToken t = token("used", policy.expiryFor(clock.instant()), true);
        when(tokenRepository.findByToken("used")).thenReturn(Optional.of(t));
        when(tokenRepository.findByToken("nope")).thenReturn(Optional.empty());
        assertEquals(false, controller.resetPasswordTokenStatus("used").getBody().get("valid"));
        assertEquals(false, controller.resetPasswordTokenStatus("nope").getBody().get("valid"));
        assertEquals(false, controller.resetPasswordTokenStatus(" ").getBody().get("valid"));
    }

    @Test
    void oldLinkIsInvalidOnceNewerOneIsIssued() {
        // UserService retires the old token (used=true) when it issues the new one; the status check honours it.
        PasswordResetToken old = issue("old");
        old.setUsed(true);
        issue("new");
        assertEquals(false, controller.resetPasswordTokenStatus("old").getBody().get("valid"));
        assertEquals(true, controller.resetPasswordTokenStatus("new").getBody().get("valid"));
    }

    // ── request a new link ─────────────────────────────────────────────────

    @Test
    void newLinkRequestAnswersWithTheGenericMessageAndNormalisesTheEmail() {
        ResponseEntity<Map<String, String>> res =
                controller.forgotPassword(new ForgotPasswordRequest("  Asha@X.com "));
        assertEquals(HttpStatus.OK, res.getStatusCode());
        assertEquals("If this email is registered, a new link has been sent.", res.getBody().get("message"));
        verify(userService).forgotPassword("asha@x.com");
    }

    @Test
    void responseIsIdenticalWhetherOrNotTheEmailIsRegistered() {
        // UserService.forgotPassword is a silent no-op for an unknown address; the controller can't tell.
        ResponseEntity<Map<String, String>> known = controller.forgotPassword(new ForgotPasswordRequest("asha@x.com"));
        ResponseEntity<Map<String, String>> unknown = controller.forgotPassword(new ForgotPasswordRequest("ghost@x.com"));
        assertEquals(known.getStatusCode(), unknown.getStatusCode());
        assertEquals(known.getBody(), unknown.getBody());
    }

    @Test
    void fourthRequestForTheSameAddressInFifteenMinutesIsThrottled() {
        for (int i = 0; i < 3; i++) {
            assertEquals(HttpStatus.OK, controller.forgotPassword(new ForgotPasswordRequest("asha@x.com")).getStatusCode());
        }
        ResponseEntity<Map<String, String>> fourth = controller.forgotPassword(new ForgotPasswordRequest("ASHA@x.com"));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, fourth.getStatusCode());
        verify(userService, org.mockito.Mockito.times(3)).forgotPassword(anyString());

        // Throttling is per address and the window slides.
        assertEquals(HttpStatus.OK, controller.forgotPassword(new ForgotPasswordRequest("other@x.com")).getStatusCode());
        clock.advance(Duration.ofMinutes(15));
        assertEquals(HttpStatus.OK, controller.forgotPassword(new ForgotPasswordRequest("asha@x.com")).getStatusCode());
    }

    @Test
    void throttlingAppliesToUnregisteredAddressesToo() {
        for (int i = 0; i < 3; i++) controller.forgotPassword(new ForgotPasswordRequest("ghost@x.com"));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS,
                controller.forgotPassword(new ForgotPasswordRequest("ghost@x.com")).getStatusCode());
    }

    @Test
    void emailFormatIsValidatedOnTheBackend() {
        Validator v = Validation.buildDefaultValidatorFactory().getValidator();
        for (String bad : new String[]{"", "   ", "not-an-email", "a@b", "a b@c.com", "@x.com", "a@.com"}) {
            assertFalse(v.validate(new ForgotPasswordRequest(bad)).isEmpty(), "should reject: '" + bad + "'");
        }
        for (String good : new String[]{"asha@x.com", "first.last+tag@nforceone.com"}) {
            assertTrue(v.validate(new ForgotPasswordRequest(good)).isEmpty(), "should accept: " + good);
        }
    }
}
