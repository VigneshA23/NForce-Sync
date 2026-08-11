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
 * <p>Projects: a project counts as the Team Lead's own when the Team Lead themselves — not
 * their team members — currently holds an allocation on it (see
 * {@link ProjectRepository#findAllocatedToTeamLeadOnDate}).
 *
 * <p>Categories: generic master data owned by the creating Team Lead, independent of project
 * assignment — listed and deduplicated by {@code createdBy}, not by project. A category may
 * optionally reference one of the Team Lead's projects; when it does, {@code createCategory}
 * still re-derives the Team Lead's project list to check it rather than trusting the caller's
 * projectId, which is what keeps a Team Lead from tagging a category to another Team Lead's
 * project.
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
        return projectRepository.findAllocatedToTeamLeadOnDate(actor.getId(), onDate)
                .stream()
                .map(p -> ProjectFullDto.from(p,
                        (int) allocationRepository.countByProjectIdAndEmployeeRole(p.getId(), AppUser.Role.EMPLOYEE)))
                .toList();
    }

    /**
     * Project details plus its currently assigned employees, for the project details popup.
     * Re-derives the Team Lead's own project list (via {@link #requireProjectAssignedToTeamLead})
     * so a Team Lead cannot view another Team Lead's project by supplying an arbitrary id.
     */
    public ProjectDetailDto getProjectDetail(String actingEmail, Long projectId, LocalDate onDate) {
        AppUser actor = resolveActor(actingEmail);
        Project project = requireProjectAssignedToTeamLead(projectId, actor.getId(), onDate);

        List<EmployeeRefDto> employees = allocationRepository.findByProjectIdWithRefs(projectId)
                .stream()
                .filter(a -> isActiveOn(a, onDate))
                .map(a -> EmployeeRefDto.from(a.getEmployee()))
                .distinct()
                .toList();

        return ProjectDetailDto.from(project, employees);
    }

    private boolean isActiveOn(Allocation a, LocalDate onDate) {
        return !a.getEffectiveFrom().isAfter(onDate)
                && (a.getEffectiveTo() == null || !a.getEffectiveTo().isBefore(onDate));
    }

    public List<ProjectCategoryDto> listCategories(String actingEmail) {
        AppUser actor = resolveActor(actingEmail);
        return categoryRepository.findByCreatedByIdWithRefs(actor.getId())
                .stream()
                .map(ProjectCategoryDto::from)
                .toList();
    }

    @Transactional
    public ProjectCategoryDto createCategory(CreateProjectCategoryRequest req, String actingEmail, LocalDate onDate) {
        AppUser actor = resolveActor(actingEmail);

        // Associated Project is optional — a category does not require one. When given, it must
        // be one of this Team Lead's own projects; this is the authorization check.
        Project project = req.projectId() != null
                ? requireProjectAssignedToTeamLead(req.projectId(), actor.getId(), onDate)
                : null;

        if (categoryRepository.existsByCreatedByIdAndNameIgnoreCase(actor.getId(), req.name().trim())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A category with this name already exists");
        }

        ProjectCategory.Status status = resolveStatus(req.status());
        String name = req.name().trim();

        // Mirror into a team-scoped TaskCategory row so this category becomes selectable in the
        // Employee EOD dropdown for everyone on this Team Lead's team (app_user.manager_id =
        // actor.id), without affecting the global, unscoped seeded categories. Defaults match
        // what this form collects — no productivity/billability distinction is asked of the
        // Team Lead here.
        TaskCategory taskCategory = new TaskCategory();
        taskCategory.setName(name);
        taskCategory.setIsProductive(true);
        taskCategory.setIsBillableDefault(false);
        taskCategory.setActive(status == ProjectCategory.Status.ACTIVE);
        taskCategory.setManager(actor);
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
        if (!name.equalsIgnoreCase(category.getName())
                && categoryRepository.existsByCreatedByIdAndNameIgnoreCaseAndIdNot(actor.getId(), name, id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A category with this name already exists");
        }

        ProjectCategory.Status status = resolveStatus(req.status());

        category.setName(name);
        category.setDescription(blankToNull(req.description()));
        category.setStatus(status);
        category.setUpdatedAt(OffsetDateTime.now());

        // Keep the mirrored TaskCategory in sync so the Employee EOD dropdown reflects the
        // rename/status change for this Team Lead's team without touching any eod_task rows
        // that already reference it.
        if (category.getTaskCategoryId() != null) {
            taskCategoryRepository.findById(category.getTaskCategoryId()).ifPresent(tc -> {
                tc.setName(name);
                tc.setActive(status == ProjectCategory.Status.ACTIVE);
                taskCategoryRepository.save(tc);
            });
        }

        return ProjectCategoryDto.from(categoryRepository.save(category));
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
     * Re-derives the Team Lead's own project list rather than trusting the caller's projectId —
     * this is the authorization boundary: a project not in that list is not one this Team Lead
     * is personally assigned to, and either way they may not read or write its categories.
     */
    private Project requireProjectAssignedToTeamLead(Long projectId, Long teamLeadId, LocalDate onDate) {
        return projectRepository.findAllocatedToTeamLeadOnDate(teamLeadId, onDate)
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
