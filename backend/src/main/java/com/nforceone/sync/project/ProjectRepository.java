package com.nforceone.sync.project;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProjectRepository extends JpaRepository<Project, Long> {
    boolean existsByCode(String code);
    List<Project> findByStatusOrderByNameAsc(Project.Status status);
}
