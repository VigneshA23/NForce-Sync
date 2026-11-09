package com.nforceone.sync.businessrules;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ShiftDefinitionRepository extends JpaRepository<ShiftDefinition, Long> {
    List<ShiftDefinition> findAllByOrderByStartTimeAsc();
    List<ShiftDefinition> findAllByActiveTrueOrderByStartTimeAsc();
    boolean existsByName(String name);

        // Counts active users assigned to the shift with this name, via app_user.shift_id.
    // Used only to warn admins before deleting a shift; not a live/enforced relationship.
    @Query(value = "SELECT COUNT(*) FROM app_user u JOIN shift_definition s ON s.id = u.shift_id "
            + "WHERE UPPER(s.name) = UPPER(:name) AND u.deleted_at IS NULL", nativeQuery = true)
    long countEmployeesAssigned(@Param("name") String name);
}
