import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const prospectJobsTable = pgTable("prospect_jobs", {
  id: text("id").primaryKey(),
  prospectId: text("prospect_id").notNull(),
  locationId: text("location_id"),   // nullable — matched after discovery
  title: text("title").notNull(),
  department: text("department"),
  rawLocation: text("raw_location"), // raw string from job posting
  jobType: text("job_type"),         // "full-time" | "part-time" | "contract" | "intern"
  postedDate: text("posted_date"),
  url: text("url"),
  snippet: text("snippet"),
  isHealthRelated: boolean("is_health_related").default(false),
  healthRelevanceReason: text("health_relevance_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProspectJobSchema = createInsertSchema(prospectJobsTable).omit({
  createdAt: true,
});

export const selectProspectJobSchema = createSelectSchema(prospectJobsTable);

export type InsertProspectJob = z.infer<typeof insertProspectJobSchema>;
export type ProspectJob = typeof prospectJobsTable.$inferSelect;
