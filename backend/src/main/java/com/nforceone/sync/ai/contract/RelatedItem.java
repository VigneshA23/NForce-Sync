package com.nforceone.sync.ai.contract;

/** A lightweight "see also" pointer the model may attach to a response. Never a navigation target. */
public record RelatedItem(String type, String refId, String label) {
}
