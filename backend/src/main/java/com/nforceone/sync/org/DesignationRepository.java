package com.nforceone.sync.org;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DesignationRepository extends JpaRepository<Designation, Long> {
    boolean existsByTitle(String title);
    List<Designation> findAllByOrderByTitleAsc();
}
