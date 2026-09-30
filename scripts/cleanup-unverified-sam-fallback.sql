-- Cleanup for SAM.gov records that came from web-search fallback with an
-- invented posted date (stamped with the fetch time) and no page verification.
-- Run step 1, eyeball the rows, then run step 2. Step 2 archives, it does not delete.

-- 1) Preview
SELECT id, title, agency, posted_date, sam_url
FROM opportunities
WHERE sam_url LIKE '%sam.gov/opp/%'
  AND tags LIKE '%date-unknown%'
ORDER BY posted_date DESC;

-- 2) Archive (hides them from the active list; reversible)
UPDATE opportunities
SET status = 'archived', updated_at = now()
WHERE sam_url LIKE '%sam.gov/opp/%'
  AND tags LIKE '%date-unknown%'
  AND status = 'active';

-- ---------------------------------------------------------------------------
-- CanadaBuys records found by web search with an invented posted date.
-- Preview first, then archive.

-- 3) Preview
SELECT id, title, agency, posted_date, sam_url
FROM opportunities
WHERE sam_url LIKE '%canadabuys.canada.ca%'
  AND tags LIKE '%date-unknown%'
ORDER BY posted_date DESC;

-- 4) Archive (reversible)
UPDATE opportunities
SET status = 'archived', updated_at = now()
WHERE sam_url LIKE '%canadabuys.canada.ca%'
  AND tags LIKE '%date-unknown%'
  AND status = 'active';
