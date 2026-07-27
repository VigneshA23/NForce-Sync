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
import com.nforceone.sync.org.DepartmentRepository;
import com.nforceone.sync.org.DesignationRepository;
import com.nforceone.sync.org.OrgLocationRepository;
import jakarta.persistence.EntityManager;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.List;

@Service
@Transactional
public class UserService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final AppUserRepository userRepository;
    private final AuditLogRepository auditLogRepository;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper objectMapper;
    private final EntityManager entityManager;
    private final DepartmentRepository departmentRepository;
    private final DesignationRepository designationRepository;
    private final OrgLocationRepository locationRepository;

    public UserService(AppUserRepository userRepository,
                       AuditLogRepository auditLogRepository,
                       PasswordEncoder passwordEncoder,
                       ObjectMapper objectMapper,
                       EntityManager entityManager,
                       DepartmentRepository departmentRepository,
                       DesignationRepository designationRepository,
                       OrgLocationRepository locationRepository) {
        this.userRepository        = userRepository;
        this.auditLogRepository    = auditLogRepository;
        this.passwordEncoder       = passwordEncoder;
        this.objectMapper          = objectMapper;
        this.entityManager         = entityManager;
        this.departmentRepository  = departmentRepository;
        this.designationRepository = designationRepository;
        this.locationRepository    = locationRepository;
    }

    public UserCreateResult createUser(CreateUserRequest request, String actingEmail) {
        if (userRepository.existsByEmail(request.email())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "An account with this email already exists");
        }
        AppUser actor = requireActorByEmail(actingEmail);

        String tempPassword = generateTempPassword();

        AppUser user = new AppUser();
        user.setFullName(request.fullName());
        user.setEmail(request.email());
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

        // Employee profile
        user.setEmploymentType(request.employmentType() != null ? request.employmentType() : "FULL_TIME");
        user.setWorkMode(request.workMode() != null ? request.workMode() : "ONSITE");
        user.setJoiningDate(request.joiningDate());

        // Manager assignment
        if (request.managerId() != null) {
            AppUser manager = userRepository.findById(request.managerId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Manager not found"));
            user.setManager(manager);
        }

        user = userRepository.save(user);

        // flush writes the INSERT, then refresh reads back DB-generated columns
        // (employee_code is GENERATED ALWAYS AS IDENTITY — not returned by getGeneratedKeys)
        entityManager.flush();
        entityManager.refresh(user);

        writeAudit("APP_USER", user.getId(), "CREATE", null, toJson(UserDto.from(user)), actor);

        return new UserCreateResult(UserDto.from(user), tempPassword);
    }

    private String generateTempPassword() {
        int digits = 100000 + RANDOM.nextInt(900000);
        return "NFSync@" + digits;
    }

    public UserDto updateUser(Long id, UpdateUserRequest request, String actingEmail) {
        AppUser user  = requireUserById(id);
        AppUser actor = requireActorByEmail(actingEmail);

        String before = toJson(UserDto.from(user));

        user.setFullName(request.fullName());
        user.setRole(request.role());

        // Org assignments — null means explicitly unassign
        user.setDepartmentId(request.departmentId());
        user.setDesignationId(request.designationId());
        user.setLocationId(request.locationId());

        // Employee profile — null means leave existing value untouched
        if (request.employmentType() != null && !request.employmentType().isBlank()) {
            user.setEmploymentType(request.employmentType());
        }
        if (request.workMode() != null && !request.workMode().isBlank()) {
            user.setWorkMode(request.workMode());
        }

        if (request.managerId() != null) {
            if (request.managerId().equals(id)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "A user cannot be their own Team Lead");
            }
            AppUser manager = userRepository.findById(request.managerId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Team Lead not found"));
            user.setManager(manager);
        } else {
            user.setManager(null);
        }

        user = userRepository.save(user);
        writeAudit("APP_USER", user.getId(), "UPDATE", before, toJson(UserDto.from(user)), actor);
        return UserDto.from(user);
    }

    public UserDto setStatus(Long id, AppUser.Status newStatus, String actingEmail) {
        AppUser user = requireUserById(id);

        if (newStatus == AppUser.Status.INACTIVE
                && user.getRole() == AppUser.Role.SUPERADMIN) {
            long activeSuperadmins = userRepository.countByRoleAndStatus(
                    AppUser.Role.SUPERADMIN, AppUser.Status.ACTIVE);
            if (activeSuperadmins <= 1) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Cannot deactivate the last active Super Admin");
            }
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

        String tempPassword = generateTempPassword();
        user.setPasswordHash(passwordEncoder.encode(tempPassword));
        user.setMustChangePassword(true);
        userRepository.save(user);

        // No password data in audit log — who reset whose password, and when
        writeAudit("APP_USER", id, "PASSWORD_RESET", null, null, actor);

        return tempPassword;
    }

    public void softDeleteUser(Long id, String actingEmail) {
        AppUser user  = requireUserById(id);
        AppUser actor = requireActorByEmail(actingEmail);

        // Soft-delete: deactivate and record in audit
        user.setStatus(AppUser.Status.INACTIVE);
        userRepository.save(user);

        writeAudit("APP_USER", id, "SOFT_DELETE", toJson(UserDto.from(user)), null, actor);
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

    // ── private helpers ─────────────────────────────────────────────

    private AppUser requireUserById(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
    }

    private AppUser requireActorByEmail(String email) {
        return userRepository.findByEmail(email)
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
