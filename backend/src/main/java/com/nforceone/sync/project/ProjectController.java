package com.nforceone.sync.project;

import com.nforceone.sync.project.dto.CreateProjectRequest;
import com.nforceone.sync.project.dto.EmployeeRefDto;
import com.nforceone.sync.project.dto.ProjectDto;
import com.nforceone.sync.project.dto.ProjectFullDto;
import com.nforceone.sync.project.dto.UpdateProjectRequest;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/projects")
public class ProjectController {

    private final ProjectService projectService;

    public ProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    /**
     * The caller's own allocated projects — this is what feeds the EOD Project dropdown, so it is
     * scoped to the signed-in user rather than listing every active project in the org. Privileged
     * screens that need the full list use {@code /api/projects/all} instead.
     *
     * @param date the EOD date the list is for; defaults to today.
     */
    @GetMapping
    public List<ProjectDto> listMine(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return projectService.listMine(actingEmail(), date != null ? date : LocalDate.now());
    }

    /** Full project list — readable by PM (read-only view), Admin, and Super Admin. */
    @GetMapping("/all")
    @PreAuthorize("hasAnyRole('PM','ADMIN','SUPERADMIN')")
    public List<ProjectFullDto> listAll() {
        return projectService.listAll();
    }

    /** Create project — Admin and Super Admin only. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ADMIN','SUPERADMIN')")
    public ProjectFullDto create(@Valid @RequestBody CreateProjectRequest request) {
        return projectService.create(request);
    }

    /** Users assignable as a project's Team Lead — active MANAGERs only. */
    @GetMapping("/leads")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERADMIN')")
    public List<EmployeeRefDto> listAssignableLeads() {
        return projectService.listAssignableLeads();
    }

    /** Users assignable as a project's overseeing PM — PM, Admin, and Super Admin accounts. */
    @GetMapping("/managers")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERADMIN')")
    public List<EmployeeRefDto> listAssignableProjectManagers() {
        return projectService.listAssignableProjectManagers();
    }

    /** Update project — Admin and Super Admin only. */
    @PatchMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERADMIN')")
    public ProjectFullDto update(@PathVariable Long id, @Valid @RequestBody UpdateProjectRequest request) {
        return projectService.update(id, request);
    }

    /**
     * Assign a Team Lead to a project. Three-rule validation: target must be MANAGER-role,
     * must not already be this project's PM, and must have an active allocation on this project.
     */
    @PutMapping("/{id}/lead")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERADMIN')")
    public ProjectFullDto assignLead(@PathVariable Long id, @RequestBody AssignLeadRequest request) {
        return projectService.assignLead(id, request.leadId());
    }

    /** Clear the Team Lead; project reverts to PM-as-approver fallback. */
    @DeleteMapping("/{id}/lead")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERADMIN')")
    public ProjectFullDto clearLead(@PathVariable Long id) {
        return projectService.clearLead(id);
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }

    record AssignLeadRequest(Long leadId) {}
}
