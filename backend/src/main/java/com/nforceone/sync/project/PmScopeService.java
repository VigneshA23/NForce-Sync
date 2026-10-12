package com.nforceone.sync.project;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodTask;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The single definition of "a Project Manager's scope" for the Projects sidebar section (Project
 * Dashboard, Projects Utilization, Blockers, EOD Inbox, Approvals, Reports), their badge counts and the
 * endpoint access checks — the PM counterpart of {@code LeadTeamPolicy}, so pages, badges and checks
 * cannot drift apart.
 *
 * <p><b>PM of project P</b> = {@code project.pm_id}. It is a per-project assignment, not a role: one user
 * can be PM on some projects, Team Lead ({@code project.lead_id}) on others and a reporting manager of
 * some people, and each sidebar section shows only its own set. A PM's <b>members</b> are the employees
 * actively allocated (effective-dated) to his projects, excluding the PM himself.
 *
 * <p>COMPLETED / ON_HOLD projects stay in scope (read-only history). SUPERADMIN sees every project.
 * The few repository queries that express the same rule in JPQL ({@code project.pm.id = :pmId}) are the
 * DB-level form of {@link #scopedProjects}; they must not be widened independently.
 *
 * <p>Access passes for PM role, SUPERADMIN, or any user who is pm of at least one ACTIVE project.
 */
@Service
public class PmScopeService {

    private final ProjectRepository projectRepository;
    private final AllocationRepository allocationRepository;

    public PmScopeService(ProjectRepository projectRepository, AllocationRepository allocationRepository) {
        this.projectRepository = projectRepository;
        this.allocationRepository = allocationRepository;
    }

    /**
     * Throws 403 unless the actor has PM role, SUPERADMIN role, or manages at least one ACTIVE
     * project (i.e. is the pm of an ACTIVE Project row).
     */
    public void requirePmScope(AppUser actor) {
        if (actor.getRole() == AppUser.Role.PM || actor.getRole() == AppUser.Role.SUPERADMIN) return;
        if (projectRepository.existsByPmIdAndStatus(actor.getId(), Project.Status.ACTIVE)) return;
        throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Access denied: you do not manage any active project");
    }

    /** Returns true when the actor passes the PM scope check (no throw). */
    public boolean isProjectManager(AppUser actor) {
        if (actor.getRole() == AppUser.Role.PM || actor.getRole() == AppUser.Role.SUPERADMIN) return true;
        return projectRepository.existsByPmIdAndStatus(actor.getId(), Project.Status.ACTIVE);
    }

    /**
     * Projects scoped to what the actor may manage.
     * SUPERADMIN → all projects.
     * Everyone else → projects where actor is the pm (all statuses: COMPLETED / ON_HOLD history stays visible).
     */
    public List<Project> scopedProjects(AppUser actor) {
        if (actor.getRole() == AppUser.Role.SUPERADMIN) {
            return projectRepository.findAllWithPmOrderByNameAsc();
        }
        return projectRepository.findByPmIdOrderByNameAsc(actor.getId());
    }

    /**
     * As {@link #scopedProjects(AppUser)}, but a SUPERADMIN may narrow to one PM's portfolio
     * ({@code pmId}). Ignored for everyone else, so a PM can never widen his own scope by passing an id.
     */
    public List<Project> scopedProjects(AppUser actor, Long pmIdOverride) {
        if (actor.getRole() == AppUser.Role.SUPERADMIN && pmIdOverride != null) {
            return projectRepository.findByPmIdOrderByNameAsc(pmIdOverride);
        }
        return scopedProjects(actor);
    }

    /** The projects this user is PM of (any status) — never widened for SUPERADMIN (unlike scopedProjects). */
    public List<Project> managedProjects(Long pmId) {
        return projectRepository.findByPmIdOrderByNameAsc(pmId);
    }

    /** Ids of the projects the actor is PM of (any status). */
    public Set<Long> managedProjectIds(Long pmId) {
        return projectRepository.findByPmIdOrderByNameAsc(pmId).stream()
                .map(Project::getId)
                .collect(Collectors.toSet());
    }

    /** The project, or 403 when it is not in the actor's scope (another PM's project, by id). */
    public Project requireProjectInScope(AppUser actor, Long projectId) {
        return scopedProjects(actor).stream()
                .filter(p -> p.getId().equals(projectId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Project is not in your portfolio"));
    }

    /** Whether the project is in the actor's scope (SUPERADMIN: always). */
    public boolean inScope(AppUser actor, Project project) {
        return actor.getRole() == AppUser.Role.SUPERADMIN || isPmOf(actor, project);
    }

    /**
     * Members: allocations on {@code projectIds} that overlap [from, to] (effective-dated), excluding the
     * actor himself — a PM never reviews his own items, and is not his own team.
     */
    public List<Allocation> memberAllocations(AppUser actor, Collection<Long> projectIds, LocalDate from, LocalDate to) {
        if (projectIds.isEmpty()) return List.of();
        return allocationRepository.findActiveInRangeForProjects(List.copyOf(projectIds), from, to).stream()
                .filter(a -> !a.getEmployee().getId().equals(actor.getId()))
                .toList();
    }

    /** True when the employee is a member of one of the actor's projects at any point in [from, to]. */
    public boolean isMember(AppUser actor, Long employeeId, LocalDate from, LocalDate to) {
        if (employeeId.equals(actor.getId())) return false;
        Set<Long> ids = managedProjectIds(actor.getId());
        return !ids.isEmpty() && allocationRepository.existsMemberOnProjects(employeeId, ids, from, to);
    }

    // ── per-record checks (static: repository-free, usable from other packages' policies) ─────────

    public static boolean isPmOf(AppUser actor, Project project) {
        return actor != null && project != null && project.getPm() != null
                && project.getPm().getId().equals(actor.getId());
    }

    /** True when the entry has a task on a project this user is PM of. */
    public static boolean entryTouchesManagedProject(AppUser actor, EodEntry entry) {
        return entry.getTasks().stream()
                .map(EodTask::getProject).filter(Objects::nonNull)
                .anyMatch(p -> isPmOf(actor, p));
    }

    /** May this user read someone else's entry as a PM? Not his own entry; it must touch one of his projects. */
    public static boolean canReadEntryAsPm(AppUser actor, EodEntry entry) {
        if (entry.getEmployee().getId().equals(actor.getId())) return false;
        return entryTouchesManagedProject(actor, entry);
    }
}
