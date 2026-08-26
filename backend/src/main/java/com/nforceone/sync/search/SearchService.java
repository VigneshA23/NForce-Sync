package com.nforceone.sync.search;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.project.ProjectRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;

@Service
public class SearchService {

    private final AppUserRepository userRepository;
    private final ProjectRepository projectRepository;

    public SearchService(AppUserRepository userRepository, ProjectRepository projectRepository) {
        this.userRepository = userRepository;
        this.projectRepository = projectRepository;
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
            case SUPERADMIN, HR -> userRepository.findAll().stream()
                    .filter(u -> u.getDeletedAt() == null)
                    .filter(u -> matchesUser(u, term))
                    .limit(5)
                    .map(u -> new SearchResultDto.UserResult(
                            u.getId(), u.getFullName(), u.getEmail(),
                            u.getRole().name(), u.getEmployeeCode()))
                    .toList();
            case MANAGER -> userRepository.findByManagerId(actor.getId()).stream()
                    .filter(u -> u.getDeletedAt() == null)
                    .filter(u -> matchesUser(u, term))
                    .limit(5)
                    .map(u -> new SearchResultDto.UserResult(
                            u.getId(), u.getFullName(), u.getEmail(),
                            u.getRole().name(), u.getEmployeeCode()))
                    .toList();
            default -> List.of();
        };
    }

    private List<SearchResultDto.ProjectResult> searchProjects(String term, AppUser actor) {
        return switch (actor.getRole()) {
            case SUPERADMIN, DM, FINANCE, LEADERSHIP -> projectRepository.findAll().stream()
                    .filter(p -> matchesProject(p, term))
                    .limit(5)
                    .map(p -> new SearchResultDto.ProjectResult(
                            p.getId(), p.getCode(), p.getName(), p.getStatus().name()))
                    .toList();
            case PM -> projectRepository.findByProjectManagerIdOrderByNameAsc(actor.getId()).stream()
                    .filter(p -> matchesProject(p, term))
                    .limit(5)
                    .map(p -> new SearchResultDto.ProjectResult(
                            p.getId(), p.getCode(), p.getName(), p.getStatus().name()))
                    .toList();
            case MANAGER -> projectRepository.findByPmIdOrderByNameAsc(actor.getId()).stream()
                    .filter(p -> matchesProject(p, term))
                    .limit(5)
                    .map(p -> new SearchResultDto.ProjectResult(
                            p.getId(), p.getCode(), p.getName(), p.getStatus().name()))
                    .toList();
            case EMPLOYEE -> projectRepository.findAllocatedToEmployeeOnDate(actor.getId(), LocalDate.now(), com.nforceone.sync.project.Project.Status.ACTIVE).stream()
                    .filter(p -> matchesProject(p, term))
                    .limit(5)
                    .map(p -> new SearchResultDto.ProjectResult(
                            p.getId(), p.getCode(), p.getName(), p.getStatus().name()))
                    .toList();
            case HR -> List.of();
        };
    }

    private boolean matchesUser(AppUser u, String term) {
        if (term.isEmpty()) return false;
        String name = u.getFullName() == null ? "" : u.getFullName().toLowerCase();
        String email = u.getEmail() == null ? "" : u.getEmail().toLowerCase();
        String code = u.getEmployeeCode() == null ? "" : u.getEmployeeCode().toLowerCase();
        return name.contains(term) || email.contains(term) || code.contains(term);
    }

    private boolean matchesProject(com.nforceone.sync.project.Project p, String term) {
        if (term.isEmpty()) return false;
        String name = p.getName() == null ? "" : p.getName().toLowerCase();
        String code = p.getCode() == null ? "" : p.getCode().toLowerCase();
        return name.contains(term) || code.contains(term);
    }
}
