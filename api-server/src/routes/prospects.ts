/**
 * Prospect Intelligence Routes
 *
 * GET    /api/prospects           — list all prospects
 * POST   /api/prospects           — create a new prospect
 * PATCH  /api/prospects/:id       — update a prospect
 * DELETE /api/prospects/:id       — delete a prospect
 * POST   /api/prospects/:id/research — trigger AI research on a prospect
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { prospectsTable } from "@workspace/db/schema";
import { serperProvider } from "../lib/providers/serper";
import { tavilyProvider } from "../lib/providers/tavily";
import { resolveCredential } from "../lib/config/providerConfig";

const router = Router();

// ── List ──────────────────────────────────────────────────────────────────────

router.get("/prospects", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(prospectsTable)
      .orderBy(prospectsTable.name);
    res.json({ prospects: rows });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list prospects" });
  }
});

// ── Create ────────────────────────────────────────────────────────────────────

router.post("/prospects", async (req, res) => {
  try {
    const { name, website, description, industry, headquarters, employeeCount, founded, naicsCodes, status, tier, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "name is required" });

    const row = await db
      .insert(prospectsTable)
      .values({
        id: randomUUID(),
        name: name.trim(),
        website: website?.trim() || null,
        description: description?.trim() || null,
        industry: industry?.trim() || null,
        headquarters: headquarters?.trim() || null,
        employeeCount: employeeCount?.trim() || null,
        founded: founded?.trim() || null,
        naicsCodes: naicsCodes ? JSON.stringify(naicsCodes) : null,
        status: status || "prospect",
        tier: tier || "enterprise",
        notes: notes?.trim() || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    res.status(201).json({ prospect: row[0] });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create prospect" });
  }
});

// ── Update ────────────────────────────────────────────────────────────────────

router.patch("/prospects/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, website, description, industry, headquarters, employeeCount, founded, naicsCodes, status, tier, notes } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (website !== undefined) updates.website = website?.trim() || null;
    if (description !== undefined) updates.description = description?.trim() || null;
    if (industry !== undefined) updates.industry = industry?.trim() || null;
    if (headquarters !== undefined) updates.headquarters = headquarters?.trim() || null;
    if (employeeCount !== undefined) updates.employeeCount = employeeCount?.trim() || null;
    if (founded !== undefined) updates.founded = founded?.trim() || null;
    if (naicsCodes !== undefined) updates.naicsCodes = naicsCodes ? JSON.stringify(naicsCodes) : null;
    if (status !== undefined) updates.status = status;
    if (tier !== undefined) updates.tier = tier;
    if (notes !== undefined) updates.notes = notes?.trim() || null;

    const row = await db
      .update(prospectsTable)
      .set(updates)
      .where(eq(prospectsTable.id, id))
      .returning();

    if (!row.length) return res.status(404).json({ error: "Prospect not found" });
    res.json({ prospect: row[0] });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update prospect" });
  }
});

// ── Delete ────────────────────────────────────────────────────────────────────

router.delete("/prospects/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await db
      .delete(prospectsTable)
      .where(eq(prospectsTable.id, id))
      .returning();
    if (!deleted.length) return res.status(404).json({ error: "Prospect not found" });
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete prospect" });
  }
});

// ── Research ──────────────────────────────────────────────────────────────────

router.post("/prospects/:id/research", async (req, res) => {
  const { id } = req.params;

  try {
    const rows = await db.select().from(prospectsTable).where(eq(prospectsTable.id, id));
    if (!rows.length) return res.status(404).json({ error: "Prospect not found" });
    const prospect = rows[0];

    const errors: string[] = [];
    const sourceUrls: string[] = [];

    // ── 1. Serper — occupational health opportunity signals ────────────────────
    const serperQueries = [
      `"${prospect.name}" occupational health medical services RFP contract 2025 OR 2026`,
      `"${prospect.name}" employee health clinic services bid solicitation`,
      `"${prospect.name}" workforce health safety medical program contract award`,
    ];

    let serperResults: { title: string; link: string; snippet: string }[] = [];
    try {
      serperResults = await serperProvider.searchMultiple(serperQueries, 8);
      serperResults.forEach((r) => r.link && sourceUrls.push(r.link));
    } catch (e: any) {
      errors.push(`Serper: ${e.message}`);
    }

    // ── 2. Tavily — deep company profile ──────────────────────────────────────
    const tavilyQueries = [
      `${prospect.name} occupational health employee workforce medical services`,
      `${prospect.name} defense contractor health safety programs benefits`,
    ];

    let tavilyResults: { title: string; url: string; content: string }[] = [];
    try {
      tavilyResults = await tavilyProvider.researchMultiple(tavilyQueries, 5);
      tavilyResults.forEach((r) => r.url && sourceUrls.push(r.url));
    } catch (e: any) {
      errors.push(`Tavily: ${e.message}`);
    }

    // ── 3. Extract opportunity signals ────────────────────────────────────────
    const opportunitySignals: { title: string; type: string; date: string; url: string }[] = [];
    const allResults = [
      ...serperResults.map((r) => ({ title: r.title, content: r.snippet, url: r.link })),
      ...tavilyResults.map((r) => ({ title: r.title, content: r.content, url: r.url })),
    ];

    for (const r of allResults) {
      const text = `${r.title} ${r.content}`.toLowerCase();
      let type = "";
      if (text.includes("rfp") || text.includes("solicitation") || text.includes("bid")) type = "RFP";
      else if (text.includes("award") || text.includes("contract win") || text.includes("selected")) type = "Contract Award";
      else if (text.includes("expansion") || text.includes("new facility") || text.includes("opening")) type = "Expansion";
      else if (text.includes("health") || text.includes("medical") || text.includes("safety") || text.includes("wellness")) type = "Health Program";

      if (type) {
        const dateMatch = r.content.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b|\b\d{4}\b/i);
        opportunitySignals.push({
          title: r.title.slice(0, 120),
          type,
          date: dateMatch?.[0] || "",
          url: r.url,
        });
        if (opportunitySignals.length >= 10) break;
      }
    }

    // ── 4. Gemini — prospect intelligence summary ─────────────────────────────
    let researchSummary = "";
    const geminiKey = await resolveCredential("geminiApiKey", "GEMINI_API_KEY");

    if (geminiKey && allResults.length > 0) {
      try {
        const textSample = allResults
          .slice(0, 8)
          .map((r) => `Title: ${r.title}\nContent: ${r.content.slice(0, 400)}`)
          .join("\n\n---\n\n");

        const prompt = `You are a business development analyst for Occu-Med, an occupational health company targeting defense and aerospace contractors.
Analyze these web results about the prospect company "${prospect.name}" (Industry: ${prospect.industry || "Defense & Aerospace"}) and write a concise 3–5 sentence intelligence summary.
Focus on: their workforce size and locations, occupational health or medical service needs, existing health programs, safety requirements for their industry, and why Occu-Med's services would be relevant.
If limited information is available, reason from what you know about the company's industry and workforce.

Results:
${textSample}

Respond with ONLY the intelligence summary paragraph, no headers or labels.`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 350, temperature: 0.3 },
            }),
          }
        );
        if (response.ok) {
          const json = (await response.json()) as any;
          researchSummary = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
        }
      } catch (e: any) {
        errors.push(`Gemini summary: ${e.message}`);
      }
    }

    if (!researchSummary && allResults.length > 0) {
      const topSnippets = allResults.slice(0, 3).map((r) => r.content.slice(0, 200).trim()).join(" ");
      researchSummary = topSnippets || "No specific occupational health intelligence found. Manual research recommended.";
    }

    // ── 5. Save results ───────────────────────────────────────────────────────
    const updated = await db
      .update(prospectsTable)
      .set({
        researchSummary: researchSummary || "No intelligence found.",
        opportunitySignals: JSON.stringify(opportunitySignals),
        intelligenceSources: JSON.stringify([...new Set(sourceUrls)].slice(0, 20)),
        lastResearched: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(prospectsTable.id, id))
      .returning();

    res.json({
      prospect: updated[0],
      stats: {
        serperResults: serperResults.length,
        tavilyResults: tavilyResults.length,
        signalsFound: opportunitySignals.length,
        sourcesIndexed: sourceUrls.length,
      },
      errors,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Research failed" });
  }
});

export default router;
