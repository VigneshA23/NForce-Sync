/**
 * A future action-execution extension point that is present, and deliberately inert. In this
 * release nothing in this package can change a single row of Sync data. That is not enforced by a
 * feature flag — a flag is a thing someone can flip. It is enforced by what does and does not
 * exist, mirroring the OneHR reference implementation's design:
 *
 * <ol>
 *   <li>{@link com.nforceone.sync.ai.action.ActionDefinition} is pure metadata with no
 *       {@code execute} method. Holding one gives a caller no way to run anything.</li>
 *   <li>There are zero implementations of {@code ActionDefinition} in {@code src/main}. The
 *       contract is defined; nothing implements it. (Asserted by
 *       {@code ActionFrameworkDisabledTest} via a classpath scan.)</li>
 *   <li>{@link com.nforceone.sync.ai.action.ActionRegistry} is {@code final} and holds
 *       {@code Map.of()}. It deliberately does not autowire a {@code List<ActionDefinition>} —
 *       bean collection would let a future {@code @Component} register itself silently.</li>
 *   <li>{@link com.nforceone.sync.ai.action.DisabledActionExecutor} is the only
 *       {@code ActionExecutor} and throws unconditionally. There is no enable flag; it ignores
 *       {@code ActionDefinition.enabled()} entirely.</li>
 *   <li>No HTTP endpoint accepts an {@link com.nforceone.sync.ai.action.ActionRequest} — not even
 *       a stub returning 501. An endpoint that looks real invites a client to start calling it.</li>
 *   <li>{@link com.nforceone.sync.ai.contract.AssistantResponse} has no action field, and any
 *       unrecognised field a model invents is dropped during response validation, not merely
 *       ignored on the wire.</li>
 *   <li>Nothing in {@code com.nforceone.sync.ai} uses reflection, SpEL, dynamic bean lookup, or
 *       model-supplied SQL or URLs. Retrieval is parameterised JDBC only; the model contributes a
 *       query string that is embedded, never interpolated. It returns a pageId, never a route.</li>
 *   <li>The assistant reaches no write. Its only writes are conversation, feedback and telemetry
 *       rows, all confined to {@code ai_*} tables (plus {@code audit_log} for Super Admin settings
 *       changes). Live-data providers ({@code ai/data}) call read-only service methods only — see
 *       that package's {@code DataProviderSafetyTest} for how that is verified, not merely assumed.</li>
 * </ol>
 *
 * <p>{@code ActionFrameworkDisabledTest} asserts every one of guarantees 1–6, so re-enabling one
 * by accident fails the build rather than shipping. See {@code docs/ai-assistant/action-execution.md}
 * for the intended future progression (read-only → intent recognition → draft → confirmation →
 * execution) — none of which is wired today.
 */
package com.nforceone.sync.ai.action;
