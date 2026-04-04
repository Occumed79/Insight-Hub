/**
 * Client Contacts / Org Structure Routes
 *
 * GET    /api/clients/:id/contacts           — list all contacts
 * POST   /api/clients/:id/contacts           — add single contact
 * POST   /api/clients/:id/contacts/bulk      — bulk upsert contacts (seed)
 * DELETE /api/clients/:id/contacts/:cid      — remove contact
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { clientContactsTable } from "@workspace/db/schema";

const router = Router();

const VALID_CATEGORIES = [
  "ceo_leadership", "finance", "human_resources", "legal_compliance",
  "ehs_safety", "quality", "operations", "technology",
  "procurement_supply_chain", "board_governance", "communications",
  "strategy", "business_unit", "other",
] as const;

function mapCategory(raw: string): typeof VALID_CATEGORIES[number] {
  const r = raw.toLowerCase();
  if (r.includes("ceo") || r.includes("chair") || r.includes("president") || r.includes("vice chair") || r.includes("coo") || r.includes("general manager") || r.includes("secretary") && r.includes("agency")) return "ceo_leadership";
  if (r.includes("cfo") || r.includes("finance") || r.includes("accounting") || r.includes("controller") || r.includes("treasurer")) return "finance";
  if (r.includes("human resource") || r.includes("people") || r.includes("chro") || r.includes("talent") || r.includes("belonging") || r.includes("dei") || r.includes("workforce") || r.includes("hr ") || r.includes(" hr")) return "human_resources";
  if (r.includes("legal") || r.includes("compliance") || r.includes("counsel") || r.includes("governance") || r.includes("regulatory") || r.includes("parole")) return "legal_compliance";
  if (r.includes("ehs") || r.includes("safety") || r.includes("environment") || r.includes("hseq") || r.includes("hse") || r.includes("health care") || r.includes("psychologist") || r.includes("clinical") || r.includes("medical")) return "ehs_safety";
  if (r.includes("quality")) return "quality";
  if (r.includes("technology") || r.includes("digital") || r.includes("cyber") || r.includes("cio") || r.includes("cto") || r.includes("information officer") || r.includes("it ")) return "technology";
  if (r.includes("procurement") || r.includes("supply chain") || r.includes("purchasing") || r.includes("contract") || r.includes("logistics") || r.includes("subcontract")) return "procurement_supply_chain";
  if (r.includes("board") || r.includes("director") || r.includes("advisory") || r.includes("supervisory") || r.includes("ward") || r.includes("trustee")) return "board_governance";
  if (r.includes("communicat") || r.includes("media") || r.includes("public affairs") || r.includes("press") || r.includes("external affairs") || r.includes("customer experience")) return "communications";
  if (r.includes("strategy") || r.includes("development") || r.includes("growth") || r.includes("business dev") || r.includes("legislative") || r.includes("planning")) return "strategy";
  if (r.includes("operations") || r.includes("division") || r.includes("sector") || r.includes("warden") || r.includes("facility") || r.includes("regional") || r.includes("field operations")) return "operations";
  return "other";
}

function isEhsContact(category: string, title: string): boolean {
  const combined = `${category} ${title}`.toLowerCase();
  return (
    combined.includes("ehs") ||
    combined.includes("hse") ||
    combined.includes("hseq") ||
    combined.includes("safety") ||
    combined.includes("environment, health") ||
    combined.includes("occupational health") ||
    combined.includes("industrial hygiene") ||
    combined.includes("health care services") ||
    combined.includes("medical facility")
  );
}

function isKeyContact(category: typeof VALID_CATEGORIES[number], ehs: boolean): boolean {
  return ehs || ["ceo_leadership", "human_resources", "ehs_safety", "quality"].includes(category);
}

router.get("/clients/:id/contacts", async (req, res) => {
  try {
    const contacts = await db
      .select()
      .from(clientContactsTable)
      .where(eq(clientContactsTable.clientId, req.params.id))
      .orderBy(clientContactsTable.category, clientContactsTable.name);
    res.json({ contacts });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list contacts" });
  }
});

router.post("/clients/:id/contacts", async (req, res) => {
  try {
    const { name, categoryRaw, category, title, department, linkedinUrl, email, notes } = req.body;
    const resolvedCategory = category || mapCategory(categoryRaw || "other");
    const ehs = isEhsContact(resolvedCategory, title || "");
    const contact = {
      id: randomUUID(),
      clientId: req.params.id,
      name,
      category: VALID_CATEGORIES.includes(resolvedCategory as any) ? resolvedCategory as any : "other",
      title: title || null,
      department: department || null,
      isEhsContact: ehs,
      isKeyContact: isKeyContact(resolvedCategory as any, ehs),
      linkedinUrl: linkedinUrl || null,
      email: email || null,
      notes: notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const [inserted] = await db.insert(clientContactsTable).values(contact).returning();
    res.json({ contact: inserted });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to add contact" });
  }
});

router.post("/clients/:id/contacts/bulk", async (req, res) => {
  try {
    const { contacts, replace = false } = req.body;
    if (!Array.isArray(contacts)) return res.status(400).json({ error: "contacts must be an array" });

    if (replace) {
      await db.delete(clientContactsTable).where(eq(clientContactsTable.clientId, req.params.id));
    }

    const rows = contacts.map((c: any) => {
      const rawCat = c.categoryRaw || c.category || "other";
      const resolvedCategory = VALID_CATEGORIES.includes(rawCat as any) ? rawCat : mapCategory(rawCat);
      const ehs = isEhsContact(rawCat, c.title || "");
      return {
        id: randomUUID(),
        clientId: req.params.id,
        name: c.name,
        category: VALID_CATEGORIES.includes(resolvedCategory as any) ? resolvedCategory as any : "other",
        title: c.title || null,
        department: c.department || null,
        isEhsContact: ehs,
        isKeyContact: isKeyContact(resolvedCategory as any, ehs),
        linkedinUrl: c.linkedinUrl || null,
        email: c.email || null,
        notes: c.notes || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    if (rows.length > 0) {
      await db.insert(clientContactsTable).values(rows);
    }

    const all = await db
      .select()
      .from(clientContactsTable)
      .where(eq(clientContactsTable.clientId, req.params.id))
      .orderBy(clientContactsTable.category);

    res.json({ contacts: all, added: rows.length });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to bulk insert contacts" });
  }
});

router.delete("/clients/:id/contacts/:cid", async (req, res) => {
  try {
    await db
      .delete(clientContactsTable)
      .where(
        and(
          eq(clientContactsTable.id, req.params.cid),
          eq(clientContactsTable.clientId, req.params.id)
        )
      );
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

export default router;
