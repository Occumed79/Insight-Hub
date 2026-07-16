import { pgTable, text, timestamp, integer, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { opportunitiesTable } from "./opportunities";

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
 * opportunityId is a real database foreign key to opportunities.id. Existing
 * installations add it as NOT VALID first so historical orphan rows are never
 * deleted or rewritten; all new and updated feedback rows are still enforced.
 */
export const opportunityFeedbackTable = pgTable(
  "opportunity_feedback",
  {
    id: text("id").primaryKey(),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunitiesTable.id, { onDelete: "cascade" }),
    grade: feedbackGradeEnum("grade").notNull(),
    notes: text("notes"),
    // Signal fields extracted from the rated opportunity (denormalized for fast model training)
    agency: text("agency"),
    naicsCode: text("naics_code"),
    providerName: text("provider_name"),
    tags: text("tags"), // JSON array text (mirrors opportunity.tags)
    // Timestamps
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_opportunity_feedback_opportunity_id").on(table.opportunityId),
  ],
);

export const insertOpportunityFeedbackSchema = createInsertSchema(opportunityFeedbackTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const selectOpportunityFeedbackSchema = createSelectSchema(opportunityFeedbackTable);

export type InsertOpportunityFeedback = z.infer<typeof insertOpportunityFeedbackSchema>;
export type OpportunityFeedback = typeof opportunityFeedbackTable.$inferSelect;
