package com.nforceone.sync.project;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ProjectCategoryRepository extends JpaRepository<ProjectCategory, Long> {

    // Categories are generic master data scoped to their creator, not to a project — LEFT JOIN
    // FETCH project since it is now optional. JOIN FETCH createdBy avoids an N+1 per row too.
    @Query("SELECT c FROM ProjectCategory c LEFT JOIN FETCH c.project JOIN FETCH c.createdBy " +
           "WHERE c.createdBy.id = :createdById ORDER BY c.name ASC")
    List<ProjectCategory> findByCreatedByIdWithRefs(@Param("createdById") Long createdById);

    boolean existsByCreatedByIdAndNameIgnoreCase(Long createdById, String name);

    boolean existsByCreatedByIdAndNameIgnoreCaseAndIdNot(Long createdById, String name, Long id);
}
