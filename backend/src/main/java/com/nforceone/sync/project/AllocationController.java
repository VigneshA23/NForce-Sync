package com.nforceone.sync.project;

import com.nforceone.sync.project.dto.AllocationDto;
import com.nforceone.sync.project.dto.CreateAllocationRequest;
import com.nforceone.sync.project.dto.EmployeeRefDto;
import com.nforceone.sync.project.dto.UpdateAllocationRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/allocations")
public class AllocationController {

    private final AllocationService allocationService;

    public AllocationController(AllocationService allocationService) {
        this.allocationService = allocationService;
    }

    /**
     * All allocations (optionally filtered by project or team lead). PM gets read-only access so
     * the Projects & Allocation page can still show allocations; write endpoints are ADMIN-only.
     * teamLeadId: see AllocationService.listAll(Long, Long) javadoc.
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('PM','ADMIN','SUPERADMIN')")
    public List<AllocationDto> listAll(@RequestParam(required = false) Long projectId,
                                        @RequestParam(required = false) Long teamLeadId) {
        return allocationService.listAll(projectId, teamLeadId);
    }

    /**
     * Read-only allocations for one project — accessible to PM so they can see who is on their
     * projects without being able to create, edit, or delete.
     */
    @GetMapping("/project/{projectId}")
    @PreAuthorize("hasAnyRole('PM','ADMIN','SUPERADMIN')")
    public List<AllocationDto> listForProject(@PathVariable Long projectId) {
        return allocationService.listAll(projectId);
    }

    @GetMapping("/employees")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERADMIN')")
    public List<EmployeeRefDto> listAssignableEmployees() {
        return allocationService.listAssignableEmployees();
    }

    /** Assigns one employee to one project for a date range. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ADMIN','SUPERADMIN')")
    public AllocationDto create(@Valid @RequestBody CreateAllocationRequest request) {
        return allocationService.create(request);
    }

    /** Edits an allocation's date range. Employee and project are fixed. */
    @PatchMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERADMIN')")
    public AllocationDto update(@PathVariable Long id,
                                @Valid @RequestBody UpdateAllocationRequest request) {
        return allocationService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('ADMIN','SUPERADMIN')")
    public void delete(@PathVariable Long id) {
        allocationService.delete(id);
    }
}
