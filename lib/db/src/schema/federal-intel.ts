import { pgTable, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const federalIntelBucketEnum = pgEnum("federal_intel_bucket", [
  "forecast",
  "recompete-watch",
  "agency-pain",
  "policy-radar",
  "incumbent-tracker",
  "leadership-org",
  "deployment-medical",
  "budget-funding",
  "protest-litigation",
]);

export const federalIntelActionTagEnum = pgEnum("federal_intel_action_tag", [
  "monitor",
  "pursue",
  "brief",
  "contact",
  "wait",
]);

export const federalIntelSourceTypeEnum = pgEnum("federal_intel_source_type", [
  "sam_gov",
  "usaspending",
  "oversight_gov",
  "gao",
  "oig",
  "federal_register",
  "acquisition_gov",
  "usajobs",
  "rss_feed",
  "govinfo",
  "cdc",
  "state_dept",
  "faa",
  "omb",
  "serper_search",
  "other",
]);

export const federalIntelItemsTable = pgTable("federal_intel_items", {
  id: text("id").primaryKey(),
  bucket: federalIntelBucketEnum("bucket").notNull(),
  sourceType: federalIntelSourceTypeEnum("source_type").notNull().default("other"),
  agency: text("agency"),
  component: text("component"),
  office: text("office"),
  regionCountry: text("region_country"),
  title: text("title").notNull(),
  summary: text("summary"),
  datePosted: timestamp("date_posted"),
  status: text("status"),
  contractorIncumbent: text("contractor_incumbent"),
  relatedRef: text("related_ref"),
  budgetSignal: text("budget_signal"),
  oversightSignal: text("oversight_signal"),
  medicalTravelRelevance: text("medical_travel_relevance"),
  occuMedScore: integer("occu_med_score").default(0),
  actionTag: federalIntelActionTagEnum("action_tag").default("monitor"),
  sourceUrl: text("source_url"),
  rawJson: text("raw_json"),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFederalIntelItemSchema = createInsertSchema(federalIntelItemsTable).omit({
  createdAt: true,
  updatedAt: true,
  fetchedAt: true,
});

export const selectFederalIntelItemSchema = createSelectSchema(federalIntelItemsTable);

export type InsertFederalIntelItem = z.infer<typeof insertFederalIntelItemSchema>;
export type FederalIntelItem = typeof federalIntelItemsTable.$inferSelect;
export type FederalIntelBucket = typeof federalIntelBucketEnum.enumValues[number];
export type FederalIntelActionTag = typeof federalIntelActionTagEnum.enumValues[number];
