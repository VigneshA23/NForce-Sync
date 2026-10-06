package com.nforceone.sync.ai.navigation;

import com.nforceone.sync.ai.contract.PageReference;
import com.nforceone.sync.auth.AppUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class PageRegistryTest {

    private PageRegistry registry;

    @BeforeEach
    void load() {
        registry = new PageRegistry();
        registry.load(); // @PostConstruct — invoked directly, no Spring context needed here
    }

    @Test
    void loadsAllExpectedPages() {
        assertEquals(23, registry.size());
        assertTrue(registry.exists("dashboard"));
        assertTrue(registry.exists("eod-submit"));
        assertFalse(registry.exists("no-such-page"));
    }

    @Test
    void roleSpecificVariantsResolveToTheRealRoute() {
        Optional<PageReference> employeeDashboard = registry.find("dashboard", AppUser.Role.EMPLOYEE);
        assertTrue(employeeDashboard.isPresent());
        assertEquals("/dashboard", employeeDashboard.get().route());
        assertFalse(employeeDashboard.get().placeholder());

        Optional<PageReference> pmDashboard = registry.find("dashboard", AppUser.Role.PM);
        assertEquals("/projects/dashboard", pmDashboard.orElseThrow().route());

        Optional<PageReference> superadminDashboard = registry.find("dashboard", AppUser.Role.SUPERADMIN);
        assertEquals("/admin/executive-dashboard", superadminDashboard.orElseThrow().route());
    }

    @Test
    void sharedPathAcrossTwoRolesResolvesIndependently() {
        Optional<PageReference> adminOrgMasters = registry.find("org-masters", AppUser.Role.ADMIN);
        Optional<PageReference> superadminOrgMasters = registry.find("org-masters", AppUser.Role.SUPERADMIN);
        assertEquals("/admin/org-masters", adminOrgMasters.orElseThrow().route());
        assertEquals("/admin/org-masters", superadminOrgMasters.orElseThrow().route());
    }

    @Test
    void unknownRoleReturnsEmptyForAnyPage() {
        // DM/FINANCE/LEADERSHIP no longer exist in AppUser.Role — passing null simulates an
        // unknown role; find() handles it gracefully with Optional.empty().
        assertTrue(registry.find("dashboard", null).isEmpty());
    }

    @Test
    void employeeHasNoAdminPages() {
        assertTrue(registry.find("user-management", AppUser.Role.EMPLOYEE).isEmpty());
        assertTrue(registry.find("audit-log", AppUser.Role.EMPLOYEE).isEmpty());
    }

    @Test
    void sharedPagesReachEveryRole() {
        for (AppUser.Role role : AppUser.Role.values()) {
            assertTrue(registry.find("notifications", role).isPresent(), "notifications should reach " + role);
            assertTrue(registry.find("profile", role).isPresent(), "profile should reach " + role);
        }
    }

    @Test
    void forRoleReturnsDeterministicDeclarationOrder() {
        List<PageReference> first = registry.forRole(AppUser.Role.PM);
        List<PageReference> second = registry.forRole(AppUser.Role.PM);
        assertEquals(first.stream().map(PageReference::pageId).toList(),
                second.stream().map(PageReference::pageId).toList());
    }
}
