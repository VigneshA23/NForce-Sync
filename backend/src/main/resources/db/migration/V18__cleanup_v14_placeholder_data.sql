-- Remove V14 placeholder entries superseded by V16 real data
-- Departments: "Operations" replaced by "Delivery & Operations"
DELETE FROM department WHERE name = 'Operations';

-- Locations: generic V14 entries replaced by real V16 entries
DELETE FROM location WHERE name IN ('Chennai', 'Bangalore', 'Mumbai', 'Hyderabad', 'Remote');
