package com.nforceone.sync.project;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.org.ProjectType;
import com.nforceone.sync.org.ProjectTypeRepository;
import com.nforceone.sync.project.dto.CreateProjectRequest;
import com.nforceone.sync.project.dto.EmployeeRefDto;
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
    private final ProjectTypeRepository projectTypeRepository;

    public ProjectService(ProjectRepository projectRepository,
                          AllocationRepository allocationRepository,
                          AppUserRepository appUserRepository,
                          ProjectTypeRepository projectTypeRepository) {
        this.projectRepository = projectRepository;
        this.allocationRepository = allocationRepository;
        this.appUserRepository = appUserRepository;
        this.projectTypeRepository = projectTypeRepository;
    }

    /**
     * The projects the signed-in user can book EOD time against on {@code onDate} — i.e. their own
     * allocations, not every project in the org. Scoped by date so an EOD backdated to before an
     * allocation started does not offer a project the person was not on yet.
     */
    @Transactional(readOnly = true)
    public List<ProjectDto> listMine(String actingEmail, LocalDate onDate) {
        // Deleted-aware lookup, per the convention documented on AppUserRepository: an email can
        // be reused after a soft delete, so findByEmail can match several rows and blow up an
        // Optional query with IncorrectResultSizeDataAccessException (a 500 on this endpoint,
        // which the EOD screen shows as an empty Project dropdown).
        AppUser actor = appUserRepository.findByEmailAndDeletedAtIsNull(actingEmail)
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
                .map(p -> ProjectFullDto.from(p, (int) allocationRepository.countByProjectIdAndEmployeeRole(p.getId(), AppUser.Role.EMPLOYEE)))
                .toList();
    }

    /**
     * Users assignable as a project's Team Lead: active MANAGERs only. A PM is deliberately not
     * offered — a PM sits above the TL in the approval chain (they are the escalation target when a
     * TL goes quiet), so leading a project would put them on both sides of their own escalation.
     */
    @Transactional(readOnly = true)
    public List<EmployeeRefDto> listAssignableLeads() {
        return appUserRepository
                .findByRoleInAndStatusAndDeletedAtIsNullOrderByFullNameAsc(
                        List.of(AppUser.Role.MANAGER), AppUser.Status.ACTIVE)
                .stream()
                .map(EmployeeRefDto::from)
                .toList();
    }

    public ProjectFullDto create(CreateProjectRequest req) {
        if (projectRepository.existsByCode(req.code())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A project with this code already exists");
        }

        ProjectType projectType = resolveProjectType(req.projectTypeId(), null);
        String client = resolveClient(projectType, req.client());
        requireDateOrder(req.startDate(), req.endDate());

        Project project = new Project();
        project.setCode(req.code());
        project.setName(req.name());
        project.setClient(client);
        project.setProjectType(projectType);
        project.setStatus(Project.Status.ACTIVE);
        project.setPm(resolveLead(req.pmId(), null));
        project.setProjectManager(resolveProjectManager(req.projectManagerId(), null));
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

        // Code is editable, but must stay unique. Excluding this project from the check is what
        // lets an unrelated edit re-send the unchanged code without tripping a false clash.
        if (projectRepository.existsByCodeAndIdNot(req.code(), id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A project with this code already exists");
        }

        ProjectType projectType = resolveProjectType(req.projectTypeId(), project.getProjectType());
        String client = resolveClient(projectType, req.client());
        requireDateOrder(req.startDate(), req.endDate());

        // A completed project must say when it finished. Only reachable on update — create()
        // always starts a project ACTIVE.
        if (status == Project.Status.COMPLETED && req.endDate() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "End Date is required when status is Completed");
        }

        project.setCode(req.code());
        project.setName(req.name());
        project.setClient(client);
        project.setProjectType(projectType);
        project.setStatus(status);
        project.setPm(resolveLead(req.pmId(), project.getPm()));
        project.setProjectManager(resolveProjectManager(req.projectManagerId(), project.getProjectManager()));
        project.setStartDate(req.startDate());
        project.setEndDate(req.endDate());

        Project saved = projectRepository.save(project);
        return ProjectFullDto.from(saved, (int) allocationRepository.countByProjectIdAndEmployeeRole(saved.getId(), AppUser.Role.EMPLOYEE));
    }

    /**
     * Resolves the project's Team Lead, which must be an active MANAGER — see listAssignableLeads
     * for why a PM is not eligible.
     *
     * <p>This field is not merely a label: whoever holds it may approve EOD entries on the project
     * (see {@code ApprovalService.checkManagerAuthorization}) and it scopes their Approvals queue,
     * Project Dashboard and reports. So an out-of-role assignment is rejected.
     *
     * <p>{@code currentHolder} is the project's existing TL on update, and null on create. Re-sending
     * the current holder unchanged is always allowed — several seeded projects are owned by a
     * SUPERADMIN, and editing an unrelated field on them must not force a reassignment (which would
     * silently move approval authority).
     */
    private AppUser resolveLead(Long pmId, AppUser currentHolder) {
        AppUser lead = appUserRepository.findById(pmId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Team Lead not found"));

        boolean unchanged = currentHolder != null && currentHolder.getId().equals(lead.getId());
        if (unchanged) {
            return lead;
        }

        if (lead.getStatus() != AppUser.Status.ACTIVE || lead.getDeletedAt() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Team Lead must be an active user");
        }
        if (lead.getRole() != AppUser.Role.MANAGER) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only a Team Lead can lead a project");
        }
        return lead;
    }

    /**
     * Resolves the overseeing Project Manager (V55). This is not the approver — the Team Lead is —
     * but it decides whose Approvals queue, Project Dashboard and reports the project appears in,
     * so an out-of-role assignment is rejected.
     *
     * <p>Grandfathers an unchanged current holder for the same reason {@link #resolveLead} does:
     * editing an unrelated field must not force a reassignment that silently moves oversight.
     */
    private AppUser resolveProjectManager(Long projectManagerId, AppUser currentHolder) {
        AppUser manager = appUserRepository.findById(projectManagerId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Project Manager not found"));

        if (currentHolder != null && currentHolder.getId().equals(manager.getId())) {
            return manager;
        }
        if (manager.getStatus() != AppUser.Status.ACTIVE || manager.getDeletedAt() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Project Manager must be an active user");
        }
        if (manager.getRole() != AppUser.Role.PM) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only a Project Manager can oversee a project");
        }
        return manager;
    }

    /** Users assignable as a project's overseeing PM: active PM accounts. */
    @Transactional(readOnly = true)
    public List<EmployeeRefDto> listAssignableProjectManagers() {
        return appUserRepository
                .findByRoleInAndStatusAndDeletedAtIsNullOrderByFullNameAsc(
                        List.of(AppUser.Role.PM), AppUser.Status.ACTIVE)
                .stream()
                .map(EmployeeRefDto::from)
                .toList();
    }

    /**
     * Resolves the project type from the Organization Master (V51). Mandatory — the column is NOT NULL.
     *
     * <p>An inactive type can't be newly assigned, but {@code current} — the project's existing type
     * on update — passes through, so deactivating a type doesn't block edits to projects already on
     * it. Same grandfathering as {@link #resolveLead}.
     */
    private ProjectType resolveProjectType(Long projectTypeId, ProjectType current) {
        if (current != null && current.getId().equals(projectTypeId)) {
            return current;
        }
        ProjectType type = projectTypeRepository.findById(projectTypeId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Project type not found"));
        if (!type.isActive()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "That project type is inactive");
        }
        return type;
    }

    /**
     * The client name to store, decided by the type's {@code requiresClient} flag rather than a
     * hardcoded "CLIENT" — so renaming or adding a type can't silently change the rule.
     *
     * <p>A type that doesn't require a client never stores one: returning null clears a stale name
     * when a client project is switched to another type, so a value hidden in the UI is never
     * silently retained.
     */
    private String resolveClient(ProjectType type, String client) {
        if (!type.isRequiresClient()) {
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
