import { pgTable, text, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const opportunityStatusEnum = pgEnum("opportunity_status", ["active", "archived"]);
export const opportunitySourceEnum = pgEnum("opportunity_source", ["sam_gov", "csv_import", "manual"]);

export const opportunitiesTable = pgTable("opportunities", {
  id: text("id").primaryKey(),
  noticeId: text("notice_id").unique(),
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
  // Intelligence fields
  relevanceScore: numeric("relevance_score"),
  sourceConfidence: text("source_confidence"), // high, medium, low
  tags: text("tags"), // JSON array stored as text
  notes: text("notes"),
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOpportunitySchema = createInsertSchema(opportunitiesTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const selectOpportunitySchema = createSelectSchema(opportunitiesTable);

export type InsertOpportunity = z.infer<typeof insertOpportunitySchema>;
export type Opportunity = typeof opportunitiesTable.$inferSelect;
