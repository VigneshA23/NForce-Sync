package com.nforceone.sync.auth;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {

    Optional<AppUser> findByEmail(String email);

    boolean existsByEmail(String email);

    List<AppUser> findAllByOrderByEmployeeCodeAsc();

    long countByStatus(AppUser.Status status);

    long countByRole(AppUser.Role role);

    long countByRoleAndStatus(AppUser.Role role, AppUser.Status status);
}
