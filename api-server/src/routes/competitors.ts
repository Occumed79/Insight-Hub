/**
 * Competitor Intelligence Routes
 *
 * GET    /api/competitors           — list all competitors
 * POST   /api/competitors           — create a new competitor
 * PATCH  /api/competitors/:id       — update a competitor
 * DELETE /api/competitors/:id       — delete a competitor
 * POST   /api/competitors/:id/research — trigger AI research on a competitor
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { competitorsTable } from "@workspace/db/schema";
import { serperProvider } from "../lib/providers/serper";
import { tavilyProvider } from "../lib/providers/tavily";
import { resolveCredential } from "../lib/config/providerConfig";

const router = Router();

// ── List ──────────────────────────────────────────────────────────────────────

router.get("/competitors", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(competitorsTable)
      .orderBy(competitorsTable.name);
    res.json({ competitors: rows });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list competitors" });
  }
});

// ── Create ────────────────────────────────────────────────────────────────────

router.post("/competitors", async (req, res) => {
  try {
    const { name, website, description, services, coverageStates, tier, headquarters, employeeCount, founded, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "name is required" });

    const row = await db
      .insert(competitorsTable)
      .values({
        id: randomUUID(),
        name: name.trim(),
        website: website?.trim() || null,
        description: description?.trim() || null,
        services: services ? JSON.stringify(services) : null,
        coverageStates: coverageStates ? JSON.stringify(coverageStates) : null,
        tier: tier || "regional",
        headquarters: headquarters?.trim() || null,
        employeeCount: employeeCount?.trim() || null,
        founded: founded?.trim() || null,
        notes: notes?.trim() || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    res.status(201).json({ competitor: row[0] });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create competitor" });
  }
});

// ── Update ────────────────────────────────────────────────────────────────────

router.patch("/competitors/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, website, description, services, coverageStates, tier, headquarters, employeeCount, founded, notes } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (website !== undefined) updates.website = website?.trim() || null;
    if (description !== undefined) updates.description = description?.trim() || null;
    if (services !== undefined) updates.services = services ? JSON.stringify(services) : null;
    if (coverageStates !== undefined) updates.coverageStates = coverageStates ? JSON.stringify(coverageStates) : null;
    if (tier !== undefined) updates.tier = tier;
    if (headquarters !== undefined) updates.headquarters = headquarters?.trim() || null;
    if (employeeCount !== undefined) updates.employeeCount = employeeCount?.trim() || null;
    if (founded !== undefined) updates.founded = founded?.trim() || null;
    if (notes !== undefined) updates.notes = notes?.trim() || null;

    const row = await db
      .update(competitorsTable)
      .set(updates)
      .where(eq(competitorsTable.id, id))
      .returning();

    if (!row.length) return res.status(404).json({ error: "Competitor not found" });
    res.json({ competitor: row[0] });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update competitor" });
  }
});

// ── Delete ────────────────────────────────────────────────────────────────────

router.delete("/competitors/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await db
      .delete(competitorsTable)
      .where(eq(competitorsTable.id, id))
      .returning();
    if (!deleted.length) return res.status(404).json({ error: "Competitor not found" });
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete competitor" });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Unknown";
  }
}

// ── Research ──────────────────────────────────────────────────────────────────

router.post("/competitors/:id/research", async (req, res) => {
  const { id } = req.params;

  try {
    const rows = await db.select().from(competitorsTable).where(eq(competitorsTable.id, id));
    if (!rows.length) return res.status(404).json({ error: "Competitor not found" });
    const competitor = rows[0];

    const errors: string[] = [];
    const sourceUrls: string[] = [];

    // ── All external calls run in parallel ────────────────────────────────────
    const [serperOutcome, tavilyOutcome, serperNewsOutcome, fecOutcome, serperKeyOutcome] =
      await Promise.allSettled([

        // 1. Serper — contract activity & web search
        (async () => {
          const queries = [
            `"${competitor.name}" occupational health government contract award 2025 OR 2026`,
            `"${competitor.name}" RFP bid solicitation occupational medicine services`,
            `"${competitor.name}" contract win healthcare services government`,
          ];
          return serperProvider.searchMultiple(queries, 8);
        })(),

        // 2. Tavily — deep research
        (async () => {
          const queries = [
            `${competitor.name} occupational health company profile services contracts`,
            `${competitor.name} government contracts awarded healthcare 2026`,
          ];
          return tavilyProvider.researchMultiple(queries, 5);
        })(),

        // 3. Serper news mode — credible health/government outlets
        (async () => {
          const serperKey = await resolveCredential("serperApiKey", "SERPER_API_KEY");
          if (!serperKey) return [];

          const newsQueries = [
            `"${competitor.name}" site:reuters.com OR site:bloomberg.com OR site:modernhealthcare.com OR site:fiercehealthcare.com`,
            `"${competitor.name}" occupational health news 2025 OR 2026`,
          ];

          const articles: { headline: string; source: string; date: string; url: string }[] = [];
          for (const q of newsQueries) {
            if (articles.length >= 12) break;
            try {
              const resp = await fetch("https://google.serper.dev/news", {
                method: "POST",
                headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
                body: JSON.stringify({ q, num: 6 }),
              });
              if (resp.ok) {
                const data = (await resp.json()) as any;
                for (const item of (data.news ?? []) as any[]) {
                  if (articles.length >= 12) break;
                  const headline = item.title?.trim();
                  const url = item.link?.trim();
                  if (headline && url) {
                    articles.push({
                      headline,
                      source: item.source?.trim() || extractDomain(url),
                      date: item.date?.trim() || "",
                      url,
                    });
                  }
                }
              }
            } catch (_) {}
          }
          return articles;
        })(),

        // 4. FEC API — political contributions (public, no auth required)
        (async () => {
          const fecUrl = new URL("https://api.open.fec.gov/v1/schedules/schedule_b/");
          fecUrl.searchParams.set("contributor_name", competitor.name);
          fecUrl.searchParams.set("sort_hide_null", "false");
          fecUrl.searchParams.set("per_page", "20");
          fecUrl.searchParams.set("api_key", "DEMO_KEY");

          const resp = await fetch(fecUrl.toString(), {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(8000),
          });
          if (!resp.ok) return [];

          const data = (await resp.json()) as any;
          const agg: Record<string, { committee: string; cycle: string; amount: number; recipient: string }> = {};
          for (const r of (data?.results ?? []) as any[]) {
            const committee = r.contributor_name?.trim() || competitor.name;
            const cycle = String(r.report_year ?? r.election_year ?? "");
            const amount = Number(r.disbursement_amount ?? r.contribution_receipt_amount ?? 0);
            const recipient = r.recipient_name?.trim() || r.committee_name?.trim() || "Unknown";
            const key = `${committee}|${cycle}|${recipient}`;
            agg[key] = agg[key]
              ? { ...agg[key], amount: agg[key].amount + amount }
              : { committee, cycle, amount, recipient };
          }
          return Object.values(agg).sort((a, b) => b.amount - a.amount).slice(0, 15);
        })(),

        // 5. Resolve Gemini key (needed later, resolved in parallel)
        resolveCredential("geminiApiKey", "GEMINI_API_KEY"),
      ]);

    // ── Collect results and per-source errors ─────────────────────────────────
    let serperResults: { title: string; link: string; snippet: string }[] = [];
    if (serperOutcome.status === "fulfilled") {
      serperResults = serperOutcome.value;
      serperResults.forEach((r) => r.link && sourceUrls.push(r.link));
    } else {
      errors.push(`Serper: ${(serperOutcome.reason as Error).message}`);
    }

    let tavilyResults: { title: string; url: string; content: string }[] = [];
    if (tavilyOutcome.status === "fulfilled") {
      tavilyResults = tavilyOutcome.value;
      tavilyResults.forEach((r) => r.url && sourceUrls.push(r.url));
    } else {
      errors.push(`Tavily: ${(tavilyOutcome.reason as Error).message}`);
    }

    let newsArticles: { headline: string; source: string; date: string; url: string }[] = [];
    if (serperNewsOutcome.status === "fulfilled") {
      newsArticles = serperNewsOutcome.value;
      newsArticles.forEach((a) => sourceUrls.push(a.url));
    } else {
      errors.push(`Serper news: ${(serperNewsOutcome.reason as Error).message}`);
    }

    let fecFilings: { committee: string; cycle: string; amount: number; recipient: string }[] = [];
    if (fecOutcome.status === "fulfilled") {
      fecFilings = fecOutcome.value;
    } else {
      errors.push(`FEC: ${(fecOutcome.reason as Error).message}`);
    }

    const geminiKey = serperKeyOutcome.status === "fulfilled" ? serperKeyOutcome.value : null;

    // ── Extract contract wins from web results ────────────────────────────────
    const contractWins: { title: string; agency: string; value: string; date: string; url: string }[] = [];
    const allResults = [
      ...serperResults.map((r) => ({ title: r.title, content: r.snippet, url: r.link })),
      ...tavilyResults.map((r) => ({ title: r.title, content: r.content, url: r.url })),
    ];

    for (const r of allResults) {
      const text = `${r.title} ${r.content}`.toLowerCase();
      if (
        text.includes("award") || text.includes("contract") || text.includes("win") ||
        text.includes("selected") || text.includes("signed") || text.includes("procurement")
      ) {
        const valueMatch = r.content.match(/\$[\d,]+(?:\.\d+)?(?:\s*(?:million|billion|M|B))?/i);
        const dateMatch = r.content.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b|\b\d{4}\b/i);
        const agencyMatch = r.title.match(/^([^|–-]+)\s*[|–-]/);

        contractWins.push({
          title: r.title.slice(0, 120),
          agency: agencyMatch?.[1]?.trim() || "Government Agency",
          value: valueMatch?.[0] || "",
          date: dateMatch?.[0] || "",
          url: r.url,
        });

        if (contractWins.length >= 10) break;
      }
    }

    // ── Gemini AI summary (uses resolved key from parallel step) ──────────────
    let recentActivity = "";

    if (geminiKey && allResults.length > 0) {
      try {
        const textSample = allResults
          .slice(0, 8)
          .map((r) => `Title: ${r.title}\nContent: ${r.content.slice(0, 400)}`)
          .join("\n\n---\n\n");

        const prompt = `You are a competitive intelligence analyst for Occu-Med, an occupational health company.
Analyze these web results about their competitor "${competitor.name}" and produce a concise 3–5 sentence intelligence summary.
Focus on: recent contract wins, government contracts, service expansions, new market entries, pricing signals, and competitive positioning.
If no relevant intelligence is found, say so briefly.

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
              generationConfig: { maxOutputTokens: 300, temperature: 0.3 },
            }),
          }
        );
        if (response.ok) {
          const json = (await response.json()) as any;
          recentActivity = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
        }
      } catch (e: any) {
        errors.push(`Gemini summary: ${e.message}`);
      }
    }

    if (!recentActivity && allResults.length > 0) {
      const topSnippets = allResults.slice(0, 3).map((r) => r.content.slice(0, 200).trim()).join(" ");
      recentActivity = topSnippets || "No recent activity found from web sources.";
    }

    // ── Save results ───────────────────────────────────────────────────────────
    const updated = await db
      .update(competitorsTable)
      .set({
        recentActivity: recentActivity || "No intelligence found.",
        contractWins: JSON.stringify(contractWins),
        intelligenceSources: JSON.stringify([...new Set(sourceUrls)].slice(0, 20)),
        newsArticles: JSON.stringify(newsArticles),
        fecFilings: JSON.stringify(fecFilings),
        lastResearched: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(competitorsTable.id, id))
      .returning();

    res.json({
      competitor: updated[0],
      stats: {
        serperResults: serperResults.length,
        tavilyResults: tavilyResults.length,
        contractWinsFound: contractWins.length,
        newsArticlesFound: newsArticles.length,
        fecFilingsFound: fecFilings.length,
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
