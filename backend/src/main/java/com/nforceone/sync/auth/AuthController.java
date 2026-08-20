package com.nforceone.sync.auth;

import com.nforceone.sync.admin.UserService;
import com.nforceone.sync.auth.dto.ChangePasswordRequest;
import com.nforceone.sync.auth.dto.ForgotPasswordRequest;
import com.nforceone.sync.auth.dto.LoginRequest;
import com.nforceone.sync.auth.dto.LoginResponse;
import com.nforceone.sync.auth.dto.UserDto;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalInt;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final AppUserRepository appUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final UserService userService;
    private final AccountLockoutService accountLockoutService;

    public AuthController(AuthenticationManager authenticationManager,
                          JwtService jwtService,
                          AppUserRepository appUserRepository,
                          PasswordEncoder passwordEncoder,
                          UserService userService,
                          AccountLockoutService accountLockoutService) {
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
        this.appUserRepository = appUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.userService = userService;
        this.accountLockoutService = accountLockoutService;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request) {
        String email = request.email() == null ? null : request.email().trim().toLowerCase();

        // Deactivated accounts are reported plainly and never touch the lockout counters — a
        // super-admin already made the "you're out" decision, so counting attempts here (or
        // hiding it behind the generic bad-credentials message) would only confuse the user.
        Optional<AppUser> existing = email == null || email.isBlank()
                ? Optional.empty()
                : appUserRepository.findByEmailAndDeletedAtIsNull(email);
        if (existing.isPresent() && existing.get().getStatus() == AppUser.Status.INACTIVE) {
            return deactivatedResponse();
        }

        // Locked accounts never reach the authentication manager — a correct password must not
        // unlock early, otherwise the lock is only a speed bump for a credential-stuffing run.
        Optional<Long> lockedFor = accountLockoutService.lockedSecondsRemaining(email);
        if (lockedFor.isPresent()) {
            return lockedResponse(lockedFor.get());
        }

        try {
            Authentication auth = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(email, request.password())
            );
            AppUser user = ((AppUserDetails) auth.getPrincipal()).getAppUser();
            accountLockoutService.recordSuccess(email);
            String token = jwtService.generateToken(user);
            return ResponseEntity.ok(
                    new LoginResponse(token, UserDto.from(user), user.isMustChangePassword()));
        } catch (BadCredentialsException e) {
            OptionalInt attemptsRemaining = accountLockoutService.recordFailure(email);
            if (attemptsRemaining.isPresent() && attemptsRemaining.getAsInt() == 0) {
                // This failure tripped the lock — report the full window straight away rather than
                // making the user submit once more to discover they are locked out.
                return lockedResponse((long) accountLockoutService.durationMinutes() * 60);
            }

            // Same message for wrong password and unknown email.
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("error", "Invalid email or password");
            // Only sent when there is a real account counting down to a lockout. Omitted for an
            // unknown email, where the client would otherwise show a countdown toward a lockout
            // that can never happen.
            attemptsRemaining.ifPresent(remaining -> body.put("attemptsRemaining", remaining));
            return ResponseEntity.status(401).body(body);
        }
    }

    /**
     * 423 Locked — the account exists but is temporarily barred. Deliberately not 429, which would
     * describe request throttling rather than account state. retryAfterSeconds drives the countdown
     * on the sign-in and lockout screens, so the clock is anchored to the server, not the browser.
     */
    private ResponseEntity<Map<String, Object>> lockedResponse(long retryAfterSeconds) {
        return ResponseEntity.status(HttpStatus.LOCKED)
                .header("Retry-After", String.valueOf(retryAfterSeconds))
                .body(Map.of("error", "Account temporarily locked",
                             "retryAfterSeconds", retryAfterSeconds));
    }

    /** 403 Forbidden — the account exists but has been deactivated by a super admin. */
    private ResponseEntity<Map<String, Object>> deactivatedResponse() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("error",
                        "Your account has been deactivated. Please reach out to your Super Admin."));
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<Map<String, String>> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest request) {
        userService.forgotPassword(request.email());
        return ResponseEntity.ok(Map.of(
                "message", "If that email is registered, we've sent password reset instructions."
        ));
    }

    @GetMapping("/me")
    public ResponseEntity<UserDto> me() {
        String email = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        AppUser user = appUserRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
        return ResponseEntity.ok(UserDto.from(user));
    }

    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        String email = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        AppUser user = appUserRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));

        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Current password is incorrect"));
        }

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        user.setMustChangePassword(false);
        // Setting a new password releases any lockout — otherwise "Reset password", the escape
        // hatch the lock screen offers, would leave the user just as locked out as before.
        accountLockoutService.clearLock(user);
        appUserRepository.save(user);

        // Issue a fresh token with mustChangePassword=false
        String newToken = jwtService.generateToken(user);
        return ResponseEntity.ok(
                new LoginResponse(newToken, UserDto.from(user), false));
    }
}
