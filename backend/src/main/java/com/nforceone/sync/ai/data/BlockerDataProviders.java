package com.nforceone.sync.ai.data;

import com.nforceone.sync.ai.contract.AssistantRequestContext;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.employee.EmployeeService;
import com.nforceone.sync.employee.dto.DashboardSummaryDto;
import com.nforceone.sync.pmblockers.PmBlockersService;
import com.nforceone.sync.pmblockers.dto.PmBlockerDto;
import com.nforceone.sync.teamlead.TeamLeadService;
import com.nforceone.sync.teamlead.dto.TeamBlockerDto;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Manager/PM-facing blocker providers return counts only, never other employees' names or
 * blocker text (I8 — OneHR's equivalent sent report names and free text to the model).
 */
final class BlockerDataProviders {

    private BlockerDataProviders() {
    }

    @Component
    static class BlockersMineProvider implements AssistantDataProvider {
        private final EmployeeService employeeService;

        BlockersMineProvider(EmployeeService employeeService) {
            this.employeeService = employeeService;
        }

        @Override public String id() { return "blockers.mine"; }
        @Override public String title() { return "My open blockers"; }
        @Override public Set<AppUser.Role> audiences() { return Set.of(AppUser.Role.EMPLOYEE); }
        @Override public Set<String> modules() { return Set.of("blockers"); }

        @Override
        public Optional<String> fetch(AssistantRequestContext context) {
            LocalDate to = LocalDate.now();
            LocalDate from = to.minusDays(30);
            List<DashboardSummaryDto.BlockedTask> blockers = employeeService.getBlockers(context.userId(), from, to);
            long open = blockers.stream().filter(b -> !"RESOLVED".equals(b.status())).count();
            if (open == 0) {
                return Optional.empty();
            }
            return Optional.of(open + " open blocker(s) in the last 30 days (not yet resolved).");
        }
    }

    @Component
    static class BlockersTeamProvider implements AssistantDataProvider {
        private final TeamLeadService teamLeadService;

        BlockersTeamProvider(TeamLeadService teamLeadService) {
            this.teamLeadService = teamLeadService;
        }

        @Override public String id() { return "blockers.team"; }
        @Override public String title() { return "Open blockers on my team"; }
        @Override public Set<AppUser.Role> audiences() { return Set.of(AppUser.Role.MANAGER); }
        @Override public Set<String> modules() { return Set.of("blockers"); }

        @Override
        public Optional<String> fetch(AssistantRequestContext context) {
            LocalDate to = LocalDate.now();
            LocalDate from = to.minusDays(30);
            // includeAcknowledged=false, teamLeadId=null — self-scoped, and only counts.
            List<TeamBlockerDto> blockers = teamLeadService.getBlockers(from, to, context.email(), false, null);
            if (blockers.isEmpty()) {
                return Optional.empty();
            }
            return Optional.of(blockers.size() + " open blocker(s) on your team in the last 30 days.");
        }
    }

    @Component
    static class BlockersPmProvider implements AssistantDataProvider {
        private final PmBlockersService pmBlockersService;

        BlockersPmProvider(PmBlockersService pmBlockersService) {
            this.pmBlockersService = pmBlockersService;
        }

        @Override public String id() { return "blockers.pm"; }
        @Override public String title() { return "Open blockers on my projects"; }
        @Override public Set<AppUser.Role> audiences() { return Set.of(AppUser.Role.PM); }
        @Override public Set<String> modules() { return Set.of("blockers"); }

        @Override
        public Optional<String> fetch(AssistantRequestContext context) {
            LocalDate to = LocalDate.now();
            LocalDate from = to.minusDays(30);
            List<PmBlockerDto> blockers = pmBlockersService.getBlockers(context.email(), from, to, null, null, null);
            if (blockers.isEmpty()) {
                return Optional.empty();
            }
            return Optional.of(blockers.size() + " open blocker(s) across your projects in the last 30 days.");
        }
    }
}
