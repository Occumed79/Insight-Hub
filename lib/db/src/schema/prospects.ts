import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const prospectStatusEnum = pgEnum("prospect_status", ["prospect", "lead", "qualified", "active"]);
export const prospectTierEnum = pgEnum("prospect_tier", ["strategic", "enterprise", "mid-market"]);

export const prospectsTable = pgTable("prospects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  website: text("website"),
  description: text("description"),
  industry: text("industry"),
  headquarters: text("headquarters"),
  employeeCount: text("employee_count"),
  founded: text("founded"),
  naicsCodes: text("naics_codes"),         // JSON: string[] — relevant NAICS for occ health
  status: prospectStatusEnum("status").notNull().default("prospect"),
  tier: prospectTierEnum("tier").notNull().default("enterprise"),
  notes: text("notes"),
  // Intelligence fields — populated by the /research endpoint
  researchSummary: text("research_summary"),
  opportunitySignals: text("opportunity_signals"), // JSON: { title, type, date, url }[]
  intelligenceSources: text("intelligence_sources"), // JSON: string[]
  lastResearched: timestamp("last_researched"),
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProspectSchema = createInsertSchema(prospectsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const selectProspectSchema = createSelectSchema(prospectsTable);

export type InsertProspect = z.infer<typeof insertProspectSchema>;
export type Prospect = typeof prospectsTable.$inferSelect;
