-- pgvector-backed knowledge index for the AI support assistant. Reached only through JDBC
-- (com.nforceone.sync.ai.index.PgVectorKnowledgeIndexRepository) -- deliberately never a JPA
-- entity, so ddl-auto=none plus Hibernate's schema validation never has to understand the
-- vector(1024) column type.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE ai_knowledge_chunk (
    id BIGSERIAL PRIMARY KEY,
    knowledge_id VARCHAR(120) NOT NULL,
    chunk_ordinal INTEGER NOT NULL DEFAULT 0,
    knowledge_type VARCHAR(20) NOT NULL,
    module VARCHAR(60),
    page_id VARCHAR(60),
    action_id VARCHAR(80),
    workflow_id VARCHAR(80),
    source_ref VARCHAR(200) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    content_hash VARCHAR(64) NOT NULL,
    embedding_model VARCHAR(60) NOT NULL,
    title VARCHAR(300) NOT NULL,
    body TEXT NOT NULL,
    metadata JSONB,
    -- mistral-embed produces 1024-dimension vectors. Changing the embed model means a new
    -- migration to alter this column width AND a full re-index -- see
    -- KnowledgeIndexRepository.EMBEDDING_DIMENSIONS, which KnowledgeIndexingService checks
    -- against the configured provider before any indexing runs.
    embedding vector(1024) NOT NULL,
    indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ai_knowledge_chunk UNIQUE (knowledge_id, chunk_ordinal),
    CONSTRAINT chk_ai_knowledge_chunk_ordinal CHECK (chunk_ordinal >= 0),
    CONSTRAINT chk_ai_knowledge_chunk_type CHECK (knowledge_type IN
        ('FOUNDATION', 'ROLE', 'MODULE', 'PAGE', 'ACTION', 'WORKFLOW', 'ERROR', 'FAQ', 'TERM'))
);

CREATE INDEX idx_ai_knowledge_chunk_knowledge ON ai_knowledge_chunk (knowledge_id);
CREATE INDEX idx_ai_knowledge_chunk_source ON ai_knowledge_chunk (source_ref);
CREATE INDEX idx_ai_knowledge_chunk_type_module ON ai_knowledge_chunk (knowledge_type, module);

-- No ANN index (e.g. HNSW) in v1. An exact scan over the expected low-hundreds of knowledge
-- chunks is fast and exact; HNSW combined with the audience EXISTS filter below can silently
-- under-return candidates before the filter ever applies. Add an ANN index only if the chunk
-- count grows past roughly 10k and a measured query-latency problem justifies the trade-off.

-- Sync's single-role model means "audience" is exactly the 8 AppUser.Role values -- no
-- OneHR-style bucket inheritance. A chunk with no audience rows is fail-closed: visible to
-- nobody, never "visible to everyone" (enforced by KnowledgeSchemaValidator at index time, and
-- by PgVectorKnowledgeIndexRepository.search returning an empty list for an empty audience set).
CREATE TABLE ai_knowledge_chunk_audience (
    chunk_id BIGINT NOT NULL REFERENCES ai_knowledge_chunk(id) ON DELETE CASCADE,
    audience VARCHAR(20) NOT NULL,
    CONSTRAINT pk_ai_knowledge_chunk_audience PRIMARY KEY (chunk_id, audience),
    CONSTRAINT chk_ai_knowledge_chunk_audience CHECK (audience IN
        ('EMPLOYEE', 'MANAGER', 'SUPERADMIN', 'PM', 'DM', 'FINANCE', 'LEADERSHIP', 'ADMIN'))
);
