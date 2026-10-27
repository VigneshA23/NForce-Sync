package com.nforceone.sync.eod;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface BlockerReadStateRepository extends JpaRepository<BlockerReadState, Long> {

    Optional<BlockerReadState> findByTaskIdAndUserId(Long taskId, Long userId);

    Optional<BlockerReadState> findByLogLineIdAndUserId(Long logLineId, Long userId);

    /**
     * Unread blockers for the employee who raised them: distinct blockers on his own entries that have a reply
     * from SOMEONE ELSE (a reviewer) newer than his last read of that thread (or never read).
     */
    @Query("SELECT COUNT(DISTINCT r.task.id) FROM BlockerReply r " +
           "WHERE r.task.eodEntry.employee.id = :userId AND r.sender.id <> :userId " +
           "AND NOT EXISTS (SELECT 1 FROM BlockerReadState s " +
           "                WHERE s.task.id = r.task.id AND s.user.id = :userId AND s.lastReadAt >= r.createdAt)")
    long countUnreadBlockersForEmployee(@Param("userId") Long userId);

    /** The same count for the employee's Daily Log blockers. */
    @Query("SELECT COUNT(DISTINCT r.logLine.id) FROM BlockerReply r " +
           "WHERE r.logLine.entry.employee.id = :userId AND r.sender.id <> :userId " +
           "AND NOT EXISTS (SELECT 1 FROM BlockerReadState s " +
           "                WHERE s.logLine.id = r.logLine.id AND s.user.id = :userId AND s.lastReadAt >= r.createdAt)")
    long countUnreadLineBlockersForEmployee(@Param("userId") Long userId);
}
