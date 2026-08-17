package com.nforceone.sync.teamlead;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.EodTaskRepository;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectCategory;
import com.nforceone.sync.project.ProjectCategoryRepository;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.project.TaskCategory;
import com.nforceone.sync.project.TaskCategoryRepository;
import com.nforceone.sync.project.Allocation;
import com.nforceone.sync.project.dto.CreateProjectCategoryRequest;
import com.nforceone.sync.project.dto.DeleteCategoryResult;
import com.nforceone.sync.project.dto.EmployeeRefDto;
import com.nforceone.sync.project.dto.ProjectCategoryDto;
import com.nforceone.sync.project.dto.ProjectDetailDto;
import com.nforceone.sync.project.dto.ProjectFullDto;
import com.nforceone.sync.project.dto.UpdateProjectCategoryRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * Backs the Team Lead "My Projects" module.
 *
 * <p>Projects: a project counts as the Team Lead's own when the Team Lead is that project's
 * assigned Team Lead — {@code Project.pm} — not when the Team Lead merely holds a personal
 * Allocation row on it (see {@link ProjectRepository#findByPmIdOrderByNameAsc}).
 *
 * <p>Categories: global, generic master data — every Team Lead sees and can add to the same
 * application-wide list (see V60), independent of project, team, or who created each row.
 * Uniqueness is case-insensitive and whitespace-normalized, checked here and enforced as the
 * final guard by the DB (project_category_normalized_name_uq / task_category_normalized_name_uq).
 * A category may optionally reference one of the Team Lead's projects; when it does,
 * {@code createCategory} still re-derives the Team Lead's project list to check it rather than
 * trusting the caller's projectId, which is what keeps a Team Lead from tagging a category to
 * another Team Lead's project. Edit/delete remain restricted to the category's creator (see
 * {@link #requireOwnedCategory}) — global visibility does not imply shared ownership.
 */
@Service
@Transactional(readOnly = true)
public class TeamLeadProjectService {

    private final ProjectRepository projectRepository;
    private final ProjectCategoryRepository categoryRepository;
    private final AllocationRepository allocationRepository;
    private final AppUserRepository appUserRepository;
    private final TaskCategoryRepository taskCategoryRepository;
    private final EodTaskRepository eodTaskRepository;

    public TeamLeadProjectService(ProjectRepository projectRepository,
                                   ProjectCategoryRepository categoryRepository,
                                   AllocationRepository allocationRepository,
                                   AppUserRepository appUserRepository,
                                   TaskCategoryRepository taskCategoryRepository,
                                   EodTaskRepository eodTaskRepository) {
        this.projectRepository = projectRepository;
        this.categoryRepository = categoryRepository;
        this.allocationRepository = allocationRepository;
        this.appUserRepository = appUserRepository;
        this.taskCategoryRepository = taskCategoryRepository;
        this.eodTaskRepository = eodTaskRepository;
    }

    public List<ProjectFullDto> listMyProjects(String actingEmail, LocalDate onDate) {
    AppUser actor = resolveActor(actingEmail);
    return projectRepository.findByPmIdOrderByNameAsc(actor.getId())
            .stream()
            .map(p -> ProjectFullDto.from(p, activeAssignedEmployees(p.getId(), onDate).size()))
            .toList();
}

    /**
     * Project details plus its currently assigned employees, for the project details popup.
     * Re-derives the Team Lead's own project list (via {@link #requireProjectAssignedToTeamLead})
     * so a Team Lead cannot view another Team Lead's project by supplying an arbitrary id.
     *
     * <p>The employee roster excludes the project's own Team Lead: {@code
     * findByProjectIdWithRefs} returns every Allocation row on the project, which can include the
     * Team Lead's own personal allocation — that person is already shown separately as "Team
     * Lead" and must not also appear in "Assigned Employees".
     */
    public ProjectDetailDto getProjectDetail(String actingEmail, Long projectId, LocalDate onDate) {
        AppUser actor = resolveActor(actingEmail);
        Project project = requireProjectAssignedToTeamLead(projectId, actor.getId());

        return ProjectDetailDto.from(project, activeAssignedEmployees(projectId, onDate));
    }

    /**
     * Everyone (any role) with an allocation on this project whose effective window covers
     * {@code onDate}, deduplicated. Backs both the "Team Size" column on the My Projects list
     * and the "Assigned Employees" list in the project details popup, so the two always agree.
     */
   private List<EmployeeRefDto> activeAssignedEmployees(Long projectId, LocalDate onDate) {
    Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "Project not found"));

    return allocationRepository.findByProjectIdWithRefs(projectId)
            .stream()
            .filter(a -> isActiveOn(a, onDate))
            .filter(a -> project.getPm() == null
                    || !a.getEmployee().getId().equals(project.getPm().getId()))
            .map(a -> EmployeeRefDto.from(a.getEmployee()))
            .distinct()
            .toList();
}

    private boolean isActiveOn(Allocation a, LocalDate onDate) {
        return !a.getEffectiveFrom().isAfter(onDate)
                && (a.getEffectiveTo() == null || !a.getEffectiveTo().isBefore(onDate));
    }

    public List<ProjectCategoryDto> listCategories(String actingEmail) {
        // Global list — every Team Lead sees the same application-wide categories, not just
        // the ones they personally created (see V60 / class javadoc).
        resolveActor(actingEmail);
        return categoryRepository.findAllWithRefs()
                .stream()
                .map(ProjectCategoryDto::from)
                .toList();
    }

    @Transactional
    public ProjectCategoryDto createCategory(CreateProjectCategoryRequest req, String actingEmail) {
        AppUser actor = resolveActor(actingEmail);

        // Associated Project is optional — a category does not require one. When given, it must
        // be one of this Team Lead's own projects; this is the authorization check.
        Project project = req.projectId() != null
                ? requireProjectAssignedToTeamLead(req.projectId(), actor.getId())
                : null;

        String name = req.name().trim();

        // Global existence check, case-insensitive and whitespace-normalized — a category with
        // this name under ANY Team Lead blocks creation of another one (see V60). The DB-level
        // unique index is the final guard for the concurrent-request race (two Team Leads
        // submitting the same name at once); see the catch below.
        if (categoryRepository.existsByNormalizedName(name)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Category '" + name + "' already exists.");
        }

        ProjectCategory.Status status = resolveStatus(req.status());

        try {
            // Mirror into a TaskCategory row so this category becomes selectable in the
            // Employee EOD dropdown for every employee, application-wide. Defaults match what
            // this form collects — no productivity/billability distinction is asked of the
            // Team Lead here.
            TaskCategory taskCategory = new TaskCategory();
            taskCategory.setName(name);
            taskCategory.setIsProductive(true);
            taskCategory.setIsBillableDefault(false);
            taskCategory.setActive(status == ProjectCategory.Status.ACTIVE);
            taskCategory = taskCategoryRepository.save(taskCategory);

            ProjectCategory category = new ProjectCategory();
            category.setProject(project);
            category.setName(name);
            category.setCode(blankToNull(req.code()));
            category.setDescription(blankToNull(req.description()));
            category.setColor(blankToNull(req.color()));
            category.setStatus(status);
            category.setCreatedBy(actor);
            category.setTaskCategoryId(taskCategory.getId());
            OffsetDateTime now = OffsetDateTime.now();
            category.setCreatedAt(now);
            category.setUpdatedAt(now);

            return ProjectCategoryDto.from(categoryRepository.save(category));
        } catch (DataIntegrityViolationException e) {
            // Two Team Leads submitted the same normalized name at nearly the same time and
            // both passed the pre-check above; the DB's unique index rejected the loser. Never
            // surface the raw constraint-violation error to the client.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Category '" + name + "' already exists.");
        }
    }

    /**
     * Same editable surface as the "Existing Categories" table: name, description, status.
     * Project/code/color/ownership are intentionally not touched here — categories are
     * team-level and generic, and editing must not be able to move a category to another
     * project or team.
     */
    @Transactional
    public ProjectCategoryDto updateCategory(Long id, UpdateProjectCategoryRequest req, String actingEmail) {
        AppUser actor = resolveActor(actingEmail);
        ProjectCategory category = requireOwnedCategory(id, actor.getId());

        String name = req.name().trim();
        // Global check (excluding this row itself) — renaming "Testing" to "Development" must
        // be rejected exactly like creating a new "Development" would be, whichever Team Lead
        // owns the existing one.
        if (!name.equalsIgnoreCase(category.getName())
                && categoryRepository.existsByNormalizedNameAndIdNot(name, id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Category '" + name + "' already exists.");
        }

        ProjectCategory.Status status = resolveStatus(req.status());

        category.setName(name);
        category.setDescription(blankToNull(req.description()));
        category.setStatus(status);
        category.setUpdatedAt(OffsetDateTime.now());

        try {
            // Keep the mirrored TaskCategory in sync so the Employee EOD dropdown reflects the
            // rename/status change everywhere, without touching any eod_task rows that already
            // reference it.
            if (category.getTaskCategoryId() != null) {
                taskCategoryRepository.findById(category.getTaskCategoryId()).ifPresent(tc -> {
                    tc.setName(name);
                    tc.setActive(status == ProjectCategory.Status.ACTIVE);
                    taskCategoryRepository.save(tc);
                });
            }

            return ProjectCategoryDto.from(categoryRepository.save(category));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Category '" + name + "' already exists.");
        }
    }

    /**
     * Hard-deletes the category (and its mirrored TaskCategory) when nothing historical
     * references it. If the mirrored TaskCategory is already referenced by an eod_task row,
     * hard-deleting it would either violate the FK or destroy the ability to render that
     * historical entry — so the category is deactivated instead, exactly like clicking
     * "Deactivate" on the status field. Historical EOD records are never touched.
     */
    @Transactional
    public DeleteCategoryResult deleteCategory(Long id, String actingEmail) {
        AppUser actor = resolveActor(actingEmail);
        ProjectCategory category = requireOwnedCategory(id, actor.getId());

        Long taskCategoryId = category.getTaskCategoryId();
        boolean inUse = taskCategoryId != null && eodTaskRepository.existsByTaskCategoryId(taskCategoryId);

        if (inUse) {
            category.setStatus(ProjectCategory.Status.INACTIVE);
            category.setUpdatedAt(OffsetDateTime.now());
            taskCategoryRepository.findById(taskCategoryId).ifPresent(tc -> {
                tc.setActive(false);
                taskCategoryRepository.save(tc);
            });
            return new DeleteCategoryResult(false, ProjectCategoryDto.from(categoryRepository.save(category)));
        }

        categoryRepository.delete(category);
        if (taskCategoryId != null) {
            taskCategoryRepository.deleteById(taskCategoryId);
        }
        return new DeleteCategoryResult(true, null);
    }

    /**
     * Re-derives ownership from the category's own {@code createdBy} rather than trusting the
     * caller — the authorization boundary for edit/delete, same pattern as
     * {@link #requireProjectAssignedToTeamLead}: a Team Lead can never mutate another Team
     * Lead's category by supplying its id.
     */
    private ProjectCategory requireOwnedCategory(Long id, Long actorId) {
        ProjectCategory category = categoryRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found"));
        if (!category.getCreatedBy().getId().equals(actorId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Category does not belong to you");
        }
        return category;
    }

    private AppUser resolveActor(String actingEmail) {
        return appUserRepository.findByEmailAndDeletedAtIsNull(actingEmail)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
    }

    /**
     * Re-derives the Team Lead's own project list (by {@code Project.pm}, not by the caller's
     * say-so) — this is the authorization boundary: a project not in that list is not one this
     * Team Lead is the assigned Team Lead of, and either way they may not read or write its
     * details/categories.
     */
    private Project requireProjectAssignedToTeamLead(Long projectId, Long teamLeadId) {
        return projectRepository.findByPmIdOrderByNameAsc(teamLeadId)
                .stream()
                .filter(p -> p.getId().equals(projectId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Project is not assigned to you"));
    }

    private ProjectCategory.Status resolveStatus(String status) {
        if (status == null || status.isBlank()) {
            return ProjectCategory.Status.ACTIVE;
        }
        try {
            return ProjectCategory.Status.valueOf(status);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status: " + status);
        }
    }

    private String blankToNull(String value) {
        return (value == null || value.isBlank()) ? null : value.trim();
    }
}
