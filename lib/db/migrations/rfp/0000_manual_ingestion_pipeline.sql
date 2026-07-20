CREATE TYPE "public"."opportunity_ingestion_run_status" AS ENUM('queued', 'running', 'completed', 'completed_with_errors', 'failed');
--> statement-breakpoint
CREATE TYPE "public"."opportunity_ingestion_source_status" AS ENUM('queued', 'running', 'completed', 'failed');
--> statement-breakpoint
CREATE TYPE "public"."opportunity_quality_status" AS ENUM('pending', 'accepted', 'rejected', 'duplicate', 'quarantined');
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "first_seen_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "last_seen_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE TABLE "opportunity_ingestion_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"status" "opportunity_ingestion_run_status" DEFAULT 'queued' NOT NULL,
	"selected_providers" jsonb NOT NULL,
	"query" text,
	"date_range" integer,
	"retry_of_run_id" text,
	"current_provider" text,
	"providers_completed" integer DEFAULT 0 NOT NULL,
	"providers_total" integer DEFAULT 0 NOT NULL,
	"fetched" integer DEFAULT 0 NOT NULL,
	"staged" integer DEFAULT 0 NOT NULL,
	"accepted" integer DEFAULT 0 NOT NULL,
	"rejected" integer DEFAULT 0 NOT NULL,
	"duplicates" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"archived" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_ingestion_run_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"provider" text NOT NULL,
	"position" integer NOT NULL,
	"status" "opportunity_ingestion_source_status" DEFAULT 'queued' NOT NULL,
	"fetched" integer DEFAULT 0 NOT NULL,
	"staged" integer DEFAULT 0 NOT NULL,
	"accepted" integer DEFAULT 0 NOT NULL,
	"rejected" integer DEFAULT 0 NOT NULL,
	"duplicates" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_ingestion_run_sources_run_id_opportunity_ingestion_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."opportunity_ingestion_runs"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE "opportunity_raw_records" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"run_source_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_native_id" text,
	"source_url" text,
	"provider_record" jsonb NOT NULL,
	"source_evidence" jsonb,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_raw_records_run_id_opportunity_ingestion_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."opportunity_ingestion_runs"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "opportunity_raw_records_run_source_id_opportunity_ingestion_run_sources_id_fk" FOREIGN KEY ("run_source_id") REFERENCES "public"."opportunity_ingestion_run_sources"("id") ON DELETE restrict ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE "opportunity_staging" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"raw_record_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_native_id" text,
	"title" text,
	"agency" text,
	"solicitation_number" text,
	"source_url" text,
	"posted_date" timestamp with time zone,
	"response_deadline" timestamp with time zone,
	"normalized_record" jsonb NOT NULL,
	"quality_status" "opportunity_quality_status" DEFAULT 'pending' NOT NULL,
	"quality_reason" text,
	"completeness_score" numeric NOT NULL,
	"source_confidence" numeric NOT NULL,
	"dedupe_keys" jsonb NOT NULL,
	"canonical_opportunity_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_staging_run_id_opportunity_ingestion_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."opportunity_ingestion_runs"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "opportunity_staging_raw_record_id_opportunity_raw_records_id_fk" FOREIGN KEY ("raw_record_id") REFERENCES "public"."opportunity_raw_records"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "opportunity_staging_canonical_opportunity_id_opportunities_id_fk" FOREIGN KEY ("canonical_opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE "opportunity_source_registry" (
	"id" text PRIMARY KEY NOT NULL,
	"opportunity_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_native_id" text,
	"source_url" text,
	"canonical_url" text,
	"latest_raw_record_id" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_source_registry_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "opportunity_source_registry_latest_raw_record_id_opportunity_raw_records_id_fk" FOREIGN KEY ("latest_raw_record_id") REFERENCES "public"."opportunity_raw_records"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE "opportunity_dedupe_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"opportunity_id" text NOT NULL,
	"key_type" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_dedupe_keys_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "idx_opportunity_ingestion_runs_created_at" ON "opportunity_ingestion_runs" USING btree ("created_at");
CREATE INDEX "idx_opportunity_ingestion_runs_status" ON "opportunity_ingestion_runs" USING btree ("status");
CREATE UNIQUE INDEX "uq_opportunity_ingestion_run_source" ON "opportunity_ingestion_run_sources" USING btree ("run_id","provider");
CREATE INDEX "idx_opportunity_ingestion_run_sources_run" ON "opportunity_ingestion_run_sources" USING btree ("run_id");
CREATE INDEX "idx_opportunity_raw_records_run" ON "opportunity_raw_records" USING btree ("run_id");
CREATE INDEX "idx_opportunity_raw_records_provider_native" ON "opportunity_raw_records" USING btree ("provider","provider_native_id");
CREATE UNIQUE INDEX "uq_opportunity_staging_raw_record" ON "opportunity_staging" USING btree ("raw_record_id");
CREATE INDEX "idx_opportunity_staging_run_quality" ON "opportunity_staging" USING btree ("run_id","quality_status");
CREATE UNIQUE INDEX "uq_opportunity_source_registry_provider_native" ON "opportunity_source_registry" USING btree ("provider","provider_native_id") WHERE provider_native_id IS NOT NULL;
CREATE INDEX "idx_opportunity_source_registry_opportunity" ON "opportunity_source_registry" USING btree ("opportunity_id");
CREATE UNIQUE INDEX "uq_opportunity_dedupe_key" ON "opportunity_dedupe_keys" USING btree ("dedupe_key");
CREATE INDEX "idx_opportunity_dedupe_keys_opportunity" ON "opportunity_dedupe_keys" USING btree ("opportunity_id");

-- Reversal (manual, only before production data exists): drop the six tables in
-- dependency order, drop the three enum types, then drop first_seen_at and
-- last_seen_at from opportunities. The forward migration is otherwise additive.
