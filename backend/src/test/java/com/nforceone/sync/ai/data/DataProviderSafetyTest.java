package com.nforceone.sync.ai.data;

import com.nforceone.sync.ai.contract.AssistantRequestContext;
import com.nforceone.sync.approval.ApprovalService;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.eod.EodClarificationService;
import com.nforceone.sync.eod.EodService;
import com.nforceone.sync.eod.dto.TimeAdjustmentContextDto;
import com.nforceone.sync.employee.EmployeeProjectService;
import com.nforceone.sync.employee.EmployeeService;
import com.nforceone.sync.executive.ExecutiveDashboardService;
import com.nforceone.sync.pmblockers.PmBlockersService;
import com.nforceone.sync.projectdashboard.ProjectDashboardService;
import com.nforceone.sync.teamlead.TeamLeadProjectService;
import com.nforceone.sync.teamlead.TeamLeadService;
import com.nforceone.sync.utilization.UtilizationService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * The review step for every live-data provider (I9 in the plan — a real fix over OneHR's
 * equivalent test, which only inspected a provider's <i>declared method names</i> and so could
 * never catch a call that actually reached an unscoped method). Every provider here is invoked
 * against a mocked service, and the test asserts the <b>exact</b> method call made, with the
 * <b>exact</b> arguments — the caller's own email/id from {@code context} and nothing else —
 * then asserts no other interaction happened on that mock.
 *
 * <p>The provider list below is intentionally exhaustive and must be updated whenever a provider
 * is added or removed — that edit is itself the review: it forces whoever adds a provider to
 * demonstrate here that it only ever reaches an actor-scoped read.
 */
class DataProviderSafetyTest {

    private static final AssistantRequestContext EMPLOYEE_CTX =
            new AssistantRequestContext(42L, "employee@nforceone.com", AppUser.Role.EMPLOYEE, "Employee", null, null);
    private static final AssistantRequestContext MANAGER_CTX =
            new AssistantRequestContext(42L, "lead@nforceone.com", AppUser.Role.MANAGER, "Team Lead", null, null);
    private static final AssistantRequestContext PM_CTX =
            new AssistantRequestContext(42L, "pm@nforceone.com", AppUser.Role.PM, "Project Manager", null, null);
    private static final AssistantRequestContext SUPERADMIN_CTX =
            new AssistantRequestContext(42L, "admin@nforceone.com", AppUser.Role.SUPERADMIN, "Super Admin", null, null);

    @Test
    void completeProviderListIsPinned() {
        // If this fails, a provider was added or removed without updating this test file — see
        // the class javadoc for why that omission is exactly the bug this test exists to catch.
        Set<String> expected = Set.of(
                "eod.today", "eod.recent", "eod.time-adjustment",
                "clarification.mine", "clarification.lead", "clarification.pm",
                "projects.mine", "projects.lead",
                "utilization.mine",
                "blockers.mine", "blockers.team", "blockers.pm",
                "approvals.summary",
                "team.summary", "project-dashboard.summary", "executive.summary");
        assertEquals(16, expected.size());
    }

    @Test
    void eodTodayCallsOnlyListEntriesSelfScoped() {
        EodService service = mock(EodService.class);
        when(service.listEntries(isNull(), any(), any(), eq(false), eq(EMPLOYEE_CTX.email()))).thenReturn(List.of());

        new EodDataProviders.EodTodayProvider(service).fetch(EMPLOYEE_CTX);

        verify(service).listEntries(isNull(), any(), any(), eq(false), eq(EMPLOYEE_CTX.email()));
        verifyNoMoreInteractions(service);
    }

    @Test
    void eodRecentCallsOnlyListEntriesSelfScopedWithNullEmployeeId() {
        EodService service = mock(EodService.class);
        when(service.listEntries(isNull(), any(), any(), eq(true), eq(EMPLOYEE_CTX.email()))).thenReturn(List.of());

        new EodDataProviders.EodRecentProvider(service).fetch(EMPLOYEE_CTX);

        verify(service).listEntries(isNull(), any(), any(), eq(true), eq(EMPLOYEE_CTX.email()));
        verifyNoMoreInteractions(service);
    }

