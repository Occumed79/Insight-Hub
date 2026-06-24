import { pgTable, text, timestamp, integer, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Scrape status enum ───────────────────────────────────────────────────────
export const scrapeStatusEnum = pgEnum("scrape_status", [
  "success",
  "no_items_found",
  "blocked",
  "failed",
  "timeout",
]);

// ── Source monitor items (extracted articles / listings) ────────────────────
export const sourceMonitorItemsTable = pgTable("source_monitor_items", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  sourceName: text("source_name").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  itemUrl: text("item_url"),
  sourceUrl: text("source_url").notNull(),
  publishedDate: timestamp("published_date"),
  scrapeStatus: scrapeStatusEnum("scrape_status").notNull().default("success"),
  errorMessage: text("error_message"),
  rawJson: text("raw_json"),
  protectedFromCleanup: boolean("protected_from_cleanup").notNull().default(false),
  protectedAt: timestamp("protected_at"),
  scrapedAt: timestamp("scraped_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Source monitor runs (per-source scrape tracking) ─────────────────────────
export const sourceMonitorRunsTable = pgTable("source_monitor_runs", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  status: scrapeStatusEnum("status").notNull().default("success"),
  itemsFound: integer("items_found").notNull().default(0),
  itemsCreated: integer("items_created").notNull().default(0),
  itemsUpdated: integer("items_updated").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

// ── Zod schemas ───────────────────────────────────────────────────────────────
export const insertSourceMonitorItemSchema = createInsertSchema(
  sourceMonitorItemsTable
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  scrapedAt: true,
});

export const selectSourceMonitorItemSchema = createSelectSchema(sourceMonitorItemsTable);

export const insertSourceMonitorRunSchema = createInsertSchema(
  sourceMonitorRunsTable
).omit({
  id: true,
  startedAt: true,
  completedAt: true,
});

export const selectSourceMonitorRunSchema = createSelectSchema(sourceMonitorRunsTable);

export type InsertSourceMonitorItem = z.infer<typeof insertSourceMonitorItemSchema>;
export type SourceMonitorItem = typeof sourceMonitorItemsTable.$inferSelect;
export type InsertSourceMonitorRun = z.infer<typeof insertSourceMonitorRunSchema>;
export type SourceMonitorRun = typeof sourceMonitorRunsTable.$inferSelect;
export type ScrapeStatus = typeof scrapeStatusEnum.enumValues[number];
