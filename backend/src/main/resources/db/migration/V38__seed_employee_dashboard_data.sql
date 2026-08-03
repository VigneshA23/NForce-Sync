-- V38: Seed ~4 weeks of realistic EOD history for employee@nforceone.com (id=2)
-- Employee: id=2 | Manager (Team Lead): id=3
-- Projects used: INTERNAL-TOOLS(id=3), NForce Sync(id=4)
-- Date range: 2026-07-07 to 2026-08-01 (20 weekdays)
-- Covers: approved, missed, rejected-then-approved, changes_requested-then-approved, blocked tasks

DO $$
DECLARE
  v_emp   BIGINT := 2;
  v_mgr   BIGINT := 3;
  v_sync  BIGINT := 4;
  v_tools BIGINT := 3;
  eid     BIGINT;
  n_rows  INTEGER;
BEGIN

  -- ── 2026-07-07 Mon NEW APPROVED util=100% ────────────────────────────────
  INSERT INTO eod_entry (employee_id, entry_date, status, work_location, next_day_plan, remarks, submitted_at, created_at, updated_at)
  VALUES (v_emp, '2026-07-07', 'APPROVED', 'WFH',
          'Continue SYNC auth work and review remaining PRs',
          'Completed auth middleware implementation, all unit tests passing.',
          '2026-07-07 11:30:00+00', '2026-07-07 09:00:00+00', '2026-07-07 17:00:00+00')
  ON CONFLICT (employee_id, entry_date) DO NOTHING;
  GET DIAGNOSTICS n_rows = ROW_COUNT;
  IF n_rows > 0 THEN
    SELECT id INTO eid FROM eod_entry WHERE employee_id = v_emp AND entry_date = '2026-07-07';
    INSERT INTO eod_task (eod_entry_id, project_id, task_category_id, description, hours, task_status, is_billable)
    VALUES
      (eid, v_sync,  8,  'Implemented JWT refresh token middleware for REST API', 5.00, 'COMPLETED', true),
      (eid, v_sync,  9,  'Reviewed PR #47 - API gateway auth refactor', 2.00, 'COMPLETED', true),
      (eid, v_sync,  13, 'Updated Swagger docs for auth endpoints', 1.00, 'COMPLETED', false);
    INSERT INTO approval_action (eod_entry_id, actor_id, action, comment, acted_at)
    VALUES (eid, v_mgr, 'APPROVE', NULL, '2026-07-07 17:00:00+00');
    INSERT INTO util_snapshot (employee_id, snapshot_date, available_hours, approved_productive_hours, billable_hours, non_billable_hours, bench_hours, idle_hours, utilization_pct, computed_at)
    VALUES (v_emp, '2026-07-07', 8.00, 8.00, 7.00, 1.00, 0.00, 0.00, 100.00, '2026-07-07 17:00:00+00')
    ON CONFLICT (employee_id, snapshot_date) DO NOTHING;
  END IF;

  -- ── 2026-07-08 Wed EXISTING SUBMITTED→APPROVED util=37.5% ────────────────
  UPDATE eod_entry SET status = 'APPROVED', updated_at = '2026-07-08 17:10:00+00'
  WHERE employee_id = v_emp AND entry_date = '2026-07-08' AND status = 'SUBMITTED';
  SELECT id INTO eid FROM eod_entry WHERE employee_id = v_emp AND entry_date = '2026-07-08';
  IF eid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM approval_action WHERE eod_entry_id = eid AND action = 'APPROVE'
  ) THEN
    INSERT INTO approval_action (eod_entry_id, actor_id, action, comment, acted_at)
    VALUES (eid, v_mgr, 'APPROVE', NULL, '2026-07-08 17:10:00+00');
  END IF;
  INSERT INTO util_snapshot (employee_id, snapshot_date, available_hours, approved_productive_hours, billable_hours, non_billable_hours, bench_hours, idle_hours, utilization_pct, computed_at)
  VALUES (v_emp, '2026-07-08', 8.00, 3.00, 3.00, 0.00, 0.00, 5.00, 37.50, '2026-07-08 17:10:00+00')
  ON CONFLICT (employee_id, snapshot_date) DO NOTHING;

  -- ── 2026-07-09 Wed NEW APPROVED util=87.5% ───────────────────────────────
  INSERT INTO eod_entry (employee_id, entry_date, status, work_location, next_day_plan, remarks, submitted_at, created_at, updated_at)
  VALUES (v_emp, '2026-07-09', 'APPROVED', 'Office',
          'Start on notification service integration',
          'Good sprint progress. Sprint planning ran long but alignment achieved.',
          '2026-07-09 12:00:00+00', '2026-07-09 09:00:00+00', '2026-07-09 17:05:00+00')
  ON CONFLICT (employee_id, entry_date) DO NOTHING;
  GET DIAGNOSTICS n_rows = ROW_COUNT;
  IF n_rows > 0 THEN
    SELECT id INTO eid FROM eod_entry WHERE employee_id = v_emp AND entry_date = '2026-07-09';
    INSERT INTO eod_task (eod_entry_id, project_id, task_category_id, description, hours, task_status, is_billable)
    VALUES
      (eid, v_sync,  8,  'Developed notification service module scaffolding', 4.00, 'COMPLETED', true),
      (eid, v_sync,  12, 'Sprint planning session and backlog refinement', 2.00, 'COMPLETED', false),
      (eid, v_tools, 1,  'Requirements gathering for internal tools dashboard', 1.00, 'COMPLETED', true);
    INSERT INTO approval_action (eod_entry_id, actor_id, action, comment, acted_at)
    VALUES (eid, v_mgr, 'APPROVE', NULL, '2026-07-09 17:05:00+00');
    INSERT INTO util_snapshot (employee_id, snapshot_date, available_hours, approved_productive_hours, billable_hours, non_billable_hours, bench_hours, idle_hours, utilization_pct, computed_at)
    VALUES (v_emp, '2026-07-09', 8.00, 7.00, 5.00, 2.00, 0.00, 1.00, 87.50, '2026-07-09 17:05:00+00')
    ON CONFLICT (employee_id, snapshot_date) DO NOTHING;
  END IF;

  -- ── 2026-07-10 Thu NEW APPROVED util=112.5% (over-utilized day) ──────────
  INSERT INTO eod_entry (employee_id, entry_date, status, work_location, next_day_plan, remarks, submitted_at, created_at, updated_at)
  VALUES (v_emp, '2026-07-10', 'APPROVED', 'WFH',
          'Wrap up notification service and write unit tests',
          'Long day - critical deadline pushed everything. Over hours but worth it to unblock the team.',
          '2026-07-10 14:30:00+00', '2026-07-10 08:30:00+00', '2026-07-10 17:30:00+00')
  ON CONFLICT (employee_id, entry_date) DO NOTHING;
  GET DIAGNOSTICS n_rows = ROW_COUNT;
  IF n_rows > 0 THEN
    SELECT id INTO eid FROM eod_entry WHERE employee_id = v_emp AND entry_date = '2026-07-10';
    INSERT INTO eod_task (eod_entry_id, project_id, task_category_id, description, hours, task_status, is_billable)
    VALUES
      (eid, v_sync,  8,  'Completed notification service with Resend integration', 5.00, 'COMPLETED', true),
      (eid, v_tools, 18, 'Built internal dashboard data pipeline', 2.00, 'COMPLETED', true),
      (eid, v_sync,  9,  'Code review for 3 open PRs before sprint close', 1.00, 'COMPLETED', true),
      (eid, v_sync,  13, 'Sprint retrospective notes and action items', 1.00, 'COMPLETED', false);
    INSERT INTO approval_action (eod_entry_id, actor_id, action, comment, acted_at)
    VALUES (eid, v_mgr, 'APPROVE', NULL, '2026-07-10 17:30:00+00');
    INSERT INTO util_snapshot (employee_id, snapshot_date, available_hours, approved_productive_hours, billable_hours, non_billable_hours, bench_hours, idle_hours, utilization_pct, computed_at)
    VALUES (v_emp, '2026-07-10', 8.00, 9.00, 8.00, 1.00, 0.00, 0.00, 112.50, '2026-07-10 17:30:00+00')
    ON CONFLICT (employee_id, snapshot_date) DO NOTHING;
  END IF;

  -- ── 2026-07-11 Fri NEW APPROVED util=75% with BLOCKED task ──────────────
  INSERT INTO eod_entry (employee_id, entry_date, status, work_location, next_day_plan, remarks, submitted_at, created_at, updated_at)
  VALUES (v_emp, '2026-07-11', 'APPROVED', 'Office',
          'Follow up on infra ticket, continue automation scripting',
          'Production support blocked on infra access. Switched to scripting to stay productive.',
          '2026-07-11 12:30:00+00', '2026-07-11 09:00:00+00', '2026-07-11 17:00:00+00')
  ON CONFLICT (employee_id, entry_date) DO NOTHING;
  GET DIAGNOSTICS n_rows = ROW_COUNT;
  IF n_rows > 0 THEN
    SELECT id INTO eid FROM eod_entry WHERE employee_id = v_emp AND entry_date = '2026-07-11';
    INSERT INTO eod_task (eod_entry_id, project_id, task_category_id, description, hours, task_status, is_billable)
    VALUES
      (eid, v_sync,  6,  'Automation test scripts for login and EOD submission flows', 3.50, 'COMPLETED', true),
      (eid, v_sync,  12, 'Cross-team sync meeting and weekly status update', 1.50, 'COMPLETED', false);
    INSERT INTO eod_task (eod_entry_id, project_id, task_category_id, description, hours, task_status, is_billable, blocker_reason)
    VALUES (eid, v_tools, 10, 'Investigate prod API timeout issue', 1.00, 'BLOCKED', true,
            'Dependent service API unresponsive - escalated to infra team as JIRA INF-2301');
    INSERT INTO approval_action (eod_entry_id, actor_id, action, comment, acted_at)
    VALUES (eid, v_mgr, 'APPROVE', NULL, '2026-07-11 17:00:00+00');
    INSERT INTO util_snapshot (employee_id, snapshot_date, available_hours, approved_productive_hours, billable_hours, non_billable_hours, bench_hours, idle_hours, utilization_pct, computed_at)
    VALUES (v_emp, '2026-07-11', 8.00, 6.00, 4.50, 1.50, 0.00, 2.00, 75.00, '2026-07-11 17:00:00+00')
    ON CONFLICT (employee_id, snapshot_date) DO NOTHING;
  END IF;

  -- ── 2026-07-14 Mon NEW APPROVED util=100% ────────────────────────────────
  INSERT INTO eod_entry (employee_id, entry_date, status, work_location, next_day_plan, remarks, submitted_at, created_at, updated_at)
  VALUES (v_emp, '2026-07-14', 'APPROVED', 'WFH',
          'Start on EOD history page and utilization charts',
          'Clean sprint start. All tasks completed on schedule.',
          '2026-07-14 11:45:00+00', '2026-07-14 09:00:00+00', '2026-07-14 17:00:00+00')
  ON CONFLICT (employee_id, entry_date) DO NOTHING;
  GET DIAGNOSTICS n_rows = ROW_COUNT;
  IF n_rows > 0 THEN
    SELECT id INTO eid FROM eod_entry WHERE employee_id = v_emp AND entry_date = '2026-07-14';
    INSERT INTO eod_task (eod_entry_id, project_id, task_category_id, description, hours, task_status, is_billable)
    VALUES
      (eid, v_sync,  8,  'Built EOD history table with filtering and pagination', 4.00, 'COMPLETED', true),
      (eid, v_sync,  6,  'Automation test coverage for approval workflow', 2.00, 'COMPLETED', true),
      (eid, v_sync,  9,  'Reviewed team PRs for the new profile page', 1.00, 'COMPLETED', true),
      (eid, v_sync,  12, 'Monday standup and sprint backlog review', 1.00, 'COMPLETED', false);
    INSERT INTO approval_action (eod_entry_id, actor_id, action, comment, acted_at)
    VALUES (eid, v_mgr, 'APPROVE', NULL, '2026-07-14 17:00:00+00');
    INSERT INTO util_snapshot (employee_id, snapshot_date, available_hours, approved_productive_hours, billable_hours, non_billable_hours, bench_hours, idle_hours, utilization_pct, computed_at)
    VALUES (v_emp, '2026-07-14', 8.00, 8.00, 7.00, 1.00, 0.00, 0.00, 100.00, '2026-07-14 17:00:00+00')
    ON CONFLICT (employee_id, snapshot_date) DO NOTHING;
  END IF;

  -- ── 2026-07-15 Tue NEW APPROVED util=87.5% ───────────────────────────────
  INSERT INTO eod_entry (employee_id, entry_date, status, work_location, next_day_plan, remarks, submitted_at, created_at, updated_at)
  VALUES (v_emp, '2026-07-15', 'APPROVED', 'Office',
          'Continue utilization charts and add KT session notes',
          'KT session on the legacy allocation module took longer than planned.',
          '2026-07-15 12:15:00+00', '2026-07-15 09:00:00+00', '2026-07-15 17:05:00+00')
  ON CONFLICT (employee_id, entry_date) DO NOTHING;
  GET DIAGNOSTICS n_rows = ROW_COUNT;
  IF n_rows > 0 THEN
    SELECT id INTO eid FROM eod_entry WHERE employee_id = v_emp AND entry_date = '2026-07-15';
    INSERT INTO eod_task (eod_entry_id, project_id, task_category_id, description, hours, task_status, is_billable)
    VALUES
      (eid, v_sync,  8,  'Implemented utilization trend chart with Recharts', 3.00, 'COMPLETED', true),
      (eid, v_sync,  3,  'Ran regression tests on approval workflow changes', 2.00, 'COMPLETED', true),
      (eid, v_sync,  13, 'Wrote test case documentation for Q2 QA review', 1.00, 'COMPLETED', false),
      (eid, v_sync,  14, 'Knowledge transfer session on allocation module history', 1.00, 'COMPLETED', false);
    INSERT INTO approval_action (eod_entry_id, actor_id, action, comment, acted_at)
    VALUES (eid, v_mgr, 'APPROVE', NULL, '2026-07-15 17:05:00+00');
    INSERT INTO util_snapshot (employee_id, snapshot_date, available_hours, approved_productive_hours, billable_hours, non_billable_hours, bench_hours, idle_hours, utilization_pct, computed_at)
    VALUES (v_emp, '2026-07-15', 8.00, 7.00, 5.00, 2.00, 0.00, 1.00, 87.50, '2026-07-15 17:05:00+00')
    ON CONFLICT (employee_id, snapshot_date) DO NOTHING;
  END IF;

  -- ── 2026-07-16 Wed NEW MISSED (never submitted) ───────────────────────────
  INSERT INTO eod_entry (employee_id, entry_date, status, work_location, next_day_plan, remarks, submitted_at, created_at, updated_at)
  VALUES (v_emp, '2026-07-16', 'MISSED', NULL, NULL, NULL, NULL, '2026-07-17 09:00:00+00', '2026-07-17 09:00:00+00')
  ON CONFLICT (employee_id, entry_date) DO NOTHING;

  -- ── 2026-07-17 Thu EXISTING SUBMITTED→APPROVED util=62.5% ────────────────
  UPDATE eod_entry SET status = 'APPROVED', updated_at = '2026-07-17 17:20:00+00'
  WHERE employee_id = v_emp AND entry_date = '2026-07-17' AND status = 'SUBMITTED';
  SELECT id INTO eid FROM eod_entry WHERE employee_id = v_emp AND entry_date = '2026-07-17';
  IF eid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM approval_action WHERE eod_entry_id = eid AND action = 'APPROVE'
  ) THEN
    INSERT INTO approval_action (eod_entry_id, actor_id, action, comment, acted_at)
    VALUES (eid, v_mgr, 'APPROVE', NULL, '2026-07-17 17:20:00+00');
  END IF;
  INSERT INTO util_snapshot (employee_id, snapshot_date, available_hours, approved_productive_hours, billable_hours, non_billable_hours, bench_hours, idle_hours, utilization_pct, computed_at)
  VALUES (v_emp, '2026-07-17', 8.00, 5.00, 5.00, 0.00, 0.00, 3.00, 62.50, '2026-07-17 17:20:00+00')
  ON CONFLICT (employee_id, snapshot_date) DO NOTHING;

  -- ── 2026-07-18 Fri NEW APPROVED (REJECTED once then re-approved) util=87.5%
  INSERT INTO eod_entry (employee_id, entry_date, status, work_location, next_day_plan, remarks, submitted_at, created_at, updated_at)
  VALUES (v_emp, '2026-07-18', 'APPROVED', 'WFH',
          'Profile page polish and change password flow',
          'Updated after feedback - added missing task hours breakdown.',
          '2026-07-18 14:00:00+00', '2026-07-18 09:00:00+00', '2026-07-18 16:30:00+00')
  ON CONFLICT (employee_id, entry_date) DO NOTHING;
  GET DIAGNOSTICS n_rows = ROW_COUNT;
  IF n_rows > 0 THEN
    SELECT id INTO eid FROM eod_entry WHERE employee_id = v_emp AND entry_date = '2026-07-18';
    INSERT INTO eod_task (eod_entry_id, project_id, task_category_id, description, hours, task_status, is_billable)
    VALUES
      (eid, v_sync,  8,  'Profile page redesign - avatar upload and edit flow', 5.00, 'COMPLETED', true),
      (eid, v_sync,  13, 'Updated component documentation and storybook entries', 2.00, 'COMPLETED', false);
    -- Rejection first (manager rejected original submission)
    INSERT INTO approval_action (eod_entry_id, actor_id, action, comment, acted_at)
    VALUES (eid, v_mgr, 'REJECT', 'Hours breakdown unclear - please split development and documentation separately', '2026-07-18 12:00:00+00');
    -- Employee resubmitted, then approved
    INSERT INTO approval_action (eod_entry_id, actor_id, action, comment, acted_at)
    VALUES (eid, v_mgr, 'APPROVE', NULL, '2026-07-18 16:30:00+00');
    INSERT INTO util_snapshot (employee_id, snapshot_date, available_hours, approved_productive_hours, billable_hours, non_billable_hours, bench_hours, idle_hours, utilization_pct, computed_at)
    VALUES (v_emp, '2026-07-18', 8.00, 7.00, 5.00, 2.00, 0.00, 1.00, 87.50, '2026-07-18 16:30:00+00')
    ON CONFLICT (employee_id, snapshot_date) DO NOTHING;
  END IF;

  -- ── 2026-07-21 Mon NEW APPROVED util=100% ────────────────────────────────
  INSERT INTO eod_entry (employee_id, entry_date, status, work_location, next_day_plan, remarks, submitted_at, created_at, updated_at)
  VALUES (v_emp, '2026-07-21', 'APPROVED', 'Office',
          'Finalize change password flow and start notifications page',
          'Solid week start. Sprint velocity on track.',
          '2026-07-21 11:30:00+00', '2026-07-21 09:00:00+00', '2026-07-21 17:00:00+00')
  ON CONFLICT (employee_id, entry_date) DO NOTHING;
  GET DIAGNOSTICS n_rows = ROW_COUNT;
  IF n_rows > 0 THEN
    SELECT id INTO eid FROM eod_entry WHERE employee_id = v_emp AND entry_date = '2026-07-21';
    INSERT INTO eod_task (eod_entry_id, project_id, task_category_id, description, hours, task_status, is_billable)
    VALUES
      (eid, v_sync,  8,  'Implemented change password flow with strength meter', 3.00, 'COMPLETED', true),
      (eid, v_sync,  6,  'Automated E2E tests for auth screens', 3.00, 'COMPLETED', true),
      (eid, v_sync,  9,  'Reviewed notification backend implementation PR', 1.00, 'COMPLETED', true),
      (eid, v_tools, 12, 'Internal product sync with stakeholders', 1.00, 'COMPLETED', false);
    INSERT INTO approval_action (eod_entry_id, actor_id, action, comment, acted_at)
    VALUES (eid, v_mgr, 'APPROVE', NULL, '2026-07-21 17:00:00+00');
    INSERT INTO util_snapshot (employee_id, snapshot_date, available_hours, approved_productive_hours, billable_hours, non_billable_hours, bench_hours, idle_hours, utilization_pct, computed_at)
    VALUES (v_emp, '2026-07-21', 8.00, 8.00, 7.00, 1.00, 0.00, 0.00, 100.00, '2026-07-21 17:00:00+00')
    ON CONFLICT (employee_id, snapshot_date) DO NOTHING;
  END IF;

  -- ── 2026-07-22 Tue NEW APPROVED util=75% ─────────────────────────────────
  INSERT INTO eod_entry (employee_id, entry_date, status, work_location, next_day_plan, remarks, submitted_at, created_at, updated_at)
  VALUES (v_emp, '2026-07-22', 'APPROVED', 'WFH',
          'Notifications page and learning session on React Query v5',
          'Took some time upskilling on React Query optimistic updates.',
          '2026-07-22 12:45:00+00', '2026-07-22 09:00:00+00', '2026-07-22 17:00:00+00')
  ON CONFLICT (employee_id, entry_date) DO NOTHING;
  GET DIAGNOSTICS n_rows = ROW_COUNT;
  IF n_rows > 0 THEN
    SELECT id INTO eid FROM eod_entry WHERE employee_id = v_emp AND entry_date = '2026-07-22';
    INSERT INTO eod_task (eod_entry_id, project_id, task_category_id, description, hours, task_status, is_billable)
    VALUES
      (eid, v_sync,  6,  'Built notification row component with read/unread states', 3.00, 'COMPLETED', true),
      (eid, v_sync,  4,  'Logged and triaged 4 defects from QA regression run', 1.00, 'COMPLETED', true),
      (eid, v_sync,  12, 'Team retrospective and velocity planning', 1.00, 'COMPLETED', false),
      (eid, v_sync,  15, 'Self-study: React Query v5 optimistic updates patterns', 1.00, 'COMPLETED', false);
    INSERT INTO approval_action (eod_entry_id, actor_id, action, comment, acted_at)
    VALUES (eid, v_mgr, 'APPROVE', NULL, '2026-07-22 17:00:00+00');
    INSERT INTO util_snapshot (employee_id, snapshot_date, available_hours, approved_productive_hours, billable_hours, non_billable_hours, bench_hours, idle_hours, utilization_pct, computed_at)
    VALUES (v_emp, '2026-07-22', 8.00, 6.00, 4.00, 2.00, 0.00, 2.00, 75.00, '2026-07-22 17:00:00+00')
    ON CONFLICT (employee_id, snapshot_date) DO NOTHING;
  END IF;

  -- ── 2026-07-23 Wed NEW APPROVED util=106.25% with BLOCKED task ───────────
  INSERT INTO eod_entry (employee_id, entry_date, status, work_location, next_day_plan, remarks, submitted_at, created_at, updated_at)
  VALUES (v_emp, '2026-07-23', 'APPROVED', 'Office',
          'Chase prod DB access, continue notifications and profile polish',
          'Prod DB replica issue blocked support task. Pivoted to feature work to stay productive.',
          '2026-07-23 13:00:00+00', '2026-07-23 08:30:00+00', '2026-07-23 17:30:00+00')
  ON CONFLICT (employee_id, entry_date) DO NOTHING;
  GET DIAGNOSTICS n_rows = ROW_COUNT;
  IF n_rows > 0 THEN
    SELECT id INTO eid FROM eod_entry WHERE employee_id = v_emp AND entry_date = '2026-07-23';
    INSERT INTO eod_task (eod_entry_id, project_id, task_category_id, description, hours, task_status, is_billable)
    VALUES
      (eid, v_sync,  8,  'Implemented notification pagination and mark-all-read', 5.00, 'COMPLETED', true),
      (eid, v_sync,  9,  'Code review for profile photo upload feature', 2.00, 'COMPLETED', true),
      (eid, v_sync,  13, 'Technical spec document for EOD calendar heatmap', 1.00, 'COMPLETED', false);
    INSERT INTO eod_task (eod_entry_id, project_id, task_category_id, description, hours, task_status, is_billable, blocker_reason)
    VALUES (eid, v_tools, 10, 'Investigate prod DB replica read timeout', 0.50, 'BLOCKED', true,
            'Prod DB replica lag causing read timeouts; awaiting DBA escalation - ticket OPS-7821');
    INSERT INTO approval_action (eod_entry_id, actor_id, action, comment, acted_at)
    VALUES (eid, v_mgr, 'APPROVE', NULL, '2026-07-23 17:30:00+00');
    INSERT INTO util_snapshot (employee_id, snapshot_date, available_hours, approved_productive_hours, billable_hours, non_billable_hours, bench_hours, idle_hours, utilization_pct, computed_at)
    VALUES (v_emp, '2026-07-23', 8.00, 8.50, 7.50, 1.00, 0.00, 0.00, 106.25, '2026-07-23 17:30:00+00')
    ON CONFLICT (employee_id, snapshot_date) DO NOTHING;
  END IF;

  -- ── 2026-07-24 Thu EXISTING APPROVED util=50% (snapshot exists, skip) ────
  -- Already approved with snapshot. No action needed.

  -- ── 2026-07-25 Fri NEW APPROVED util=87.5% ───────────────────────────────
  INSERT INTO eod_entry (employee_id, entry_date, status, work_location, next_day_plan, remarks, submitted_at, created_at, updated_at)
  VALUES (v_emp, '2026-07-25', 'APPROVED', 'WFH',
          'Weekend break - resume with profile page final polish on Monday',
          'Wrapped up sprint deliverables. Good week overall.',
          '2026-07-25 12:00:00+00', '2026-07-25 09:00:00+00', '2026-07-25 17:10:00+00')
  ON CONFLICT (employee_id, entry_date) DO NOTHING;
  GET DIAGNOSTICS n_rows = ROW_COUNT;
  IF n_rows > 0 THEN
    SELECT id INTO eid FROM eod_entry WHERE employee_id = v_emp AND entry_date = '2026-07-25';
    INSERT INTO eod_task (eod_entry_id, project_id, task_category_id, description, hours, task_status, is_billable)
    VALUES
      (eid, v_sync,  8,  'Profile page final polish - dark/light mode fixes', 4.00, 'COMPLETED', true),
      (eid, v_sync,  2,  'Created test plan for profile and notifications features', 1.00, 'COMPLETED', true),
      (eid, v_sync,  13, 'Updated deployment runbook for prod release', 1.00, 'COMPLETED', false),
      (eid, v_sync,  12, 'Sprint demo prep and stakeholder walk-through', 1.00, 'COMPLETED', false);
    INSERT INTO approval_action (eod_entry_id, actor_id, action, comment, acted_at)
    VALUES (eid, v_mgr, 'APPROVE', NULL, '2026-07-25 17:10:00+00');
    INSERT INTO util_snapshot (employee_id, snapshot_date, available_hours, approved_productive_hours, billable_hours, non_billable_hours, bench_hours, idle_hours, utilization_pct, computed_at)
    VALUES (v_emp, '2026-07-25', 8.00, 7.00, 5.00, 2.00, 0.00, 1.00, 87.50, '2026-07-25 17:10:00+00')
    ON CONFLICT (employee_id, snapshot_date) DO NOTHING;
  END IF;

  -- ── 2026-07-28 Mon NEW APPROVED (CHANGES_REQUESTED then approved) util=100%
  INSERT INTO eod_entry (employee_id, entry_date, status, work_location, next_day_plan, remarks, submitted_at, created_at, updated_at)
  VALUES (v_emp, '2026-07-28', 'APPROVED', 'Office',
          'Start on employee dashboard page - cutoff banner and quick stats',
          'Updated task descriptions after feedback. All good now.',
          '2026-07-28 14:15:00+00', '2026-07-28 09:00:00+00', '2026-07-28 17:00:00+00')
  ON CONFLICT (employee_id, entry_date) DO NOTHING;
  GET DIAGNOSTICS n_rows = ROW_COUNT;
  IF n_rows > 0 THEN
    SELECT id INTO eid FROM eod_entry WHERE employee_id = v_emp AND entry_date = '2026-07-28';
    INSERT INTO eod_task (eod_entry_id, project_id, task_category_id, description, hours, task_status, is_billable)
    VALUES
      (eid, v_sync,  8,  'Began employee dashboard layout with quick stats tiles', 4.00, 'COMPLETED', true),
      (eid, v_sync,  9,  'Reviewed backend PR for profile controller Transactional fix', 2.00, 'COMPLETED', true),
      (eid, v_sync,  12, 'Monday standup, sprint planning and task breakdowns', 2.00, 'COMPLETED', false);
    -- Manager requested changes first
    INSERT INTO approval_action (eod_entry_id, actor_id, action, comment, acted_at)
    VALUES (eid, v_mgr, 'REQUEST_CHANGES', 'Please add more detail to task descriptions so the client can understand the scope', '2026-07-28 13:00:00+00');
    -- Then approved after resubmission
    INSERT INTO approval_action (eod_entry_id, actor_id, action, comment, acted_at)
    VALUES (eid, v_mgr, 'APPROVE', NULL, '2026-07-28 17:00:00+00');
    INSERT INTO util_snapshot (employee_id, snapshot_date, available_hours, approved_productive_hours, billable_hours, non_billable_hours, bench_hours, idle_hours, utilization_pct, computed_at)
    VALUES (v_emp, '2026-07-28', 8.00, 8.00, 6.00, 2.00, 0.00, 0.00, 100.00, '2026-07-28 17:00:00+00')
    ON CONFLICT (employee_id, snapshot_date) DO NOTHING;
  END IF;

  -- ── 2026-07-29 Tue EXISTING SUBMITTED→APPROVED util=162.5% (over-utilized!)
  UPDATE eod_entry SET status = 'APPROVED', updated_at = '2026-07-29 17:30:00+00'
  WHERE employee_id = v_emp AND entry_date = '2026-07-29' AND status = 'SUBMITTED';
  SELECT id INTO eid FROM eod_entry WHERE employee_id = v_emp AND entry_date = '2026-07-29';
  IF eid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM approval_action WHERE eod_entry_id = eid AND action = 'APPROVE'
  ) THEN
    INSERT INTO approval_action (eod_entry_id, actor_id, action, comment, acted_at)
    VALUES (eid, v_mgr, 'APPROVE', 'Exceptional effort noted - please ensure sustainable pace going forward', '2026-07-29 17:30:00+00');
  END IF;
  INSERT INTO util_snapshot (employee_id, snapshot_date, available_hours, approved_productive_hours, billable_hours, non_billable_hours, bench_hours, idle_hours, utilization_pct, computed_at)
  VALUES (v_emp, '2026-07-29', 8.00, 13.00, 13.00, 0.00, 0.00, 0.00, 162.50, '2026-07-29 17:30:00+00')
  ON CONFLICT (employee_id, snapshot_date) DO NOTHING;

  -- ── 2026-07-30 Wed EXISTING CHANGES_REQUESTED (leave as-is for realism) ──
  -- Entry id=5 in CHANGES_REQUESTED - realistic: employee still needs to resubmit.
  -- No util_snapshot (correct: only APPROVED entries produce snapshots).

  -- ── 2026-07-31 Thu EXISTING APPROVED util=37.5% (snapshot exists) ────────
  -- Snapshot already exists from prior approval. No action needed.

  -- ── 2026-08-01 Fri NEW APPROVED util=100% ────────────────────────────────
  INSERT INTO eod_entry (employee_id, entry_date, status, work_location, next_day_plan, remarks, submitted_at, created_at, updated_at)
  VALUES (v_emp, '2026-08-01', 'APPROVED', 'WFH',
          'Calendar heatmap implementation and data layer wiring',
          'Good end to the week. Dashboard taking shape.',
          '2026-08-01 12:00:00+00', '2026-08-01 09:00:00+00', '2026-08-01 17:00:00+00')
  ON CONFLICT (employee_id, entry_date) DO NOTHING;
  GET DIAGNOSTICS n_rows = ROW_COUNT;
  IF n_rows > 0 THEN
    SELECT id INTO eid FROM eod_entry WHERE employee_id = v_emp AND entry_date = '2026-08-01';
    INSERT INTO eod_task (eod_entry_id, project_id, task_category_id, description, hours, task_status, is_billable)
    VALUES
      (eid, v_sync,  8,  'Employee dashboard - calendar heatmap with status coloring', 4.00, 'COMPLETED', true),
      (eid, v_sync,  6,  'Automated test scripts for dashboard data endpoints', 2.00, 'COMPLETED', true),
      (eid, v_sync,  9,  'Code review for utilization chart component PR', 1.00, 'COMPLETED', true),
      (eid, v_sync,  12, 'Friday all-hands and weekly retrospective', 1.00, 'COMPLETED', false);
    INSERT INTO approval_action (eod_entry_id, actor_id, action, comment, acted_at)
    VALUES (eid, v_mgr, 'APPROVE', NULL, '2026-08-01 17:00:00+00');
    INSERT INTO util_snapshot (employee_id, snapshot_date, available_hours, approved_productive_hours, billable_hours, non_billable_hours, bench_hours, idle_hours, utilization_pct, computed_at)
    VALUES (v_emp, '2026-08-01', 8.00, 8.00, 7.00, 1.00, 0.00, 0.00, 100.00, '2026-08-01 17:00:00+00')
    ON CONFLICT (employee_id, snapshot_date) DO NOTHING;
  END IF;

END $$;
