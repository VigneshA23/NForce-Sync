package com.nforceone.sync.ai.contract;

import com.nforceone.sync.auth.AppUser;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * One authored knowledge unit, as loaded from YAML before chunking. Provider-independent — knows
 * nothing about Mistral, pgvector or embeddings.
 */
public record KnowledgeDocument(
        String knowledgeId,
        KnowledgeType type,
        String module,
        String pageId,
        String actionId,
        String workflowId,
        int version,
        Set<AppUser.Role> audience,
        String sourceRef,
        String title,
        String body,
        List<String> synonyms,
        List<String> sources,
        List<String> errorMessages,
        Map<String, Object> metadata
) {
    public KnowledgeDocument {
        synonyms = synonyms == null ? List.of() : List.copyOf(synonyms);
        sources = sources == null ? List.of() : List.copyOf(sources);
        errorMessages = errorMessages == null ? List.of() : List.copyOf(errorMessages);
        metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
    }

    /** Fluent construction for tests — real documents are always authored as YAML and loaded by {@code YamlKnowledgeSource}. */
    public static final class Builder {
        private String knowledgeId;
        private KnowledgeType type;
        private String module;
        private String pageId;
        private String actionId;
        private String workflowId;
        private int version = 1;
        private Set<AppUser.Role> audience = Set.of();
        private String sourceRef = "test:inline";
        private String title = "Untitled";
        private String body = "";
        private List<String> synonyms = List.of();
        private List<String> sources = List.of();
        private List<String> errorMessages = List.of();
        private Map<String, Object> metadata = Map.of();

        public Builder knowledgeId(String v) { this.knowledgeId = v; return this; }
        public Builder type(KnowledgeType v) { this.type = v; return this; }
        public Builder module(String v) { this.module = v; return this; }
        public Builder pageId(String v) { this.pageId = v; return this; }
        public Builder actionId(String v) { this.actionId = v; return this; }
        public Builder workflowId(String v) { this.workflowId = v; return this; }
        public Builder version(int v) { this.version = v; return this; }
        public Builder audience(Set<AppUser.Role> v) { this.audience = v; return this; }
        public Builder sourceRef(String v) { this.sourceRef = v; return this; }
        public Builder title(String v) { this.title = v; return this; }
        public Builder body(String v) { this.body = v; return this; }
        public Builder synonyms(List<String> v) { this.synonyms = v; return this; }
        public Builder sources(List<String> v) { this.sources = v; return this; }
        public Builder errorMessages(List<String> v) { this.errorMessages = v; return this; }
        public Builder metadata(Map<String, Object> v) { this.metadata = v; return this; }

        public KnowledgeDocument build() {
            return new KnowledgeDocument(knowledgeId, type, module, pageId, actionId, workflowId, version,
                    audience, sourceRef, title, body, synonyms, sources, errorMessages, metadata);
        }
    }
}
