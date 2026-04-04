import { pgTable, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const stateAgencyBucketEnum = pgEnum("state_agency_bucket", [
  "procurement",
  "legislature",
  "governor_agencies",
  "health_dept",
  "labor_warn",
  "medical_licensing",
  "emergency_mgmt",
  "osha_plan",
  "insurance_dept",
  "corrections",
  "fmcsa",
  "post_guidelines",
  "dot",
]);

export const stateIntelChannelEnum = pgEnum("state_intel_channel", [
  "public_health",
  "travel_advisory",
  "fda_recalls",
  "disaster",
]);

export const stateProfilesTable = pgTable("state_profiles", {
  stateCode: text("state_code").primaryKey(),
  stateName: text("state_name").notNull(),
  region: text("region").notNull().default(""),
  oshaStatePlan: text("osha_state_plan").notNull().default("federal"),
  procurementUrl: text("procurement_url"),
  legislatureUrl: text("legislature_url"),
  govUrl: text("gov_url"),
  healthDeptUrl: text("health_dept_url"),
  laborUrl: text("labor_url"),
  emergencyMgmtUrl: text("emergency_mgmt_url"),
  medicalBoardUrl: text("medical_board_url"),
  insuranceDeptUrl: text("insurance_dept_url"),
  correctionsUrl: text("corrections_url"),
  dotUrl: text("dot_url"),
  postCommissionUrl: text("post_commission_url"),
  lastRefreshed: text("last_refreshed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const stateAgencyItemsTable = pgTable("state_agency_items", {
  id: text("id").primaryKey(),
  stateCode: text("state_code").notNull(),
  bucket: stateAgencyBucketEnum("bucket").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  url: text("url"),
  publishedDate: text("published_date"),
  agency: text("agency"),
  itemType: text("item_type"),
  relevanceScore: integer("relevance_score").default(0),
  rawJson: text("raw_json"),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const stateIntelItemsTable = pgTable("state_intel_items", {
  id: text("id").primaryKey(),
  channel: stateIntelChannelEnum("channel").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  url: text("url"),
  publishedDate: text("published_date"),
  source: text("source"),
  severity: text("severity"),
  affectedStates: text("affected_states"),
  rawJson: text("raw_json"),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertStateAgencyItemSchema = createInsertSchema(stateAgencyItemsTable).omit({ createdAt: true, fetchedAt: true });
export const selectStateAgencyItemSchema = createSelectSchema(stateAgencyItemsTable);
export const insertStateIntelItemSchema = createInsertSchema(stateIntelItemsTable).omit({ createdAt: true, fetchedAt: true });
export const selectStateIntelItemSchema = createSelectSchema(stateIntelItemsTable);

export type StateProfile = typeof stateProfilesTable.$inferSelect;
export type StateAgencyItem = typeof stateAgencyItemsTable.$inferSelect;
export type StateIntelItem = typeof stateIntelItemsTable.$inferSelect;
export type StateAgencyBucket = typeof stateAgencyBucketEnum.enumValues[number];
export type StateIntelChannel = typeof stateIntelChannelEnum.enumValues[number];
