package com.nforceone.sync.admin;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.auth.MutableClock;
import com.nforceone.sync.auth.PasswordResetPolicy;
import com.nforceone.sync.auth.PasswordResetToken;
import com.nforceone.sync.auth.PasswordResetTokenRepository;
import com.nforceone.sync.businessrules.ShiftDefinitionRepository;
import com.nforceone.sync.config.BusinessClock;
import com.nforceone.sync.email.EmailService;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.org.DepartmentRepository;
import com.nforceone.sync.org.DesignationRepository;
import com.nforceone.sync.org.OrgLocationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.crypto.password.PasswordEncoder;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** "Request new link": a fresh 10-minute token, the previous one retired, the new email carrying the stored expiry. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UserServiceResetIssuanceTest {

    private static final Instant SENT = Instant.parse("2026-11-16T11:07:00Z"); // 4:37 PM IST

    @Mock AppUserRepository userRepository;
    @Mock AuditLogRepository auditLogRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock DepartmentRepository departmentRepository;
    @Mock DesignationRepository designationRepository;
    @Mock OrgLocationRepository locationRepository;
    @Mock ShiftDefinitionRepository shiftRepository;
    @Mock EmailService emailService;
    @Mock NotificationService notificationService;
    @Mock PasswordResetTokenRepository tokenRepository;

    private MutableClock clock;
    private UserService service;
    private AppUser user;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(SENT);
        PasswordResetPolicy policy = new PasswordResetPolicy(10, new BusinessClock(ZoneId.of("Asia/Kolkata"), clock));
        service = new UserService(userRepository, auditLogRepository, passwordEncoder, new ObjectMapper(),
                departmentRepository, designationRepository, locationRepository, shiftRepository,
                emailService, notificationService, tokenRepository, policy);

        user = new AppUser();
        user.setId(7L);
        user.setFullName("Asha Rao");
        user.setEmail("asha@x.com");
        user.setRole(AppUser.Role.EMPLOYEE);
        user.setStatus(AppUser.Status.ACTIVE);
        when(userRepository.findByEmailAndDeletedAtIsNull("asha@x.com")).thenReturn(Optional.of(user));
        when(userRepository.save(any(AppUser.class))).thenAnswer(i -> i.getArgument(0));
        when(passwordEncoder.encode(anyString())).thenReturn("hash");
        when(emailService.sendPasswordResetEmailSync(anyString(), anyString(), anyString(), anyString(), any()))
                .thenReturn(true);
    }

    @Test
    void newLinkEmailAndStoredTokenShareOneUtcExpiryTenMinutesAfterSending() {
        service.forgotPassword("asha@x.com");

        ArgumentCaptor<OffsetDateTime> emailed = ArgumentCaptor.forClass(OffsetDateTime.class);
        ArgumentCaptor<String> emailedToken = ArgumentCaptor.forClass(String.class);
        verify(emailService).sendPasswordResetEmailSync(eq("asha@x.com"), eq("Asha Rao"), anyString(),
                emailedToken.capture(), emailed.capture());

        ArgumentCaptor<PasswordResetToken> saved = ArgumentCaptor.forClass(PasswordResetToken.class);
        verify(tokenRepository).save(saved.capture());

        assertEquals(emailedToken.getValue(), saved.getValue().getToken());
        assertEquals(emailed.getValue(), saved.getValue().getExpiresAt(), "email and DB must not disagree");
        assertEquals(ZoneOffset.UTC, saved.getValue().getExpiresAt().getOffset());
        assertEquals(Duration.ofMinutes(10), Duration.between(SENT, saved.getValue().getExpiresAt().toInstant()));
        assertTrue(emailed.getValue().toInstant().isAfter(SENT), "displayed expiry is later than the send time");
        assertFalse(saved.getValue().isUsed());
    }

    @Test
    void previousLinksAreRetiredBeforeTheNewOneIsStored_andTheTempPasswordIsReplaced() {
        service.forgotPassword("asha@x.com");

        InOrder order = inOrder(tokenRepository, userRepository);
        order.verify(tokenRepository).invalidateAllForUser(7L);
        order.verify(tokenRepository).save(any(PasswordResetToken.class));
        // Overwriting the hash is what kills the previous temporary password.
        verify(passwordEncoder).encode(anyString());
        assertTrue(user.isMustChangePassword());
        assertEquals("hash", user.getPasswordHash());
    }

    @Test
    void secondRequestIssuesADifferentTokenAndTempPassword() {
        service.forgotPassword("asha@x.com");
        clock.advance(Duration.ofMinutes(2));
        service.forgotPassword("asha@x.com");

        ArgumentCaptor<String> tokens = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> passwords = ArgumentCaptor.forClass(String.class);
        verify(emailService, org.mockito.Mockito.times(2)).sendPasswordResetEmailSync(
                anyString(), anyString(), passwords.capture(), tokens.capture(), any());
        assertNotEquals(tokens.getAllValues().get(0), tokens.getAllValues().get(1));
        verify(tokenRepository, org.mockito.Mockito.times(2)).invalidateAllForUser(7L);

        ArgumentCaptor<PasswordResetToken> saved = ArgumentCaptor.forClass(PasswordResetToken.class);
        verify(tokenRepository, org.mockito.Mockito.times(2)).save(saved.capture());
        // The second expiry is measured from the second send, not the first.
        assertEquals(Duration.ofMinutes(12),
                Duration.between(SENT, saved.getAllValues().get(1).getExpiresAt().toInstant()));
    }

    @Test
    void unknownAddressSendsNothingAndChangesNothing() {
        service.forgotPassword("ghost@x.com");
        verify(emailService, never()).sendPasswordResetEmailSync(anyString(), anyString(), anyString(), anyString(), any());
        verify(tokenRepository, never()).save(any());
        verify(tokenRepository, never()).invalidateAllForUser(any());
    }

    @Test
    void failedSendLeavesTheExistingPasswordAndLinksAlone() {
        when(emailService.sendPasswordResetEmailSync(anyString(), anyString(), anyString(), anyString(), any()))
                .thenReturn(false);
        user.setPasswordHash("existing");
        service.forgotPassword("asha@x.com");

        assertEquals("existing", user.getPasswordHash());
        verify(tokenRepository, never()).invalidateAllForUser(any());
        verify(tokenRepository, never()).save(any());
    }

    @Test
    void emailIsMatchedCaseInsensitively() {
        service.forgotPassword("  ASHA@x.com ");
        verify(emailService).sendPasswordResetEmailSync(eq("asha@x.com"), anyString(), anyString(), anyString(), any());
    }
}
