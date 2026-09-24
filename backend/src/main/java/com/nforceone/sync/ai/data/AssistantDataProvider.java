package com.nforceone.sync.ai.data;

import com.nforceone.sync.ai.contract.AssistantRequestContext;
import com.nforceone.sync.auth.AppUser;

import java.util.Optional;
import java.util.Set;

/**
 * One explicit, registered, read-only live-data provider. Every implementation (added in a later
 * milestone) must call exactly one actor-scoped read method on an existing Sync service, passing
 * only the caller's own identity from {@code context} — never another user's id. See
 * {@code DataProviderSafetyTest} for how that is verified, not merely assumed.
 */
public interface AssistantDataProvider {

    /** {@code "<family>.<subtype>"}, e.g. {@code "eod.today"} — the prefix before the first dot groups related providers for the diversity rule in {@link AssistantDataService}. */
    String id();

    /** Short label shown as the {@code <userdata>} section heading in the prompt. */
    String title();

    Set<AppUser.Role> audiences();

    /** Knowledge modules this provider is relevant to — an empty set would make it never eligible, which is correct until a real module is declared. */
    Set<String> modules();

    /** Empty if there's nothing to report (e.g. no pending items) — a provider with nothing to say contributes nothing, not a "nothing found" section. */
    Optional<String> fetch(AssistantRequestContext context);
}
