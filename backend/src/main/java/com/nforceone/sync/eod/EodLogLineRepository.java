package com.nforceone.sync.eod;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

public interface EodLogLineRepository extends JpaRepository<EodLogLine, Long> {

    List<EodLogLine> findByEntryIdOrderBySortOrderAscIdAsc(Long entryId);

    // Batch load for multiple entries — avoids N+1 in mapWithBatchedComments.
    @Query("SELECT l FROM EodLogLine l WHERE l.entry.id IN :entryIds ORDER BY l.entry.id, l.sortOrder ASC, l.id ASC")
    List<EodLogLine> findByEntryIdInOrderBySortOrderAscIdAsc(@Param("entryIds") List<Long> entryIds);

    @Modifying
    @Query("DELETE FROM EodLogLine l WHERE l.entry.id = :entryId")
    void deleteByEntryId(@Param("entryId") Long entryId);

    /** True when someone has replied on this line's blocker thread — the line must then not be deleted. */
    @Query("SELECT COUNT(r) > 0 FROM BlockerReply r WHERE r.logLine.id = :lineId")
    boolean hasBlockerReplies(@Param("lineId") Long lineId);

    /** Which of these lines already have a reply on their blocker thread (one query for a whole list). */
    @Query("SELECT DISTINCT r.logLine.id FROM BlockerReply r WHERE r.logLine.id IN :lineIds")
    List<Long> findLineIdsWithReplies(@Param("lineIds") List<Long> lineIds);

    // ── Daily Log blockers (BLOCKED lines) ────────────────────────────────────────────────────────

    // Reporting Manager blockers from the Daily Log: the same rule as EodTaskRepository#findBlockedForReportingManager
    // — the entry's frozen manager is the viewer and the author is not, non-draft entries only, and an open
    // (unresolved) blocker carries over from its entry date until it is resolved. A Daily Log line has no project,
    // so no lead ever sees it: the reporting manager alone handles it.
    @Query("SELECT DISTINCT l FROM EodLogLine l " +
           "JOIN FETCH l.entry e " +
           "JOIN FETCH e.employee emp " +
           "LEFT JOIN FETCH emp.manager " +
           "LEFT JOIN FETCH l.category " +
           "LEFT JOIN FETCH l.acknowledgedBy " +
           "LEFT JOIN FETCH l.resolvedBy " +
           "WHERE l.taskStatus = com.nforceone.sync.eod.EodTask.TaskStatus.BLOCKED " +
           "AND e.managerId = :managerId " +
           "AND emp.id <> :managerId " +
           "AND e.status <> com.nforceone.sync.eod.EodEntry.Status.DRAFT " +
           "AND ( (l.resolvedAt IS NULL AND e.entryDate <= :to) " +
           "      OR (e.entryDate BETWEEN :from AND :to) " +
           "      OR (l.resolvedAt >= :fromTs AND l.resolvedAt < :toTs) ) " +
           "ORDER BY e.entryDate DESC")
    List<EodLogLine> findBlockedForReportingManager(@Param("managerId") Long managerId,
                                                    @Param("from") LocalDate from,
                                                    @Param("to") LocalDate to,
                                                    @Param("fromTs") OffsetDateTime fromTs,
                                                    @Param("toTs") OffsetDateTime toTs);

    // The member-set window (the reporting team's dashboard figures): entry-date only, like the task version.
    @Query("SELECT DISTINCT l FROM EodLogLine l " +
           "JOIN FETCH l.entry e " +
           "JOIN FETCH e.employee emp " +
           "LEFT JOIN FETCH emp.manager " +
           "LEFT JOIN FETCH l.category " +
           "LEFT JOIN FETCH l.acknowledgedBy " +
           "LEFT JOIN FETCH l.resolvedBy " +
           "WHERE l.taskStatus = com.nforceone.sync.eod.EodTask.TaskStatus.BLOCKED " +
           "AND emp.id IN :memberIds " +
           "AND e.status <> com.nforceone.sync.eod.EodEntry.Status.DRAFT " +
           "AND e.entryDate BETWEEN :from AND :to " +
           "ORDER BY e.entryDate DESC")
    List<EodLogLine> findBlockedByEmployeeIdsInAndDateRange(@Param("memberIds") List<Long> memberIds,
                                                            @Param("from") LocalDate from,
                                                            @Param("to") LocalDate to);

    // The employee's own blockers for My Blockers: every BLOCKED line on his entries in the window (his drafts
    // included, exactly as his Submit EOD blockers are), with what the row needs fetched up front.
    @Query("SELECT DISTINCT l FROM EodLogLine l " +
           "JOIN FETCH l.entry e " +
           "LEFT JOIN FETCH l.category " +
           "LEFT JOIN FETCH l.acknowledgedBy " +
           "LEFT JOIN FETCH l.resolvedBy " +
           "WHERE l.taskStatus = com.nforceone.sync.eod.EodTask.TaskStatus.BLOCKED " +
           "AND e.employee.id = :employeeId " +
           "AND e.status <> com.nforceone.sync.eod.EodEntry.Status.MISSED " +
           "AND e.entryDate BETWEEN :from AND :to " +
           "ORDER BY e.entryDate DESC")
    List<EodLogLine> findBlockedByEmployeeAndDateRange(@Param("employeeId") Long employeeId,
                                                       @Param("from") LocalDate from,
                                                       @Param("to") LocalDate to);
}
