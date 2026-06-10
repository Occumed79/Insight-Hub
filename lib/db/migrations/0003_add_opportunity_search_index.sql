-- Phase 1 Smart RFP Search
-- Adds a local PostgreSQL full-text search index for stored opportunities.
-- This keeps user-facing search fast and avoids triggering the crawler pipeline.

ALTER TABLE opportunities
ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(agency, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(sub_agency, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(office, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(type, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(naics_code, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(naics_description, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(place_of_performance, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(tags, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(notes, '')), 'D')
) STORED;

CREATE INDEX IF NOT EXISTS idx_opportunities_search_vector
  ON opportunities USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_opportunities_posted_date
  ON opportunities (posted_date DESC);

CREATE INDEX IF NOT EXISTS idx_opportunities_response_deadline
  ON opportunities (response_deadline ASC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_opportunities_status
  ON opportunities (status);