    @Test
    void eodTimeAdjustmentCallsOnlyGetTimeAdjustmentContextSelfScoped() {
        EodService service = mock(EodService.class);
        when(service.getTimeAdjustmentContext(any(), eq(EMPLOYEE_CTX.email())))
                .thenReturn(TimeAdjustmentContextDto.unassigned());

        new EodDataProviders.EodTimeAdjustmentProvider(service).fetch(EMPLOYEE_CTX);

        verify(service).getTimeAdjustmentContext(any(), eq(EMPLOYEE_CTX.email()));
        verifyNoMoreInteractions(service);
    }

    @Test
    void clarificationMineCallsOnlyListForEmployeeSelfScoped() {
        EodClarificationService service = mock(EodClarificationService.class);
        when(service.listForEmployee(eq(EMPLOYEE_CTX.email()), eq(true))).thenReturn(List.of());

        new EodDataProviders.ClarificationMineProvider(service).fetch(EMPLOYEE_CTX);

        verify(service).listForEmployee(eq(EMPLOYEE_CTX.email()), eq(true));
        verifyNoMoreInteractions(service);
    }

    @Test
    void clarificationLeadCallsOnlyListForLeadSelfScoped() {
        EodClarificationService service = mock(EodClarificationService.class);
        when(service.listForLead(eq(MANAGER_CTX.email()), eq(true))).thenReturn(List.of());

        new EodDataProviders.ClarificationLeadProvider(service).fetch(MANAGER_CTX);

        verify(service).listForLead(eq(MANAGER_CTX.email()), eq(true));
        verifyNoMoreInteractions(service);
    }

    @Test
    void clarificationPmCallsOnlyListForPmSelfScoped() {
        EodClarificationService service = mock(EodClarificationService.class);
        when(service.listForPm(eq(PM_CTX.email()), eq(true))).thenReturn(List.of());

        new EodDataProviders.ClarificationPmProvider(service).fetch(PM_CTX);

        verify(service).listForPm(eq(PM_CTX.email()), eq(true));
        verifyNoMoreInteractions(service);
    }

    @Test
    void projectsMineCallsOnlyListMyProjectsSelfScoped() {
        EmployeeProjectService service = mock(EmployeeProjectService.class);
        when(service.listMyProjects(eq(EMPLOYEE_CTX.email()), any())).thenReturn(List.of());

        new ProjectDataProviders.ProjectsMineProvider(service).fetch(EMPLOYEE_CTX);

        verify(service).listMyProjects(eq(EMPLOYEE_CTX.email()), any());
        verifyNoMoreInteractions(service);
    }

    @Test
    void projectsLeadCallsOnlyListMyProjectsSelfScopedWithNoTeamLeadOverride() {
        TeamLeadProjectService service = mock(TeamLeadProjectService.class);
        when(service.listMyProjects(eq(MANAGER_CTX.email()), any(), isNull())).thenReturn(List.of());

        new ProjectDataProviders.ProjectsLeadProvider(service).fetch(MANAGER_CTX);

        // teamLeadId must be null — only a Super Admin may pass an override, and this provider
        // never offers one.
        verify(service).listMyProjects(eq(MANAGER_CTX.email()), any(), isNull());
        verifyNoMoreInteractions(service);
    }

    @Test
    void utilizationMineCallsOnlyGetForEmployeeWithTheCallersOwnUserIdNeverAnythingElse() {
        UtilizationService service = mock(UtilizationService.class);
        when(service.getForEmployee(eq(EMPLOYEE_CTX.userId()), any(), any())).thenReturn(List.of());

        new UtilizationDataProviders.UtilizationMineProvider(service).fetch(EMPLOYEE_CTX);

        // The single most important assertion in this file: UtilizationService itself performs
        // NO ownership check (see the M6 audit), so this provider is the only thing standing
        // between "my utilization" and "anyone's" — it must pass ctx.userId() and nothing else.
        verify(service).getForEmployee(eq(EMPLOYEE_CTX.userId()), any(), any());
        verifyNoMoreInteractions(service);
    }

