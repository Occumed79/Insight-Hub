-- Migration 0004: enforce feedback -> opportunity integrity without deleting legacy rows.

CREATE INDEX IF NOT EXISTS "idx_opportunity_feedback_opportunity_id"
  ON "opportunity_feedback" ("opportunity_id");--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'opportunity_feedback_opportunity_id_fkey'
  ) THEN
    ALTER TABLE "opportunity_feedback"
      ADD CONSTRAINT "opportunity_feedback_opportunity_id_fkey"
      FOREIGN KEY ("opportunity_id")
      REFERENCES "opportunities" ("id")
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;--> statement-breakpoint

-- Validate immediately only when no historical orphan rows exist. The NOT VALID
-- constraint still enforces all new and updated feedback rows either way.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "opportunity_feedback" feedback
    LEFT JOIN "opportunities" opportunity
      ON opportunity."id" = feedback."opportunity_id"
    WHERE opportunity."id" IS NULL
  ) THEN
    ALTER TABLE "opportunity_feedback"
      VALIDATE CONSTRAINT "opportunity_feedback_opportunity_id_fkey";
  END IF;
END $$;
