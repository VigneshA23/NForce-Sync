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
        return new AssistantRequestContext(1L, "e@nforceone.com", role, role.name(), null, null, java.util.Set.of());
    }

    @Test
    void validPageForRoleResolves() {
        Optional<NavigationAction> action = validator.validate("eod-submit", context(AppUser.Role.EMPLOYEE));
        assertTrue(action.isPresent());
        assertEquals("eod-submit", action.get().pageId());
        assertEquals("Submit EOD", action.get().label());
    }

    @Test
    void adminOnlyPageDoesNotValidateForEmployee() {
        assertTrue(validator.validate("user-management", context(AppUser.Role.EMPLOYEE)).isEmpty());
        assertTrue(validator.validate("audit-log", context(AppUser.Role.EMPLOYEE)).isEmpty());
        assertTrue(validator.validate("roles-access", context(AppUser.Role.EMPLOYEE)).isEmpty());
    }

    @Test
    void pageNotReachableByRoleDoesNotValidate() {
        assertTrue(validator.validate("user-management", context(AppUser.Role.EMPLOYEE)).isEmpty());
        assertTrue(validator.validate("audit-log", context(AppUser.Role.EMPLOYEE)).isEmpty());
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
    void currentPageValidationReturnsPresentForKnownRoleAndPage() {
        Optional<PageReference> ref = validator.validateCurrentPage("dashboard", context(AppUser.Role.EMPLOYEE));
        assertTrue(ref.isPresent());
    }
}
