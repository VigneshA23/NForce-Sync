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
        WHERE emp.manager.id = :managerId AND e.status = :status
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
        WHERE emp.manager.id = :managerId AND e.status = :status
        AND e.entryDate BETWEEN :from AND :to
        """)
    List<EodEntry> findPendingByManagerIdAndEntryDateBetween(@Param("managerId") Long managerId,
                                                             @Param("status") EodEntry.Status status,
                                                             @Param("from") LocalDate from,
                                                             @Param("to") LocalDate to);

    // Pending approvals for a Project Manager — any entry with at least one task on a project
    // this PM owns (Project.pm). An entry can span multiple projects, so this is an EXISTS
    // check rather than a strict join, and DISTINCT dedupes entries matching on >1 task.
    @Query("""
        SELECT DISTINCT e FROM EodEntry e
        JOIN FETCH e.employee emp
        LEFT JOIN FETCH e.tasks t
        LEFT JOIN FETCH t.project
        LEFT JOIN FETCH t.taskCategory
        WHERE e.status = :status
          AND EXISTS (
            SELECT 1 FROM EodTask pt
            WHERE pt.eodEntry = e AND pt.project.pm.id = :pmId
          )
        """)
    List<EodEntry> findPendingByProjectManagerId(@Param("pmId") Long pmId,
                                                 @Param("status") EodEntry.Status status);

    // Entries a PM has personally decided (APPROVED/REJECTED), for the PM's own Approved/Rejected
    // tabs. Deliberately narrower than findPendingByProjectManagerId's "any entry on my projects" —
    // scoped to ApprovalAction.actor = this PM, so a PM doesn't see entries the TL decided on
    // without the PM ever touching them.
    @Query("""
        SELECT DISTINCT e FROM EodEntry e
        JOIN FETCH e.employee emp
        LEFT JOIN FETCH e.tasks t
        LEFT JOIN FETCH t.project
        LEFT JOIN FETCH t.taskCategory
        WHERE e.status = :status
          AND EXISTS (
            SELECT 1 FROM com.nforceone.sync.approval.ApprovalAction a
            WHERE a.eodEntry = e AND a.actor.id = :pmId
          )
        """)
    List<EodEntry> findDecidedByProjectManagerId(@Param("pmId") Long pmId,
                                                  @Param("status") EodEntry.Status status);

    // Same idea as findDecidedByProjectManagerId, but for a Team Lead: entries belonging to
    // this manager's direct reports, decided by this manager personally.
    @Query("""
        SELECT DISTINCT e FROM EodEntry e
        JOIN FETCH e.employee emp
        LEFT JOIN FETCH e.tasks t
        LEFT JOIN FETCH t.project
        LEFT JOIN FETCH t.taskCategory
        WHERE emp.manager.id = :managerId AND e.status = :status
          AND EXISTS (
            SELECT 1 FROM com.nforceone.sync.approval.ApprovalAction a
            WHERE a.eodEntry = e AND a.actor.id = :managerId
          )
        """)
    List<EodEntry> findDecidedByManagerId(@Param("managerId") Long managerId,
                                          @Param("status") EodEntry.Status status);

    /**
     * Time-adjustment uses of one type inside a date window, for the monthly allowance check.
     *
     * DRAFT is excluded: a draft is an intention, not a use, and a forgotten one silently
     * eating a monthly slot would be undiagnosable from the UI.
     *
     * excludeId skips the entry currently being submitted, so resubmitting an entry that
     * already counts (e.g. after a changes-request) cannot fail the check against itself.
     * Pass null to count everything.
     */
    @Query("SELECT COUNT(e) FROM EodEntry e "
         + "WHERE e.employee.id = :employeeId "
         + "AND e.timeAdjustmentType = :type "
         + "AND e.status <> com.nforceone.sync.eod.EodEntry.Status.DRAFT "
         + "AND e.entryDate BETWEEN :from AND :to "
         + "AND (:excludeId IS NULL OR e.id <> :excludeId)")
    long countAdjustmentsInPeriod(@Param("employeeId") Long employeeId,
                                  @Param("type") EodEntry.TimeAdjustmentType type,
                                  @Param("from") LocalDate from,
                                  @Param("to") LocalDate to,
                                  @Param("excludeId") Long excludeId);
}
