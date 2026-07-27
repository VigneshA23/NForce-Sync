-- Safe idempotent seed: insert only rows that don't already exist by name/title

INSERT INTO department (name)
SELECT v.name FROM (VALUES
  ('Engineering'),
  ('Human Resources'),
  ('Finance'),
  ('Delivery & Operations'),
  ('Sales & Marketing')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM department d WHERE d.name = v.name);

INSERT INTO designation (title)
SELECT v.title FROM (VALUES
  ('Software Engineer'),
  ('Senior Software Engineer'),
  ('Team Lead'),
  ('Project Manager'),
  ('Delivery Manager'),
  ('HR Executive'),
  ('HR Manager'),
  ('Finance Analyst'),
  ('Business Analyst')
) AS v(title)
WHERE NOT EXISTS (SELECT 1 FROM designation d WHERE d.title = v.title);

INSERT INTO location (name)
SELECT v.name FROM (VALUES
  ('Albany, NY (HQ)'),
  ('Remote - US'),
  ('Bengaluru, India'),
  ('Hyderabad, India')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM location l WHERE l.name = v.name);
