package com.nforceone.sync.teamlead;

import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

/**
 * Thin injectable helper for capability-based authorization checks that other packages
 * (eod, search) need without pulling in the full TeamLeadService dependency graph.
 * All three methods delegate to the same repositories that TeamLeadService already uses.
 */
@Service
@Transactional(readOnly = true)
public class LeadAccessService {

    private final ProjectRepository    projectRepository;
    private final AllocationRepository allocationRepository;

    public LeadAccessService(ProjectRepository projectRepository,
                              AllocationRepository allocationRepository) {
        this.projectRepository    = projectRepository;
        this.allocationRepository = allocationRepository;
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
        return allocationRepository.findActiveMembersByProjectLead(actorId, LocalDate.now())
                .stream().anyMatch(u -> u.getId().equals(employeeId));
    }
}
