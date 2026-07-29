package com.nforceone.sync.project;

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

    @Query("SELECT COALESCE(SUM(a.allocationPct), 0) FROM Allocation a " +
           "WHERE a.employee.id = :employeeId AND a.effectiveFrom <= :today " +
           "AND (a.effectiveTo IS NULL OR a.effectiveTo >= :today)")
    int sumActiveAllocationPct(@Param("employeeId") Long employeeId, @Param("today") LocalDate today);

    // Same total but ignoring one allocation — used when editing a row, which would otherwise
    // count its own current % against the 100% ceiling and reject an unchanged save.
    @Query("SELECT COALESCE(SUM(a.allocationPct), 0) FROM Allocation a " +
           "WHERE a.employee.id = :employeeId AND a.id <> :excludeId " +
           "AND a.effectiveFrom <= :today AND (a.effectiveTo IS NULL OR a.effectiveTo >= :today)")
    int sumActiveAllocationPctExcluding(@Param("employeeId") Long employeeId,
                                       @Param("today") LocalDate today,
                                       @Param("excludeId") Long excludeId);

    // Current load for every allocated employee in one query — lets the assignable-employee
    // list carry each person's committed % without an N+1 of sumActiveAllocationPct calls.
    @Query("SELECT a.employee.id, COALESCE(SUM(a.allocationPct), 0) FROM Allocation a " +
           "WHERE a.effectiveFrom <= :today AND (a.effectiveTo IS NULL OR a.effectiveTo >= :today) " +
           "GROUP BY a.employee.id")
    List<Object[]> sumActiveByEmployee(@Param("today") LocalDate today);

    long countByProjectId(Long projectId);
}
