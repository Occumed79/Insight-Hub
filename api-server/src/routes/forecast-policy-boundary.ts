import { createHash } from "node:crypto";
import { Router } from "express";
import { intelDb as db } from "@workspace/db";
import { federalIntelItemsTable } from "@workspace/db/schema";

const router = Router();
const FEEDS = [
  { name: "FAR", url: "https://www.acquisition.gov/far-site/rss" },
  { name: "DFARS", url: "https://www.acquisition.gov/rss/dfars" },
] as const;

function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match?.[1] ? decode(match[1]) : null;
}

function parseFeed(xml: string, limit = 30) {
  return Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi))
    .slice(0, limit)
    .map((match) => {
      const block = match[1] ?? "";
      return {
        title: tag(block, "title") ?? "Acquisition policy update",
        link: tag(block, "link"),
        description: tag(block, "description"),
        pubDate: tag(block, "pubDate"),
      };
    });
}

function scorePolicy(text: string): number {
  let score = 20;
  if (/health|medical|occupational|workforce|employee/i.test(text)) score += 25;
  if (/small business|set.aside|service contract|professional services/i.test(text)) score += 15;
  if (/far|dfars|acquisition regulation|clause|rule/i.test(text)) score += 10;
  return Math.min(100, score);
}

// The former generic forecast bucket mixed presolicitations, search results and
// acquisition-regulation RSS. Forecasts now live only at /govcon/forecasts.
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

// FAR/DFARS are policy intelligence, never pipeline forecasts.
router.post("/federal-intel/policy-radar/refresh", async (req, res) => {
  const now = new Date();
  const items: any[] = [];
  const sources: Array<{ source: string; count: number; ok: boolean; error?: string }> = [];

  for (const feed of FEEDS) {
    try {
      const response = await fetch(feed.url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = parseFeed(await response.text());
      let count = 0;
      for (const entry of parsed) {
        const text = `${entry.title} ${entry.description ?? ""}`;
        const score = scorePolicy(text);
        const dedupe = entry.link ?? `${feed.name}:${entry.title}`;
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
        const rows = await db
          .insert(federalIntelItemsTable)
          .values({
            id,
            bucket: "policy-radar",
            sourceType: "acquisition_gov",
            agency: "Acquisition.gov",
            component: feed.name,
            title: entry.title,
            summary: entry.description?.slice(0, 1000) ?? null,
            datePosted: entry.pubDate ? new Date(entry.pubDate) : null,
            status: "published",
            relatedRef: feed.name,
            occuMedScore: score,
            actionTag: score >= 50 ? "monitor" : "wait",
            sourceUrl: entry.link,
            rawJson: JSON.stringify(entry),
            fetchedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: federalIntelItemsTable.id,
            set: {
              title: entry.title,
              summary: entry.description?.slice(0, 1000) ?? null,
              datePosted: entry.pubDate ? new Date(entry.pubDate) : null,
              occuMedScore: score,
              sourceUrl: entry.link,
              rawJson: JSON.stringify(entry),
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
      sources.push({ source: feed.name, count, ok: true });
    } catch (error) {
      sources.push({
        source: feed.name,
        count: 0,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      req.log.warn(error, `${feed.name} policy feed refresh failed`);
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
