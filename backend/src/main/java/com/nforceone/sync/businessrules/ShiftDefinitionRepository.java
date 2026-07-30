package com.nforceone.sync.businessrules;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ShiftDefinitionRepository extends JpaRepository<ShiftDefinition, Long> {
    List<ShiftDefinition> findAllByOrderByStartTimeAsc();
    boolean existsByName(String name);

    // Legacy `employee` table (no JPA entity — predates the AppUser-based employee
    // model and isn't otherwise read/written by this app) is still the only place a
    // shift assignment is recorded. Matched by name since there's no FK to shift_definition.id.
    // Used only to warn admins before deleting a shift; not a live/enforced relationship.
    @Query(value = "SELECT COUNT(*) FROM employee WHERE UPPER(shift) = UPPER(:name)", nativeQuery = true)
    long countEmployeesAssigned(@Param("name") String name);
}
