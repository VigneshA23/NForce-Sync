package com.nforceone.sync.teamlead;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectCategory;
import com.nforceone.sync.project.ProjectCategoryRepository;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.project.dto.CreateProjectCategoryRequest;
import com.nforceone.sync.project.dto.ProjectCategoryDto;
import com.nforceone.sync.project.dto.ProjectFullDto;
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

    public TeamLeadProjectService(ProjectRepository projectRepository,
                                   ProjectCategoryRepository categoryRepository,
                                   AllocationRepository allocationRepository,
                                   AppUserRepository appUserRepository) {
        this.projectRepository = projectRepository;
        this.categoryRepository = categoryRepository;
        this.allocationRepository = allocationRepository;
        this.appUserRepository = appUserRepository;
    }

    public List<ProjectFullDto> listMyProjects(String actingEmail, LocalDate onDate) {
        AppUser actor = resolveActor(actingEmail);
        return projectRepository.findAllocatedToTeamLeadOnDate(actor.getId(), onDate)
                .stream()
                .map(p -> ProjectFullDto.from(p,
                        (int) allocationRepository.countByProjectIdAndEmployeeRole(p.getId(), AppUser.Role.EMPLOYEE)))
                .toList();
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

        ProjectCategory category = new ProjectCategory();
        category.setProject(project);
        category.setName(req.name().trim());
        category.setCode(blankToNull(req.code()));
        category.setDescription(blankToNull(req.description()));
        category.setColor(blankToNull(req.color()));
        category.setStatus(status);
        category.setCreatedBy(actor);
        OffsetDateTime now = OffsetDateTime.now();
        category.setCreatedAt(now);
        category.setUpdatedAt(now);

        return ProjectCategoryDto.from(categoryRepository.save(category));
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
