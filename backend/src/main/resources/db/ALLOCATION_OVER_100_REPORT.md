# Existing allocation data exceeding the new 100% cap

Generated while implementing the "employee total allocation % cannot exceed 100%" rule
(AllocationService.requireWithinCapacity). **Not a migration — informational only, not run by
Flyway.** No allocation rows were changed to produce this or in response to it.

## Why this data exists

Every allocation row created before V61 (`allocation_pct`'s introduction) was backfilled to
`100` ("every allocation counts as full-time" was the model at the time — see V61's own comment:
*"PMs can edit individual rows down afterward"*). Nobody has gone back and edited those rows down,
so any employee holding more than one concurrent allocation from that era already sums past 100%,
and a few PM-created rows since then have compounded it. This is expected historical data debt
from a real product-modeling change, not corruption — there is no way to infer from the data alone
what each employee's *intended* per-project share should have been, so no automatic correction is
applied. The new rule is enforced only going forward, on create/update; these existing rows are
left exactly as they are.

## Employees currently over 100% (as of 2026-08-22, computed as max concurrent overlapping sum)

| employee_id | name | max overlapping total | allocations |
|---|---|---|---|
| 13 | Arjun Mehta (NF-01013) | 400% | NORDIC-RETAIL 100% (28-07-2026→open), SYNC 100% (29-07-2026→open), PULSE 100% (29-07-2026→open), TEST PROJECT 100% (31-07-2026→01-08-2026) |
| 2 | Employee User (NF-01002) | 350% | SYNC 100% (01-07-2026→open), PULSE 100% (01-08-2026→open), OHR 100% (10-08-2026→open), TES-12 50% (14-08-2026→open) |
| 49 | Sai Ganesh Rodda (NF-20240071) | 300% | SYNC 100% (01-06-2026→open), PULSE 100% (01-07-2026→open), OHR 100% (11-08-2026→open) |
| 3 | Team Lead (NF-01003) | 300% | SYNC 100% (07-08-2026→open), NORDIC-RETAIL 100% (07-08-2026→open), INTERNAL-TOOLS 100% (07-08-2026→open) |
| 57 | Jaspreet Kour (NF-20250095) | 264% | OHR 100% (11-08-2026→open), SYNC 100% (11-08-2026→11-11-2031), PULSE 43% (17-08-2026→09-09-2032), INTERNAL-TOOLS 21% (21-08-2026→open) |
| 56 | AShruthi (NF-20240033) | 260% | INTERNAL-TOOLS 100% (07-08-2026→30-11-2026), PULSE 100% (11-08-2026→open), OHR 60% (14-08-2026→open) |
| 53 | sravani (NF-99876567) | 200% | INTERNAL-TOOLS 100% (03-07-2026→open), SYNC 100% (08-07-2026→open) |
| 55 | Akhila (NF-20250099) | 200% | SYNC 100% (07-07-2026→open), INTERNAL-TOOLS 100% (05-08-2026→open) |
| 58 | Siri (NF-20240031) | 180% | OHR 60% (01-08-2026→31-08-2026), SYNC 100% (10-08-2026→open), PULSE 20% (20-08-2026→open) |

## Rows that also violate the new "multiple of 10" rule

| allocation_id | employee | project | allocation_pct |
|---|---|---|---|
| 64 | Jaspreet Kour (57) | PULSE | 43% |
| 74 | Jaspreet Kour (57) | INTERNAL-TOOLS | 21% |

## Recommended remediation (manual — not applied automatically)

For each employee above, a PM should review their actual current project commitments and edit
the *individual* allocation rows down to percentages that (a) are multiples of 10 and (b) sum to
100% or less for any period they overlap — e.g. splitting Arjun Mehta's four concurrent 100%
rows into shares that reflect how his time is actually split. This is a business judgment call
(which project gets what share) that cannot be inferred from the data, which is why it isn't
scripted here. Once corrected through the UI/API, the new validation added in this change will
keep it from regressing.

## Verification query

Re-run this after cleanup; it should return zero rows:

```sql
WITH probes AS (
  SELECT DISTINCT employee_id, effective_from AS probe_date FROM allocation
),
sums AS (
  SELECT p.employee_id, p.probe_date, SUM(a.allocation_pct) AS total_pct
  FROM probes p
  JOIN allocation a ON a.employee_id = p.employee_id
    AND a.effective_from <= p.probe_date
    AND COALESCE(a.effective_to, DATE '9999-12-31') >= p.probe_date
  GROUP BY p.employee_id, p.probe_date
)
SELECT employee_id, MAX(total_pct) AS max_total_pct
FROM sums
GROUP BY employee_id
HAVING MAX(total_pct) > 100
ORDER BY max_total_pct DESC;
```
