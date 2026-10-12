package com.nforceone.sync.teamlead;

import com.nforceone.sync.approval2.EodProjectApproval;
import com.nforceone.sync.approval2.EodProjectApprovalRepository;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The single definition of "a Team Lead's team" for the Team Lead sidebar section (Team Dashboard,
 * Projects I Lead, Approvals, Team Utilization, Team Blockers, Team Inbox, Reports) — in the style
 * of EodAccessPolicy: one place to ask, so the pages, their badge counts and the endpoint access
 * checks cannot drift apart.
 *
 * <p><b>Team of lead X</b> = employees actively allocated (effective-dated) to a project whose
 * {@code project.lead_id} is X, excluding X himself. It is deliberately NOT the reporting-manager
 * relationship: that belongs to the "My Reporting Team" section and must not leak into this one.
 *
 * <p>Two related questions are answered here too, because the team alone is not enough to decide
 * what a lead may SEE of an item:
 * <ul>
 *   <li><b>Led projects</b> — the projects X leads. A lead sees the parts of an entry that belong to
 *       these, and only an aggregate for everything else.</li>
 *   <li><b>Entry access as a lead</b> — X may read another employee's entry when it has a task on one
 *       of his projects or a current-cycle piece he approves; being merely allocated to one of his
 *       projects is not enough to read a day that was spent elsewhere.</li>
 * </ul>
 */
@Service
@Transactional(readOnly = true)
public class LeadTeamPolicy {

    private final AllocationRepository allocationRepository;
    private final ProjectRepository projectRepository;
    private final EodProjectApprovalRepository pieceRepository;

    public LeadTeamPolicy(AllocationRepository allocationRepository,
                          ProjectRepository projectRepository,
                          EodProjectApprovalRepository pieceRepository) {
        this.allocationRepository = allocationRepository;
        this.projectRepository = projectRepository;
        this.pieceRepository = pieceRepository;
    }

    /** Active members as of today. */
    public List<AppUser> teamMembers(Long leadId) {
        return teamMembers(leadId, LocalDate.now());
    }

    /** Active members as of {@code asOf} (Team Utilization asks for a specific date). */
    public List<AppUser> teamMembers(Long leadId, LocalDate asOf) {
        return allocationRepository.findActiveMembersByProjectLead(leadId, asOf);
    }

    public boolean isInTeam(Long employeeId, Long leadId) {
        return teamMembers(leadId).stream().anyMatch(u -> u.getId().equals(employeeId));
    }

    /** Ids of the projects this user leads. */
    public Set<Long> ledProjectIds(Long leadId) {
        return projectRepository.findByLeadIdOrderByNameAsc(leadId).stream()
                .map(Project::getId)
                .collect(Collectors.toSet());
    }

    public boolean leadsProject(Long leadId, Project project) {
        return project != null && project.getLead() != null && project.getLead().getId().equals(leadId);
    }

    /** True when the entry has at least one task on a project this user leads. */
    public boolean entryTouchesLedProject(EodEntry entry, Set<Long> ledProjectIds) {
        return entry.getTasks().stream()
                .map(EodTask::getProject).filter(Objects::nonNull)
                .anyMatch(p -> ledProjectIds.contains(p.getId()));
    }

    /** True when the user is the approver of a current-cycle (non-superseded) piece on the entry. */
    public boolean holdsPieceOn(Long leadId, EodEntry entry) {
        List<EodProjectApproval> pieces = pieceRepository.findByEodEntryId(entry.getId());
        return pieces.stream().anyMatch(p -> p.getApprover() != null && p.getApprover().getId().equals(leadId));
    }

    /**
     * May this user read someone else's entry in his capacity as a lead? Yes when it has a task on one
     * of his projects or a piece he approves. Never his own entry (that is the employee-side view).
     */
    public boolean canReadEntryAsLead(Long leadId, EodEntry entry) {
        if (entry.getEmployee().getId().equals(leadId)) return false;
        return entryTouchesLedProject(entry, ledProjectIds(leadId)) || holdsPieceOn(leadId, entry);
    }
}
