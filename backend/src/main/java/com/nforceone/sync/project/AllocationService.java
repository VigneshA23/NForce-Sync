package com.nforceone.sync.project;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.project.dto.AllocationDto;
import com.nforceone.sync.project.dto.CreateAssignmentRequest;
import com.nforceone.sync.project.dto.EmployeeRefDto;
import com.nforceone.sync.project.dto.UpdateAllocationRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Transactional
public class AllocationService {

    private final AllocationRepository allocationRepository;
    private final ProjectRepository projectRepository;
    private final AppUserRepository appUserRepository;

    public AllocationService(AllocationRepository allocationRepository,
                             ProjectRepository projectRepository,
                             AppUserRepository appUserRepository) {
        this.allocationRepository = allocationRepository;
        this.projectRepository = projectRepository;
        this.appUserRepository = appUserRepository;
    }

    @Transactional(readOnly = true)
    public List<AllocationDto> listAll(Long projectId) {
        List<Allocation> allocations = projectId != null
                ? allocationRepository.findByProjectIdWithRefs(projectId)
                : allocationRepository.findAllWithRefsOrderByEffectiveFromDesc();
        return allocations.stream().map(AllocationDto::from).toList();
    }

    @Transactional(readOnly = true)
    public List<EmployeeRefDto> listAssignableEmployees() {
        LocalDate today = LocalDate.now();
        Map<Long, Integer> loadByEmployee = new HashMap<>();
        for (Object[] row : allocationRepository.sumActiveByEmployee(today)) {
            loadByEmployee.put((Long) row[0], ((Number) row[1]).intValue());
        }
        return appUserRepository.findByStatusAndDeletedAtIsNullOrderByFullNameAsc(AppUser.Status.ACTIVE)
                .stream()
                .map(u -> EmployeeRefDto.from(u, loadByEmployee.getOrDefault(u.getId(), 0)))
                .toList();
    }

    /**
     * Creates an employee's allocation across a required primary project and an optional
     * secondary one, both sharing the same effective date range.
     *
     * <p>Runs inside the class-level transaction, so the two rows commit or fail together —
     * previously the caller had to POST twice, which could leave the primary saved and the
     * secondary rejected. The 100% ceiling is checked against the *combined* request plus
     * whatever the employee already holds, rather than one allocation at a time.
     */
    public List<AllocationDto> createAssignment(CreateAssignmentRequest req) {
        AppUser employee = appUserRepository.findById(req.employeeId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Employee not found"));
        Project primaryProject = projectRepository.findById(req.primaryProjectId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Primary project not found"));

        boolean hasSecondaryProject = req.secondaryProjectId() != null;
        boolean hasSecondaryPct     = req.secondaryPct() != null;
        if (hasSecondaryProject != hasSecondaryPct) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Secondary project and its allocation % must be provided together");
        }

        Project secondaryProject = null;
        if (hasSecondaryProject) {
            if (req.secondaryProjectId().equals(req.primaryProjectId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Primary and secondary project must be different");
            }
            secondaryProject = projectRepository.findById(req.secondaryProjectId())
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.NOT_FOUND, "Secondary project not found"));
        }

        if (req.effectiveTo() != null && req.effectiveTo().isBefore(req.effectiveFrom())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Effective To cannot be earlier than Effective From");
        }

        LocalDate today = LocalDate.now();
        int existingPct  = allocationRepository.sumActiveAllocationPct(req.employeeId(), today);
        int requestedPct = req.primaryPct() + (hasSecondaryPct ? req.secondaryPct() : 0);
        if (existingPct + requestedPct > 100) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    employee.getFullName() + " is already allocated " + existingPct
                            + "% — adding " + requestedPct + "% would reach "
                            + (existingPct + requestedPct) + "%, over the 100% limit");
        }

        List<Allocation> toSave = new ArrayList<>();
        toSave.add(buildAllocation(employee, primaryProject, req.primaryPct(),
                Allocation.AllocationType.PRIMARY, req));
        if (secondaryProject != null) {
            toSave.add(buildAllocation(employee, secondaryProject, req.secondaryPct(),
                    Allocation.AllocationType.SECONDARY, req));
        }

        return allocationRepository.saveAll(toSave).stream().map(AllocationDto::from).toList();
    }

    private Allocation buildAllocation(AppUser employee, Project project, int pct,
                                       Allocation.AllocationType type,
                                       CreateAssignmentRequest req) {
        Allocation allocation = new Allocation();
        allocation.setEmployee(employee);
        allocation.setProject(project);
        allocation.setAllocationPct(pct);
        allocation.setAllocationType(type);
        allocation.setEffectiveFrom(req.effectiveFrom());
        allocation.setEffectiveTo(req.effectiveTo());
        allocation.setCreatedAt(OffsetDateTime.now());
        return allocation;
    }

    /**
     * Edits one allocation in place — percentage, primary/secondary, and date range. The
     * employee and project are never reassigned.
     *
     * <p>The 100% ceiling is measured against the employee's <em>other</em> active allocations,
     * so re-saving a row at its current percentage is not treated as a double-booking.
     */
    public AllocationDto update(Long id, UpdateAllocationRequest req) {
        Allocation allocation = allocationRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Allocation not found"));

        Allocation.AllocationType type;
        try {
            type = Allocation.AllocationType.valueOf(req.allocationType());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Invalid allocation type: " + req.allocationType());
        }

        if (req.effectiveTo() != null && req.effectiveTo().isBefore(req.effectiveFrom())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Effective To cannot be earlier than Effective From");
        }

        AppUser employee = allocation.getEmployee();
        int otherPct = allocationRepository.sumActiveAllocationPctExcluding(
                employee.getId(), LocalDate.now(), id);
        if (otherPct + req.allocationPct() > 100) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    employee.getFullName() + " is allocated " + otherPct
                            + "% on other projects — setting this to " + req.allocationPct()
                            + "% would reach " + (otherPct + req.allocationPct())
                            + "%, over the 100% limit");
        }

        allocation.setAllocationPct(req.allocationPct());
        allocation.setAllocationType(type);
        allocation.setEffectiveFrom(req.effectiveFrom());
        allocation.setEffectiveTo(req.effectiveTo());

        return AllocationDto.from(allocationRepository.save(allocation));
    }

    public void delete(Long id) {
        if (!allocationRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Allocation not found");
        }
        allocationRepository.deleteById(id);
    }
}
