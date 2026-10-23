package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.project.TaskCategory;
import com.nforceone.sync.reporting.ReportingScopeService;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * Single answer to "is this employee on the bench on this date?", and the category scope that follows.
 *
 * <p><b>Rules</b>
 * <ul>
 *   <li>Only the EMPLOYEE role can be on the bench. Admins, PMs, Reporting Managers and Leads always use the
 *       existing Daily Log categories (scope MANAGEMENT) — their form choice is unchanged.</li>
 *   <li>An EMPLOYEE who is a Reporting Manager (has active direct reports) or leads an ACTIVE project is never
 *       on the bench — they keep today's behaviour and the Daily Log (MANAGEMENT) categories.
 *       <b>Known v1 limitation:</b> unlike the allocation test, these two checks are CURRENT-STATE, not
 *       effective-dated — "has direct reports" and "leads an active project" are read as of the moment the
 *       draft is created, not as of the entry date, and the result is frozen into {@code bench_mode} at that
 *       moment. A backfilled date from before someone became an RM or lead is therefore judged as if they
 *       already were one.</li>
 *   <li>Any other EMPLOYEE is on the bench on a date when no allocation covers that date on an ACTIVE project.
 *       Allocations are effective-dated: {@code effective_from <= date} and ({@code effective_to} is null or
 *       {@code >= date}), both ends inclusive. So an expired allocation, or one that starts in the future,
 *       means bench on that date.</li>
 *   <li>Project status: only {@code Project.Status.ACTIVE} counts. An allocation to an INACTIVE, COMPLETED
 *       or ON_HOLD project is treated as no allocation. (ON_HOLD counting as bench is a product choice —
 *       change it here, in {@link AllocationRepository#existsActiveProjectAllocationOn}.)</li>
 * </ul>
 *
 * <p><b>Entry date, not "now"</b> — bench status is evaluated against the ENTRY DATE, so a backfilled or past
 * date is judged by the allocation that was active on that date. An employee allocated mid-week is bench for
 * the days before {@code effective_from} and on a project from it.
 *
 * <p><b>Frozen at draft creation</b> — the result is stored once on {@link EodEntry#getBenchMode()} (like
 * {@code entry_form}) and never recomputed. If an allocation changes, or is backdated, while a draft is open,
 * that draft keeps its original mode and is validated and submitted as that mode. Existing bench entries stay
 * PLAIN_LOG after the employee is allocated.
 *
 * <p>Known v1 limitation: the form the UI shows is chosen once from <i>today's</i> allocation
 * ({@code capabilities.eodForm}); the server enforces by entry date. Backfilling a date whose mode differs from
 * today's is rejected with a message pointing at the other form.
 */
@Component
public class BenchModePolicy {

    public static final String SCOPE_BENCH = "BENCH";
    public static final String SCOPE_DAILY_LOG = "MANAGEMENT";

    private final AllocationRepository allocationRepository;
    private final ReportingScopeService reportingScope;
    private final ProjectRepository projectRepository;

    BenchModePolicy(AllocationRepository allocationRepository,
                    ReportingScopeService reportingScope,
                    ProjectRepository projectRepository) {
        this.allocationRepository = allocationRepository;
        this.reportingScope = reportingScope;
        this.projectRepository = projectRepository;
    }

    /**
     * True when {@code employee} is an EMPLOYEE with no active-project allocation on {@code date}, who is
     * neither a Reporting Manager nor an active project lead. Never true for non-EMPLOYEE roles.
     */
    public boolean isBenchMode(AppUser employee, LocalDate date) {
        if (employee.getRole() != AppUser.Role.EMPLOYEE) return false;
        if (allocationRepository.existsActiveProjectAllocationOn(employee.getId(), date)) return false;
        if (reportingScope.hasDirectReports(employee.getId())) return false;
        return !projectRepository.existsByLeadIdAndStatus(employee.getId(), Project.Status.ACTIVE);
    }

    /** The category scope a Daily Log line must use: BENCH for a bench-mode entry, MANAGEMENT for everyone else. */
    public static String requiredScope(boolean benchMode) {
        return benchMode ? SCOPE_BENCH : SCOPE_DAILY_LOG;
    }

    /**
     * Null when {@code category} is valid for an entry in the given mode, else a user-readable reason.
     * Does not check {@code active} — callers decide whether that applies (saves yes; submit judges scope only).
     */
    public static String scopeMismatch(TaskCategory category, boolean benchMode) {
        String required = requiredScope(benchMode);
        if (required.equals(category.getScope())) return null;
        return benchMode
                ? "Category \"" + category.getName() + "\" is not a Bench Log category. "
                  + "While you are not allocated to a project, use the Bench Log categories."
                : "Category \"" + category.getName() + "\" is not a Daily Log category"
                  + (SCOPE_BENCH.equals(category.getScope()) ? " (Bench Log categories are only for employees on the bench)." : ".");
    }
}
