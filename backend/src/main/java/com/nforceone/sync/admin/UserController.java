package com.nforceone.sync.admin;

import com.nforceone.sync.admin.dto.CreateUserRequest;
import com.nforceone.sync.admin.dto.ResetPasswordRequest;
import com.nforceone.sync.admin.dto.SetStatusRequest;
import com.nforceone.sync.admin.dto.UpdateUserRequest;
import com.nforceone.sync.auth.dto.UserDto;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/users")
@PreAuthorize("hasRole('SUPERADMIN')")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserDto createUser(@Valid @RequestBody CreateUserRequest request) {
        return userService.createUser(request, actingEmail());
    }

    @GetMapping
    public List<UserDto> listUsers() {
        return userService.listUsers();
    }

    @GetMapping("/{id}")
    public UserDto getUser(@PathVariable Long id) {
        return userService.getUser(id);
    }

    @PatchMapping("/{id}")
    public UserDto updateUser(@PathVariable Long id,
                              @Valid @RequestBody UpdateUserRequest request) {
        return userService.updateUser(id, request, actingEmail());
    }

    @PatchMapping("/{id}/status")
    public UserDto setStatus(@PathVariable Long id,
                             @Valid @RequestBody SetStatusRequest request) {
        return userService.setStatus(id, request.status(), actingEmail());
    }

    @PostMapping("/{id}/reset-password")
    public Map<String, String> resetPassword(@PathVariable Long id,
                                             @Valid @RequestBody ResetPasswordRequest request) {
        userService.resetPassword(id, request.newPassword(), actingEmail());
        return Map.of("message", "Password updated");
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
