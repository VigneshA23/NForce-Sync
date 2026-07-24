package com.nforceone.sync.eod;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface EodEntryRepository extends JpaRepository<EodEntry, Long> {

    Optional<EodEntry> findByEmployeeIdAndEntryDate(Long employeeId, LocalDate entryDate);

    List<EodEntry> findByEmployeeIdAndEntryDateBetweenOrderByEntryDateDesc(
            Long employeeId, LocalDate from, LocalDate to);

    List<EodEntry> findByEmployeeIdOrderByEntryDateDesc(Long employeeId);

    @Query("SELECT e FROM EodEntry e WHERE e.employee.manager.id = :managerId AND e.status = :status ORDER BY e.entryDate DESC")
    List<EodEntry> findPendingByManagerId(@Param("managerId") Long managerId,
                                          @Param("status") EodEntry.Status status);
}
