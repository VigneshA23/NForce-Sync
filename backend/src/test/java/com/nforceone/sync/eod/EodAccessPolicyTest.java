package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.reporting.ReportingScopeService;
import com.nforceone.sync.teamlead.LeadAccessService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EodAccessPolicyTest {

    @Mock LeadAccessService leadAccess;
    @Mock ReportingScopeService reportingScope;

    private EodAccessPolicy policy;

    private AppUser owner;
    private AppUser otherUser;
    private EodEntry plainLogEntry;
    private EodEntry projectEntry;

    @BeforeEach
    void setUp() {
        policy = new EodAccessPolicy(leadAccess, reportingScope);

        owner = new AppUser();
        owner.setId(1L);
        owner.setRole(AppUser.Role.PM);

        otherUser = new AppUser();
        otherUser.setId(99L);

        plainLogEntry = new EodEntry();
        plainLogEntry.setEmployee(owner);
        plainLogEntry.setEntryForm(EodEntry.EntryForm.PLAIN_LOG);

        projectEntry = new EodEntry();
        projectEntry.setEmployee(owner);
        projectEntry.setEntryForm(EodEntry.EntryForm.PROJECT_GROUPED);
    }

    // ── Owner ─────────────────────────────────────────────────────────────────

    @Test
    void owner_can_read_own_plain_log() {
        assertTrue(policy.canRead(owner, plainLogEntry));
    }

    @Test
    void owner_can_read_own_project_entry() {
        assertTrue(policy.canRead(owner, projectEntry));
    }

    // ── SuperAdmin ────────────────────────────────────────────────────────────

    @Test
    void superadmin_can_read_any_plain_log() {
        otherUser.setRole(AppUser.Role.SUPERADMIN);
        assertTrue(policy.canRead(otherUser, plainLogEntry));
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    @Test
    void admin_can_read_any_plain_log() {
        otherUser.setRole(AppUser.Role.ADMIN);
        assertTrue(policy.canRead(otherUser, plainLogEntry));
    }

    @Test
    void admin_can_read_project_entry() {
        otherUser.setRole(AppUser.Role.ADMIN);
        assertTrue(policy.canRead(otherUser, projectEntry));
    }

    // ── Reporting tree for PLAIN_LOG ─────────────────────────────────────────

    @Test
    void user_in_reporting_tree_can_read_plain_log() {
        otherUser.setRole(AppUser.Role.PM);
        when(reportingScope.subtreeUserIds(otherUser.getId()))
                .thenReturn(List.of(owner.getId()));

        assertTrue(policy.canRead(otherUser, plainLogEntry));
    }

    @Test
    void user_not_in_reporting_tree_cannot_read_plain_log() {
        otherUser.setRole(AppUser.Role.PM);
        when(reportingScope.subtreeUserIds(otherUser.getId()))
                .thenReturn(List.of(42L, 43L)); // owner.id = 1 not present

        assertFalse(policy.canRead(otherUser, plainLogEntry));
    }

    // ── PM does not get blanket plain-log access ──────────────────────────────

    @Test
    void pm_not_in_reporting_tree_cannot_read_plain_log() {
        otherUser.setRole(AppUser.Role.PM);
        when(reportingScope.subtreeUserIds(otherUser.getId()))
                .thenReturn(List.of());

        assertFalse(policy.canRead(otherUser, plainLogEntry));
        // Verify: leadAccess never consulted for plain-log entries.
        verifyNoInteractions(leadAccess);
    }

    // ── PROJECT_GROUPED: PM sees all ─────────────────────────────────────────

    @Test
    void pm_can_read_project_grouped_entry() {
        otherUser.setRole(AppUser.Role.PM);
        assertTrue(policy.canRead(otherUser, projectEntry));
    }

    // ── PROJECT_GROUPED: Lead team member access ──────────────────────────────

    @Test
    void lead_team_member_can_read_project_entry() {
        otherUser.setRole(AppUser.Role.EMPLOYEE);
        when(leadAccess.isInLeadTeam(owner.getId(), otherUser.getId())).thenReturn(true);

        assertTrue(policy.canRead(otherUser, projectEntry));
    }

    @Test
    void non_lead_team_member_cannot_read_project_entry() {
        otherUser.setRole(AppUser.Role.EMPLOYEE);
        when(leadAccess.isInLeadTeam(owner.getId(), otherUser.getId())).thenReturn(false);

        assertFalse(policy.canRead(otherUser, projectEntry));
    }
}
