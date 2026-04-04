import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { contactCategoryEnum } from "./prospect-contacts";

export const clientContactsTable = pgTable("client_contacts", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
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

export const insertClientContactSchema = createInsertSchema(clientContactsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const selectClientContactSchema = createSelectSchema(clientContactsTable);

export type InsertClientContact = z.infer<typeof insertClientContactSchema>;
export type ClientContact = typeof clientContactsTable.$inferSelect;
