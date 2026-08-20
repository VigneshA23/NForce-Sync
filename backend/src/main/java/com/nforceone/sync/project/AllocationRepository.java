package com.nforceone.sync.project;

import com.nforceone.sync.auth.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

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

    /**
     * Currently active headcount for the Team Lead "My Projects" list — distinct employees (not
     * raw allocation rows) whose EMPLOYEE-role allocation on the project is active as of {@code
     * onDate}. Unlike {@link #countByProjectIdAndEmployeeRole} (used by the Employee/PM project
     * lists, left as-is), this is date-scoped and DISTINCTs by employee, so a re-assigned
     * employee (two Allocation rows on the same project) is not double-counted and a since-ended
     * allocation is not stale-counted — keeping "Team Size" consistent with the Project Details
     * popup's "Assigned Employees" list, which applies this same active-date scoping.
     */
    @Query("SELECT COUNT(DISTINCT a.employee.id) FROM Allocation a " +
           "WHERE a.project.id = :projectId AND a.employee.role = :role " +
           "AND a.effectiveFrom <= :onDate " +
           "AND (a.effectiveTo IS NULL OR a.effectiveTo >= :onDate)")
    long countActiveDistinctByProjectIdAndEmployeeRole(@Param("projectId") Long projectId,
                                                        @Param("role") AppUser.Role role,
                                                        @Param("onDate") LocalDate onDate);

    /**
     * Existing allocations of the same employee to the same project whose window overlaps
     * [newFrom, newTo]. Both windows are inclusive at both ends, so windows that merely touch —
     * one ends 31-07, the next starts 01-08 — do NOT overlap, which is what makes a genuine
     * re-assignment legal.
     *
     * <p>Callers substitute {@link Allocation#OPEN_ENDED} for a null end date on both sides (the
     * stored one via COALESCE, the incoming one before binding), so no parameter is ever null.
     * {@code excludeId} is the row being edited, or -1 on create; a sentinel for the same reason.
     *
     * <p>Returns a list rather than Optional: data predating V54 can hold more than one overlapping
     * row, and a single-result query would fail on those instead of reporting the conflict.
     */
    @Query("SELECT a FROM Allocation a " +
           "WHERE a.employee.id = :employeeId " +
           "AND a.project.id = :projectId " +
           "AND a.id <> :excludeId " +
           "AND a.effectiveFrom <= :newTo " +
           "AND COALESCE(a.effectiveTo, :openEnded) >= :newFrom " +
           "ORDER BY a.effectiveFrom ASC")
    List<Allocation> findOverlapping(@Param("employeeId") Long employeeId,
                                     @Param("projectId") Long projectId,
                                     @Param("newFrom") LocalDate newFrom,
                                     @Param("newTo") LocalDate newTo,
                                     @Param("openEnded") LocalDate openEnded,
                                     @Param("excludeId") Long excludeId);

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

    // Team Lead Reports: all allocations for a set of employees (manager_id scoping),
    // used to populate the project/client filter dropdowns.
    @Query("SELECT a FROM Allocation a JOIN FETCH a.employee JOIN FETCH a.project " +
           "WHERE a.employee.id IN :employeeIds " +
           "ORDER BY a.project.name ASC, a.employee.fullName ASC")
    List<Allocation> findByEmployeeIdIn(@Param("employeeIds") List<Long> employeeIds);

    // Team Lead Reports: active allocations for a team within a date range — used to narrow
    // results when a project filter is applied.
    @Query("SELECT a FROM Allocation a JOIN FETCH a.employee JOIN FETCH a.project " +
           "WHERE a.employee.id IN :employeeIds " +
           "AND a.effectiveFrom <= :to " +
           "AND (a.effectiveTo IS NULL OR a.effectiveTo >= :from) " +
           "ORDER BY a.project.name ASC, a.employee.fullName ASC")
    List<Allocation> findActiveInRangeForEmployees(@Param("employeeIds") List<Long> employeeIds,
                                                    @Param("from") LocalDate from,
                                                    @Param("to") LocalDate to);

    /**
     * Which of these employees were assigned to any project on {@code date} — the EOD cutoff
     * reminder's test for "owes an EOD at all".
     *
     * Ids only, with no JOIN FETCH: the scheduler runs every 15 minutes over every shift member
     * and needs a membership test, not the allocation rows themselves.
     */
    @Query("SELECT DISTINCT a.employee.id FROM Allocation a "
         + "WHERE a.employee.id IN :employeeIds "
         + "AND a.effectiveFrom <= :date "
         + "AND (a.effectiveTo IS NULL OR a.effectiveTo >= :date)")
    Set<Long> findEmployeeIdsAllocatedOn(@Param("employeeIds") List<Long> employeeIds,
                                         @Param("date") LocalDate date);
}
