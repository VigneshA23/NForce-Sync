package com.nforceone.sync.ai.data;

import com.nforceone.sync.ai.contract.AssistantRequestContext;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.executive.ExecutiveDashboardService;
import com.nforceone.sync.executive.dto.ExecutiveDashboardDto;
import com.nforceone.sync.projectdashboard.ProjectDashboardService;
import com.nforceone.sync.projectdashboard.dto.ProjectDashboardSummaryDto;
import com.nforceone.sync.teamlead.TeamLeadService;
import com.nforceone.sync.teamlead.dto.TeamLeadSummaryDto;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.Optional;
import java.util.Set;

/**
 * Dashboard-summary providers. Each underlying DTO is already an organization/team-level
 * aggregate — none of these read or forward an individual's name, matching the counts-only
 * discipline the other providers apply explicitly.
 */
final class DashboardDataProviders {

    private DashboardDataProviders() {
    }

    @Component
    static class TeamSummaryProvider implements AssistantDataProvider {
        private final TeamLeadService teamLeadService;

        TeamSummaryProvider(TeamLeadService teamLeadService) {
            this.teamLeadService = teamLeadService;
        }

        @Override public String id() { return "team.summary"; }
        @Override public String title() { return "Team summary"; }
        @Override public Set<AppUser.Role> audiences() { return Set.of(AppUser.Role.MANAGER); }
        @Override public Set<String> modules() { return Set.of("dashboard"); }

        @Override
        public Optional<String> fetch(AssistantRequestContext context) {
            LocalDate today = LocalDate.now();
            TeamLeadSummaryDto s = teamLeadService.getSummary(today, today, context.email(), null);
            if (!s.workingDay()) {
                return Optional.of("Today is not a working day, so today's team figures carry no real signal.");
            }
            String util = s.avgUtilization() == null ? "not yet computed" : s.avgUtilization() + "%";
            return Optional.of("Team: " + s.activeMembers() + " active member(s), " + s.missingCount()
                    + " missing today's EOD, " + s.pendingApprovalCount() + " pending your approval, "
                    + "average utilization " + util + ", " + s.activeBlockersCount() + " open blocker(s).");
        }
    }

    @Component
    static class ProjectDashboardSummaryProvider implements AssistantDataProvider {
        private final ProjectDashboardService projectDashboardService;

        ProjectDashboardSummaryProvider(ProjectDashboardService projectDashboardService) {
            this.projectDashboardService = projectDashboardService;
        }

        @Override public String id() { return "project-dashboard.summary"; }
        @Override public String title() { return "Project portfolio summary"; }
        @Override public Set<AppUser.Role> audiences() { return Set.of(AppUser.Role.PM); }
        @Override public Set<String> modules() { return Set.of("dashboard", "projects"); }

        @Override
        public Optional<String> fetch(AssistantRequestContext context) {
            LocalDate to = LocalDate.now();
            LocalDate from = to.withDayOfMonth(1);
            ProjectDashboardSummaryDto s = projectDashboardService.getSummary(
                    context.email(), from, to, null, null, null, null);
            var cards = s.cards();
            return Optional.of("Your projects this month: " + cards.activeProjects() + " active, "
                    + cards.onHoldProjects() + " on hold, " + cards.completedProjects() + " completed. "
                    + "Overall utilization " + valueOrNa(cards.overallUtilizationPct()) + "%, "
                    + cards.missingEodCount() + " missing EOD(s).");
        }
    }

    @Component
    static class ExecutiveSummaryProvider implements AssistantDataProvider {
        private final ExecutiveDashboardService executiveDashboardService;

        ExecutiveSummaryProvider(ExecutiveDashboardService executiveDashboardService) {
            this.executiveDashboardService = executiveDashboardService;
        }

        @Override public String id() { return "executive.summary"; }
        @Override public String title() { return "Executive summary"; }
        @Override public Set<AppUser.Role> audiences() { return Set.of(AppUser.Role.SUPERADMIN); }
        @Override public Set<String> modules() { return Set.of("dashboard"); }

        @Override
        public Optional<String> fetch(AssistantRequestContext context) {
            LocalDate to = LocalDate.now();
            LocalDate from = to.withDayOfMonth(1);
            ExecutiveDashboardDto d = executiveDashboardService.getDashboard(context.email(), from, to);
            // Deliberately omits topUtilized/bottomUtilized and recentActivity — those name
            // individuals, and an aggregate summary has no need for them.
            return Optional.of("Organization: " + d.workforce().activeUsers() + " active user(s), "
                    + d.projects().activeProjects() + " active project(s). "
                    + "EOD compliance " + d.eodCompliance().compliancePct() + "% ("
                    + d.eodCompliance().missing() + " missing this period). "
                    + "Overall utilization " + valueOrNa(d.utilization().overallUtilizationPct()) + "%.");
        }
    }

    private static String valueOrNa(Object value) {
        return value == null ? "N/A" : value.toString();
    }
}
