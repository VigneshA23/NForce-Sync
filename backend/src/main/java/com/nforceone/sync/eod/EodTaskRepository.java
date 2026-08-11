package com.nforceone.sync.eod;

import com.nforceone.sync.eod.dto.CategoryHoursRow;
import com.nforceone.sync.eod.dto.EmployeeProjectHoursRow;
import com.nforceone.sync.eod.dto.ProjectHoursRow;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public interface EodTaskRepository extends JpaRepository<EodTask, Long> {

    // Used to decide whether deleting a team-level category can hard-delete its mirrored
    // TaskCategory row, or must deactivate instead to keep historical EOD tasks intact — see
    // TeamLeadProjectService.deleteCategory.
    boolean existsByTaskCategoryId(Long taskCategoryId);

    @Query("SELECT t FROM EodTask t " +
           "WHERE t.taskStatus = com.nforceone.sync.eod.EodTask.TaskStatus.BLOCKED " +
           "AND t.eodEntry.employee.manager.id = :managerId " +
           "AND t.eodEntry.status <> com.nforceone.sync.eod.EodEntry.Status.DRAFT " +
           "ORDER BY t.eodEntry.entryDate DESC")
    List<EodTask> findBlockedByManagerId(@Param("managerId") Long managerId);

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

    @Query("SELECT COALESCE(SUM(t.hours), 0) FROM EodTask t " +
           "WHERE t.project.id IN :projectIds AND t.eodEntry.employee.id IN :employeeIds " +
           "AND t.isBillable = :billable " +
           "AND t.eodEntry.status = com.nforceone.sync.eod.EodEntry.Status.APPROVED " +
           "AND t.eodEntry.entryDate BETWEEN :from AND :to")
    BigDecimal sumHoursByBillable(@Param("projectIds") List<Long> projectIds,
                                  @Param("employeeIds") List<Long> employeeIds,
                                  @Param("billable") boolean billable,
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
}
