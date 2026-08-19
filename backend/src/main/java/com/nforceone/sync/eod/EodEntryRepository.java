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

    // From-only / to-only history filters — the Between query above requires both bounds.
    @EntityGraph(attributePaths = {"employee", "tasks", "tasks.project", "tasks.taskCategory"})
    List<EodEntry> findByEmployeeIdAndEntryDateGreaterThanEqualOrderByEntryDateDesc(
            Long employeeId, LocalDate from);

    @EntityGraph(attributePaths = {"employee", "tasks", "tasks.project", "tasks.taskCategory"})
    List<EodEntry> findByEmployeeIdAndEntryDateLessThanEqualOrderByEntryDateDesc(
            Long employeeId, LocalDate to);

    // Project Dashboard missing-EOD breakdown: one batch query for every employee in scope,
    // rather than one query per employee per day.
    @Query("SELECT e FROM EodEntry e WHERE e.employee.id IN :employeeIds " +
           "AND e.entryDate BETWEEN :from AND :to")
    List<EodEntry> findByEmployeeIdInAndEntryDateBetween(@Param("employeeIds") List<Long> employeeIds,
                                                          @Param("from") LocalDate from,
                                                          @Param("to") LocalDate to);

    // Same as findByEmployeeIdInAndEntryDateBetween but with tasks/project/category eagerly
    // fetched — for reporting views that render every task line, not just the missing-day count.
    @EntityGraph(attributePaths = {"employee", "tasks", "tasks.project", "tasks.taskCategory"})
    @Query("SELECT e FROM EodEntry e WHERE e.employee.id IN :employeeIds " +
           "AND e.entryDate BETWEEN :from AND :to")
    List<EodEntry> findWithTasksByEmployeeIdInAndEntryDateBetween(@Param("employeeIds") List<Long> employeeIds,
                                                                   @Param("from") LocalDate from,
                                                                   @Param("to") LocalDate to);

    // Pending approvals for a manager — custom JPQL with EntityGraph-equivalent JOIN FETCH
    @Query("""
        SELECT DISTINCT e FROM EodEntry e
        JOIN FETCH e.employee emp
        LEFT JOIN FETCH e.tasks t
        LEFT JOIN FETCH t.project
        LEFT JOIN FETCH t.taskCategory
        WHERE e.managerId = :managerId AND e.status = :status
        """)
    List<EodEntry> findPendingByManagerId(@Param("managerId") Long managerId,
                                          @Param("status") EodEntry.Status status);

    // Same as findPendingByManagerId, scoped to entries whose entryDate falls within [from, to] —
    // backs the Team Dashboard's date-filtered "Review approvals" count.
    @Query("""
        SELECT DISTINCT e FROM EodEntry e
        JOIN FETCH e.employee emp
        LEFT JOIN FETCH e.tasks t
        LEFT JOIN FETCH t.project
        LEFT JOIN FETCH t.taskCategory
        WHERE e.managerId = :managerId AND e.status = :status
        AND e.entryDate BETWEEN :from AND :to
        """)
    List<EodEntry> findPendingByManagerIdAndEntryDateBetween(@Param("managerId") Long managerId,
                                                             @Param("status") EodEntry.Status status,
                                                             @Param("from") LocalDate from,
                                                             @Param("to") LocalDate to);

    // Every entry with at least one task on a project this PM oversees (Project.projectManager —
    // NOT Project.pm, which is the Team Lead who decides entries), at a given
    // status — used for BOTH the PM's Pending tab (status=SUBMITTED) and, unlike a Team Lead's
    // decided query, the PM's Approved/Rejected tabs too (status=APPROVED/REJECTED): a PM
    // oversees every team touching their projects, not just the entries they personally acted
    // on, so "decided" here deliberately isn't scoped to ApprovalAction.actor = this PM the way
    // findDecidedByManagerId is scoped to a Team Lead's own actions. An entry can span multiple
    // projects, so this is an EXISTS check rather than a strict join, and DISTINCT dedupes
    // entries matching on >1 task.
    @Query("""
        SELECT DISTINCT e FROM EodEntry e
        JOIN FETCH e.employee emp
        LEFT JOIN FETCH e.tasks t
        LEFT JOIN FETCH t.project
        LEFT JOIN FETCH t.taskCategory
        WHERE e.status = :status
          AND EXISTS (
            SELECT 1 FROM EodTask pt
            WHERE pt.eodEntry = e AND pt.project.projectManager.id = :pmId
          )
        """)
    List<EodEntry> findByProjectManagerIdAndStatus(@Param("pmId") Long pmId,
                                                    @Param("status") EodEntry.Status status);

    // A Team Lead's own decided entries — belonging to this manager's direct reports AND
    // decided by this manager personally. Unlike findByProjectManagerIdAndStatus above, this
    // stays actor-scoped: a Team Lead's Approved/Rejected tabs are about their own actions,
    // not every team's (they only have their own direct reports to begin with).
    @Query("""
        SELECT DISTINCT e FROM EodEntry e
        JOIN FETCH e.employee emp
        LEFT JOIN FETCH e.tasks t
        LEFT JOIN FETCH t.project
        LEFT JOIN FETCH t.taskCategory
        WHERE e.managerId = :managerId AND e.status = :status
          AND EXISTS (
            SELECT 1 FROM com.nforceone.sync.approval.ApprovalAction a
            WHERE a.eodEntry = e AND a.actor.id = :managerId
          )
        """)
    List<EodEntry> findDecidedByManagerId(@Param("managerId") Long managerId,
                                          @Param("status") EodEntry.Status status);

    /**
     * Time-adjustment MINUTES spent inside a date window, for the monthly budget check.
     *
     * Summed across every adjustment type rather than counted per type (V62): the budget is one
     * shared pool, so two hours taken as an early log-off leaves nothing for a late arrival.
     * COALESCE keeps this 0 rather than null when the employee has spent nothing this month.
     *
     * DRAFT is excluded: a draft is an intention, not a use, and a forgotten one silently
     * eating the budget would be undiagnosable from the UI.
     *
     * REJECTED is excluded for the same reason: the manager turned the entry back, so its
     * adjustment was never granted. Counting it stranded the employee — the rejected entry
     * consumed the budget that its own resubmission then failed against, with no way to edit
     * the adjustment or clear it. The minutes are spent again once the entry is resubmitted
     * (SUBMITTED) and, in turn, APPROVED.
     *
     * excludeId skips the entry currently being submitted, so resubmitting an entry that
     * already counts cannot fail the check against itself. Pass null to count everything.
     */
    @Query("SELECT COALESCE(SUM(e.timeAdjustmentMinutes), 0) FROM EodEntry e "
         + "WHERE e.employee.id = :employeeId "
         + "AND e.timeAdjustmentType IS NOT NULL "
         + "AND e.status <> com.nforceone.sync.eod.EodEntry.Status.DRAFT "
         + "AND e.status <> com.nforceone.sync.eod.EodEntry.Status.REJECTED "
         + "AND e.entryDate BETWEEN :from AND :to "
         + "AND (:excludeId IS NULL OR e.id <> :excludeId)")
    long sumAdjustmentMinutesInPeriod(@Param("employeeId") Long employeeId,
                                      @Param("from") LocalDate from,
                                      @Param("to") LocalDate to,
                                      @Param("excludeId") Long excludeId);
}
