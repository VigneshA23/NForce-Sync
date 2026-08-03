package com.nforceone.sync.eod;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface EodEntryRepository extends JpaRepository<EodEntry, Long> {

    // Bare lookup for save/submit (entity will be modified — no fetch needed)
    Optional<EodEntry> findByEmployeeIdAndEntryDate(Long employeeId, LocalDate entryDate);

    // Fetched single-entry — used for read-only and action endpoints to avoid 2 lazy queries
    @EntityGraph(attributePaths = {"employee", "tasks", "tasks.project", "tasks.taskCategory"})
    Optional<EodEntry> findWithDetailsById(Long id);

    // List queries — fetch employee + tasks + task.project + task.taskCategory in ONE query each
    @EntityGraph(attributePaths = {"employee", "tasks", "tasks.project", "tasks.taskCategory"})
    List<EodEntry> findByEmployeeIdAndEntryDateBetweenOrderByEntryDateDesc(
            Long employeeId, LocalDate from, LocalDate to);

    @EntityGraph(attributePaths = {"employee", "tasks", "tasks.project", "tasks.taskCategory"})
    List<EodEntry> findByEmployeeIdOrderByEntryDateDesc(Long employeeId);

    // Pending approvals for a manager — custom JPQL with EntityGraph-equivalent JOIN FETCH
    @Query("""
        SELECT DISTINCT e FROM EodEntry e
        JOIN FETCH e.employee emp
        LEFT JOIN FETCH e.tasks t
        LEFT JOIN FETCH t.project
        LEFT JOIN FETCH t.taskCategory
        WHERE emp.manager.id = :managerId AND e.status = :status
        """)
    List<EodEntry> findPendingByManagerId(@Param("managerId") Long managerId,
                                          @Param("status") EodEntry.Status status);
}
