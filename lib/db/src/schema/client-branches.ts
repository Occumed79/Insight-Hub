import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const branchTypeEnum = pgEnum("branch_type", [
  "office",
  "manufacturing",
  "research",
  "depot",
  "field_operations",
  "headquarters",
  "training",
  "distribution",
  "data_center",
  "other",
]);

export const clientBranchesTable = pgTable("client_branches", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  name: text("name"),
  city: text("city"),
  country: text("country").notNull().default("United States"),
  state: text("state"),
  address: text("address"),
  branchType: branchTypeEnum("branch_type").notNull().default("office"),
  lastResearched: timestamp("last_researched"),
  hiringTrendSummary: text("hiring_trend_summary"),
  hiringTrendDirection: text("hiring_trend_direction").default("unknown"),
  postingCount: text("posting_count").default("0"),
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertClientBranchSchema = createInsertSchema(clientBranchesTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const selectClientBranchSchema = createSelectSchema(clientBranchesTable);

export type InsertClientBranch = z.infer<typeof insertClientBranchSchema>;
export type ClientBranch = typeof clientBranchesTable.$inferSelect;
