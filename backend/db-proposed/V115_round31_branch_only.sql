-- NEON BRANCH ONLY. NOT part of V115 and never to be run on the shared database.
-- Attach legacy round 31 (entry 2357) to ONEHR piece 2608 by hand, and do NOT resolve it.

-- BEFORE: expect piece_id NULL, status NEEDS_RESPONSE.
SELECT c.id, c.eod_entry_id, c.status, c.opened_by_id, c.piece_id, p.project_id
FROM eod_clarification c
LEFT JOIN eod_project_approval p ON p.id = c.piece_id
WHERE c.id = 31;

-- UPDATE: exactly one row expected. Only matches while the round is unmapped and piece 2608 belongs to
-- the same entry.
UPDATE eod_clarification c
SET piece_id = p.id
FROM eod_project_approval p
WHERE c.id = 31
  AND c.piece_id IS NULL
  AND p.id = 2608
  AND p.eod_entry_id = c.eod_entry_id;

-- AFTER: expect piece_id = 2608, project_id = the ONEHR project, status still NEEDS_RESPONSE.
SELECT c.id, c.eod_entry_id, c.status, c.opened_by_id, c.piece_id, p.project_id
FROM eod_clarification c
LEFT JOIN eod_project_approval p ON p.id = c.piece_id
WHERE c.id = 31;
