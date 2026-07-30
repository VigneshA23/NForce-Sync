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
@PreAuthorize("hasAnyRole('PM','SUPERADMIN')")
public class AllocationController {

    private final AllocationService allocationService;

    public AllocationController(AllocationService allocationService) {
        this.allocationService = allocationService;
    }

    @GetMapping
    public List<AllocationDto> listAll(@RequestParam(required = false) Long projectId) {
        return allocationService.listAll(projectId);
    }

    @GetMapping("/employees")
    public List<EmployeeRefDto> listAssignableEmployees() {
        return allocationService.listAssignableEmployees();
    }

    /** Assigns one employee to one project for a date range. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AllocationDto create(@Valid @RequestBody CreateAllocationRequest request) {
        return allocationService.create(request);
    }

    /** Edits an allocation's date range. Employee and project are fixed. */
    @PatchMapping("/{id}")
    public AllocationDto update(@PathVariable Long id,
                                @Valid @RequestBody UpdateAllocationRequest request) {
        return allocationService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        allocationService.delete(id);
    }
}
