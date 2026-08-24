package com.nforceone.sync.admin;

import tools.jackson.databind.ObjectMapper;
import com.nforceone.sync.admin.dto.CreateUserRequest;
import com.nforceone.sync.admin.dto.UpdateUserRequest;
import com.nforceone.sync.admin.dto.UserCreateResult;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLog;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.auth.dto.UserDto;
import com.nforceone.sync.email.EmailService;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.org.DepartmentRepository;
import com.nforceone.sync.org.DesignationRepository;
import com.nforceone.sync.org.OrgLocation;
import com.nforceone.sync.org.OrgLocationRepository;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

@Service
@Transactional
public class UserService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(UserService.class);

    private static final SecureRandom RANDOM = new SecureRandom();

    // Mirrors frontend ROLE_LABELS (src/lib/nav.ts) so free-text search ("team lead",
    // "hr admin") matches the label users actually see, not just the backend enum name.
    private static final Map<AppUser.Role, String> ROLE_LABELS = Map.of(
            AppUser.Role.EMPLOYEE,   "Employee",
            AppUser.Role.MANAGER,    "Team Lead",
            AppUser.Role.PM,         "Project Manager",
            AppUser.Role.DM,         "Delivery Manager",
            AppUser.Role.HR,         "HR Admin",
            AppUser.Role.FINANCE,    "Finance Admin",
            AppUser.Role.LEADERSHIP, "Leadership Viewer",
            AppUser.Role.SUPERADMIN, "Super Admin"
    );

    private final AppUserRepository userRepository;
    private final AuditLogRepository auditLogRepository;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper objectMapper;

    private final DepartmentRepository departmentRepository;
    private final DesignationRepository designationRepository;
    private final OrgLocationRepository locationRepository;
    private final EmailService emailService;
    private final NotificationService notificationService;

    public UserService(AppUserRepository userRepository,
                       AuditLogRepository auditLogRepository,
                       PasswordEncoder passwordEncoder,
                       ObjectMapper objectMapper,
                       DepartmentRepository departmentRepository,
                       DesignationRepository designationRepository,
                       OrgLocationRepository locationRepository,
                       EmailService emailService,
                       NotificationService notificationService) {
        this.userRepository        = userRepository;
        this.auditLogRepository    = auditLogRepository;
        this.passwordEncoder       = passwordEncoder;
        this.objectMapper          = objectMapper;
        this.departmentRepository  = departmentRepository;
        this.designationRepository = designationRepository;
        this.locationRepository    = locationRepository;
        this.emailService          = emailService;
        this.notificationService   = notificationService;
    }

    public UserCreateResult createUser(CreateUserRequest request, String actingEmail) {
        // Emails must always be stored/compared in lowercase — the client normalizes too,
        // but this is the authoritative point so uniqueness checks and storage never diverge.
        String email = request.email() == null ? null : request.email().trim().toLowerCase(java.util.Locale.ROOT);
        if (userRepository.existsByEmailAndDeletedAtIsNull(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "An account with this email already exists");
        }
        if (userRepository.existsByEmployeeCodeAndDeletedAtIsNull(request.employeeCode())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This Employee ID is already in use");
        }
        AppUser actor = requireActorByEmail(actingEmail);

        requireOrgReferencesExist(request.departmentId(), request.designationId(), request.locationId());

        String tempPassword = generateTempPassword();

        AppUser user = new AppUser();
        user.setFullName(request.fullName());
        user.setEmail(email);
        user.setEmployeeCode(request.employeeCode());
        user.setPasswordHash(passwordEncoder.encode(tempPassword));
        user.setRole(request.role());
        user.setStatus(AppUser.Status.ACTIVE);
        user.setMustChangePassword(true);
        user.setCreatedAt(OffsetDateTime.now());
        user.setCreatedBy(actor);

        // Org assignments
        user.setDepartmentId(request.departmentId());
        user.setDesignationId(request.designationId());
        user.setLocationId(request.locationId());
        user.setShiftId(request.shiftId());

        // Employee profile
        user.setEmploymentType(request.employmentType() != null ? request.employmentType() : "FULL_TIME");
        user.setWorkMode(request.workMode() != null ? request.workMode() : "ONSITE");
        user.setJoiningDate(request.joiningDate());

        // Manager assignment
        if (request.managerId() != null) {
            AppUser manager = userRepository.findById(request.managerId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reporting manager not found"));
            requireValidReportingManagerRole(request.role(), manager);
            user.setManager(manager);
        }

        user = userRepository.save(user);

        writeAudit("APP_USER", user.getId(), "CREATE", null, toJson(UserDto.from(user)), actor);

        emailService.sendInviteEmail(user.getEmail(), user.getFullName(), tempPassword);
        notificationService.send(user.getId(), "ACCOUNT_CREATED",
                "Welcome to NForce Sync",
                "Your account has been created. Please log in and update your profile.",
                "/profile");

        return new UserCreateResult(UserDto.from(user), tempPassword);
    }

    private String generateTempPassword() {
        int digits = 100000 + RANDOM.nextInt(900000);
        return "NFSync@" + digits;
    }

    public UserDto updateUser(Long id, UpdateUserRequest request, String actingEmail) {
        AppUser user  = requireUserById(id);
        AppUser actor = requireActorByEmail(actingEmail);

        if (user.getRole() == AppUser.Role.SUPERADMIN
                && user.getStatus() == AppUser.Status.ACTIVE
                && request.role() != AppUser.Role.SUPERADMIN) {
            assertSurvivingSuperAdmin();
        }

        requireOrgReferencesExist(request.departmentId(), request.designationId(), request.locationId());

        String before = toJson(UserDto.from(user));

        user.setFullName(request.fullName());
        user.setRole(request.role());

        // Org assignments — null means explicitly unassign
        user.setDepartmentId(request.departmentId());
        user.setDesignationId(request.designationId());
        user.setLocationId(request.locationId());
        user.setShiftId(request.shiftId());

        // Employee profile — null means leave existing value untouched
        if (request.employmentType() != null && !request.employmentType().isBlank()) {
            user.setEmploymentType(request.employmentType());
        }
        if (request.workMode() != null && !request.workMode().isBlank()) {
            user.setWorkMode(request.workMode());
        }

        AppUser oldManager = user.getManager();
        AppUser newManager = null;

        if (request.managerId() != null) {
            if (request.managerId().equals(id)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "A user cannot be their own reporting manager");
            }
            newManager = userRepository.findById(request.managerId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Reporting manager not found"));
            requireNoManagerCycle(id, newManager);
            requireValidReportingManagerRole(request.role(), newManager);
            user.setManager(newManager);
        } else {
            user.setManager(null);
        }

        user = userRepository.save(user);
        writeAudit("APP_USER", user.getId(), "UPDATE", before, toJson(UserDto.from(user)), actor);

        boolean managerChanged = !java.util.Objects.equals(
                oldManager != null ? oldManager.getId() : null,
                newManager != null ? newManager.getId() : null);
        if (managerChanged) {
            notifyManagerChanged(user, oldManager, newManager);
        }

        return UserDto.from(user);
    }

    // Reporting-manager reassignment is always immediate — there's no scheduling, so the
    // "effective date" is simply today. The old manager keeps approve/reject authority over
    // EOD entries submitted before this change (see EodEntry.managerId snapshot); they're
    // told so explicitly since it's easy to assume authority ends the moment the reassignment
    // happens.
    private void notifyManagerChanged(AppUser employee, AppUser oldManager, AppUser newManager) {
        String today = com.nforceone.sync.notification.NotificationDates.format(java.time.LocalDate.now());
        String oldManagerName = oldManager != null ? oldManager.getFullName() : "Unassigned";
        String newManagerName = newManager != null ? newManager.getFullName() : "Unassigned";
        String changeSummary = "Reporting Manager Changed: " + oldManagerName + " → " + newManagerName
                + ". Effective Date: " + today + ".";

        notificationService.send(employee.getId(), "MANAGER_CHANGED",
                "Your reporting manager has changed",
                changeSummary,
                "/profile");

        if (oldManager != null) {
            notificationService.send(oldManager.getId(), "TEAM_MEMBER_REMOVED",
                    employee.getFullName() + "'s reporting manager has changed",
                    changeSummary + " You remain responsible for approving/rejecting EOD entries "
                            + "submitted before this date.",
                    "/team/approvals");
        }
        if (newManager != null) {
            notificationService.send(newManager.getId(), "TEAM_MEMBER_ADDED",
                    employee.getFullName() + " now reports to you",
                    changeSummary,
                    "/team/approvals");
        }
    }

    // Walks the proposed manager's own reporting chain — if it leads back to `userId`,
    // assigning `proposedManager` would create a cycle (A -> B, B -> A or longer).
    private void requireNoManagerCycle(Long userId, AppUser proposedManager) {
        AppUser current = proposedManager;
        while (current != null) {
            if (current.getId().equals(userId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "This assignment would create a circular reporting chain");
            }
            current = current.getManager();
        }
    }

    // Enforces the org's reporting hierarchy (Project Manager -> Team Lead -> Employee):
    // an Employee's reporting manager must be a Team Lead, and a Team Lead's must be a
    // Project Manager. Other roles have no reporting-manager restriction here.
    private static final Map<AppUser.Role, AppUser.Role> REQUIRED_MANAGER_ROLE = Map.of(
            AppUser.Role.EMPLOYEE, AppUser.Role.MANAGER,
            AppUser.Role.MANAGER,  AppUser.Role.PM
    );

    private void requireValidReportingManagerRole(AppUser.Role role, AppUser manager) {
        AppUser.Role requiredRole = REQUIRED_MANAGER_ROLE.get(role);
        if (requiredRole != null && manager.getRole() != requiredRole) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    ROLE_LABELS.get(role) + " reporting manager must be a " + ROLE_LABELS.get(requiredRole) + ".");
        }
    }

    private void requireOrgReferencesExist(Long departmentId, Long designationId, Long locationId) {
        if (departmentId != null && !departmentRepository.existsById(departmentId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Department not found");
        }
        if (designationId != null && !designationRepository.existsById(designationId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Designation not found");
        }
        if (locationId != null && !locationRepository.existsById(locationId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location not found");
        }
    }

    public UserDto setStatus(Long id, AppUser.Status newStatus, String actingEmail) {
        AppUser user = requireUserById(id);

        if (newStatus == AppUser.Status.INACTIVE
                && user.getStatus() == AppUser.Status.ACTIVE
                && user.getRole() == AppUser.Role.SUPERADMIN) {
            assertSurvivingSuperAdmin();
        }

        AppUser actor = requireActorByEmail(actingEmail);
        String before = toJson(UserDto.from(user));

        user.setStatus(newStatus);
        user = userRepository.save(user);

        writeAudit("APP_USER", user.getId(), "STATUS_CHANGE", before, toJson(UserDto.from(user)), actor);

        return UserDto.from(user);
    }

    public String resetPassword(Long id, String actingEmail) {
        AppUser user  = requireUserById(id);
        AppUser actor = requireActorByEmail(actingEmail);

        // Snapshot for audit display only (e.g. resolving the target's name in the
        // Recent Activity panel) — no password data is ever written to the audit log.
        String snapshot = toJson(UserDto.from(user));

        String tempPassword = generateTempPassword();
        user.setPasswordHash(passwordEncoder.encode(tempPassword));
        user.setMustChangePassword(true);
        // A reset releases any Account Lockout: the lock screen points the user here, so the temp
        // password has to be usable immediately rather than waiting out the remaining window.
        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);
        userRepository.save(user);

        emailService.sendPasswordResetEmail(user.getEmail(), user.getFullName(), tempPassword);
        notificationService.send(user.getId(), "PASSWORD_RESET",
                "Password has been reset",
                "An admin has reset your password. Check your email for the temporary password.",
                null);

        // No password data in audit log — who reset whose password, and when
        writeAudit("APP_USER", id, "PASSWORD_RESET", snapshot, null, actor);

        return tempPassword;
    }

    /**
     * Self-service reset. The email is sent BEFORE the new password is stored, and the change is
     * abandoned if delivery is not accepted.
     *
     * <p>The temp password exists nowhere else — there is no screen showing it, unlike the admin
     * reset. Writing it first and mailing it afterwards meant a failed send (exhausted quota,
     * expired key, Resend outage) left the account with a password nobody could ever learn, while
     * the UI still reported success. Failing closed keeps the user's existing password working.
     *
     * <p>The caller's response is deliberately identical either way — revealing that the send
     * failed would also reveal that the address is registered.
     */
    public void forgotPassword(String email) {
        String normalized = email.toLowerCase().trim();
        userRepository.findByEmailAndDeletedAtIsNull(normalized).ifPresent(user -> {
            if (user.getStatus() == AppUser.Status.ACTIVE && user.getDeletedAt() == null) {
                String tempPassword = generateTempPassword();

                if (!emailService.sendPasswordResetEmailSync(
                        user.getEmail(), user.getFullName(), tempPassword)) {
                    log.error("Password reset for {} abandoned — the email could not be sent, so the "
                            + "existing password was left in place.", user.getEmail());
                    return;
                }

                user.setPasswordHash(passwordEncoder.encode(tempPassword));
                user.setMustChangePassword(true);
                // Same reasoning as the admin reset: a self-service reset must release the lockout,
                // since "Reset password" is the documented way out of the lock screen.
                user.setFailedLoginAttempts(0);
                user.setLockedUntil(null);
                userRepository.save(user);
                writeAudit("APP_USER", user.getId(), "PASSWORD_RESET_SELF", null, null, user);
            }
        });
    }

    public void softDeleteUser(Long id, String actingEmail) {
        AppUser user  = requireUserById(id);

        if (user.getStatus() == AppUser.Status.ACTIVE && user.getRole() == AppUser.Role.SUPERADMIN) {
            assertSurvivingSuperAdmin();
        }

        AppUser actor = requireActorByEmail(actingEmail);

        String before = toJson(UserDto.from(user));
        user.setStatus(AppUser.Status.INACTIVE);
        user.setDeletedAt(OffsetDateTime.now());
        userRepository.save(user);

        writeAudit("APP_USER", id, "SOFT_DELETE", before, null, actor);
    }

    @Transactional(readOnly = true)
    public List<UserDto> listUsers() {
        // Fix 3: use JOIN FETCH to load manager + createdBy in a single query,
        // eliminating N+1 lazy-load SELECT per user over the remote Neon connection.
        return userRepository.findAllWithRelationsOrderByEmployeeCodeAsc()
                .stream()
                .map(UserDto::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public UserDto getUser(Long id) {
        return UserDto.from(requireUserById(id));
    }

    // Top-nav workspace search: free text (q) matches name, email, role label, and
    // location name; role/locationId can additionally be passed as exact filters.
    @Transactional(readOnly = true)
    public List<UserDto> searchUsers(String q, String roleParam, Long locationId) {
        AppUser.Role roleFilter = null;
        if (roleParam != null && !roleParam.isBlank()) {
            try {
                roleFilter = AppUser.Role.valueOf(roleParam.toUpperCase());
            } catch (IllegalArgumentException ex) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown role: " + roleParam);
            }
        }

        String trimmed = q == null ? "" : q.trim();
        List<AppUser.Role> matchingRoles = trimmed.isEmpty()
                ? List.of()
                : ROLE_LABELS.entrySet().stream()
                        .filter(e -> e.getKey().name().toLowerCase().contains(trimmed.toLowerCase())
                                || e.getValue().toLowerCase().contains(trimmed.toLowerCase()))
                        .map(Map.Entry::getKey)
                        .toList();

        List<Long> matchingLocationIds = trimmed.isEmpty()
                ? List.of()
                : locationRepository.findAll().stream()
                        .filter(l -> l.getName().toLowerCase().contains(trimmed.toLowerCase()))
                        .map(OrgLocation::getId)
                        .toList();

        Specification<AppUser> spec = Specification
                .where(UserSpecs.notDeleted())
                .and(UserSpecs.roleIs(roleFilter))
                .and(UserSpecs.locationIdIs(locationId))
                .and(UserSpecs.matchesQuery(trimmed, matchingRoles, matchingLocationIds));

        return userRepository.findAll(spec, Sort.by("employeeCode").ascending())
                .stream()
                .map(UserDto::from)
                .toList();
    }

    // ── private helpers ─────────────────────────────────────────────

    // Shared by setStatus, updateUser (role change off SUPERADMIN), and softDeleteUser —
    // all three can turn an active Super Admin into a non-active-Super-Admin state.
    private void assertSurvivingSuperAdmin() {
        long activeSuperadmins = userRepository.countByRoleAndStatus(
                AppUser.Role.SUPERADMIN, AppUser.Status.ACTIVE);
        if (activeSuperadmins <= 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Cannot remove the last active Super Admin");
        }
    }

    private AppUser requireUserById(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
    }

    private AppUser requireActorByEmail(String email) {
        return userRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
    }

    private void writeAudit(String entityType, Long entityId, String action,
                             String beforeJson, String afterJson, AppUser actor) {
        AuditLog log = new AuditLog();
        log.setEntityType(entityType);
        log.setEntityId(entityId);
        log.setAction(action);
        log.setActor(actor);
        log.setBeforeValue(beforeJson);
        log.setAfterValue(afterJson);
        log.setOccurredAt(OffsetDateTime.now());
        auditLogRepository.save(log);
    }

    private String toJson(Object obj) {
        // JacksonException is RuntimeException in Jackson 3 — no checked catch needed
        return objectMapper.writeValueAsString(obj);
    }
}
