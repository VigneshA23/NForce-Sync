package com.nforceone.sync.project;

import com.nforceone.sync.auth.AppUser;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Shared gate check and project-scoping for all PM-facing endpoints.
 * Access passes for PM role, SUPERADMIN, or any user who is pm_id of at least one ACTIVE project.
 */
@Service
public class PmScopeService {

    private final ProjectRepository projectRepository;

    public PmScopeService(ProjectRepository projectRepository) {
        this.projectRepository = projectRepository;
    }

    /**
     * Throws 403 unless the actor has PM role, SUPERADMIN role, or manages at least one ACTIVE
     * project (i.e. is the pm_id of an ACTIVE Project row).
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
     * Everyone else → projects where actor is the pm_id (all statuses, for backward compat with
     * PM role seeing COMPLETED projects they managed).
     */
    public List<Project> scopedProjects(AppUser actor) {
        if (actor.getRole() == AppUser.Role.SUPERADMIN) {
            return projectRepository.findAllWithPmOrderByNameAsc();
        }
        return projectRepository.findByPmIdOrderByNameAsc(actor.getId());
    }
}
