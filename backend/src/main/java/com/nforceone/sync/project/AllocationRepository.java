package com.nforceone.sync.project;

import com.nforceone.sync.auth.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface AllocationRepository extends JpaRepository<Allocation, Long> {
    List<Allocation> findByEmployeeId(Long employeeId);
    List<Allocation> findByProjectId(Long projectId);

    // JOIN FETCH employee + project to avoid N+1 lazy-load round trips when listing
    @Query("SELECT a FROM Allocation a JOIN FETCH a.employee JOIN FETCH a.project ORDER BY a.effectiveFrom DESC")
    List<Allocation> findAllWithRefsOrderByEffectiveFromDesc();

    @Query("SELECT a FROM Allocation a JOIN FETCH a.employee JOIN FETCH a.project " +
           "WHERE a.project.id = :projectId ORDER BY a.effectiveFrom DESC")
    List<Allocation> findByProjectIdWithRefs(@Param("projectId") Long projectId);

    /**
     * Headcount for the Projects tab. Counts only EMPLOYEE-role allocations so the number agrees
     * with the rows the Allocation tab actually shows — a plain count would include leads and
     * back-office accounts that are filtered out of the list.
     */
    @Query("SELECT COUNT(a) FROM Allocation a WHERE a.project.id = :projectId AND a.employee.role = :role")
    long countByProjectIdAndEmployeeRole(@Param("projectId") Long projectId,
                                        @Param("role") AppUser.Role role);

    // Project Dashboard: every allocation on one of a PM's projects whose effective window
    // overlaps the requested date range, with employee+project JOIN FETCHed to avoid N+1.
    @Query("SELECT a FROM Allocation a JOIN FETCH a.employee JOIN FETCH a.project " +
           "WHERE a.project.id IN :projectIds " +
           "AND a.effectiveFrom <= :to " +
           "AND (a.effectiveTo IS NULL OR a.effectiveTo >= :from) " +
           "ORDER BY a.project.name ASC, a.employee.fullName ASC")
    List<Allocation> findActiveInRangeForProjects(@Param("projectIds") List<Long> projectIds,
                                                   @Param("from") LocalDate from,
                                                   @Param("to") LocalDate to);
}
