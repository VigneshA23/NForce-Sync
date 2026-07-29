package com.nforceone.sync.project;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.project.dto.CreateProjectRequest;
import com.nforceone.sync.project.dto.ProjectDto;
import com.nforceone.sync.project.dto.ProjectFullDto;
import com.nforceone.sync.project.dto.UpdateProjectRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

@Service
@Transactional
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final AllocationRepository allocationRepository;
    private final AppUserRepository appUserRepository;

    public ProjectService(ProjectRepository projectRepository,
                          AllocationRepository allocationRepository,
                          AppUserRepository appUserRepository) {
        this.projectRepository = projectRepository;
        this.allocationRepository = allocationRepository;
        this.appUserRepository = appUserRepository;
    }

    /**
     * The projects the signed-in user can book EOD time against on {@code onDate} — i.e. their own
     * allocations, not every project in the org. Scoped by date so an EOD backdated to before an
     * allocation started does not offer a project the person was not on yet.
     */
    @Transactional(readOnly = true)
    public List<ProjectDto> listMine(String actingEmail, LocalDate onDate) {
        AppUser actor = appUserRepository.findByEmail(actingEmail)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));

        return projectRepository
                .findAllocatedToEmployeeOnDate(actor.getId(), onDate, Project.Status.ACTIVE)
                .stream()
                .map(ProjectDto::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ProjectFullDto> listAll() {
        return projectRepository.findAllWithPmOrderByNameAsc()
                .stream()
                .map(p -> ProjectFullDto.from(p, (int) allocationRepository.countByProjectId(p.getId())))
                .toList();
    }

    public ProjectFullDto create(CreateProjectRequest req, String actingEmail) {
        if (projectRepository.existsByCode(req.code())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A project with this code already exists");
        }
        AppUser actor = appUserRepository.findByEmail(actingEmail)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));

        String client = resolveClient(req.projectType(), req.client());
        requireDateOrder(req.startDate(), req.endDate());

        Project project = new Project();
        project.setCode(req.code());
        project.setName(req.name());
        project.setClient(client);
        project.setProjectType(req.projectType());
        project.setBillingModel(req.billingModel());
        project.setStatus(Project.Status.ACTIVE);
        project.setPm(actor);
        project.setStartDate(req.startDate());
        project.setEndDate(req.endDate());
        project.setCreatedAt(OffsetDateTime.now());

        Project saved = projectRepository.save(project);
        return ProjectFullDto.from(saved, 0);
    }

    public ProjectFullDto update(Long id, UpdateProjectRequest req) {
        Project project = projectRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));

        Project.Status status;
        try {
            status = Project.Status.valueOf(req.status());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status: " + req.status());
        }

        String client = resolveClient(req.projectType(), req.client());
        requireDateOrder(req.startDate(), req.endDate());

        // A completed project must say when it finished. Only reachable on update — create()
        // always starts a project ACTIVE.
        if (status == Project.Status.COMPLETED && req.endDate() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "End Date is required when status is Completed");
        }

        project.setName(req.name());
        project.setClient(client);
        project.setProjectType(req.projectType());
        project.setBillingModel(req.billingModel());
        project.setStatus(status);
        project.setStartDate(req.startDate());
        project.setEndDate(req.endDate());

        Project saved = projectRepository.save(project);
        return ProjectFullDto.from(saved, (int) allocationRepository.countByProjectId(saved.getId()));
    }

    /**
     * Validates the project type and returns the client name to store.
     *
     * <p>A CLIENT project must name its client. An INTERNAL project never stores one — returning
     * null here is what clears a stale name when an existing client project is switched to
     * internal, so a value hidden in the UI can never be silently retained.
     */
    private String resolveClient(String projectType, String client) {
        if (!"CLIENT".equals(projectType) && !"INTERNAL".equals(projectType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Invalid project type: " + projectType);
        }
        if ("INTERNAL".equals(projectType)) {
            return null;
        }
        if (client == null || client.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Client name is required for client projects");
        }
        return client.trim();
    }

    /**
     * A null end date means the project is ongoing. A present one must fall strictly after the
     * start — a project cannot begin and end on the same day.
     */
    private void requireDateOrder(LocalDate startDate, LocalDate endDate) {
        if (endDate != null && !endDate.isAfter(startDate)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "End Date must be after Start Date");
        }
    }
}
