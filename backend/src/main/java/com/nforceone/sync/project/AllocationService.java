package com.nforceone.sync.project;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.project.dto.AllocationDto;
import com.nforceone.sync.project.dto.CreateAllocationRequest;
import com.nforceone.sync.project.dto.EmployeeRefDto;
import com.nforceone.sync.project.dto.UpdateAllocationRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@Transactional
public class AllocationService {

    /** UI convention throughout the app, so a message quotes dates the way the PM sees them. */
    private static final DateTimeFormatter DMY = DateTimeFormatter.ofPattern("dd-MM-yyyy");

    /** No row to exclude from the overlap check — a create has no id of its own yet. */
    private static final long NOTHING_TO_EXCLUDE = -1L;

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
        requireNoOverlap(employee, project, req.effectiveFrom(), req.effectiveTo(), NOTHING_TO_EXCLUDE);

        Allocation allocation = new Allocation();
        allocation.setEmployee(employee);
        allocation.setProject(project);
        allocation.setEffectiveFrom(req.effectiveFrom());
        allocation.setEffectiveTo(req.effectiveTo());
        allocation.setAllocationPct(req.allocationPct());
        allocation.setCreatedAt(OffsetDateTime.now());

        return AllocationDto.from(saveGuarded(allocation));
    }

    /**
     * Edits an allocation's date range in place. The employee and project are never reassigned —
     * that would misattribute any EOD hours logged under the original pairing.
     */
    public AllocationDto update(Long id, UpdateAllocationRequest req) {
        Allocation allocation = allocationRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Allocation not found"));

        requireDateOrder(req.effectiveFrom(), req.effectiveTo());
        // Excludes itself, so re-sending a row's own dates is not a conflict with itself. The
        // employee and project come from the row because this endpoint never reassigns them.
        requireNoOverlap(allocation.getEmployee(), allocation.getProject(),
                req.effectiveFrom(), req.effectiveTo(), allocation.getId());

        allocation.setEffectiveFrom(req.effectiveFrom());
        allocation.setEffectiveTo(req.effectiveTo());
        allocation.setAllocationPct(req.allocationPct());

        return AllocationDto.from(saveGuarded(allocation));
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

    /**
     * One employee may not hold two allocations to the same project over overlapping dates.
     * Non-overlapping re-assignment stays legal — leaving a project and rejoining later is two
     * rows, which is how that history should read.
     *
     * <p>The clashing row is fetched rather than merely counted so the message can quote the window
     * the PM has to work around; "already assigned" alone leaves them guessing which dates to pick.
     */
    private void requireNoOverlap(AppUser employee, Project project,
                                  LocalDate effectiveFrom, LocalDate effectiveTo, Long excludeId) {
        List<Allocation> clashes = allocationRepository.findOverlapping(
                employee.getId(), project.getId(),
                effectiveFrom, effectiveTo != null ? effectiveTo : Allocation.OPEN_ENDED,
                Allocation.OPEN_ENDED, excludeId);
        if (clashes.isEmpty()) {
            return;
        }

        Allocation clash = clashes.get(0);
        String window = clash.getEffectiveTo() != null
                ? "from %s to %s".formatted(DMY.format(clash.getEffectiveFrom()),
                                            DMY.format(clash.getEffectiveTo()))
                : "from %s onwards (no end date)".formatted(DMY.format(clash.getEffectiveFrom()));

        throw new ResponseStatusException(HttpStatus.CONFLICT,
                "%s is already allocated to %s %s. Choose dates outside that window."
                        .formatted(employee.getFullName(), project.getCode(), window));
    }

    /**
     * {@code saveAndFlush}, not {@code save}: the insert must hit the database inside this method so
     * the {@code allocation_no_overlap} constraint (V54) is caught here. Two concurrent requests can
     * both clear {@link #requireNoOverlap}; without this the loser would surface as a raw 500.
     */
    private Allocation saveGuarded(Allocation allocation) {
        try {
            return allocationRepository.saveAndFlush(allocation);
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This employee was just allocated to that project by someone else — "
                            + "reload and try again");
        }
    }
}
