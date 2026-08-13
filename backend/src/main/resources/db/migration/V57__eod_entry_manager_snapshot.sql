-- eod_entry visibility to a manager was always resolved live via app_user.manager_id, so
-- reassigning an employee's manager instantly moved ALL of their EOD history — pending,
-- approved, and rejected alike — to the new manager and hid it from the old one. An entry
-- should stay attributed to whoever was managing the employee at the moment they submitted it.
--
-- manager_id here is a point-in-time snapshot, set once at submission and never touched again —
-- distinct from app_user.manager_id, which keeps tracking the employee's current manager.

ALTER TABLE eod_entry ADD COLUMN manager_id BIGINT REFERENCES app_user(id);

-- Backfill: no historical record of who actually managed each employee at submission time
-- exists, so existing rows fall back to the employee's CURRENT manager. This is only accurate
-- for employees who have never been reassigned — anyone already reassigned before this
-- migration keeps their pre-existing entries under the new manager, same as today. Only entries
-- submitted after this migration ships get a true point-in-time snapshot.
UPDATE eod_entry e
   SET manager_id = u.manager_id
  FROM app_user u
 WHERE e.employee_id = u.id;

CREATE INDEX idx_eod_entry_manager_id ON eod_entry (manager_id);
