package com.nforceone.sync.teamlead;

import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;


/**
 * Thin injectable helper for capability-based authorization checks that other packages
 * (eod, search) need without pulling in the full TeamLeadService dependency graph.
 * All three methods delegate to the same repositories that TeamLeadService already uses.
 */
@Service
@Transactional(readOnly = true)
public class LeadAccessService {

    private final ProjectRepository    projectRepository;
    private final LeadTeamPolicy       leadTeamPolicy;

    public LeadAccessService(ProjectRepository projectRepository,
                              LeadTeamPolicy leadTeamPolicy) {
        this.projectRepository = projectRepository;
        this.leadTeamPolicy    = leadTeamPolicy;
    }

    /** True when the actor is the assigned lead on at least one active project. */
    public boolean leadsAnyProject(Long actorId) {
        return projectRepository.existsByLeadIdAndStatus(actorId, Project.Status.ACTIVE);
    }

    /** True when the actor is the assigned lead on this specific project. */
    public boolean leadsThisProject(Long actorId, Long projectId) {
        return projectRepository.findByLeadIdOrderByNameAsc(actorId)
                .stream().anyMatch(p -> p.getId().equals(projectId));
    }

    /**
     * True when employeeId is currently allocated to any project led by actorId.
     * Allocation-based: same definition as TeamLeadService.activeMembers / isInLeadTeam.
     */
    public boolean isInLeadTeam(Long employeeId, Long actorId) {
        return leadTeamPolicy.isInTeam(employeeId, actorId);
    }

    /** See LeadTeamPolicy#canReadEntryAsLead — a task on one of his projects or a piece he approves. */
    public boolean canReadEntryAsLead(Long actorId, com.nforceone.sync.eod.EodEntry entry) {
        return leadTeamPolicy.canReadEntryAsLead(actorId, entry);
    }

    /** Ids of the projects the actor leads. */
    public java.util.Set<Long> ledProjectIds(Long actorId) {
        return leadTeamPolicy.ledProjectIds(actorId);
    }
}
