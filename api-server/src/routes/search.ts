import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

interface SearchRequestBody {
  query?: string;
  limit?: number;
  offset?: number;
  status?: "active" | "archived" | "all";
}

const clampLimit = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
};

const clampOffset = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

const normalizeQuery = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
};

const toPlainTextQuery = (query: string): string => {
  // websearch_to_tsquery already handles natural-language input, but removing
  // shell-like punctuation makes the endpoint more forgiving for pasted text.
  return query.replace(/[<>()[\]{}|&!:*]/g, " ").replace(/\s+/g, " ").trim();
};

router.post("/search", async (req, res) => {
  try {
    const body = (req.body ?? {}) as SearchRequestBody;
    const query = normalizeQuery(body.query);
    const textQuery = toPlainTextQuery(query);
    const limit = clampLimit(body.limit);
    const offset = clampOffset(body.offset);
    const status = body.status ?? "active";

    if (!textQuery) {
      return res.status(400).json({ error: "query is required" });
    }

    const statusClause = status === "all"
      ? sql`TRUE`
      : sql`o.status = ${status}`;

    const rows = await db.execute(sql`
      WITH q AS (
        SELECT websearch_to_tsquery('english', ${textQuery}) AS tsq
      )
      SELECT
        o.id,
        o.title,
        o.agency,
        o.sub_agency AS "subAgency",
        o.office,
        o.type,
        o.status,
        o.naics_code AS "naicsCode",
        o.naics_description AS "naicsDescription",
        o.posted_date AS "postedDate",
        o.response_deadline AS "responseDeadline",
        o.place_of_performance AS "placeOfPerformance",
        o.description,
        o.solicitation_number AS "solicitationNumber",
        o.sam_url AS "samUrl",
        o.source,
        o.provider_name AS "providerName",
        o.relevance_score AS "relevanceScore",
        ts_rank_cd(o.search_vector, q.tsq) AS "matchScore",
        ts_headline(
          'english',
          coalesce(o.description, o.title),
          q.tsq,
          'MaxWords=32, MinWords=8, ShortWord=3, HighlightAll=false'
        ) AS snippet
      FROM opportunities o, q
      WHERE ${statusClause}
        AND o.search_vector @@ q.tsq
      ORDER BY
        ts_rank_cd(o.search_vector, q.tsq) DESC,
        o.posted_date DESC NULLS LAST,
        o.response_deadline ASC NULLS LAST
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    return res.json({
      query,
      limit,
      offset,
      source: "local_database",
      results: rows.rows,
    });
  } catch (err: any) {
    const message = err?.message || "Search failed";
    return res.status(500).json({
      error: message,
      hint: message.includes("search_vector")
        ? "The opportunity search migration may not have run yet."
        : undefined,
    });
  }
});

export default router;
