-- Phase 8b follow-up: widen the ai_knowledge_chunk_audience allow-list.
-- The old constraint named every AppUser.Role value. After Phase 8b removed MANAGER, DM,
-- FINANCE and LEADERSHIP, those dead role names still appear in the constraint but no longer
-- in the app. More importantly the new capability token LEADS_PROJECT must also be allowed,
-- since capability-gated knowledge chunks (audience = "LEADS_PROJECT") are inserted by the
-- reindex job for knowledge units that gate on a runtime capability rather than a static role.

ALTER TABLE ai_knowledge_chunk_audience
    DROP CONSTRAINT IF EXISTS chk_ai_knowledge_chunk_audience;

ALTER TABLE ai_knowledge_chunk_audience
    ADD CONSTRAINT chk_ai_knowledge_chunk_audience CHECK (
        audience IN ('EMPLOYEE', 'PM', 'ADMIN', 'SUPERADMIN', 'LEADS_PROJECT')
    );

-- Remove any stale audience rows for the now-removed roles so they do not occupy index slots
-- and get retrieved for roles that no longer exist.
DELETE FROM ai_knowledge_chunk_audience
WHERE audience IN ('MANAGER', 'DM', 'FINANCE', 'LEADERSHIP');
