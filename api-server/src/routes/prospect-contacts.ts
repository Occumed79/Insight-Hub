/**
 * Prospect Contacts / Org Structure Routes
 *
 * GET    /api/prospects/:id/contacts           — list all contacts
 * POST   /api/prospects/:id/contacts           — add single contact
 * POST   /api/prospects/:id/contacts/bulk      — bulk upsert contacts (seed)
 * DELETE /api/prospects/:id/contacts/:cid      — remove contact
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { prospectContactsTable } from "@workspace/db/schema";

const router = Router();

const VALID_CATEGORIES = [
  "ceo_leadership", "finance", "human_resources", "legal_compliance",
  "ehs_safety", "quality", "operations", "technology",
  "procurement_supply_chain", "board_governance", "communications",
  "strategy", "business_unit", "other",
] as const;

// ── Map raw category strings from PDF to enum values ─────────────────────────
function mapCategory(raw: string): typeof VALID_CATEGORIES[number] {
  const r = raw.toLowerCase();
  if (r.includes("ceo") || r.includes("chair") || r.includes("president") || r.includes("vice chair") || r.includes("coo")) return "ceo_leadership";
  if (r.includes("cfo") || r.includes("finance") || r.includes("accounting") || r.includes("controller")) return "finance";
  if (r.includes("human resource") || r.includes("people") || r.includes("chro") || r.includes("talent") || r.includes("belonging") || r.includes("dei") || r.includes("workforce")) return "human_resources";
  if (r.includes("legal") || r.includes("compliance") || r.includes("counsel") || r.includes("governance") || r.includes("regulatory")) return "legal_compliance";
  if (r.includes("ehs") || r.includes("safety") || r.includes("environment") || r.includes("hseq") || r.includes("hse")) return "ehs_safety";
  if (r.includes("quality")) return "quality";
  if (r.includes("technology") || r.includes("digital") || r.includes("cyber") || r.includes("it ") || r.includes(" it") || r.includes("cio") || r.includes("cto") || r.includes("information")) return "technology";
  if (r.includes("procurement") || r.includes("supply chain") || r.includes("purchasing") || r.includes("contract") || r.includes("logistics") || r.includes("subcontract") || r.includes("materials")) return "procurement_supply_chain";
  if (r.includes("board") || r.includes("director") || r.includes("advisory") || r.includes("supervisory") || r.includes("governance")) return "board_governance";
  if (r.includes("communicat") || r.includes("sustainability") || r.includes("brand") || r.includes("media") || r.includes("public affairs")) return "communications";
  if (r.includes("strategy") || r.includes("development") || r.includes("growth") || r.includes("business dev")) return "strategy";
  if (r.includes("business unit") || r.includes("business group") || r.includes("division") || r.includes("sector") || r.includes("operations")) return "operations";
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
    combined.includes("industrial hygiene")
  );
}

function isKeyContact(category: typeof VALID_CATEGORIES[number], ehs: boolean): boolean {
  return ehs || ["ceo_leadership", "human_resources", "ehs_safety", "quality"].includes(category);
}

// ── GET contacts ──────────────────────────────────────────────────────────────

router.get("/prospects/:id/contacts", async (req, res) => {
  try {
    const contacts = await db
      .select()
      .from(prospectContactsTable)
      .where(eq(prospectContactsTable.prospectId, req.params.id))
      .orderBy(prospectContactsTable.category, prospectContactsTable.name);
    res.json({ contacts });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list contacts" });
  }
});

// ── POST single contact ───────────────────────────────────────────────────────

router.post("/prospects/:id/contacts", async (req, res) => {
  try {
    const { name, categoryRaw, category, title, department, linkedinUrl, email, notes } = req.body;
    const resolvedCategory = category || mapCategory(categoryRaw || "other");
    const ehs = isEhsContact(resolvedCategory, title || "");
    const contact = {
      id: randomUUID(),
      prospectId: req.params.id,
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
    const [inserted] = await db.insert(prospectContactsTable).values(contact).returning();
    res.json({ contact: inserted });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to add contact" });
  }
});

// ── POST bulk upsert ─────────────────────────────────────────────────────────

router.post("/prospects/:id/contacts/bulk", async (req, res) => {
  try {
    const { contacts, replace = false } = req.body;
    if (!Array.isArray(contacts)) return res.status(400).json({ error: "contacts must be an array" });

    if (replace) {
      await db.delete(prospectContactsTable).where(eq(prospectContactsTable.prospectId, req.params.id));
    }

    const rows = contacts.map((c: any) => {
      const rawCat = c.categoryRaw || c.category || "other";
      const resolvedCategory = VALID_CATEGORIES.includes(rawCat as any) ? rawCat : mapCategory(rawCat);
      const ehs = isEhsContact(rawCat, c.title || "");
      return {
        id: randomUUID(),
        prospectId: req.params.id,
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
      await db.insert(prospectContactsTable).values(rows);
    }

    const all = await db
      .select()
      .from(prospectContactsTable)
      .where(eq(prospectContactsTable.prospectId, req.params.id))
      .orderBy(prospectContactsTable.category);

    res.json({ contacts: all, added: rows.length });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to bulk insert contacts" });
  }
});

// ── DELETE contact ────────────────────────────────────────────────────────────

router.delete("/prospects/:id/contacts/:cid", async (req, res) => {
  try {
    await db
      .delete(prospectContactsTable)
      .where(
        and(
          eq(prospectContactsTable.id, req.params.cid),
          eq(prospectContactsTable.prospectId, req.params.id)
        )
      );
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

export default router;
