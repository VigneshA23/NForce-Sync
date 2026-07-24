package com.nforceone.sync.eod;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface EodTaskRepository extends JpaRepository<EodTask, Long> {

    @Query("SELECT t FROM EodTask t " +
           "WHERE t.taskStatus = com.nforceone.sync.eod.EodTask.TaskStatus.BLOCKED " +
           "AND t.eodEntry.employee.manager.id = :managerId " +
           "AND t.eodEntry.status <> com.nforceone.sync.eod.EodEntry.Status.DRAFT " +
           "ORDER BY t.eodEntry.entryDate DESC")
    List<EodTask> findBlockedByManagerId(@Param("managerId") Long managerId);
}
