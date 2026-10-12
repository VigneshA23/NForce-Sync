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
     * All allocations (optionally filtered by project or team lead). Admin / Super Admin see the whole
     * org; a project manager (by role or by assignment) sees only allocations on projects he is PM of —
     * the scope is enforced in AllocationService.listAllAs via PmScopeService, not here. Write endpoints
     * are ADMIN-only. teamLeadId: see AllocationService.listAll(Long, Long) javadoc.
     */
    @GetMapping
    public List<AllocationDto> listAll(@RequestParam(required = false) Long projectId,
                                        @RequestParam(required = false) Long teamLeadId) {
        return allocationService.listAllAs(actingEmail(), projectId, teamLeadId);
    }

    /**
     * Read-only allocations for one project. Admin / Super Admin: any project. A project manager: only
     * a project he is PM of; another PM's project id is a 403.
     */
    @GetMapping("/project/{projectId}")
    public List<AllocationDto> listForProject(@PathVariable Long projectId) {
        return allocationService.listAllAs(actingEmail(), projectId, null);
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

    private String actingEmail() {
        return (String) org.springframework.security.core.context.SecurityContextHolder
                .getContext().getAuthentication().getPrincipal();
    }
}
