package com.nforceone.sync.project;

import com.nforceone.sync.approval2.EodProjectApprovalRepository;
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
    private final EodProjectApprovalRepository pieceRepository;

    public ProjectService(ProjectRepository projectRepository,
                          AllocationRepository allocationRepository,
                          AppUserRepository appUserRepository,
                          ProjectTypeRepository projectTypeRepository,
                          EodProjectApprovalRepository pieceRepository) {
        this.projectRepository = projectRepository;
        this.allocationRepository = allocationRepository;
        this.appUserRepository = appUserRepository;
        this.projectTypeRepository = projectTypeRepository;
        this.pieceRepository = pieceRepository;
    }

    /**
     * The projects the signed-in user can book EOD time against on {@code onDate} — i.e. their own
     * allocations, not every project in the org. Scoped by date so an EOD backdated to before an
     * allocation started does not offer a project the person was not on yet.
     */
    @Transactional(readOnly = true)
    public List<ProjectDto> listMine(String actingEmail, LocalDate onDate) {
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
     * Users assignable as a project's Team Lead: any active user except PM role.
     * A PM cannot be a lead — they sit above the lead in the approval chain, so leading
     * a project would put them on both sides of their own escalation.
     */
    @Transactional(readOnly = true)
    public List<EmployeeRefDto> listAssignableLeads() {
        return appUserRepository
                .findByRoleNotInAndStatusAndDeletedAtIsNullOrderByFullNameAsc(
                        List.of(AppUser.Role.PM), AppUser.Status.ACTIVE)
                .stream()
                .map(EmployeeRefDto::from)
                .toList();
    }

    /** Users assignable as a project's overseeing PM: any active user (any role). */
    @Transactional(readOnly = true)
    public List<EmployeeRefDto> listAssignableProjectManagers() {
        return appUserRepository
                .findByStatusAndDeletedAtIsNullOrderByFullNameAsc(AppUser.Status.ACTIVE)
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
        project.setLead(resolveLead(req.leadId(), null));
        project.setPm(resolvePm(req.pmId(), null));
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

        if (projectRepository.existsByCodeAndIdNot(req.code(), id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A project with this code already exists");
        }

        ProjectType projectType = resolveProjectType(req.projectTypeId(), project.getProjectType());
        String client = resolveClient(projectType, req.client());
        requireDateOrder(req.startDate(), req.endDate());

        if (status == Project.Status.COMPLETED && req.endDate() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "End Date is required when status is Completed");
        }

        // Block closing a project while any EOD pieces are still awaiting approval.
        if ((status == Project.Status.COMPLETED || status == Project.Status.INACTIVE)
                && project.getStatus() != status) {
            long pending = pieceRepository.countPendingByProjectId(id);
            if (pending > 0) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Cannot close this project: " + pending + " pending EOD approval"
                        + (pending == 1 ? "" : "s") + " must be resolved first.");
            }
        }

        project.setCode(req.code());
        project.setName(req.name());
        project.setClient(client);
        project.setProjectType(projectType);
        project.setStatus(status);
        project.setLead(resolveLead(req.leadId(), project.getLead()));
        project.setPm(resolvePm(req.pmId(), project.getPm()));
        project.setStartDate(req.startDate());
        project.setEndDate(req.endDate());

        Project saved = projectRepository.save(project);
        return ProjectFullDto.from(saved, (int) allocationRepository.countByProjectIdAndEmployeeRole(saved.getId(), AppUser.Role.EMPLOYEE));
    }

    /**
     * Assigns a new Team Lead to a project via the explicit lead-assignment endpoint.
     * Three-rule validation (Phase 8a):
     *   1. Candidate must not have PM role — PMs sit above the lead in the approval chain.
     *   2. Candidate must not already be this project's PM (same-person check).
     *   3. Candidate must have an active allocation on this project today.
     * Each rule returns a specific 400 naming the failure.
     */
    public ProjectFullDto assignLead(Long projectId, Long leadId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));
        AppUser candidate = appUserRepository.findById(leadId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "User not found: " + leadId));

        if (candidate.getRole() == AppUser.Role.PM) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    candidate.getFullName() + " has the PM role and cannot be assigned as Team Lead.");
        }

        if (project.getPm() != null && project.getPm().getId().equals(leadId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    candidate.getFullName() + " is already this project's PM and cannot also be its Team Lead.");
        }

        long active = allocationRepository.countActiveByEmployeeIdAndProjectId(leadId, projectId, LocalDate.now());
        if (active == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    candidate.getFullName() + " is not actively allocated to this project. "
                    + "Allocate them first, then assign as Team Lead.");
        }

        project.setLead(candidate);
        Project saved = projectRepository.save(project);
        return ProjectFullDto.from(saved, (int) allocationRepository.countByProjectIdAndEmployeeRole(saved.getId(), AppUser.Role.EMPLOYEE));
    }

    /** Clears the Team Lead; the project falls back to PM-as-approver per existing routing. */
    public ProjectFullDto clearLead(Long projectId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));
        project.setLead(null);
        Project saved = projectRepository.save(project);
        return ProjectFullDto.from(saved, (int) allocationRepository.countByProjectIdAndEmployeeRole(saved.getId(), AppUser.Role.EMPLOYEE));
    }

    /**
     * Resolves the project's Team Lead. Any active non-PM user may lead a project (Phase 8a).
     * Grandfathers an unchanged current holder so editing an unrelated field cannot force reassignment.
     */
    private AppUser resolveLead(Long leadId, AppUser currentHolder) {
        AppUser lead = appUserRepository.findById(leadId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Team Lead not found"));

        boolean unchanged = currentHolder != null && currentHolder.getId().equals(lead.getId());
        if (unchanged) {
            return lead;
        }

        if (lead.getStatus() != AppUser.Status.ACTIVE || lead.getDeletedAt() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Team Lead must be an active user");
        }
        if (lead.getRole() == AppUser.Role.PM) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A user with the PM role cannot be assigned as Team Lead.");
        }
        return lead;
    }

    /**
     * Resolves the overseeing Project Manager. Any active user may oversee a project.
     * Grandfathers an unchanged current holder so an unrelated edit cannot silently move oversight.
     */
    private AppUser resolvePm(Long pmId, AppUser currentHolder) {
        AppUser manager = appUserRepository.findById(pmId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Project Manager not found"));

        if (currentHolder != null && currentHolder.getId().equals(manager.getId())) {
            return manager;
        }
        if (manager.getStatus() != AppUser.Status.ACTIVE || manager.getDeletedAt() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Project Manager must be an active user");
        }
        return manager;
    }

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

    private void requireDateOrder(LocalDate startDate, LocalDate endDate) {
        if (endDate != null && !endDate.isAfter(startDate)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "End Date must be after Start Date");
        }
    }
}
