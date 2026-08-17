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

    /**
     * Projects a given PM oversees — the scope for the Project Dashboard and the PM reports.
     * Keys off {@code projectManager}, not {@code pm}: the latter holds the Team Lead, who is a
     * MANAGER, so a PM id would never match it.
     */
    List<Project> findByProjectManagerIdOrderByNameAsc(Long projectManagerId);

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

    // "My Projects" for an Employee (and, historically, mis-used for the Team Lead's own list
    // too): the given AppUser's OWN allocation rows — i.e. projects they are personally staffed
    // on. Still correct for that purpose; it is NOT who a project's assigned Team Lead is, so it
    // must not be used to scope the Team Lead "My Projects" list (see findByPmIdOrderByNameAsc).
    @Query("SELECT DISTINCT a.project FROM Allocation a LEFT JOIN FETCH a.project.pm " +
           "WHERE a.employee.id = :teamLeadId " +
           "AND a.effectiveFrom <= :onDate " +
           "AND (a.effectiveTo IS NULL OR a.effectiveTo >= :onDate) " +
           "ORDER BY a.project.name ASC")
    List<Project> findAllocatedToTeamLeadOnDate(@Param("teamLeadId") Long teamLeadId,
                                                @Param("onDate") LocalDate onDate);

    /**
     * Projects actually assigned to this Team Lead — keyed on {@code Project.pm} (the {@code
     * pm_id} column), which is the real Team Lead-of-project relationship, regardless of whether
     * that Team Lead also happens to hold a personal Allocation row on the project. This is the
     * source of truth for the Team Lead "My Projects" list.
     */
    @Query("SELECT p FROM Project p LEFT JOIN FETCH p.pm WHERE p.pm.id = :teamLeadId ORDER BY p.name ASC")
    List<Project> findByPmIdOrderByNameAsc(@Param("teamLeadId") Long teamLeadId);
}
