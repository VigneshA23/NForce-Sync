package com.nforceone.sync.project;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface ProjectRepository extends JpaRepository<Project, Long> {
    boolean existsByCode(String code);

    // Projects the employee may log EOD time against on a given date: an allocation whose
    // effective window covers that date, on a project that is still ACTIVE. Same date-window
    // idiom as AllocationRepository.sumActiveAllocationPct. DISTINCT because an employee can
    // hold more than one allocation row (PRIMARY + SECONDARY) on the same project.
    @Query("SELECT DISTINCT a.project FROM Allocation a " +
           "WHERE a.employee.id = :employeeId " +
           "AND a.project.status = :status " +
           "AND a.effectiveFrom <= :onDate " +
           "AND (a.effectiveTo IS NULL OR a.effectiveTo >= :onDate) " +
           "ORDER BY a.project.name ASC")
    List<Project> findAllocatedToEmployeeOnDate(@Param("employeeId") Long employeeId,
                                                @Param("onDate") LocalDate onDate,
                                                @Param("status") Project.Status status);

    // JOIN FETCH pm to avoid N+1 lazy-load round trips when listing for management view
    @org.springframework.data.jpa.repository.Query(
            "SELECT p FROM Project p LEFT JOIN FETCH p.pm ORDER BY p.name ASC")
    List<Project> findAllWithPmOrderByNameAsc();
}
