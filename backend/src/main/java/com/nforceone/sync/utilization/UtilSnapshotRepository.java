package com.nforceone.sync.utilization;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface UtilSnapshotRepository extends JpaRepository<UtilSnapshot, Long> {

    Optional<UtilSnapshot> findByEmployeeIdAndSnapshotDate(Long employeeId, LocalDate snapshotDate);

    List<UtilSnapshot> findByEmployeeIdAndSnapshotDateBetweenOrderBySnapshotDateAsc(
            Long employeeId, LocalDate from, LocalDate to);

    @Query("SELECT s FROM UtilSnapshot s WHERE s.snapshotDate = :date " +
           "AND s.employeeId IN (SELECT u.id FROM AppUser u WHERE u.manager.id = :managerId)")
    List<UtilSnapshot> findByManagerIdAndDate(@Param("managerId") Long managerId,
                                               @Param("date") LocalDate date);

    // Batch fetch — eliminates N per-member queries in getForTeam()
    @Query("SELECT s FROM UtilSnapshot s WHERE s.snapshotDate = :date AND s.employeeId IN :employeeIds")
    List<UtilSnapshot> findByEmployeeIdInAndSnapshotDate(@Param("employeeIds") List<Long> employeeIds,
                                                          @Param("date") LocalDate date);

    // Range variant — backs resolveUtilizationPctForEmployees, one query for a whole team over
    // a whole date window instead of one query per (employee, day).
    @Query("SELECT s FROM UtilSnapshot s WHERE s.snapshotDate BETWEEN :from AND :to AND s.employeeId IN :employeeIds")
    List<UtilSnapshot> findByEmployeeIdInAndSnapshotDateBetween(@Param("employeeIds") List<Long> employeeIds,
                                                                 @Param("from") LocalDate from,
                                                                 @Param("to") LocalDate to);
}
