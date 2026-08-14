package com.nforceone.sync.project;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ProjectCategoryRepository extends JpaRepository<ProjectCategory, Long> {

    // Categories are global, generic master data — every Team Lead sees the same list,
    // regardless of who created each row. LEFT JOIN FETCH project since it is optional, JOIN
    // FETCH createdBy avoids an N+1 per row.
    @Query("SELECT c FROM ProjectCategory c LEFT JOIN FETCH c.project JOIN FETCH c.createdBy " +
           "ORDER BY c.name ASC")
    List<ProjectCategory> findAllWithRefs();

    // Global uniqueness check (case-insensitive, whitespace-normalized) — a category with this
    // name existing under ANY Team Lead blocks creation of another one. Backed by the DB-level
    // project_category_normalized_name_uq index (see V60) as the final guard against races.
    @Query("SELECT CASE WHEN COUNT(c) > 0 THEN true ELSE false END FROM ProjectCategory c " +
           "WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(:name))")
    boolean existsByNormalizedName(@Param("name") String name);

    @Query("SELECT CASE WHEN COUNT(c) > 0 THEN true ELSE false END FROM ProjectCategory c " +
           "WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(:name)) AND c.id <> :id")
    boolean existsByNormalizedNameAndIdNot(@Param("name") String name, @Param("id") Long id);
}
