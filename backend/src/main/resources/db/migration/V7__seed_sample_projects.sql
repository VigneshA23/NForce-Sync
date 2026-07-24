INSERT INTO project (code, name, client, project_type, billing_model, status, pm_id, start_date, created_at)
VALUES
    ('MER-BANK',       'Meridian Bank Platform', 'Meridian Bank',       'CLIENT',   'T_AND_M',  'ACTIVE', 1, '2026-01-15', NOW()),
    ('NORDIC-RETAIL',  'Nordic Retail Rollout',  'Nordic Retail Group', 'CLIENT',   'FIXED_BID','ACTIVE', 1, '2026-03-01', NOW()),
    ('INTERNAL-TOOLS', 'Internal Tooling',        NULL,                  'INTERNAL', NULL,       'ACTIVE', 1, '2026-02-01', NOW());
