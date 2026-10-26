package com.nforceone.sync.admin;

import tools.jackson.databind.ObjectMapper;
import com.nforceone.sync.admin.dto.UpdateUserRequest;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.PasswordResetTokenRepository;
import com.nforceone.sync.email.EmailService;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.org.DepartmentRepository;
import com.nforceone.sync.org.DesignationRepository;
import com.nforceone.sync.org.OrgLocationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/** Update semantics for the Reporting Manager: absent = keep, JSON null = clear, id = set. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UserServiceUpdateManagerTest {

    @Mock AppUserRepository userRepository;
    @Mock AuditLogRepository auditLogRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock DepartmentRepository departmentRepository;
    @Mock DesignationRepository designationRepository;
    @Mock OrgLocationRepository locationRepository;
    @Mock EmailService emailService;
    @Mock NotificationService notificationService;
    @Mock PasswordResetTokenRepository passwordResetTokenRepository;

    private final ObjectMapper mapper = new ObjectMapper();
    private UserService service;
    private AppUser actor, oldManager, newManager;

    private static AppUser user(long id, AppUser.Role role) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setFullName("User " + id);
        u.setEmail("u" + id + "@x.com");
        u.setRole(role);
        u.setStatus(AppUser.Status.ACTIVE);
        return u;
    }

    @BeforeEach
    void setUp() {
        service = new UserService(userRepository, auditLogRepository, passwordEncoder, mapper,
                departmentRepository, designationRepository, locationRepository,
                emailService, notificationService, passwordResetTokenRepository);
        actor = user(1, AppUser.Role.ADMIN);
        oldManager = user(10, AppUser.Role.SUPERADMIN);
        newManager = user(11, AppUser.Role.SUPERADMIN);
        when(userRepository.findByEmailAndDeletedAtIsNull("admin@x.com")).thenReturn(Optional.of(actor));
        when(userRepository.findById(10L)).thenReturn(Optional.of(oldManager));
        when(userRepository.findById(11L)).thenReturn(Optional.of(newManager));
        when(userRepository.save(any(AppUser.class))).thenAnswer(i -> i.getArgument(0));
    }

    private AppUser target(AppUser.Role role) {
        AppUser t = user(5, role);
        t.setManager(oldManager);
        when(userRepository.findById(5L)).thenReturn(Optional.of(t));
        return t;
    }

    private UpdateUserRequest request(AppUser.Role role, Optional<Long> managerId) {
        return new UpdateUserRequest("Target User", role, null, null, null, null, null, null, managerId);
    }

    @Test
    void managerAbsent_keepsExistingManager() {
        AppUser t = target(AppUser.Role.SUPERADMIN);
        when(userRepository.countByRoleAndStatus(any(), any())).thenReturn(2L);
        service.updateUser(5L, request(AppUser.Role.SUPERADMIN, null), "admin@x.com");
        assertSame(oldManager, t.getManager());
    }

    @Test
    void managerNull_clearsManager() {
        AppUser t = target(AppUser.Role.SUPERADMIN);
        when(userRepository.countByRoleAndStatus(any(), any())).thenReturn(2L);
        service.updateUser(5L, request(AppUser.Role.SUPERADMIN, Optional.empty()), "admin@x.com");
        assertNull(t.getManager());
    }

    @Test
    void managerId_setsNewManager() {
        AppUser t = target(AppUser.Role.SUPERADMIN);
        when(userRepository.countByRoleAndStatus(any(), any())).thenReturn(2L);
        service.updateUser(5L, request(AppUser.Role.SUPERADMIN, Optional.of(11L)), "admin@x.com");
        assertSame(newManager, t.getManager());
    }

    @Test
    void managerNull_forRoleThatRequiresOne_isRejectedAndManagerKept() {
        AppUser t = target(AppUser.Role.EMPLOYEE);
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.updateUser(5L, request(AppUser.Role.EMPLOYEE, Optional.empty()), "admin@x.com"));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertSame(oldManager, t.getManager());
    }

    @Test
    void jsonDeserialization_distinguishesAbsentNullAndId() {
        String base = "{\"fullName\":\"A B\",\"role\":\"SUPERADMIN\"";
        assertNull(mapper.readValue(base + "}", UpdateUserRequest.class).managerId());
        assertEquals(Optional.empty(), mapper.readValue(base + ",\"managerId\":null}", UpdateUserRequest.class).managerId());
        assertEquals(Optional.of(11L), mapper.readValue(base + ",\"managerId\":11}", UpdateUserRequest.class).managerId());
    }
}
