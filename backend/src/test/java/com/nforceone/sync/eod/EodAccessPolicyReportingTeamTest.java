package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.reporting.ReportingScopeService;
import com.nforceone.sync.teamlead.LeadAccessService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

/** The My Reporting Team > Reports rules in {@link EodAccessPolicy}: derived from data, never from a role. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EodAccessPolicyReportingTeamTest {

    @Mock LeadAccessService leadAccess;
    @Mock ReportingScopeService reportingScope;

    private EodAccessPolicy policy;
    private AppUser actor;

    @BeforeEach
    void setUp() {
        policy = new EodAccessPolicy(leadAccess, reportingScope);
        actor = new AppUser();
        actor.setId(1L);
        // Any role: the rule must not look at it.
        actor.setRole(AppUser.Role.EMPLOYEE);
    }

    @Test
    void mayViewWhenThereIsAtLeastOneActiveDirectReport() {
        when(reportingScope.hasDirectReports(1L)).thenReturn(true);
        assertTrue(policy.mayViewReportingTeamReports(actor));
    }

    @Test
    void mayNotViewWithoutDirectReportsWhateverTheRole() {
        when(reportingScope.hasDirectReports(1L)).thenReturn(false);
        for (AppUser.Role role : AppUser.Role.values()) {
            actor.setRole(role);
            assertFalse(policy.mayViewReportingTeamReports(actor), "role " + role);
        }
    }

    @Test
    void rosterIsCurrentActiveReportsPlusSnapshotEmployeesWithoutDuplicatesOrTheActor() {
        when(reportingScope.hasDirectReports(1L)).thenReturn(true);
        when(reportingScope.directReportIds(1L)).thenReturn(List.of(2L, 3L));
        Set<Long> roster = policy.reportingTeamReportRoster(actor, List.of(3L, 4L, 1L));
        assertEquals(Set.of(2L, 3L, 4L), roster);
    }

    @Test
    void rosterIsEmptyWithoutDirectReportsEvenIfSnapshotEntriesExist() {
        when(reportingScope.hasDirectReports(1L)).thenReturn(false);
        assertTrue(policy.reportingTeamReportRoster(actor, List.of(4L)).isEmpty());
    }
}
