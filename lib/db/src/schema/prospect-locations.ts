import { pgTable, text, timestamp, pgEnum, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const locationTypeEnum = pgEnum("prospect_location_type", [
  "headquarters",
  "manufacturing",
  "office",
  "research",
  "testing",
  "warehouse",
  "training",
  "distribution",
  "service_center",
  "other",
]);

export const prospectLocationsTable = pgTable("prospect_locations", {
  id: text("id").primaryKey(),
  prospectId: text("prospect_id").notNull(),
  name: text("name"),
  type: locationTypeEnum("type").notNull().default("office"),
  city: text("city"),
  state: text("state"),
  country: text("country").notNull().default("United States"),
  address: text("address"),
  employeeEstimate: text("employee_estimate"),
  description: text("description"),
  // Hiring intelligence
  openPositions: integer("open_positions").default(0),
  healthPositions: integer("health_positions").default(0),
  hiringTrend: text("hiring_trend"),       // "high" | "medium" | "low" | "none"
  hiringCategories: text("hiring_categories"), // JSON: { category: string; count: number }[]
  jobsLastUpdated: timestamp("jobs_last_updated"),
  // Source metadata
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProspectLocationSchema = createInsertSchema(prospectLocationsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const selectProspectLocationSchema = createSelectSchema(prospectLocationsTable);

export type InsertProspectLocation = z.infer<typeof insertProspectLocationSchema>;
export type ProspectLocation = typeof prospectLocationsTable.$inferSelect;
