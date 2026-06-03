import { pgTable, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Signal type enum ─────────────────────────────────────────────────────────
export const intelSignalTypeEnum = pgEnum("intel_signal_type", [
  "regulatory_change",
  "procurement_forecast",
  "expiring_contract",
  "new_rulemaking",
  "enforcement_action",
  "budget_funding",
  "grant_program",
  "industry_trend",
  "state_procurement",
  "other",
]);

// ── Feedback action ──────────────────────────────────────────────────────────
export const intelFeedbackEnum = pgEnum("intel_feedback", [
  "saved",
  "dismissed",
  "new",
]);

// ── Source enum ──────────────────────────────────────────────────────────────
export const intelSourceEnum = pgEnum("intel_source", [
  "federal_register",
  "regulations_gov",
  "sam_awards",
  "usaspending",
  "dol_osha",
  "acquisition_gov",
  "ecfr",
  "state_serper",
  "state_portal",
  "other",
]);

// ── Scope enum ───────────────────────────────────────────────────────────────
export const intelScopeEnum = pgEnum("intel_scope", [
  "federal",
  "state",
]);

// ── Main intel feed table ────────────────────────────────────────────────────
export const intelFeedItemsTable = pgTable("intel_feed_items", {
  id:           text("id").primaryKey(),
  scope:        intelScopeEnum("scope").notNull().default("federal"),
  stateCode:    text("state_code"),          // null for federal items
  signalType:   intelSignalTypeEnum("signal_type").notNull().default("other"),
  source:       intelSourceEnum("source").notNull().default("other"),
  agency:       text("agency"),
  title:        text("title").notNull(),
  summary:      text("summary"),
  sourceUrl:    text("source_url"),
  publishedDate: timestamp("published_date"),
  // Feedback / learning
  feedback:     intelFeedbackEnum("feedback").notNull().default("new"),
  relevanceScore: integer("relevance_score").default(50),
  // Raw data for dedup
  externalId:   text("external_id"),         // dedup key from source
  rawJson:      text("raw_json"),
  fetchedAt:    timestamp("fetched_at").notNull().defaultNow(),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
});

// ── Intel feed feedback signals (learning) ───────────────────────────────────
export const intelFeedSignalsTable = pgTable("intel_feed_signals", {
  id:         text("id").primaryKey(),
  signalType: intelSignalTypeEnum("signal_type").notNull(),
  source:     intelSourceEnum("source").notNull(),
  stateCode:  text("state_code"),
  savedCount:    integer("saved_count").notNull().default(0),
  dismissedCount: integer("dismissed_count").notNull().default(0),
  totalCount:    integer("total_count").notNull().default(0),
  updatedAt:  timestamp("updated_at").notNull().defaultNow(),
});

// ── Zod schemas ───────────────────────────────────────────────────────────────
export const insertIntelFeedItemSchema = createInsertSchema(intelFeedItemsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  fetchedAt: true,
});
export const selectIntelFeedItemSchema = createSelectSchema(intelFeedItemsTable);

export type InsertIntelFeedItem = z.infer<typeof insertIntelFeedItemSchema>;
export type IntelFeedItem = typeof intelFeedItemsTable.$inferSelect;
export type IntelSignalType = typeof intelSignalTypeEnum.enumValues[number];
export type IntelFeedback = typeof intelFeedbackEnum.enumValues[number];
export type IntelSource = typeof intelSourceEnum.enumValues[number];
export type IntelScope = typeof intelScopeEnum.enumValues[number];
