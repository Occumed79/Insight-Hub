/**
 * POST /api/search
 *
 * Instant local search over already-stored opportunity records.
 * This endpoint queries the PostgreSQL opportunities table directly and
 * ranks results locally. No external APIs, crawlers, scrapers, or LLMs are called.
 *
 * Contrast with:
 *   - POST /opportunities/fetch — ingestion/crawler path that hits live
 *     external sources (Serper, Tavily, Exa, Firecrawl, Jina, Olostep,
 *     Cloudflare Worker, Gemini, Groq, OpenRouter, etc.)
 *   - unifiedFetch / webIntelligenceFetch — full crawler/scraper pipelines
 *
 * This is the fast path for searching data that has already been ingested.
 */

import { Router } from "express";
import { searchOpportunities } from "../lib/search/localSearch";

const router = Router();

router.post("/search", async (req, res) => {
  try {
    const { query, limit, filters } = req.body as {
      query?: string;
      limit?: number;
      filters?: {
        source?: string;
        agency?: string;
        state?: string;
        dateRange?: number;
        activeOnly?: boolean;
      };
    };

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return res.status(400).json({ error: "query is required and must be a non-empty string" });
    }

    const result = await searchOpportunities(
      query.trim(),
      typeof limit === "number" && limit > 0 ? Math.min(limit, 100) : 50,
      filters ?? {},
    );

    return res.json(result);
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ error: "Search failed", details: err.message });
  }
});

export default router;
