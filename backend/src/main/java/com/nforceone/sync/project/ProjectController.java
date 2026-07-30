package com.nforceone.sync.project;

import com.nforceone.sync.project.dto.CreateProjectRequest;
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

    @GetMapping("/all")
    @PreAuthorize("hasAnyRole('PM','SUPERADMIN')")
    public List<ProjectFullDto> listAll() {
        return projectService.listAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('PM','SUPERADMIN')")
    public ProjectFullDto create(@Valid @RequestBody CreateProjectRequest request) {
        return projectService.create(request, actingEmail());
    }

    @PatchMapping("/{id}")
    @PreAuthorize("hasAnyRole('PM','SUPERADMIN')")
    public ProjectFullDto update(@PathVariable Long id, @Valid @RequestBody UpdateProjectRequest request) {
        return projectService.update(id, request);
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
