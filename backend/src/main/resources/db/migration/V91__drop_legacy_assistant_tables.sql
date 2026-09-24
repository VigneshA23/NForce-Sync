-- Removes the earlier, uncommitted Employee AI Assistant module (Cerebras-based, Employee-only),
-- whose tables were applied out-of-band to this shared database via V78-V81 -- those .sql files
-- were never committed to the repo (see backend/CLAUDE.md's Flyway warning: "the DB is AHEAD of
-- this repo"). That module's source code no longer exists on dev. The new AI support assistant
-- (V92 onward) uses its own ai_* tables and does not reuse or migrate forward anything from these.
--
-- Drop order respects assistant_message's FK to assistant_conversation.
DROP TABLE IF EXISTS assistant_message;
DROP TABLE IF EXISTS assistant_conversation;
DROP TABLE IF EXISTS assistant_knowledge;
