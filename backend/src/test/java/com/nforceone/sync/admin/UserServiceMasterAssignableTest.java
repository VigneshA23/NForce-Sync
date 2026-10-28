package com.nforceone.sync.admin;

import tools.jackson.databind.ObjectMapper;
import com.nforceone.sync.admin.dto.CreateUserRequest;
import com.nforceone.sync.admin.dto.UpdateUserRequest;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.PasswordResetTokenRepository;
import com.nforceone.sync.businessrules.ShiftDefinition;
import com.nforceone.sync.businessrules.ShiftDefinitionRepository;
import com.nforceone.sync.email.EmailService;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.org.Department;
import com.nforceone.sync.org.DepartmentRepository;
import com.nforceone.sync.org.Designation;
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

import java.time.LocalTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Department, Designation and Shift follow the same rule as Location: an inactive or unknown value
 * can't be assigned, a user already on an inactive value can still be saved, null means "none".
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UserServiceMasterAssignableTest {

    private static final long ACTIVE = 9L, INACTIVE = 7L, OTHER_INACTIVE = 8L, MISSING = 999L;

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

    private static Department dept(long id, boolean active) {
        return Department.builder().id(id).name("Dept " + id).active(active).build();
    }

    private static Designation desig(long id, boolean active) {
        return Designation.builder().id(id).title("Title " + id).active(active).build();
    }

    private static ShiftDefinition shift(long id, boolean active) {
        return ShiftDefinition.builder().id(id).name("Shift " + id)
                .startTime(LocalTime.of(9, 0)).endTime(LocalTime.of(18, 0)).active(active).build();
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
        when(departmentRepository.findById(ACTIVE)).thenReturn(Optional.of(dept(ACTIVE, true)));
        when(departmentRepository.findById(INACTIVE)).thenReturn(Optional.of(dept(INACTIVE, false)));
        when(departmentRepository.findById(OTHER_INACTIVE)).thenReturn(Optional.of(dept(OTHER_INACTIVE, false)));
        when(designationRepository.findById(ACTIVE)).thenReturn(Optional.of(desig(ACTIVE, true)));
        when(designationRepository.findById(INACTIVE)).thenReturn(Optional.of(desig(INACTIVE, false)));
        when(designationRepository.findById(OTHER_INACTIVE)).thenReturn(Optional.of(desig(OTHER_INACTIVE, false)));
        when(shiftRepository.findById(ACTIVE)).thenReturn(Optional.of(shift(ACTIVE, true)));
        when(shiftRepository.findById(INACTIVE)).thenReturn(Optional.of(shift(INACTIVE, false)));
        when(shiftRepository.findById(OTHER_INACTIVE)).thenReturn(Optional.of(shift(OTHER_INACTIVE, false)));
    }

    private static CreateUserRequest create(Long dept, Long desig, Long shift) {
        return new CreateUserRequest("New Person", "new.person@nforceone.com", AppUser.Role.SUPERADMIN,
                "NF-20240040", dept, desig, null, shift, null, null, null, "Female", null);
    }

    private static UpdateUserRequest update(Long dept, Long desig, Long shift) {
        return new UpdateUserRequest("Target User", AppUser.Role.SUPERADMIN,
                dept, desig, null, shift, null, null, null);
    }

    private AppUser existing(Long dept, Long desig, Long shift) {
        AppUser t = user(5, AppUser.Role.SUPERADMIN);
        t.setDepartmentId(dept);
        t.setDesignationId(desig);
        t.setShiftId(shift);
        when(userRepository.findById(5L)).thenReturn(Optional.of(t));
        return t;
    }

    private static void assertRejectedWith(String text, org.junit.jupiter.api.function.Executable call) {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, call);
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains(text), ex.getReason());
    }

    // ── Create ─────────────────────────────────────────────────────────────────

    @Test
    void create_withInactiveDepartment_isRejected() {
        assertRejectedWith("Department", () -> service.createUser(create(INACTIVE, null, null), "admin@x.com"));
        verify(userRepository, never()).save(any(AppUser.class));
    }

    @Test
    void create_withInactiveDesignation_isRejected() {
        assertRejectedWith("Designation", () -> service.createUser(create(null, INACTIVE, null), "admin@x.com"));
        verify(userRepository, never()).save(any(AppUser.class));
    }

    @Test
    void create_withInactiveShift_isRejected() {
        assertRejectedWith("Reactivate it in Business Rules",
                () -> service.createUser(create(null, null, INACTIVE), "admin@x.com"));
        verify(userRepository, never()).save(any(AppUser.class));
    }

    @Test
    void create_withUnknownShift_isRejectedAs400NotAForeignKeyError() {
        assertRejectedWith("Shift not found", () -> service.createUser(create(null, null, MISSING), "admin@x.com"));
    }

    @Test
    void create_withActiveValues_isAccepted() {
        var result = service.createUser(create(ACTIVE, ACTIVE, ACTIVE), "admin@x.com");
        assertEquals(ACTIVE, result.user().departmentId());
        assertEquals(ACTIVE, result.user().designationId());
        assertEquals(ACTIVE, result.user().shiftId());
    }

    @Test
    void create_withNoShiftDepartmentOrDesignation_isStillValid() {
        var result = service.createUser(create(null, null, null), "admin@x.com");
        assertNull(result.user().shiftId());
        assertNull(result.user().departmentId());
    }

    // ── Update ─────────────────────────────────────────────────────────────────

    @Test
    void update_userAlreadyOnInactiveValues_canStillSaveOtherFields() {
        AppUser t = existing(INACTIVE, INACTIVE, INACTIVE);
        service.updateUser(5L, update(INACTIVE, INACTIVE, INACTIVE), "admin@x.com");
        assertEquals("Target User", t.getFullName());
        assertEquals(INACTIVE, t.getDepartmentId());
        assertEquals(INACTIVE, t.getDesignationId());
        assertEquals(INACTIVE, t.getShiftId());
    }

    @Test
    void update_toADifferentInactiveDepartment_isRejectedAndValueKept() {
        AppUser t = existing(INACTIVE, null, null);
        assertRejectedWith("Department", () -> service.updateUser(5L, update(OTHER_INACTIVE, null, null), "admin@x.com"));
        assertEquals(INACTIVE, t.getDepartmentId());
    }

    @Test
    void update_toADifferentInactiveDesignation_isRejected() {
        existing(null, INACTIVE, null);
        assertRejectedWith("Designation", () -> service.updateUser(5L, update(null, OTHER_INACTIVE, null), "admin@x.com"));
    }

    @Test
    void update_toADifferentInactiveShift_isRejected() {
        AppUser t = existing(null, null, INACTIVE);
        assertRejectedWith("Shift", () -> service.updateUser(5L, update(null, null, OTHER_INACTIVE), "admin@x.com"));
        assertEquals(INACTIVE, t.getShiftId());
    }

    @Test
    void update_fromInactiveToActive_isAccepted() {
        AppUser t = existing(INACTIVE, INACTIVE, INACTIVE);
        service.updateUser(5L, update(ACTIVE, ACTIVE, ACTIVE), "admin@x.com");
        assertEquals(ACTIVE, t.getShiftId());
    }

    @Test
    void update_clearingShiftToNone_isValid() {
        AppUser t = existing(null, null, INACTIVE);
        service.updateUser(5L, update(null, null, null), "admin@x.com");
        assertNull(t.getShiftId());
    }
}
