import { pgTable, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const feedbackGradeEnum = pgEnum("feedback_grade", [
  "excellent",   // Perfect fit — boost signals strongly
  "good",        // Good fit — boost signals moderately
  "poor",        // Not relevant — suppress signals
  "spam",        // Junk / off-topic — suppress heavily
]);

/**
 * Stores user grades on individual opportunities.
 * Each grade feeds the learning model to improve future results.
 *
 * Data-integrity invariant: opportunityId references opportunitiesTable.id and
 * must remain stable for the lifetime of the row.  The ingestion pipeline
 * guarantees this by never regenerating an existing opportunity's primary key
 * on refresh — see normalizedToDbRecord (normalization.ts) and the UPDATE
 * branch in unifiedSearch.ts.
 */
export const opportunityFeedbackTable = pgTable("opportunity_feedback", {
  id:            text("id").primaryKey(),
  opportunityId: text("opportunity_id").notNull(),   // stable FK → opportunitiesTable.id (never changes on refresh)
  grade:         feedbackGradeEnum("grade").notNull(),
  notes:         text("notes"),
  // Signal fields extracted from the rated opportunity (denormalized for fast model training)
  agency:        text("agency"),
  naicsCode:     text("naics_code"),
  providerName:  text("provider_name"),
  tags:          text("tags"),          // JSON array text (mirrors opportunity.tags)
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOpportunityFeedbackSchema = createInsertSchema(opportunityFeedbackTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const selectOpportunityFeedbackSchema = createSelectSchema(opportunityFeedbackTable);

export type InsertOpportunityFeedback = z.infer<typeof insertOpportunityFeedbackSchema>;
export type OpportunityFeedback = typeof opportunityFeedbackTable.$inferSelect;
