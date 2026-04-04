import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const competitorTierEnum = pgEnum("competitor_tier", ["local", "regional", "national"]);

export const competitorsTable = pgTable("competitors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  website: text("website"),
  description: text("description"),
  // Services, states, and tags stored as JSON text arrays
  services: text("services"),         // JSON: string[]
  coverageStates: text("coverage_states"), // JSON: string[]
  tier: competitorTierEnum("tier").notNull().default("regional"),
  headquarters: text("headquarters"),
  employeeCount: text("employee_count"),
  founded: text("founded"),
  notes: text("notes"),
  // Intelligence fields — populated by the /research endpoint
  recentActivity: text("recent_activity"),   // AI-generated summary
  contractWins: text("contract_wins"),        // JSON: { title, agency, value, date, url }[]
  intelligenceSources: text("intelligence_sources"), // JSON: string[] of source URLs
  newsArticles: text("news_articles"),        // JSON: { headline, source, date, url }[]
  fecFilings: text("fec_filings"),            // JSON: { committee, cycle, amount, recipient }[]
  lastResearched: timestamp("last_researched"),
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCompetitorSchema = createInsertSchema(competitorsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const selectCompetitorSchema = createSelectSchema(competitorsTable);

export type InsertCompetitor = z.infer<typeof insertCompetitorSchema>;
export type Competitor = typeof competitorsTable.$inferSelect;
