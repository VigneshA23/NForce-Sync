package com.nforceone.sync.org;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// Organization Masters — Department/Designation/Location/ProjectType master data. Reads are
// open to any authenticated user (needed by user/project forms' dropdowns); writes are shared
// between SUPERADMIN (system-level configuration) and ADMIN (who also manages Organization
// Masters as part of user administration — e.g. Department/Designation/Location are attributes
// on a user record). Both roles use the exact same endpoints/service/data — no separate
// Admin-specific logic or duplicated master records.
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
    @PreAuthorize("hasAnyRole('SUPERADMIN', 'ADMIN')")
    public ProjectTypeDto createProjectType(@Valid @RequestBody CreateProjectTypeRequest request) {
        return orgService.createProjectType(request);
    }

    @PatchMapping("/project-types/{id}")
    @PreAuthorize("hasAnyRole('SUPERADMIN', 'ADMIN')")
    public ProjectTypeDto toggleProjectType(@PathVariable Long id) {
        return orgService.toggleProjectType(id);
    }

    @DeleteMapping("/project-types/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('SUPERADMIN', 'ADMIN')")
    public void deleteProjectType(@PathVariable Long id) {
        orgService.deleteProjectType(id);
    }

    // ── Departments ────────────────────────────────────────────────────────────

    @GetMapping("/departments")
    @PreAuthorize("isAuthenticated()")
    public List<DepartmentDto> listDepartments(@RequestParam(defaultValue = "false") boolean activeOnly) {
        return orgService.listDepartments(activeOnly);
    }

    @PostMapping("/departments")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SUPERADMIN', 'ADMIN')")
    public DepartmentDto createDepartment(@Valid @RequestBody CreateDepartmentRequest request) {
        return orgService.createDepartment(request);
    }

    @PatchMapping("/departments/{id}")
    @PreAuthorize("hasAnyRole('SUPERADMIN', 'ADMIN')")
    public DepartmentDto toggleDepartment(@PathVariable Long id) {
        return orgService.toggleDepartment(id);
    }

    @DeleteMapping("/departments/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('SUPERADMIN', 'ADMIN')")
    public void deleteDepartment(@PathVariable Long id) {
        orgService.deleteDepartment(id);
    }

    // ── Designations ───────────────────────────────────────────────────────────

    @GetMapping("/designations")
    @PreAuthorize("isAuthenticated()")
    public List<DesignationDto> listDesignations(@RequestParam(defaultValue = "false") boolean activeOnly) {
        return orgService.listDesignations(activeOnly);
    }

    @PostMapping("/designations")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SUPERADMIN', 'ADMIN')")
    public DesignationDto createDesignation(@Valid @RequestBody CreateDesignationRequest request) {
        return orgService.createDesignation(request);
    }

    @PatchMapping("/designations/{id}")
    @PreAuthorize("hasAnyRole('SUPERADMIN', 'ADMIN')")
    public DesignationDto toggleDesignation(@PathVariable Long id) {
        return orgService.toggleDesignation(id);
    }

    @DeleteMapping("/designations/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('SUPERADMIN', 'ADMIN')")
    public void deleteDesignation(@PathVariable Long id) {
        orgService.deleteDesignation(id);
    }

    // ── Locations ──────────────────────────────────────────────────────────────

    @GetMapping("/locations")
    @PreAuthorize("isAuthenticated()")
    public List<OrgLocationDto> listLocations(@RequestParam(defaultValue = "false") boolean activeOnly) {
        return orgService.listLocations(activeOnly);
    }

    @PostMapping("/locations")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SUPERADMIN', 'ADMIN')")
    public OrgLocationDto createLocation(@Valid @RequestBody CreateLocationRequest request) {
        return orgService.createLocation(request);
    }

    @PatchMapping("/locations/{id}")
    @PreAuthorize("hasAnyRole('SUPERADMIN', 'ADMIN')")
    public OrgLocationDto toggleLocation(@PathVariable Long id) {
        return orgService.toggleLocation(id);
    }

    @DeleteMapping("/locations/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('SUPERADMIN', 'ADMIN')")
    public void deleteLocation(@PathVariable Long id) {
        orgService.deleteLocation(id);
    }
}
