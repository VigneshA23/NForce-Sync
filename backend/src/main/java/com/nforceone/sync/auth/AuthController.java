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

import java.util.Map;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Pattern PASSWORD_COMPLEXITY =
            Pattern.compile("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^a-zA-Z\\d]).{8,}$");

    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final AppUserRepository appUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final UserService userService;

    public AuthController(AuthenticationManager authenticationManager,
                          JwtService jwtService,
                          AppUserRepository appUserRepository,
                          PasswordEncoder passwordEncoder,
                          UserService userService) {
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
        this.appUserRepository = appUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.userService = userService;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request) {
        try {
            Authentication auth = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.email(), request.password())
            );
            AppUser user = ((AppUserDetails) auth.getPrincipal()).getAppUser();
            String token = jwtService.generateToken(user);
            return ResponseEntity.ok(
                    new LoginResponse(token, UserDto.from(user), user.isMustChangePassword()));
        } catch (BadCredentialsException e) {
            // Same message for wrong password, unknown email, and inactive account —
            // never reveal which case it was (user enumeration prevention).
            return ResponseEntity.status(401)
                    .body(Map.of("error", "Invalid email or password"));
        }
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
                .orElseThrow(() -> new RuntimeException("Authenticated user no longer exists"));
        return ResponseEntity.ok(UserDto.from(user));
    }

    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        String email = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        AppUser user = appUserRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));

        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(Map.of("error", "Current password is incorrect"));
        }

        if (!PASSWORD_COMPLEXITY.matcher(request.newPassword()).matches()) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(Map.of("error",
                            "Password must have uppercase, lowercase, digit, and symbol"));
        }

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        user.setMustChangePassword(false);
        appUserRepository.save(user);

        // Issue a fresh token with mustChangePassword=false
        String newToken = jwtService.generateToken(user);
        return ResponseEntity.ok(
                new LoginResponse(newToken, UserDto.from(user), false));
    }
}
