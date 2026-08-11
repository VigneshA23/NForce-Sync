package com.nforceone.sync.employee;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.project.dto.ProjectDetailDto;
import com.nforceone.sync.project.dto.ProjectFullDto;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;

/**
 * Backs the Employee "My Projects" page — the same shape as
 * {@code TeamLeadProjectService.listMyProjects}/{@code getProjectDetail}, but scoped to the
 * signed-in Employee's own allocation rows.
 *
 * <p>Reuses {@link ProjectRepository#findAllocatedToTeamLeadOnDate}: despite its name, that
 * query is really "the given AppUser's own allocation rows, regardless of project status" — the
 * same lookup any individually-staffed user needs, Team Lead or Employee, so there is no reason
 * to duplicate it.
 *
 * <p>Unlike the Team Lead's project details popup, {@link #getProjectDetail} never returns the
 * roster of other employees assigned to the project — an Employee has no business need to see
 * who else is staffed on it.
 */
@Service
@Transactional(readOnly = true)
public class EmployeeProjectService {

    private final ProjectRepository projectRepository;
    private final AllocationRepository allocationRepository;
    private final AppUserRepository appUserRepository;

    public EmployeeProjectService(ProjectRepository projectRepository,
                                   AllocationRepository allocationRepository,
                                   AppUserRepository appUserRepository) {
        this.projectRepository = projectRepository;
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

    /**
     * Re-derives the Employee's own project list (via {@link #requireProjectAssignedToSelf})
     * rather than trusting the caller's projectId, so an Employee cannot view a project they are
     * not personally assigned to by supplying an arbitrary id.
     */
    public ProjectDetailDto getProjectDetail(String actingEmail, Long projectId, LocalDate onDate) {
        AppUser actor = resolveActor(actingEmail);
        Project project = requireProjectAssignedToSelf(projectId, actor.getId(), onDate);
        return ProjectDetailDto.from(project, List.of());
    }

    /**
     * Authorization boundary: a project not in the Employee's own current allocation list is not
     * one they are personally assigned to.
     */
    private Project requireProjectAssignedToSelf(Long projectId, Long employeeId, LocalDate onDate) {
        return projectRepository.findAllocatedToTeamLeadOnDate(employeeId, onDate)
                .stream()
                .filter(p -> p.getId().equals(projectId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Project is not assigned to you"));
    }

    private AppUser resolveActor(String actingEmail) {
        return appUserRepository.findByEmailAndDeletedAtIsNull(actingEmail)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
    }
}
