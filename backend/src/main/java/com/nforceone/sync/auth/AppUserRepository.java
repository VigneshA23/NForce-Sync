package com.nforceone.sync.auth;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {

    Optional<AppUser> findByEmail(String email);

    boolean existsByEmail(String email);

    // Fix 3: JOIN FETCH manager + createdBy to avoid N+1 lazy-load round trips to Neon
    // Also excludes soft-deleted users (deleted_at IS NULL)
    @Query("SELECT u FROM AppUser u LEFT JOIN FETCH u.manager LEFT JOIN FETCH u.createdBy WHERE u.deletedAt IS NULL ORDER BY u.employeeCode ASC")
    List<AppUser> findAllWithRelationsOrderByEmployeeCodeAsc();

    // Keep original for backward compatibility (used by setStatus, etc.)
    List<AppUser> findAllByOrderByEmployeeCodeAsc();

    long countByStatus(AppUser.Status status);

    long countByRole(AppUser.Role role);

    long countByRoleAndStatus(AppUser.Role role, AppUser.Status status);

    List<AppUser> findByManagerId(Long managerId);

    // Fix 2: FK reference checks before deleting org master records
    long countByDepartmentId(Long departmentId);

    long countByDesignationId(Long designationId);

    long countByLocationId(Long locationId);
}
