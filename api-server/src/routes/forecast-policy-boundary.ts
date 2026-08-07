import { createHash } from "node:crypto";
import { Router } from "express";
import { intelDb as db } from "@workspace/db";
import { federalIntelItemsTable } from "@workspace/db/schema";

const router = Router();
const FEDERAL_REGISTER_API = "https://www.federalregister.gov/api/v1/documents.json";
const POLICY_SEARCHES = [
  { name: "FAR", term: "Federal Acquisition Regulation" },
  {
    name: "DFARS",
    term: "Defense Federal Acquisition Regulation Supplement",
  },
] as const;

type JsonRecord = Record<string, unknown>;

type PolicyEntry = {
  title: string;
  link: string | null;
  description: string | null;
  pubDate: string | null;
  documentNumber: string | null;
  raw: JsonRecord;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function firstString(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeFederalRegisterEntry(value: unknown): PolicyEntry | null {
  const record = asRecord(value);
  const title = firstString(record, ["title"]);
  if (!title) return null;
  return {
    title,
    link: firstString(record, ["html_url", "pdf_url", "raw_text_url"]),
    description: firstString(record, ["abstract", "excerpts"]),
    pubDate: firstString(record, ["publication_date", "effective_on"]),
    documentNumber: firstString(record, ["document_number"]),
    raw: record,
  };
}

function federalRegisterUrl(term: string): URL {
  const url = new URL(FEDERAL_REGISTER_API);
  url.searchParams.set("per_page", "30");
  url.searchParams.set("order", "newest");
  url.searchParams.set("conditions[term]", term);
  return url;
}

function entryMatchesPolicy(entry: PolicyEntry, policy: "FAR" | "DFARS"): boolean {
  const text = `${entry.title} ${entry.description ?? ""}`;
  if (policy === "DFARS") {
    return /defense federal acquisition regulation supplement|\bdfars\b/i.test(text);
  }
  return (
    /federal acquisition regulation|\bfar\b/i.test(text) &&
    !/defense federal acquisition regulation supplement|\bdfars\b/i.test(text)
  );
}

export function policyFeedDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function scorePolicy(text: string): number {
  let score = 20;
  if (/health|medical|occupational|workforce|employee/i.test(text)) score += 25;
  if (/small business|set.aside|service contract|professional services/i.test(text)) score += 15;
  if (/far|dfars|acquisition regulation|clause|rule/i.test(text)) score += 10;
  return Math.min(100, score);
}

router.get("/federal-intel/forecast", (_req, res) =>
  res.status(410).json({
    error: "Legacy federal-intel forecast is retired.",
    replacement: "/api/govcon/forecasts",
  }),
);
router.post("/federal-intel/forecast/refresh", (_req, res) =>
  res.status(410).json({
    error: "Legacy forecast refresh is retired.",
    replacement: "/api/govcon/forecasts",
  }),
);

// FAR/DFARS are policy intelligence, never pipeline forecasts. The historical
// acquisition.gov RSS endpoints were retired; FederalRegister.gov's public API
// is the maintained, keyless source for newly published rules/notices.
router.post("/federal-intel/policy-radar/refresh", async (req, res) => {
  const now = new Date();
  const items: any[] = [];
  const sources: Array<{
    source: string;
    count: number;
    ok: boolean;
    error?: string;
  }> = [];

  for (const search of POLICY_SEARCHES) {
    try {
      const response = await fetch(federalRegisterUrl(search.term), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = asRecord(await response.json());
      const rawResults = Array.isArray(payload.results) ? payload.results : [];
      const parsed = rawResults
        .map(normalizeFederalRegisterEntry)
        .filter((entry): entry is PolicyEntry => Boolean(entry))
        .filter((entry) => entryMatchesPolicy(entry, search.name));

      let count = 0;
      for (const entry of parsed) {
        const text = `${entry.title} ${entry.description ?? ""}`;
        const score = scorePolicy(text);
        const dedupe = entry.documentNumber ?? entry.link ?? `${search.name}:${entry.title}`;
        const hash = createHash("sha256")
          .update(`policy-radar:${dedupe}`)
          .digest("hex");
        const id = [
          hash.slice(0, 8),
          hash.slice(8, 12),
          `5${hash.slice(13, 16)}`,
          hash.slice(16, 20),
          hash.slice(20, 32),
        ].join("-");
        const datePosted = policyFeedDate(entry.pubDate);
        const rows = await db
          .insert(federalIntelItemsTable)
          .values({
            id,
            bucket: "policy-radar",
            sourceType: "federal_register",
            agency: "Federal Register",
            component: search.name,
            title: entry.title,
            summary: entry.description?.slice(0, 1000) ?? null,
            datePosted,
            status: "published",
            relatedRef: entry.documentNumber ?? search.name,
            occuMedScore: score,
            actionTag: score >= 50 ? "monitor" : "wait",
            sourceUrl: entry.link,
            rawJson: JSON.stringify(entry.raw),
            fetchedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: federalIntelItemsTable.id,
            set: {
              title: entry.title,
              summary: entry.description?.slice(0, 1000) ?? null,
              datePosted,
              occuMedScore: score,
              sourceUrl: entry.link,
              rawJson: JSON.stringify(entry.raw),
              fetchedAt: now,
              updatedAt: now,
            },
          })
          .returning();
        if (rows[0]) {
          items.push(rows[0]);
          count += 1;
        }
      }
      sources.push({ source: search.name, count, ok: true });
    } catch (error) {
      sources.push({
        source: search.name,
        count: 0,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      req.log.warn(error, `${search.name} policy refresh failed`);
    }
  }

  return res.json({
    bucket: "policy-radar",
    count: items.length,
    items,
    sources,
  });
});

export default router;
