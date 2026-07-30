package com.nforceone.sync.project;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.project.dto.AllocationDto;
import com.nforceone.sync.project.dto.CreateAllocationRequest;
import com.nforceone.sync.project.dto.EmployeeRefDto;
import com.nforceone.sync.project.dto.UpdateAllocationRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

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

    /**
     * Allocations, restricted to people holding the EMPLOYEE role. Leads, managers and back-office
     * accounts are not project-assignable, so rows belonging to them are excluded rather than shown
     * alongside real employees. The employee is already JOIN FETCHed, so filtering here costs no
     * extra queries.
     */
    @Transactional(readOnly = true)
    public List<AllocationDto> listAll(Long projectId) {
        List<Allocation> allocations = projectId != null
                ? allocationRepository.findByProjectIdWithRefs(projectId)
                : allocationRepository.findAllWithRefsOrderByEffectiveFromDesc();
        return allocations.stream()
                .filter(a -> a.getEmployee().getRole() == AppUser.Role.EMPLOYEE)
                .map(AllocationDto::from)
                .toList();
    }

    /** Only EMPLOYEE-role users may be allocated to a project. */
    @Transactional(readOnly = true)
    public List<EmployeeRefDto> listAssignableEmployees() {
        return appUserRepository
                .findByRoleAndStatusAndDeletedAtIsNullOrderByFullNameAsc(
                        AppUser.Role.EMPLOYEE, AppUser.Status.ACTIVE)
                .stream()
                .map(EmployeeRefDto::from)
                .toList();
    }

    /** Assigns one employee to one project for a date range. */
    public AllocationDto create(CreateAllocationRequest req) {
        AppUser employee = appUserRepository.findById(req.employeeId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Employee not found"));
        Project project = projectRepository.findById(req.projectId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));

        requireDateOrder(req.effectiveFrom(), req.effectiveTo());

        Allocation allocation = new Allocation();
        allocation.setEmployee(employee);
        allocation.setProject(project);
        allocation.setEffectiveFrom(req.effectiveFrom());
        allocation.setEffectiveTo(req.effectiveTo());
        allocation.setCreatedAt(OffsetDateTime.now());

        return AllocationDto.from(allocationRepository.save(allocation));
    }

    /**
     * Edits an allocation's date range in place. The employee and project are never reassigned —
     * that would misattribute any EOD hours logged under the original pairing.
     */
    public AllocationDto update(Long id, UpdateAllocationRequest req) {
        Allocation allocation = allocationRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Allocation not found"));

        requireDateOrder(req.effectiveFrom(), req.effectiveTo());

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

    /** A null end date leaves the assignment open-ended; a present one may not precede the start. */
    private void requireDateOrder(LocalDate effectiveFrom, LocalDate effectiveTo) {
        if (effectiveTo != null && effectiveTo.isBefore(effectiveFrom)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Effective To cannot be earlier than Effective From");
        }
    }
}
