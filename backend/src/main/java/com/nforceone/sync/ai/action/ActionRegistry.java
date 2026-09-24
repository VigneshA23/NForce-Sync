package com.nforceone.sync.ai.action;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;

/**
 * The registry of enabled actions — empty, and {@code final} on purpose. It deliberately does
 * <b>not</b> {@code @Autowired List<ActionDefinition>}: bean collection would let a future
 * {@code @Component} register itself into the registry silently, just by existing on the
 * classpath. Adding an action here requires a human to edit this file and decide to do it.
 */
@Component
public final class ActionRegistry {

    private static final Map<String, ActionDefinition> ACTIONS = Map.of();

    public Optional<ActionDefinition> find(String actionId) {
        return Optional.ofNullable(ACTIONS.get(actionId));
    }

    public Map<String, ActionDefinition> all() {
        return ACTIONS;
    }

    public boolean isEmpty() {
        return ACTIONS.isEmpty();
    }
}
