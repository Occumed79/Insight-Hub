CREATE TYPE "public"."opportunity_source" AS ENUM('sam_gov', 'csv_import', 'manual');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."competitor_tier" AS ENUM('local', 'regional', 'national');--> statement-breakpoint
CREATE TYPE "public"."prospect_status" AS ENUM('prospect', 'lead', 'qualified', 'active');--> statement-breakpoint
CREATE TYPE "public"."prospect_tier" AS ENUM('strategic', 'enterprise', 'mid-market');--> statement-breakpoint
CREATE TYPE "public"."prospect_location_type" AS ENUM('headquarters', 'manufacturing', 'office', 'research', 'testing', 'warehouse', 'training', 'distribution', 'service_center', 'other');--> statement-breakpoint
CREATE TYPE "public"."prospect_contact_category" AS ENUM('ceo_leadership', 'finance', 'human_resources', 'legal_compliance', 'ehs_safety', 'quality', 'operations', 'technology', 'procurement_supply_chain', 'board_governance', 'communications', 'strategy', 'business_unit', 'other');--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"notice_id" text,
	"title" text NOT NULL,
	"agency" text NOT NULL,
	"sub_agency" text,
	"office" text,
	"type" text NOT NULL,
	"status" "opportunity_status" DEFAULT 'active' NOT NULL,
	"naics_code" text,
	"naics_description" text,
	"psc_code" text,
	"contract_type" text,
	"posted_date" timestamp NOT NULL,
	"response_deadline" timestamp,
	"period_of_performance" text,
	"set_aside" text,
	"place_of_performance" text,
	"description" text,
	"solicitation_number" text,
	"sam_url" text,
	"estimated_value" numeric,
	"ceiling_value" numeric,
	"floor_value" numeric,
	"award_amount" numeric,
	"awardee" text,
	"source" "opportunity_source" DEFAULT 'manual' NOT NULL,
	"provider_name" text,
	"relevance_score" numeric,
	"source_confidence" text,
	"tags" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "opportunities_notice_id_unique" UNIQUE("notice_id")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"description" text,
	"services" text,
	"coverage_states" text,
	"tier" "competitor_tier" DEFAULT 'regional' NOT NULL,
	"headquarters" text,
	"employee_count" text,
	"founded" text,
	"notes" text,
	"recent_activity" text,
	"contract_wins" text,
	"intelligence_sources" text,
	"news_articles" text,
	"fec_filings" text,
	"last_researched" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"description" text,
	"industry" text,
	"headquarters" text,
	"employee_count" text,
	"founded" text,
	"naics_codes" text,
	"status" "prospect_status" DEFAULT 'prospect' NOT NULL,
	"tier" "prospect_tier" DEFAULT 'enterprise' NOT NULL,
	"notes" text,
	"research_summary" text,
	"opportunity_signals" text,
	"intelligence_sources" text,
	"last_researched" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"prospect_id" text NOT NULL,
	"name" text,
	"type" "prospect_location_type" DEFAULT 'office' NOT NULL,
	"city" text,
	"state" text,
	"country" text DEFAULT 'United States' NOT NULL,
	"address" text,
	"employee_estimate" text,
	"description" text,
	"open_positions" integer DEFAULT 0,
	"health_positions" integer DEFAULT 0,
	"hiring_trend" text,
	"hiring_categories" text,
	"jobs_last_updated" timestamp,
	"source_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"prospect_id" text NOT NULL,
	"location_id" text,
	"title" text NOT NULL,
	"department" text,
	"raw_location" text,
	"job_type" text,
	"posted_date" text,
	"url" text,
	"snippet" text,
	"is_health_related" boolean DEFAULT false,
	"health_relevance_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"prospect_id" text NOT NULL,
	"name" text NOT NULL,
	"category" "prospect_contact_category" DEFAULT 'other' NOT NULL,
	"title" text,
	"department" text,
	"is_ehs_contact" boolean DEFAULT false,
	"is_key_contact" boolean DEFAULT false,
	"linkedin_url" text,
	"email" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
