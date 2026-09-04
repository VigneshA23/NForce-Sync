package com.nforceone.sync.org;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/org")
public class OrgController {

    private final OrgService orgService;

    public OrgController(OrgService orgService) {
        this.orgService = orgService;
    }

    // ── Project types ──────────────────────────────────────────────────────────

    /** Readable by any signed-in user — the PM Project form needs the list for its dropdown. */
    @GetMapping("/project-types")
    @PreAuthorize("isAuthenticated()")
    public List<ProjectTypeDto> listProjectTypes() {
        return orgService.listProjectTypes();
    }

    @PostMapping("/project-types")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('SUPERADMIN')")
    public ProjectTypeDto createProjectType(@Valid @RequestBody CreateProjectTypeRequest request) {
        return orgService.createProjectType(request);
    }

    @PatchMapping("/project-types/{id}")
    @PreAuthorize("hasRole('SUPERADMIN')")
    public ProjectTypeDto toggleProjectType(@PathVariable Long id) {
        return orgService.toggleProjectType(id);
    }

    @DeleteMapping("/project-types/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('SUPERADMIN')")
    public void deleteProjectType(@PathVariable Long id) {
        orgService.deleteProjectType(id);
    }

    // ── Departments ────────────────────────────────────────────────────────────

    @GetMapping("/departments")
    @PreAuthorize("isAuthenticated()")
    public List<DepartmentDto> listDepartments() {
        return orgService.listDepartments();
    }

    @PostMapping("/departments")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('SUPERADMIN')")
    public DepartmentDto createDepartment(@Valid @RequestBody CreateDepartmentRequest request) {
        return orgService.createDepartment(request);
    }

    @PatchMapping("/departments/{id}")
    @PreAuthorize("hasRole('SUPERADMIN')")
    public DepartmentDto toggleDepartment(@PathVariable Long id) {
        return orgService.toggleDepartment(id);
    }

    @DeleteMapping("/departments/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('SUPERADMIN')")
    public void deleteDepartment(@PathVariable Long id) {
        orgService.deleteDepartment(id);
    }

    // ── Designations ───────────────────────────────────────────────────────────

    @GetMapping("/designations")
    @PreAuthorize("isAuthenticated()")
    public List<DesignationDto> listDesignations() {
        return orgService.listDesignations();
    }

    @PostMapping("/designations")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('SUPERADMIN')")
    public DesignationDto createDesignation(@Valid @RequestBody CreateDesignationRequest request) {
        return orgService.createDesignation(request);
    }

    @PatchMapping("/designations/{id}")
    @PreAuthorize("hasRole('SUPERADMIN')")
    public DesignationDto toggleDesignation(@PathVariable Long id) {
        return orgService.toggleDesignation(id);
    }

    @DeleteMapping("/designations/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('SUPERADMIN')")
    public void deleteDesignation(@PathVariable Long id) {
        orgService.deleteDesignation(id);
    }

    // ── Locations ──────────────────────────────────────────────────────────────

    @GetMapping("/locations")
    @PreAuthorize("isAuthenticated()")
    public List<OrgLocationDto> listLocations() {
        return orgService.listLocations();
    }

    @PostMapping("/locations")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('SUPERADMIN')")
    public OrgLocationDto createLocation(@Valid @RequestBody CreateLocationRequest request) {
        return orgService.createLocation(request);
    }

    @PatchMapping("/locations/{id}")
    @PreAuthorize("hasRole('SUPERADMIN')")
    public OrgLocationDto toggleLocation(@PathVariable Long id) {
        return orgService.toggleLocation(id);
    }

    @DeleteMapping("/locations/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('SUPERADMIN')")
    public void deleteLocation(@PathVariable Long id) {
        orgService.deleteLocation(id);
    }
}
