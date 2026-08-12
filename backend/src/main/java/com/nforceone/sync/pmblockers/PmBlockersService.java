package com.nforceone.sync.pmblockers;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.eod.EodTaskRepository;
import com.nforceone.sync.pmblockers.dto.PmBlockerDto;
import com.nforceone.sync.pmblockers.dto.PmBlockersFiltersDto;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.projectdashboard.dto.ProjectOptionDto;
import com.nforceone.sync.projectdashboard.dto.TeamOptionDto;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * Backs the read-only, cross-team Project Manager Blockers page — every blocker raised against
 * any project the PM owns, regardless of which Team Lead the reporting employee belongs to.
 * Scoped server-side to {@code project.projectManager.id == caller.id} (SUPERADMIN may view any
 * PM's portfolio), matching {@code ProjectDashboardService}'s convention. Keys off
 * {@code projectManager}, not {@code pm} — the latter holds the Team Lead, so a PM id would
 * never match it.
 */
@Service
@Transactional(readOnly = true)
public class PmBlockersService {

    private final AppUserRepository appUserRepository;
    private final ProjectRepository projectRepository;
    private final EodTaskRepository eodTaskRepository;

    public PmBlockersService(AppUserRepository appUserRepository,
                              ProjectRepository projectRepository,
                              EodTaskRepository eodTaskRepository) {
        this.appUserRepository = appUserRepository;
        this.projectRepository = projectRepository;
        this.eodTaskRepository = eodTaskRepository;
    }

    public PmBlockersFiltersDto getFilters(String actingEmail) {
        AppUser pm = requirePm(actingEmail);
        List<Project> projects = scopedProjects(pm);
        List<EodTask> tasks = findBlockedTasks(projects);

        // Only project/team options that actually have a blocker — a PM's full portfolio can
        // include projects with zero blockers, which would otherwise show as filter options
        // that always return an empty table.
        Map<Long, Project> projectsWithBlockers = tasks.stream()
                .map(EodTask::getProject)
                .filter(Objects::nonNull)
                .collect(Collectors.toMap(Project::getId, p -> p, (a, b) -> a));
        List<ProjectOptionDto> projectOptions = projectsWithBlockers.values().stream()
                .sorted(Comparator.comparing(Project::getName))
                .map(p -> new ProjectOptionDto(p.getId(), p.getName()))
                .toList();

        Map<Long, AppUser> managersById = tasks.stream()
                .map(t -> t.getEodEntry().getEmployee().getManager())
                .filter(Objects::nonNull)
                .collect(Collectors.toMap(AppUser::getId, m -> m, (a, b) -> a));
        List<TeamOptionDto> teamOptions = managersById.values().stream()
                .sorted(Comparator.comparing(AppUser::getFullName))
                .map(m -> new TeamOptionDto(m.getId(), m.getFullName()))
                .toList();

        return new PmBlockersFiltersDto(projectOptions, teamOptions);
    }

    public List<PmBlockerDto> getBlockers(String actingEmail, LocalDate from, LocalDate to,
                                           Long projectId, Long teamManagerId, String status) {
        if (from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'from' must not be after 'to'");
        }

        AppUser pm = requirePm(actingEmail);
        List<Project> projects = scopedProjects(pm);

        if (projectId != null) {
            Project match = projects.stream().filter(p -> p.getId().equals(projectId)).findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                            "Project is not in your portfolio"));
            projects = List.of(match);
        }

        return findBlockedTasks(projects).stream()
                .filter(t -> !t.getEodEntry().getEntryDate().isBefore(from)
                        && !t.getEodEntry().getEntryDate().isAfter(to))
                .filter(t -> teamManagerId == null
                        || (t.getEodEntry().getEmployee().getManager() != null
                            && teamManagerId.equals(t.getEodEntry().getEmployee().getManager().getId())))
                .filter(t -> status == null || status.equals(t.getBlockerStatus()))
                .map(PmBlockerDto::from)
                .toList();
    }

    private List<EodTask> findBlockedTasks(List<Project> projects) {
        List<Long> projectIds = projects.stream().map(Project::getId).toList();
        if (projectIds.isEmpty()) return List.of();
        return eodTaskRepository.findBlockedByProjectIds(projectIds);
    }

    private AppUser requirePm(String actingEmail) {
        AppUser user = appUserRepository.findByEmailAndDeletedAtIsNull(actingEmail)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
        if (user.getRole() != AppUser.Role.PM && user.getRole() != AppUser.Role.SUPERADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Project Manager access required");
        }
        return user;
    }

    private List<Project> scopedProjects(AppUser pm) {
        if (pm.getRole() == AppUser.Role.SUPERADMIN) {
            return projectRepository.findAllWithPmOrderByNameAsc();
        }
        return projectRepository.findByProjectManagerIdOrderByNameAsc(pm.getId());
    }
}
