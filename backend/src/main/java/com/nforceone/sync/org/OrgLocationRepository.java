package com.nforceone.sync.org;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OrgLocationRepository extends JpaRepository<OrgLocation, Long> {
    boolean existsByName(String name);
    List<OrgLocation> findAllByOrderByNameAsc();
}
