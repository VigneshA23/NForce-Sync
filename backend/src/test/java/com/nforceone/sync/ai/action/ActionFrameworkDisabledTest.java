package com.nforceone.sync.ai.action;

import com.nforceone.sync.ai.contract.AssistantResponse;
import com.nforceone.sync.auth.AppUser;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AssignableTypeFilter;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.RecordComponent;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Asserts every guarantee listed in {@code ai/action/package-info.java} — re-enabling any one of
 * them by accident must fail this build, not ship silently. See that file for the full rationale.
 */
class ActionFrameworkDisabledTest {

    /**
     * Guarantee 2: zero implementations of {@link ActionDefinition} in {@code src/main}.
     *
     * <p>{@link TestStubActionDefinition} below exists only so this scan has something real to
     * find — a self-check, since a classpath scan that silently matches nothing would pass
     * forever whether or not the real guarantee held. Both main and test classes share one
     * classpath in a Maven test run, so the assertion is: the stub (a test class) is found, and
     * nothing else is.
     */
    @Test
    void noActionDefinitionImplementationExistsInMainSources() {
        ClassPathScanningCandidateComponentProvider scanner =
                new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AssignableTypeFilter(ActionDefinition.class));
        Set<BeanDefinition> candidates = scanner.findCandidateComponents("com.nforceone.sync.ai.action");

        boolean foundStub = candidates.stream()
                .anyMatch(bd -> bd.getBeanClassName().contains("TestStubActionDefinition"));
        assertTrue(foundStub, "sanity check failed: the scanner did not even find its own test stub, "
                + "so a genuine implementation could exist and this test would still pass");

        List<String> unexpected = candidates.stream()
                .map(BeanDefinition::getBeanClassName)
                .filter(name -> !name.contains("TestStubActionDefinition"))
                .toList();
        assertTrue(unexpected.isEmpty(),
                "found ActionDefinition implementation(s) outside the test stub: " + unexpected);
    }

    /** Guarantee 3: the registry is empty and cannot be populated by Spring bean collection. */
    @Test
    void registryIsEmptyAndHasNothingToAutowire() {
        ActionRegistry registry = new ActionRegistry();
        assertTrue(registry.isEmpty());
        assertTrue(registry.all().isEmpty());
        assertTrue(registry.find("anything.at.all").isEmpty());

        // A no-arg constructor with no @Autowired field means Spring has nothing to inject here —
        // the registry's contents can only change by a human editing this class, never by a
        // future @Component ActionDefinition silently registering itself via bean collection.
        Constructor<?>[] constructors = ActionRegistry.class.getDeclaredConstructors();
        assertEquals(1, constructors.length);
        assertEquals(0, constructors[0].getParameterCount());
        for (Field field : ActionRegistry.class.getDeclaredFields()) {
            assertFalse(field.isAnnotationPresent(Autowired.class),
                    "ActionRegistry must not have an @Autowired field: " + field);
        }
    }

    /** Guarantee 4: the only executor throws unconditionally, ignoring enabled(), for every input. */
    @Test
    void disabledExecutorThrowsForEveryInput() {
        DisabledActionExecutor executor = new DisabledActionExecutor();

        assertThrows(com.nforceone.sync.ai.exception.ActionExecutionDisabledException.class, () ->
                executor.execute(new ActionRequest("some.action", Map.of("x", 1), null, null), null));

        assertThrows(com.nforceone.sync.ai.exception.ActionExecutionDisabledException.class, () ->
                executor.execute(new ActionRequest("some.action", Map.of(), "a-confirmation-token", "conv-1"), null));

        assertThrows(com.nforceone.sync.ai.exception.ActionExecutionDisabledException.class,
                () -> executor.execute(null, null));

        ActionDefinition claimsEnabled = new TestStubActionDefinition() {
            @Override
            public boolean enabled() {
                return true;
            }
        };
        assertThrows(com.nforceone.sync.ai.exception.ActionExecutionDisabledException.class, () ->
                executor.execute(new ActionRequest(claimsEnabled.actionId(), Map.of(), null, null), null));
    }

    /**
     * Guarantee 6: the response contract has no field a model could use to claim an action ran,
     * and no field named "action" for a model-invented one to land in even if it tried.
     */
    @Test
    void assistantResponseHasNoActionField() {
        for (RecordComponent component : AssistantResponse.class.getRecordComponents()) {
            assertFalse(component.getName().toLowerCase().contains("action"),
                    "AssistantResponse must not carry an action-shaped field: " + component.getName());
        }
    }

    // Package-private, non-final so disabledExecutorThrowsForEveryInput can subclass it above.
    private static class TestStubActionDefinition implements ActionDefinition {
        @Override
        public String actionId() {
            return "test.stub";
        }

        @Override
        public String name() {
            return "Test stub";
        }

        @Override
        public String description() {
            return "Exists only to prove the classpath scan above actually finds implementations.";
        }

        @Override
        public List<AppUser.Role> requiredRoles() {
            return List.of();
        }

        @Override
        public List<ActionParameter> parameters() {
            return List.of();
        }

        @Override
        public List<String> preconditions() {
            return List.of();
        }

        @Override
        public boolean requiresConfirmation() {
            return false;
        }

        @Override
        public String expectedResult() {
            return "n/a";
        }

        @Override
        public String module() {
            return "test";
        }

        @Override
        public String pageId() {
            return "test";
        }

        @Override
        public String workflowId() {
            return null;
        }

        @Override
        public boolean enabled() {
            return false;
        }
    }
}
