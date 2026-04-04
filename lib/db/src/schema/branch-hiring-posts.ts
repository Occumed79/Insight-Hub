import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const branchHiringPostsTable = pgTable("branch_hiring_posts", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull(),
  clientId: text("client_id").notNull(),
  title: text("title").notNull(),
  department: text("department"),
  url: text("url"),
  postedDate: text("posted_date"),
  source: text("source"),
  rawJson: text("raw_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBranchHiringPostSchema = createInsertSchema(branchHiringPostsTable).omit({
  createdAt: true,
});

export const selectBranchHiringPostSchema = createSelectSchema(branchHiringPostsTable);

export type InsertBranchHiringPost = z.infer<typeof insertBranchHiringPostSchema>;
export type BranchHiringPost = typeof branchHiringPostsTable.$inferSelect;
