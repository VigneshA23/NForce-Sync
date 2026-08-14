package com.nforceone.sync.project;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface TaskCategoryRepository extends JpaRepository<TaskCategory, Long> {
    List<TaskCategory> findByActiveTrue();
    List<TaskCategory> findByIsProductiveAndActiveTrue(Boolean isProductive);
    Optional<TaskCategory> findByName(String name);

    // The global category master — every employee, regardless of team/project, sees the same
    // list. See V60: task_category is application-wide data, never scoped to a Team Lead.
    @Query("SELECT c FROM TaskCategory c WHERE c.active = true ORDER BY c.name ASC")
    List<TaskCategory> findAllActiveOrderByName();
}
