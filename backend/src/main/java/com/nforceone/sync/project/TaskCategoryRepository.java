package com.nforceone.sync.project;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TaskCategoryRepository extends JpaRepository<TaskCategory, Long> {
    List<TaskCategory> findByActiveTrue();
    List<TaskCategory> findByIsProductiveAndActiveTrue(Boolean isProductive);
}
