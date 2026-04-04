CREATE TYPE "public"."federal_intel_bucket" AS ENUM('forecast', 'recompete-watch', 'agency-pain', 'policy-radar', 'incumbent-tracker', 'leadership-org', 'deployment-medical', 'budget-funding', 'protest-litigation');--> statement-breakpoint
CREATE TYPE "public"."federal_intel_action_tag" AS ENUM('monitor', 'pursue', 'brief', 'contact', 'wait');--> statement-breakpoint
CREATE TYPE "public"."federal_intel_source_type" AS ENUM('sam_gov', 'usaspending', 'oversight_gov', 'gao', 'oig', 'federal_register', 'acquisition_gov', 'usajobs', 'rss_feed', 'govinfo', 'cdc', 'state_dept', 'faa', 'omb', 'other');--> statement-breakpoint
CREATE TABLE "federal_intel_items" (
"id" text PRIMARY KEY NOT NULL,
"bucket" "federal_intel_bucket" NOT NULL,
"source_type" "federal_intel_source_type" DEFAULT 'other' NOT NULL,
"agency" text,
"component" text,
"office" text,
"region_country" text,
"title" text NOT NULL,
"summary" text,
"date_posted" timestamp,
"status" text,
"contractor_incumbent" text,
"related_ref" text,
"budget_signal" text,
"oversight_signal" text,
"medical_travel_relevance" text,
"occu_med_score" integer DEFAULT 0,
"action_tag" "federal_intel_action_tag" DEFAULT 'monitor',
"source_url" text,
"raw_json" text,
"fetched_at" timestamp DEFAULT now() NOT NULL,
"created_at" timestamp DEFAULT now() NOT NULL,
"updated_at" timestamp DEFAULT now() NOT NULL
);
