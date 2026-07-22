package com.nforceone.sync.auth;

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
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final AppUserRepository appUserRepository;

    public AuthController(AuthenticationManager authenticationManager,
                          JwtService jwtService,
                          AppUserRepository appUserRepository) {
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
        this.appUserRepository = appUserRepository;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request) {
        try {
            Authentication auth = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.email(), request.password())
            );
            AppUser user = ((AppUserDetails) auth.getPrincipal()).getAppUser();
            String token = jwtService.generateToken(user);
            return ResponseEntity.ok(new LoginResponse(token, UserDto.from(user)));
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
        // Email delivery is stubbed. Always return the same generic message so
        // callers cannot determine whether the email is registered.
        return ResponseEntity.ok(Map.of(
                "message", "If that email exists, a reset link has been sent"
        ));
    }

    @GetMapping("/me")
    public ResponseEntity<UserDto> me() {
        String email = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        AppUser user = appUserRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Authenticated user no longer exists"));
        return ResponseEntity.ok(UserDto.from(user));
    }
}
