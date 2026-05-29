-- Add user_confidence and user_grade columns to opportunities table
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "user_confidence" numeric;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "user_grade" text;--> statement-breakpoint

-- Create feedback_grade enum
DO $$ BEGIN
  CREATE TYPE "public"."feedback_grade" AS ENUM('excellent', 'good', 'poor', 'spam');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- Create opportunity_feedback table
CREATE TABLE IF NOT EXISTS "opportunity_feedback" (
  "id" text PRIMARY KEY NOT NULL,
  "opportunity_id" text NOT NULL,
  "grade" "feedback_grade" NOT NULL,
  "notes" text,
  "agency" text,
  "naics_code" text,
  "provider_name" text,
  "tags" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