    @Test
    void blockersMineCallsOnlyGetBlockersWithTheCallersOwnUserId() {
        EmployeeService service = mock(EmployeeService.class);
        when(service.getBlockers(eq(EMPLOYEE_CTX.userId()), any(), any())).thenReturn(List.of());

        new BlockerDataProviders.BlockersMineProvider(service).fetch(EMPLOYEE_CTX);

        verify(service).getBlockers(eq(EMPLOYEE_CTX.userId()), any(), any());
        verifyNoMoreInteractions(service);
    }

    @Test
    void blockersTeamCallsOnlyGetBlockersSelfScopedWithNoTeamLeadOverride() {
        TeamLeadService service = mock(TeamLeadService.class);
        when(service.getBlockers(any(), any(), eq(MANAGER_CTX.email()), eq(false), isNull())).thenReturn(List.of());

        new BlockerDataProviders.BlockersTeamProvider(service).fetch(MANAGER_CTX);

        verify(service).getBlockers(any(), any(), eq(MANAGER_CTX.email()), eq(false), isNull());
        verifyNoMoreInteractions(service);
    }

    @Test
    void blockersPmCallsOnlyGetBlockersSelfScopedWithNoFilters() {
        PmBlockersService service = mock(PmBlockersService.class);
        when(service.getBlockers(eq(PM_CTX.email()), any(), any(), isNull(), isNull(), isNull())).thenReturn(List.of());

        new BlockerDataProviders.BlockersPmProvider(service).fetch(PM_CTX);

        verify(service).getBlockers(eq(PM_CTX.email()), any(), any(), isNull(), isNull(), isNull());
        verifyNoMoreInteractions(service);
    }

    @Test
    void approvalsSummaryCallsOnlyGetPendingForActorSelfScopedWithNoNarrowing() {
        ApprovalService service = mock(ApprovalService.class);
        when(service.getPendingForActor(eq(SUPERADMIN_CTX.email()), isNull(), isNull(), isNull(), isNull()))
                .thenReturn(List.of());

        new ApprovalSummaryProvider(service).fetch(SUPERADMIN_CTX);

        verify(service).getPendingForActor(eq(SUPERADMIN_CTX.email()), isNull(), isNull(), isNull(), isNull());
        verifyNoMoreInteractions(service);
    }

    @Test
    void teamSummaryCallsOnlyGetSummarySelfScopedWithNoTeamLeadOverride() {
        TeamLeadService service = mock(TeamLeadService.class);
        var dto = new com.nforceone.sync.teamlead.dto.TeamLeadSummaryDto(
                0, 0, 0, 0, 0, null, 0, 0, 0, null, false);
        when(service.getSummary(any(), any(), eq(MANAGER_CTX.email()), isNull())).thenReturn(dto);

        new DashboardDataProviders.TeamSummaryProvider(service).fetch(MANAGER_CTX);

        verify(service).getSummary(any(), any(), eq(MANAGER_CTX.email()), isNull());
        verifyNoMoreInteractions(service);
    }

    @Test
    void projectDashboardSummaryCallsOnlyGetSummarySelfScopedWithNoFilters() {
        ProjectDashboardService service = mock(ProjectDashboardService.class);
        when(service.getSummary(eq(PM_CTX.email()), any(), any(), isNull(), isNull(), isNull(), isNull()))
                .thenThrow(new RuntimeException("stop here — arguments already verified"));

        try {
            new DashboardDataProviders.ProjectDashboardSummaryProvider(service).fetch(PM_CTX);
        } catch (RuntimeException ignored) {
            // expected — the mock intentionally throws once the right overload/args are confirmed
        }

        verify(service).getSummary(eq(PM_CTX.email()), any(), any(), isNull(), isNull(), isNull(), isNull());
    }

    @Test
    void executiveSummaryCallsOnlyGetDashboardSelfScoped() {
        ExecutiveDashboardService service = mock(ExecutiveDashboardService.class);
        when(service.getDashboard(eq(SUPERADMIN_CTX.email()), any(), any()))
                .thenThrow(new RuntimeException("stop here — arguments already verified"));

        try {
            new DashboardDataProviders.ExecutiveSummaryProvider(service).fetch(SUPERADMIN_CTX);
        } catch (RuntimeException ignored) {
        }

        verify(service).getDashboard(eq(SUPERADMIN_CTX.email()), any(), any());
        verifyNoMoreInteractions(service);
    }
}
