package com.nforceone.sync.ai.contract;

/**
 * A validated navigation target. {@code pageId} is always a real page-registry entry that the
 * caller's role can reach and that is not a placeholder — never a model-generated URL.
 * {@code label} is always filled from the registry, never from the model.
 */
public record NavigationAction(String pageId, String label) {
}
