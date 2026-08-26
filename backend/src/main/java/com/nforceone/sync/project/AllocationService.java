package com.nforceone.sync.project;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.project.dto.AllocationDto;
import com.nforceone.sync.project.dto.CreateAllocationRequest;
import com.nforceone.sync.project.dto.EmployeeRefDto;
import com.nforceone.sync.project.dto.UpdateAllocationRequest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
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

    @PersistenceContext
    private EntityManager entityManager;

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

        requireAllocatableToEmployee(employee, project);
        requirePctValid(req.allocationPct());
        requireDateOrder(req.effectiveFrom(), req.effectiveTo());
        // Serializes create/update for this employee for the rest of the transaction, so two
        // concurrent requests can never both read the same "current total" and both pass the
        // capacity check below — see requireWithinCapacity's javadoc.
        lockEmployeeAllocations(employee.getId());
        requireNoOverlap(employee, project, req.effectiveFrom(), req.effectiveTo(), NOTHING_TO_EXCLUDE);
        requireWithinCapacity(employee, req.effectiveFrom(), req.effectiveTo(),
                req.allocationPct(), NOTHING_TO_EXCLUDE);

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

        requirePctValid(req.allocationPct());
        requireDateOrder(req.effectiveFrom(), req.effectiveTo());
        lockEmployeeAllocations(allocation.getEmployee().getId());
        // Excludes itself, so re-sending a row's own dates is not a conflict with itself. The
        // employee and project come from the row because this endpoint never reassigns them.
        requireNoOverlap(allocation.getEmployee(), allocation.getProject(),
                req.effectiveFrom(), req.effectiveTo(), allocation.getId());
        requireWithinCapacity(allocation.getEmployee(), req.effectiveFrom(), req.effectiveTo(),
                req.allocationPct(), allocation.getId());

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
     * A project may only be staffed with an employee when it is ACTIVE and its Team Lead is that
     * employee's own reporting manager.
     *
     * <p>The Team Lead half is what keeps Approvals answerable. An employee's EOD project list is
     * built from their allocation rows, so allocating across teams lets them log tasks against a
     * project their own Team Lead does not lead — that Lead then gets the entry in their queue with
     * no way to judge whether the work was billable, and cannot honestly approve or reject it.
     *
     * <p>The ACTIVE half was previously only enforced by the form, which left a direct API call
     * free to staff someone onto completed or on-hold work they could never book against.
     *
     * <p>Create-only. {@link #update} never reassigns the employee or project, so there is nothing
     * to re-check there, and applying this to edits would retroactively freeze allocations made
     * before the rule existed.
     */
    private void requireAllocatableToEmployee(AppUser employee, Project project) {
        if (project.getStatus() != Project.Status.ACTIVE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    project.getCode() + " is " + project.getStatus()
                            + " — only ACTIVE projects can be allocated.");
        }

        AppUser manager = employee.getManager();
        if (manager == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    employee.getFullName() + " has no reporting manager, so no project can be "
                            + "allocated. Set their manager first.");
        }

        AppUser teamLead = project.getPm();
        if (teamLead == null || !teamLead.getId().equals(manager.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    project.getCode() + " is not led by this employee's reporting manager ("
                            + manager.getFullName() + ").");
        }
    }

    /**
     * Capacity share must be a whole multiple of 10 between 10 and 100. Enforced here rather than
     * with {@code @Min}/{@code @Max} on the request records so every rejection — bounds or
     * multiple-of-10 alike — reads as the same one message, and so the same rule applies
     * identically to a direct API call as to the form (bean validation alone cannot express
     * "multiple of 10" without a custom constraint annotation this codebase doesn't otherwise need).
     */
    private void requirePctValid(Integer allocationPct) {
        if (allocationPct == null || allocationPct < 10 || allocationPct > 100 || allocationPct % 10 != 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Allocation must be between 10% and 100% and must be a multiple of 10.");
        }
    }

    /**
     * Serializes every create/update for one employee for the remainder of this transaction, via a
     * Postgres transaction-scoped advisory lock (auto-released on commit/rollback — never leaked).
     *
     * <p>{@link #requireWithinCapacity} is a read-then-decide check: without this lock, two
     * concurrent requests for the same employee (e.g. two different PMs, or one submitted twice)
     * could each read the same pre-update total, each individually pass, and together push the
     * employee over 100% — the DB has no row to lock yet for a brand-new allocation, and no CHECK
     * constraint can express "the SUM of these rows" across rows. Locking on the employee id closes
     * that window for both create (nothing to lock via the row itself) and update alike.
     */
    private void lockEmployeeAllocations(Long employeeId) {
        entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(:id)")
                .setParameter("id", employeeId)
                .getSingleResult();
    }

    /**
     * An employee's allocation percentages, summed across every allocation (any project) whose
     * window overlaps the one being created/edited, must never exceed 100 once the new/edited share
     * is added. Only allocations that actually overlap the requested window count toward this — a
     * since-ended or not-yet-started allocation on some other project does not compete for the same
     * capacity, matching the same date-overlap idiom {@link #requireNoOverlap} already uses.
     *
     * <p>On edit, {@code excludeId} drops the row being edited from "existing" — it is being
     * replaced by {@code newPct}, not stacked on top of itself.
     */
    private void requireWithinCapacity(AppUser employee, LocalDate effectiveFrom, LocalDate effectiveTo,
                                       int newPct, Long excludeId) {
        List<Allocation> overlapping = allocationRepository.findOverlappingForEmployee(
                employee.getId(), effectiveFrom,
                effectiveTo != null ? effectiveTo : Allocation.OPEN_ENDED,
                Allocation.OPEN_ENDED, excludeId);
        int existingTotal = overlapping.stream().mapToInt(Allocation::getAllocationPct).sum();
        int total = existingTotal + newPct;
        if (total > 100) {
            int available = Math.max(0, 100 - existingTotal);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Cannot allocate %d%%. %s already has %d%% allocated for this period — only %d%% is available."
                            .formatted(newPct, employee.getFullName(), existingTotal, available));
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
