package com.nforceone.sync.ai.navigation;

import com.nforceone.sync.ai.contract.AssistantRequestContext;
import com.nforceone.sync.ai.contract.NavigationAction;
import com.nforceone.sync.ai.contract.PageReference;
import com.nforceone.sync.auth.AppUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class NavigationValidatorTest {

    private NavigationValidator validator;

    @BeforeEach
    void setUp() {
        PageRegistry registry = new PageRegistry();
        registry.load();
        validator = new NavigationValidator(registry);
    }

    private static AssistantRequestContext context(AppUser.Role role) {
        return new AssistantRequestContext(1L, "e@nforceone.com", role, role.name(), null, null);
    }

    @Test
    void validPageForRoleResolves() {
        Optional<NavigationAction> action = validator.validate("eod-submit", context(AppUser.Role.EMPLOYEE));
        assertTrue(action.isPresent());
        assertEquals("eod-submit", action.get().pageId());
        assertEquals("Submit EOD", action.get().label());
    }

    @Test
    void placeholderPageNeverValidatesAsANavigationTarget() {
        assertTrue(validator.validate("dashboard", context(AppUser.Role.DM)).isEmpty());
        assertTrue(validator.validate("dashboard", context(AppUser.Role.FINANCE)).isEmpty());
        assertTrue(validator.validate("dashboard", context(AppUser.Role.LEADERSHIP)).isEmpty());
    }

    @Test
    void pageNotReachableByRoleDoesNotValidate() {
        assertTrue(validator.validate("user-management", context(AppUser.Role.EMPLOYEE)).isEmpty());
        assertTrue(validator.validate("audit-log", context(AppUser.Role.MANAGER)).isEmpty());
    }

    @Test
    void unknownPageIdDoesNotValidate() {
        assertTrue(validator.validate("not-a-real-page", context(AppUser.Role.SUPERADMIN)).isEmpty());
    }

    @Test
    void blankOrNullPageIdDoesNotValidate() {
        assertTrue(validator.validate(null, context(AppUser.Role.EMPLOYEE)).isEmpty());
        assertTrue(validator.validate("  ", context(AppUser.Role.EMPLOYEE)).isEmpty());
    }

    @Test
    void currentPageValidationAllowsPlaceholdersForContextOnly() {
        // A placeholder is fine as "what page am I looking at" context, just never as a target.
        Optional<PageReference> ref = validator.validateCurrentPage("dashboard", context(AppUser.Role.DM));
        assertTrue(ref.isPresent());
        assertTrue(ref.get().placeholder());
    }
}
