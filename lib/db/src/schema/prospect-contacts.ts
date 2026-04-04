import { pgTable, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contactCategoryEnum = pgEnum("prospect_contact_category", [
  "ceo_leadership",
  "finance",
  "human_resources",
  "legal_compliance",
  "ehs_safety",
  "quality",
  "operations",
  "technology",
  "procurement_supply_chain",
  "board_governance",
  "communications",
  "strategy",
  "business_unit",
  "other",
]);

export const prospectContactsTable = pgTable("prospect_contacts", {
  id: text("id").primaryKey(),
  prospectId: text("prospect_id").notNull(),
  name: text("name").notNull(),
  category: contactCategoryEnum("category").notNull().default("other"),
  title: text("title"),
  department: text("department"),
  isEhsContact: boolean("is_ehs_contact").default(false),
  isKeyContact: boolean("is_key_contact").default(false),
  linkedinUrl: text("linkedin_url"),
  email: text("email"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProspectContactSchema = createInsertSchema(prospectContactsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const selectProspectContactSchema = createSelectSchema(prospectContactsTable);

export type InsertProspectContact = z.infer<typeof insertProspectContactSchema>;
export type ProspectContact = typeof prospectContactsTable.$inferSelect;
