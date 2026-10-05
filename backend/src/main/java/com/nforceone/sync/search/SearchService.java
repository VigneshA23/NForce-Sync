package com.nforceone.sync.search;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.teamlead.LeadAccessService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Service
public class SearchService {

    private final AppUserRepository    userRepository;
    private final ProjectRepository    projectRepository;
    private final AllocationRepository allocationRepository;
    private final LeadAccessService    leadAccess;

    public SearchService(AppUserRepository userRepository,
                         ProjectRepository projectRepository,
                         AllocationRepository allocationRepository,
                         LeadAccessService leadAccess) {
        this.userRepository    = userRepository;
        this.projectRepository = projectRepository;
        this.allocationRepository = allocationRepository;
        this.leadAccess        = leadAccess;
    }

    @Transactional(readOnly = true)
    public SearchResultDto search(String q, String actorEmail) {
        AppUser actor = userRepository.findByEmailAndDeletedAtIsNull(actorEmail)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));

        String term = (q == null ? "" : q.trim().toLowerCase());

        List<SearchResultDto.UserResult> users = searchUsers(term, actor);
        List<SearchResultDto.ProjectResult> projects = searchProjects(term, actor);

        return new SearchResultDto(users, projects);
    }

    private List<SearchResultDto.UserResult> searchUsers(String term, AppUser actor) {
        return switch (actor.getRole()) {
            // Not SUPERADMIN: user search backs a result that deep-links to /admin/users, which
            // is now Admin-only — a Super Admin match here would be a dead-end 403.
            case ADMIN -> userRepository.findAll().stream()
                    .filter(u -> u.getDeletedAt() == null)
                    .filter(u -> matchesUser(u, term))
                    .limit(5)
                    .map(u -> new SearchResultDto.UserResult(
                            u.getId(), u.getFullName(), u.getEmail(),
                            u.getRole().name(), u.getEmployeeCode()))
                    .toList();
            case EMPLOYEE -> {
                if (leadAccess.leadsAnyProject(actor.getId())) {
                    yield allocationRepository.findActiveMembersByProjectLead(actor.getId(), LocalDate.now())
                            .stream()
                            .filter(u -> u.getDeletedAt() == null && matchesUser(u, term))
                            .limit(5)
                            .map(u -> new SearchResultDto.UserResult(
                                    u.getId(), u.getFullName(), u.getEmail(),
                                    u.getRole().name(), u.getEmployeeCode()))
                            .toList();
                }
                yield List.of();
            }
            default -> List.of();
        };
    }

    private List<SearchResultDto.ProjectResult> searchProjects(String term, AppUser actor) {
        return switch (actor.getRole()) {
            case SUPERADMIN, ADMIN -> projectRepository.findAll().stream()
                    .filter(p -> matchesProject(p, term))
                    .limit(5)
                    .map(p -> new SearchResultDto.ProjectResult(
                            p.getId(), p.getCode(), p.getName(), p.getStatus().name()))
                    .toList();
            case PM -> projectRepository.findByPmIdOrderByNameAsc(actor.getId()).stream()
                    .filter(p -> matchesProject(p, term))
                    .limit(5)
                    .map(p -> new SearchResultDto.ProjectResult(
                            p.getId(), p.getCode(), p.getName(), p.getStatus().name()))
                    .toList();
            case EMPLOYEE -> {
                // Allocated projects (baseline for all employees).
                List<Project> results = new ArrayList<>(
                        projectRepository.findAllocatedToEmployeeOnDate(
                                actor.getId(), LocalDate.now(), Project.Status.ACTIVE));
                // Additional: projects this employee leads, merged without duplicates.
                if (leadAccess.leadsAnyProject(actor.getId())) {
                    for (Project led : projectRepository.findByLeadIdOrderByNameAsc(actor.getId())) {
                        if (results.stream().noneMatch(r -> r.getId().equals(led.getId()))) {
                            results.add(led);
                        }
                    }
                }
                yield results.stream()
                        .filter(p -> matchesProject(p, term))
                        .limit(5)
                        .map(p -> new SearchResultDto.ProjectResult(
                                p.getId(), p.getCode(), p.getName(), p.getStatus().name()))
                        .toList();
            }
        };
    }

    private boolean matchesUser(AppUser u, String term) {
        if (term.isEmpty()) return false;
        String name = u.getFullName() == null ? "" : u.getFullName().toLowerCase();
        String email = u.getEmail() == null ? "" : u.getEmail().toLowerCase();
        String code = u.getEmployeeCode() == null ? "" : u.getEmployeeCode().toLowerCase();
        return name.contains(term) || email.contains(term) || code.contains(term);
    }

    private boolean matchesProject(Project p, String term) {
        if (term.isEmpty()) return false;
        String name = p.getName() == null ? "" : p.getName().toLowerCase();
        String code = p.getCode() == null ? "" : p.getCode().toLowerCase();
        return name.contains(term) || code.contains(term);
    }
}
