package com.nforceone.sync.employee;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.project.Allocation;
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
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

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
        Map<Long, List<Allocation>> mine = allocationRepository.findByEmployeeId(actor.getId()).stream()
                .collect(Collectors.groupingBy(a -> a.getProject().getId()));
        return projectRepository.findAllocatedToTeamLeadOnDate(actor.getId(), onDate)
                .stream()
                .map(p -> {
                    ProjectFullDto dto = ProjectFullDto.from(p,
                            (int) allocationRepository.countByProjectIdAndEmployeeRole(p.getId(), AppUser.Role.EMPLOYEE));
                    // Start/End Date on this page are the Employee's own allocation window, not the project's.
                    return pickAllocation(mine.getOrDefault(p.getId(), List.of()), onDate)
                            .map(a -> dto.withDates(a.getEffectiveFrom(), a.getEffectiveTo()))
                            .orElse(dto);
                })
                .toList();
    }

    /** The allocation active on {@code onDate} (latest start wins), else the most recent one. */
    static Optional<Allocation> pickAllocation(List<Allocation> rows, LocalDate onDate) {
        Comparator<Allocation> byStart = Comparator.comparing(Allocation::getEffectiveFrom);
        return rows.stream()
                .filter(a -> !a.getEffectiveFrom().isAfter(onDate)
                        && (a.getEffectiveTo() == null || !a.getEffectiveTo().isBefore(onDate)))
                .max(byStart)
                .or(() -> rows.stream().max(byStart));
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
