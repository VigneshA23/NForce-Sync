package com.nforceone.sync.admin;

import tools.jackson.databind.ObjectMapper;
import com.nforceone.sync.admin.dto.CreateUserRequest;
import com.nforceone.sync.admin.dto.UpdateUserRequest;
import com.nforceone.sync.admin.dto.UserCreateResult;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.PasswordResetTokenRepository;
import com.nforceone.sync.businessrules.ShiftDefinitionRepository;
import com.nforceone.sync.email.EmailService;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.org.DepartmentRepository;
import com.nforceone.sync.org.DesignationRepository;
import com.nforceone.sync.org.OrgLocation;
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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** A deactivated location can't be assigned to a user, but doesn't block saving an existing member. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UserServiceLocationTest {

    private static final long ACTIVE_LOC = 9L, INACTIVE_LOC = 7L, OTHER_INACTIVE_LOC = 8L;

    @Mock AppUserRepository userRepository;
    @Mock AuditLogRepository auditLogRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock DepartmentRepository departmentRepository;
    @Mock DesignationRepository designationRepository;
    @Mock OrgLocationRepository locationRepository;
    @Mock ShiftDefinitionRepository shiftRepository;
    @Mock EmailService emailService;
    @Mock NotificationService notificationService;
    @Mock PasswordResetTokenRepository passwordResetTokenRepository;

    private UserService service;

    private static AppUser user(long id, AppUser.Role role) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setFullName("User " + id);
        u.setEmail("u" + id + "@x.com");
        u.setRole(role);
        u.setStatus(AppUser.Status.ACTIVE);
        return u;
    }

    private static OrgLocation location(long id, String name, boolean active) {
        return OrgLocation.builder().id(id).name(name).active(active).build();
    }

    @BeforeEach
    void setUp() {
        service = new UserService(userRepository, auditLogRepository, passwordEncoder, new ObjectMapper(),
                departmentRepository, designationRepository, locationRepository, shiftRepository,
                emailService, notificationService, passwordResetTokenRepository);
        when(userRepository.findByEmailAndDeletedAtIsNull("admin@x.com"))
                .thenReturn(Optional.of(user(1, AppUser.Role.ADMIN)));
        when(userRepository.save(any(AppUser.class))).thenAnswer(i -> i.getArgument(0));
        when(userRepository.countByRoleAndStatus(any(), any())).thenReturn(2L);
        when(locationRepository.findById(ACTIVE_LOC))
                .thenReturn(Optional.of(location(ACTIVE_LOC, "Chennai", true)));
        when(locationRepository.findById(INACTIVE_LOC))
                .thenReturn(Optional.of(location(INACTIVE_LOC, "Hyderabad, India", false)));
        when(locationRepository.findById(OTHER_INACTIVE_LOC))
                .thenReturn(Optional.of(location(OTHER_INACTIVE_LOC, "Pune", false)));
    }

    private static CreateUserRequest createRequest(Long locationId) {
        return new CreateUserRequest("New Person", "new.person@nforceone.com", AppUser.Role.SUPERADMIN,
                "NF-20240040", null, null, locationId, null, null, null, null, "Female", null);
    }

    private static UpdateUserRequest updateRequest(Long locationId) {
        return new UpdateUserRequest("Target User", AppUser.Role.SUPERADMIN,
                null, null, locationId, null, null, null, null);
    }

    private AppUser existingUserOn(Long locationId) {
        AppUser t = user(5, AppUser.Role.SUPERADMIN);
        t.setLocationId(locationId);
        when(userRepository.findById(5L)).thenReturn(Optional.of(t));
        return t;
    }

    @Test
    void create_withInactiveLocation_isRejectedWith400() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.createUser(createRequest(INACTIVE_LOC), "admin@x.com"));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("inactive"));
        verify(userRepository, never()).save(any(AppUser.class));
    }

    @Test
    void create_withActiveLocation_isAccepted() {
        UserCreateResult result = service.createUser(createRequest(ACTIVE_LOC), "admin@x.com");
        assertEquals(ACTIVE_LOC, result.user().locationId());
    }

    @Test
    void update_userAlreadyOnInactiveLocation_canStillSaveOtherFields() {
        AppUser t = existingUserOn(INACTIVE_LOC);
        service.updateUser(5L, updateRequest(INACTIVE_LOC), "admin@x.com");
        assertEquals("Target User", t.getFullName());
        assertEquals(INACTIVE_LOC, t.getLocationId());
    }

    @Test
    void update_toADifferentInactiveLocation_isRejectedAndLocationKept() {
        AppUser t = existingUserOn(INACTIVE_LOC);
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.updateUser(5L, updateRequest(OTHER_INACTIVE_LOC), "admin@x.com"));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertEquals(INACTIVE_LOC, t.getLocationId());
    }

    @Test
    void update_fromInactiveToActiveLocation_isAccepted() {
        AppUser t = existingUserOn(INACTIVE_LOC);
        service.updateUser(5L, updateRequest(ACTIVE_LOC), "admin@x.com");
        assertEquals(ACTIVE_LOC, t.getLocationId());
    }

    @Test
    void update_unknownLocation_stillReturns400() {
        existingUserOn(null);
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.updateUser(5L, updateRequest(999L), "admin@x.com"));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertEquals("Location not found", ex.getReason());
    }
}
