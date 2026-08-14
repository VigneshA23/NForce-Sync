package com.nforceone.sync.project;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface TaskCategoryRepository extends JpaRepository<TaskCategory, Long> {
    List<TaskCategory> findByActiveTrue();
    List<TaskCategory> findByIsProductiveAndActiveTrue(Boolean isProductive);
    Optional<TaskCategory> findByName(String name);

    // Scalar id-only projection — unlike findByName, this never selects the rest of the row, so
    // it can't be tripped up by TaskCategory.manager_id being absent from this environment's
    // task_category table (see ProjectDashboardService.leaveCategoryId for why that matters).
    @Query("SELECT c.id FROM TaskCategory c WHERE c.name = :name")
    Optional<Long> findIdByName(@Param("name") String name);

    // Global categories (manager IS NULL) plus any team-scoped category owned by a manager in
    // `managerIds` — the caller's own id (categories they created as a Team Lead) and/or their
    // own manager's id (their Team Lead's categories). Enforced here, not just in the frontend,
    // so an employee can never fetch another team's categories by any client-side path.
    @Query("SELECT c FROM TaskCategory c WHERE c.active = true " +
           "AND (c.manager IS NULL OR c.manager.id IN :managerIds) ORDER BY c.name ASC")
    List<TaskCategory> findVisibleTo(@Param("managerIds") List<Long> managerIds);
    // The global category master — every employee, regardless of team/project, sees the same
    // list. See V60: task_category is application-wide data, never scoped to a Team Lead.
    @Query("SELECT c FROM TaskCategory c WHERE c.active = true ORDER BY c.name ASC")
    List<TaskCategory> findAllActiveOrderByName();
}
