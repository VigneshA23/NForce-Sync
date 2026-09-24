package com.nforceone.sync.ai.data;

import com.nforceone.sync.ai.contract.AssistantRequestContext;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.employee.EmployeeProjectService;
import com.nforceone.sync.project.dto.ProjectFullDto;
import com.nforceone.sync.teamlead.TeamLeadProjectService;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

final class ProjectDataProviders {

    private ProjectDataProviders() {
    }

    @Component
    static class ProjectsMineProvider implements AssistantDataProvider {
        private final EmployeeProjectService employeeProjectService;

        ProjectsMineProvider(EmployeeProjectService employeeProjectService) {
            this.employeeProjectService = employeeProjectService;
        }

        @Override public String id() { return "projects.mine"; }
        @Override public String title() { return "My current projects"; }
        @Override public Set<AppUser.Role> audiences() { return Set.of(AppUser.Role.EMPLOYEE); }
        @Override public Set<String> modules() { return Set.of("projects"); }

        @Override
        public Optional<String> fetch(AssistantRequestContext context) {
            List<ProjectFullDto> projects = employeeProjectService.listMyProjects(context.email(), LocalDate.now());
            if (projects.isEmpty()) {
                return Optional.of("Not currently allocated to any project.");
            }
            String names = projects.stream().limit(5).map(ProjectFullDto::name).collect(Collectors.joining(", "));
            return Optional.of("Currently allocated to " + projects.size() + " project(s): " + names + ".");
        }
    }

    @Component
    static class ProjectsLeadProvider implements AssistantDataProvider {
        private final TeamLeadProjectService teamLeadProjectService;

        ProjectsLeadProvider(TeamLeadProjectService teamLeadProjectService) {
            this.teamLeadProjectService = teamLeadProjectService;
        }

        @Override public String id() { return "projects.lead"; }
        @Override public String title() { return "Projects I lead"; }
        @Override public Set<AppUser.Role> audiences() { return Set.of(AppUser.Role.MANAGER); }
        @Override public Set<String> modules() { return Set.of("projects"); }

        @Override
        public Optional<String> fetch(AssistantRequestContext context) {
            // teamLeadId=null — only a Super Admin may pass an override; a Team Lead is always
            // scoped to themself regardless, but this provider never even offers the option.
            List<ProjectFullDto> projects = teamLeadProjectService.listMyProjects(context.email(), LocalDate.now(), null);
            if (projects.isEmpty()) {
                return Optional.of("Not currently leading any project.");
            }
            String names = projects.stream().limit(5).map(ProjectFullDto::name).collect(Collectors.joining(", "));
            return Optional.of("Leading " + projects.size() + " project(s): " + names + ".");
        }
    }
}
