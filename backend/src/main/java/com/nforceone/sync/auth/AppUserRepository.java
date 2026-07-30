package com.nforceone.sync.auth;

import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface AppUserRepository extends JpaRepository<AppUser, Long>, JpaSpecificationExecutor<AppUser> {

    // Deleted-inclusive: use only when historical/audit lookup is needed
    Optional<AppUser> findByEmail(String email);

    // Active-only variants: use for all authentication and actor resolution
    Optional<AppUser> findByEmailAndDeletedAtIsNull(String email);

    // Only counts non-deleted rows — mirrors the partial unique index from V23
    boolean existsByEmailAndDeletedAtIsNull(String email);

    boolean existsByEmployeeCode(String employeeCode);

    // Fix 3: JOIN FETCH manager + createdBy to avoid N+1 lazy-load round trips to Neon
    // Also excludes soft-deleted users (deleted_at IS NULL)
    @Query("SELECT u FROM AppUser u LEFT JOIN FETCH u.manager LEFT JOIN FETCH u.createdBy WHERE u.deletedAt IS NULL ORDER BY u.employeeCode ASC")
    List<AppUser> findAllWithRelationsOrderByEmployeeCodeAsc();

    // Keep original for backward compatibility (used by setStatus, etc.)
    List<AppUser> findAllByOrderByEmployeeCodeAsc();

    // Workspace search (name/email/role/location) — see UserSpecs
    @EntityGraph(attributePaths = {"manager", "createdBy"})
    List<AppUser> findAll(Specification<AppUser> spec, Sort sort);

    long countByStatus(AppUser.Status status);

    List<AppUser> findByStatus(AppUser.Status status);

    long countByRole(AppUser.Role role);

    long countByRoleAndStatus(AppUser.Role role, AppUser.Status status);

    // Admin dashboard KPIs must exclude soft-deleted users — a soft-deleted user keeps
    // status=INACTIVE forever (see UserService.softDeleteUser), so the plain
    // countByStatus/findByStatus/countByRole above would otherwise count them as inactive
    // indefinitely even after deletion.
    long countByDeletedAtIsNull();

    long countByStatusAndDeletedAtIsNull(AppUser.Status status);

    List<AppUser> findByStatusAndDeletedAtIsNull(AppUser.Status status);

    long countByRoleAndDeletedAtIsNull(AppUser.Role role);

    List<AppUser> findByManagerId(Long managerId);

    List<AppUser> findByRoleAndStatusAndDeletedAtIsNullOrderByFullNameAsc(AppUser.Role role,
                                                                         AppUser.Status status);

    // Fix 2: FK reference checks before deleting org master records
    long countByDepartmentId(Long departmentId);

    long countByDesignationId(Long designationId);

    long countByLocationId(Long locationId);

    List<AppUser> findByStatusAndDeletedAtIsNullOrderByFullNameAsc(AppUser.Status status);
}
