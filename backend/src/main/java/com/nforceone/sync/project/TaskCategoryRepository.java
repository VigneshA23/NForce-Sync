package com.nforceone.sync.project;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TaskCategoryRepository extends JpaRepository<TaskCategory, Long> {
    List<TaskCategory> findByActiveTrue();
    List<TaskCategory> findByIsProductiveAndActiveTrue(Boolean isProductive);
    Optional<TaskCategory> findByName(String name);
}
