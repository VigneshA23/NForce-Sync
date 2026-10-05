package com.nforceone.sync.ai.data;

import com.nforceone.sync.ai.contract.AssistantRequestContext;
import com.nforceone.sync.auth.AppUser;

import java.util.Optional;
import java.util.Set;

/**
 * One explicit, registered, read-only live-data provider. Every implementation must call exactly
 * one actor-scoped read method on an existing Sync service, passing only the caller's own identity
 * from {@code context} — never another user's id. See {@code DataProviderSafetyTest} for why this
 * is a structural guarantee, not a convention.
 *
 * <p>Audience gating uses two orthogonal mechanisms that are OR-ed:
 * <ul>
 *   <li>{@link #audienceRoles()} — exact role match (e.g. PM, SUPERADMIN).</li>
 *   <li>{@link #audienceCapabilities()} — capability-based match (e.g. LEADS_PROJECT), derived
 *       at request time from live project data so an EMPLOYEE who leads a project receives the
 *       same team-oriented providers a MANAGER-role user did before the role was removed.</li>
 * </ul>
 * A provider that returns an empty set for both mechanisms is never eligible.
 */
public interface AssistantDataProvider {

    /** Known capability tokens. */
    String CAPABILITY_LEADS_PROJECT = "LEADS_PROJECT";

    /** {@code "<family>.<subtype>"}, e.g. {@code "eod.today"} — prefix before first dot groups providers for the diversity rule in {@link AssistantDataService}. */
    String id();

    /** Short label shown as the {@code <userdata>} section heading in the prompt. */
    String title();

    /**
     * Roles that unconditionally qualify (e.g. PM, SUPERADMIN). Return empty set when the
     * provider gates purely on capabilities.
     */
    Set<AppUser.Role> audienceRoles();

    /**
     * Capability tokens that qualify any role holding them (e.g. {@link #CAPABILITY_LEADS_PROJECT}).
     * Return empty set when the provider gates purely on roles.
     */
    default Set<String> audienceCapabilities() {
        return Set.of();
    }

    /** Knowledge modules this provider is relevant to. */
    Set<String> modules();

    /** Empty if nothing to report — a provider with nothing to say contributes nothing. */
    Optional<String> fetch(AssistantRequestContext context);
}
