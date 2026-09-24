package com.nforceone.sync.ai.knowledge;

import com.nforceone.sync.ai.contract.KnowledgeDocument;

import java.util.List;

/**
 * A source of authored knowledge documents. {@code YamlKnowledgeSource} is the only
 * implementation in v1 — this interface stays open so a future source (e.g. a DB-backed authoring
 * surface) could be added later without retrieval, chunking or indexing knowing anything changed.
 */
public interface KnowledgeSource {

    /** Reported by {@code /health}'s {@code knowledgeSources} field, and used as this source's sourceRef prefix. */
    String name();

    List<KnowledgeDocument> load();
}
