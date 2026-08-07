-- V46: dev/test seed data — a realistic set of generic categories for the Team Lead test
-- account (teamlead@nforceone.com), so "My Projects" > Categories has representative data
-- beyond the ad-hoc rows created during manual verification of V45. Reuses the existing
-- project_category table and Team Lead ownership model from V45 — no schema change.
--
-- Guarded by NOT EXISTS (keyed by created_by + name, matching the table's own uniqueness
-- constraint) so this is a no-op if a category with that name already exists for this user,
-- and by an email lookup (not a hardcoded user id) so it is a no-op if the seeded account
-- doesn't exist in a given environment.
INSERT INTO project_category (project_id, name, code, description, color, status, created_by, created_at, updated_at)
SELECT NULL, cat.name, NULL, cat.description, NULL, 'ACTIVE', u.id, NOW(), NOW()
FROM app_user u
CROSS JOIN (VALUES
    ('Development',          'Feature and enhancement development work'),
    ('Testing',              'Manual and automated test execution'),
    ('Bug Fixing',           'Defect triage and resolution'),
    ('Documentation',        'Technical and user-facing documentation'),
    ('Code Review',          'Peer review of pull requests and changes'),
    ('Research & Analysis',  'Spikes, investigation, and technical analysis'),
    ('Client Support',       'Direct client communication and support requests')
) AS cat(name, description)
WHERE u.email = 'teamlead@nforceone.com'
  AND NOT EXISTS (
      SELECT 1 FROM project_category pc
      WHERE pc.created_by = u.id AND LOWER(pc.name) = LOWER(cat.name)
  );
