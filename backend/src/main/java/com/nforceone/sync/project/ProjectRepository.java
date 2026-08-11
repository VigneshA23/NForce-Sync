package com.nforceone.sync.project;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface ProjectRepository extends JpaRepository<Project, Long> {
    boolean existsByCode(String code);

    /** Uniqueness check for an edit — excludes the project being edited from the clash test. */
    boolean existsByCodeAndIdNot(String code, Long id);

    // Projects the employee may log EOD time against on a given date: an allocation whose
    // effective window covers that date, on a project that is still ACTIVE. DISTINCT because
    // nothing prevents an employee holding more than one allocation row for the same project.
    // billingModel JOIN FETCHed because ProjectDto computes billableAllowed from it — lazy access
    // inside the mapper would fire one query per project.
    @Query("SELECT DISTINCT a.project FROM Allocation a LEFT JOIN FETCH a.project.billingModel " +
           "WHERE a.employee.id = :employeeId " +
           "AND a.project.status = :status " +
           "AND a.effectiveFrom <= :onDate " +
           "AND (a.effectiveTo IS NULL OR a.effectiveTo >= :onDate) " +
           "ORDER BY a.project.name ASC")
    List<Project> findAllocatedToEmployeeOnDate(@Param("employeeId") Long employeeId,
                                                @Param("onDate") LocalDate onDate,
                                                @Param("status") Project.Status status);

    // JOIN FETCH pm to avoid N+1 lazy-load round trips when listing for management view
    @org.springframework.data.jpa.repository.Query(
            "SELECT p FROM Project p LEFT JOIN FETCH p.pm ORDER BY p.name ASC")
    List<Project> findAllWithPmOrderByNameAsc();

    // The Project Dashboard is scoped to the projects a given PM owns.
    List<Project> findByPmIdOrderByNameAsc(Long pmId);

    /** FK guard for deleting a billing model — mirrors AppUserRepository.countByDepartmentId. */
    long countByBillingModelId(Long billingModelId);

    /** FK guard for deleting a project type. */
    long countByProjectTypeId(Long projectTypeId);

    /** Same grouped-headcount idiom as countCurrentEmployeesByBillingModel, keyed on project type. */
    @Query("SELECT p.projectType.id, COUNT(DISTINCT a.employee.id) " +
           "FROM Allocation a JOIN a.project p " +
           "WHERE a.effectiveFrom <= :today " +
           "AND (a.effectiveTo IS NULL OR a.effectiveTo >= :today) " +
           "GROUP BY p.projectType.id")
    List<Object[]> countCurrentEmployeesByProjectType(@Param("today") LocalDate today);

    /**
     * Distinct employees currently allocated per billing model, resolved in one grouped query so the
     * Organization Masters list does not run a count per row.
     *
     * <p>"Currently" means the allocation's effective window covers {@code today}. No nullable bind
     * parameter is used — Postgres cannot infer the type of {@code :param IS NULL}.
     */
    @Query("SELECT p.billingModel.id, COUNT(DISTINCT a.employee.id) " +
           "FROM Allocation a JOIN a.project p " +
           "WHERE p.billingModel IS NOT NULL " +
           "AND a.effectiveFrom <= :today " +
           "AND (a.effectiveTo IS NULL OR a.effectiveTo >= :today) " +
           "GROUP BY p.billingModel.id")
    List<Object[]> countCurrentEmployeesByBillingModel(@Param("today") LocalDate today);

    // "My Projects" for a Team Lead: the Team Lead's OWN allocation rows — not their team's.
    // A Team Lead is an AppUser like any other and can hold Allocation rows directly (e.g. they
    // are personally staffed on a client engagement), so this is the same shape as
    // findAllocatedToEmployeeOnDate but without the ACTIVE-project restriction (My Projects
    // should still show a Team Lead's own project even if it is on hold or completed) and with
    // pm JOIN FETCHed to avoid N+1 when mapping to ProjectFullDto.
    @Query("SELECT DISTINCT a.project FROM Allocation a LEFT JOIN FETCH a.project.pm " +
           "WHERE a.employee.id = :teamLeadId " +
           "AND a.effectiveFrom <= :onDate " +
           "AND (a.effectiveTo IS NULL OR a.effectiveTo >= :onDate) " +
           "ORDER BY a.project.name ASC")
    List<Project> findAllocatedToTeamLeadOnDate(@Param("teamLeadId") Long teamLeadId,
                                                @Param("onDate") LocalDate onDate);
}
