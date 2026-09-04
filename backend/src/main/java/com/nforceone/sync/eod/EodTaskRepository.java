package com.nforceone.sync.eod;

import com.nforceone.sync.eod.dto.CategoryHoursRow;
import com.nforceone.sync.eod.dto.DateHoursRow;
import com.nforceone.sync.eod.dto.EmployeeProjectHoursRow;
import com.nforceone.sync.eod.dto.ProjectHoursRow;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface EodTaskRepository extends JpaRepository<EodTask, Long> {

    // Used to decide whether deleting a team-level category can hard-delete its mirrored
    // TaskCategory row, or must deactivate instead to keep historical EOD tasks intact — see
    // TeamLeadProjectService.deleteCategory.
    boolean existsByTaskCategoryId(Long taskCategoryId);

    @Query("SELECT t FROM EodTask t " +
           "WHERE t.taskStatus = com.nforceone.sync.eod.EodTask.TaskStatus.BLOCKED " +
           "AND t.eodEntry.managerId = :managerId " +
           "AND t.eodEntry.status <> com.nforceone.sync.eod.EodEntry.Status.DRAFT " +
           "ORDER BY t.eodEntry.entryDate DESC")
    List<EodTask> findBlockedByManagerId(@Param("managerId") Long managerId);

    // Same as findBlockedByManagerId, narrowed to an entry-date range at the DB level and with
    // eodEntry/employee/project/taskCategory/acknowledgedBy/resolvedBy JOIN FETCHed up front —
    // TeamBlockerDto.from touches all of them, and without the fetch each one lazy-loads per
    // row (N+1). findBlockedByManagerId itself is left untouched since EodService.getBlockedTasks
    // and TeamService's dashboard blocker count also call it and don't share this bug.
    @Query("SELECT DISTINCT t FROM EodTask t " +
           "JOIN FETCH t.eodEntry e " +
           "JOIN FETCH e.employee emp " +
           "LEFT JOIN FETCH t.project " +
           "LEFT JOIN FETCH t.taskCategory " +
           "LEFT JOIN FETCH t.acknowledgedBy " +
           "LEFT JOIN FETCH t.resolvedBy " +
           "WHERE t.taskStatus = com.nforceone.sync.eod.EodTask.TaskStatus.BLOCKED " +
           "AND e.managerId = :managerId " +
           "AND e.status <> com.nforceone.sync.eod.EodEntry.Status.DRAFT " +
           "AND e.entryDate BETWEEN :from AND :to " +
           "ORDER BY e.entryDate DESC")
    List<EodTask> findBlockedByManagerIdAndDateRange(@Param("managerId") Long managerId,
                                                       @Param("from") LocalDate from,
                                                       @Param("to") LocalDate to);

    // Cross-team view for the Project Manager Blockers page: every blocker raised against any
    // of the PM's own projects, regardless of which Team Lead the reporting employee belongs to.
    // JOIN FETCHes eodEntry/employee/manager/project/taskCategory up front — PmBlockerDto.from
    // touches all of them, and without the fetch each one lazy-loads per row (N+1), which is
    // what made this query take ~10s once a PM's portfolio had more than a handful of blockers.
    @Query("SELECT DISTINCT t FROM EodTask t " +
           "JOIN FETCH t.eodEntry e " +
           "JOIN FETCH e.employee emp " +
           "LEFT JOIN FETCH emp.manager " +
           "LEFT JOIN FETCH t.project " +
           "LEFT JOIN FETCH t.taskCategory " +
           "WHERE t.taskStatus = com.nforceone.sync.eod.EodTask.TaskStatus.BLOCKED " +
           "AND t.project.id IN :projectIds " +
           "AND e.status <> com.nforceone.sync.eod.EodEntry.Status.DRAFT " +
           "ORDER BY e.entryDate DESC")
    List<EodTask> findBlockedByProjectIds(@Param("projectIds") List<Long> projectIds);

    // Same as above, narrowed to an entry-date range at the DB level — used by the Blockers
    // page's date filter (Today/Yesterday/Custom Range all go through this) instead of fetching
    // the PM's entire blocker history and filtering it in Java on every request.
    @Query("SELECT DISTINCT t FROM EodTask t " +
           "JOIN FETCH t.eodEntry e " +
           "JOIN FETCH e.employee emp " +
           "LEFT JOIN FETCH emp.manager " +
           "LEFT JOIN FETCH t.project " +
           "LEFT JOIN FETCH t.taskCategory " +
           "WHERE t.taskStatus = com.nforceone.sync.eod.EodTask.TaskStatus.BLOCKED " +
           "AND t.project.id IN :projectIds " +
           "AND e.status <> com.nforceone.sync.eod.EodEntry.Status.DRAFT " +
           "AND e.entryDate BETWEEN :from AND :to " +
           "ORDER BY e.entryDate DESC")
    List<EodTask> findBlockedByProjectIdsAndDateRange(@Param("projectIds") List<Long> projectIds,
                                                        @Param("from") LocalDate from,
                                                        @Param("to") LocalDate to);

    // ── Project Dashboard aggregates ──────────────────────────────────────────
    // All scoped to APPROVED entries only — matches UtilizationService's convention that only
    // approved hours count as "actual" utilization. employeeIds narrows to whatever the caller's
    // Employee/Team filter resolved to, so every widget (not just tables) respects those filters.

    @Query("SELECT new com.nforceone.sync.eod.dto.ProjectHoursRow(t.project.id, SUM(t.hours)) " +
           "FROM EodTask t " +
           "WHERE t.project.id IN :projectIds " +
           "AND t.eodEntry.employee.id IN :employeeIds " +
           "AND t.eodEntry.status = com.nforceone.sync.eod.EodEntry.Status.APPROVED " +
           "AND t.eodEntry.entryDate BETWEEN :from AND :to " +
           "GROUP BY t.project.id")
    List<ProjectHoursRow> sumHoursByProject(@Param("projectIds") List<Long> projectIds,
                                            @Param("employeeIds") List<Long> employeeIds,
                                            @Param("from") LocalDate from,
                                            @Param("to") LocalDate to);

    @Query("SELECT new com.nforceone.sync.eod.dto.EmployeeProjectHoursRow(" +
           "t.eodEntry.employee.id, t.project.id, SUM(t.hours)) " +
           "FROM EodTask t " +
           "WHERE t.project.id IN :projectIds " +
           "AND t.eodEntry.employee.id IN :employeeIds " +
           "AND t.eodEntry.status = com.nforceone.sync.eod.EodEntry.Status.APPROVED " +
           "AND t.eodEntry.entryDate BETWEEN :from AND :to " +
           "GROUP BY t.eodEntry.employee.id, t.project.id")
    List<EmployeeProjectHoursRow> sumHoursByEmployeeAndProject(@Param("projectIds") List<Long> projectIds,
                                                                @Param("employeeIds") List<Long> employeeIds,
                                                                @Param("from") LocalDate from,
                                                                @Param("to") LocalDate to);

    // ── Planned vs Actual (PM dashboard) ──────────────────────────────────────
    // Same APPROVED/date-range scoping as sumHoursByProject/sumHoursByEmployeeAndProject above,
    // narrowed to task_category.is_productive = true — bench/non-productive hours (e.g. time
    // logged against the "Bench"/"Unassigned" categories) must not count toward Actual
    // Productive Hours, per the utilization PRD's productive-hours definition.

    @Query("SELECT new com.nforceone.sync.eod.dto.ProjectHoursRow(t.project.id, SUM(t.hours)) " +
           "FROM EodTask t " +
           "WHERE t.project.id IN :projectIds " +
           "AND t.eodEntry.employee.id IN :employeeIds " +
           "AND t.eodEntry.status = com.nforceone.sync.eod.EodEntry.Status.APPROVED " +
           "AND t.eodEntry.entryDate BETWEEN :from AND :to " +
           "AND t.taskCategory.isProductive = true " +
           "GROUP BY t.project.id")
    List<ProjectHoursRow> sumProductiveHoursByProject(@Param("projectIds") List<Long> projectIds,
                                                       @Param("employeeIds") List<Long> employeeIds,
                                                       @Param("from") LocalDate from,
                                                       @Param("to") LocalDate to);

    @Query("SELECT new com.nforceone.sync.eod.dto.EmployeeProjectHoursRow(" +
           "t.eodEntry.employee.id, t.project.id, SUM(t.hours)) " +
           "FROM EodTask t " +
           "WHERE t.project.id IN :projectIds " +
           "AND t.eodEntry.employee.id IN :employeeIds " +
           "AND t.eodEntry.status = com.nforceone.sync.eod.EodEntry.Status.APPROVED " +
           "AND t.eodEntry.entryDate BETWEEN :from AND :to " +
           "AND t.taskCategory.isProductive = true " +
           "GROUP BY t.eodEntry.employee.id, t.project.id")
    List<EmployeeProjectHoursRow> sumProductiveHoursByEmployeeAndProject(@Param("projectIds") List<Long> projectIds,
                                                                          @Param("employeeIds") List<Long> employeeIds,
                                                                          @Param("from") LocalDate from,
                                                                          @Param("to") LocalDate to);

    @Query("SELECT new com.nforceone.sync.eod.dto.CategoryHoursRow(t.taskCategory.name, SUM(t.hours)) " +
           "FROM EodTask t " +
           "WHERE t.project.id IN :projectIds " +
           "AND t.eodEntry.employee.id IN :employeeIds " +
           "AND t.eodEntry.status = com.nforceone.sync.eod.EodEntry.Status.APPROVED " +
           "AND t.eodEntry.entryDate BETWEEN :from AND :to " +
           "AND t.taskCategory IS NOT NULL " +
           "GROUP BY t.taskCategory.name")
    List<CategoryHoursRow> sumHoursByCategory(@Param("projectIds") List<Long> projectIds,
                                              @Param("employeeIds") List<Long> employeeIds,
                                              @Param("from") LocalDate from,
                                              @Param("to") LocalDate to);

    // Daily overall-hours trend series for the Projects Utilization page's trend chart.
    @Query("SELECT new com.nforceone.sync.eod.dto.DateHoursRow(t.eodEntry.entryDate, SUM(t.hours)) " +
           "FROM EodTask t " +
           "WHERE t.project.id IN :projectIds " +
           "AND t.eodEntry.employee.id IN :employeeIds " +
           "AND t.eodEntry.status = com.nforceone.sync.eod.EodEntry.Status.APPROVED " +
           "AND t.eodEntry.entryDate BETWEEN :from AND :to " +
           "GROUP BY t.eodEntry.entryDate")
    List<DateHoursRow> sumHoursByDate(@Param("projectIds") List<Long> projectIds,
                                      @Param("employeeIds") List<Long> employeeIds,
                                      @Param("from") LocalDate from,
                                      @Param("to") LocalDate to);

}
