import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, numeric, integer, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const opportunityStatusEnum = pgEnum("opportunity_status", ["active", "archived"]);
export const opportunitySourceEnum = pgEnum("opportunity_source", ["sam_gov", "csv_import", "manual"]);

/**
 * Canonical provider key values written to the provider_key column.
 * These are a precise identity scope — distinct from the broad 3-value
 * source enum which is kept for display/category compatibility only.
 */
export const PROVIDER_KEYS = [
  "samGov",
  "publicPortalProviders",
  "eunaBonfire",
  "internationalPublicPortals",
  "tango",
  "bidnet",
  "serper",
  "tavily",
  "exa",
  "gemini",
  "texasEsbd",
  "nyScr",
  "csvImport",
  "manual",
] as const;

export type ProviderKey = (typeof PROVIDER_KEYS)[number];

export const opportunitiesTable = pgTable(
  "opportunities",
  {
    id: text("id").primaryKey(),
    noticeId: text("notice_id"),
    title: text("title").notNull(),
    agency: text("agency").notNull(),
    subAgency: text("sub_agency"),
    office: text("office"),
    type: text("type").notNull(),
    status: opportunityStatusEnum("status").notNull().default("active"),
    naicsCode: text("naics_code"),
    naicsDescription: text("naics_description"),
    pscCode: text("psc_code"),
    contractType: text("contract_type"),
    postedDate: timestamp("posted_date").notNull(),
    responseDeadline: timestamp("response_deadline"),
    periodOfPerformance: text("period_of_performance"),
    setAside: text("set_aside"),
    placeOfPerformance: text("place_of_performance"),
    description: text("description"),
    solicitationNumber: text("solicitation_number"),
    samUrl: text("sam_url"),
    // Financial fields
    estimatedValue: numeric("estimated_value"),
    ceilingValue: numeric("ceiling_value"),
    floorValue: numeric("floor_value"),
    awardAmount: numeric("award_amount"),
    awardee: text("awardee"),
    // Source tracking
    source: opportunitySourceEnum("source").notNull().default("manual"),
    providerName: text("provider_name"), // sam_gov, serper, tavily, tango, bidnet, etc.
    /**
     * Canonical provider identity key — used together with notice_id for
     * provider-scoped duplicate detection.  See PROVIDER_KEYS for valid values.
     * Legacy records without a providerKey fall back to 'manual'.
     */
    providerKey: text("provider_key"),
    // Intelligence fields
    relevanceScore: numeric("relevance_score"),
    sourceConfidence: text("source_confidence"), // high, medium, low
    tags: text("tags"), // JSON array stored as text
    notes: text("notes"),
    // Learning model fields — updated by the feedback aggregation pipeline
    userConfidence: numeric("user_confidence"),  // 0-100: model's prediction of your interest based on past grades
    userGrade: text("user_grade"),               // your latest grade: excellent | good | poor | spam (null = ungraded)
    // Timestamps
    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // Provider-scoped uniqueness: the same external ID may exist in two different
    // providers without collision.  Both columns are nullable; the index only
    // enforces when both are non-null.
    uniqueIndex("uq_opportunities_provider_notice")
      .on(table.providerKey, table.noticeId)
      .where(sql`provider_key IS NOT NULL AND notice_id IS NOT NULL`),
  ],
);

export const insertOpportunitySchema = createInsertSchema(opportunitiesTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const selectOpportunitySchema = createSelectSchema(opportunitiesTable);

export type InsertOpportunity = z.infer<typeof insertOpportunitySchema>;
export type Opportunity = typeof opportunitiesTable.$inferSelect;
