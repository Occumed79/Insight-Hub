/**
 * Federal Intelligence Routes
 *
 * GET   /api/federal-intel/:bucket         — list items (page, limit query params)
 * POST  /api/federal-intel/:bucket/refresh — fetch latest from public APIs, deterministic upsert
 * PATCH /api/federal-intel/:id/tag         — update action tag for a single item
 */

import { Router } from "express";
import { createHash } from "crypto";
import { eq, desc, and, count as countFn } from "drizzle-orm";
import { intelDb as db } from "@workspace/db";
import { federalIntelItemsTable, type FederalIntelBucket } from "@workspace/db/schema";
import { serperProvider } from "../lib/providers/serper";
import { assessIntelText, type IntelAssessment } from "../lib/intelligence/profileIntelRelevance";
import { profileLeadQueries, profileNaicsCodes, profileSemanticQuery, quotedOr } from "../lib/providers/profileQueryTerms";
import type { RelevanceVerdict } from "../lib/search/relevanceDecision";

const router = Router();

const VALID_BUCKETS: FederalIntelBucket[] = [
  "forecast",
  "recompete-watch",
  "agency-pain",
  "policy-radar",
  "incumbent-tracker",
  "leadership-org",
  "deployment-medical",
  "budget-funding",
  "protest-litigation",
];

// ── Deterministic ID ──────────────────────────────────────────────────────────

/**
 * Produces a stable UUID-shaped ID from the bucket + a dedup key
 * (sourceUrl or relatedRef or title). Same item always gets the same ID,
 * enabling ON CONFLICT DO UPDATE upserts.
 */
function makeItemId(bucket: string, dedupKey: string): string {
  const hash = createHash("sha256").update(`${bucket}::${dedupKey}`).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "5" + hash.slice(13, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}

// ── List (paginated) ──────────────────────────────────────────────────────────

router.get("/federal-intel/:bucket", async (req, res) => {
  const bucket = req.params.bucket as FederalIntelBucket;
  if (!VALID_BUCKETS.includes(bucket)) {
    return res.status(400).json({ error: "Invalid bucket" });
  }

  const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"), 10));
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
  const offset = (page - 1) * limit;

  try {
    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(federalIntelItemsTable)
        .where(eq(federalIntelItemsTable.bucket, bucket))
        .orderBy(desc(federalIntelItemsTable.fetchedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: countFn() })
        .from(federalIntelItemsTable)
        .where(eq(federalIntelItemsTable.bucket, bucket)),
    ]);

    const total = Number(totalRows[0]?.count ?? 0);
    return res.json({ items: rows, bucket, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to list federal intel items" });
  }
});

// ── Update action tag ─────────────────────────────────────────────────────────

router.patch("/federal-intel/:id/tag", async (req, res) => {
  const { id } = req.params;
  const { actionTag } = req.body;
  const validTags = ["monitor", "pursue", "brief", "contact", "wait"];
  if (!actionTag || !validTags.includes(actionTag)) {
    return res.status(400).json({ error: "Invalid action tag" });
  }
  try {
    const rows = await db
      .update(federalIntelItemsTable)
      .set({ actionTag, updatedAt: new Date() })
      .where(eq(federalIntelItemsTable.id, id))
      .returning();
    if (!rows.length) return res.status(404).json({ error: "Item not found" });
    return res.json({ item: rows[0] });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to update action tag" });
  }
});

// ── Refresh ───────────────────────────────────────────────────────────────────

router.post("/federal-intel/:bucket/refresh", async (req, res) => {
  const bucket = req.params.bucket as FederalIntelBucket;
  if (!VALID_BUCKETS.includes(bucket)) {
    return res.status(400).json({ error: "Invalid bucket" });
  }
  try {
    const { items: rawItems, sourceLog } = await fetchBucketWithDiagnostics(bucket);
    const now = new Date();
    const upserted: typeof federalIntelItemsTable.$inferSelect[] = [];

    for (const item of rawItems) {
      // Deterministic dedup key: prefer sourceUrl, fall back to relatedRef, then title
      const dedupKey = item.sourceUrl ?? item.relatedRef ?? item.title;
      const id = makeItemId(bucket, dedupKey);

      const rows = await db
        .insert(federalIntelItemsTable)
        .values({ id, ...item, fetchedAt: now, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: federalIntelItemsTable.id,
          set: {
            agency: item.agency ?? undefined,
            component: item.component ?? undefined,
            office: item.office ?? undefined,
            regionCountry: item.regionCountry ?? undefined,
            title: item.title,
            summary: item.summary ?? undefined,
            datePosted: item.datePosted ?? undefined,
            status: item.status ?? undefined,
            contractorIncumbent: item.contractorIncumbent ?? undefined,
            relatedRef: item.relatedRef ?? undefined,
            budgetSignal: item.budgetSignal ?? undefined,
            oversightSignal: item.oversightSignal ?? undefined,
            medicalTravelRelevance: item.medicalTravelRelevance ?? undefined,
            occuMedScore: item.occuMedScore ?? 0,
            sourceUrl: item.sourceUrl ?? undefined,
            rawJson: item.rawJson ?? undefined,
            fetchedAt: now,
            updatedAt: now,
            // Never overwrite a user-set actionTag — only set on new rows
          },
        })
        .returning();

      if (rows[0]) upserted.push(rows[0]);
    }

    return res.json({ items: upserted, count: upserted.length, bucket, sources: sourceLog });
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ error: err?.message ?? "Refresh failed" });
  }
});

// ── Per-bucket fetchers ───────────────────────────────────────────────────────

type IntelItem = Omit<typeof federalIntelItemsTable.$inferInsert, "id" | "createdAt" | "updatedAt" | "fetchedAt">;

interface SourceLogEntry { source: string; count: number; ok: boolean }

// Relevance for every item comes from the Neon-backed relevance profile (classifier score + the canonical
// accept/review/reject decision). Nothing in this file defines service vocabulary, agency lists or thresholds.
type ActionTag = "monitor" | "pursue" | "brief" | "contact" | "wait";

// Bounded size of the NAICS filter sent to SAM.gov / USAspending (the codes themselves come from the profile).
const MAX_NAICS_FILTER = 8;

const VERDICT_TAG: Record<RelevanceVerdict, ActionTag> = { accept: "pursue", review: "monitor", reject: "wait" };

function assess(title: string | null | undefined, text?: string | null, agency?: string | null, date?: string | Date | null): IntelAssessment {
  return assessIntelText({ title, text, agency, date });
}

/** Feed items that are not procurement notices: topical items get the brief tag, the rest stay on watch. */
function topicTag(assessment: IntelAssessment, topical: ActionTag = "brief", other: ActionTag = "monitor"): ActionTag {
  return assessment.topical ? topical : other;
}

/** Short query text for free-text government search endpoints, from the profile's search bundles. */
function profileQueryText(maxChars: number): string {
  return profileSemanticQuery(maxChars);
}

/**
 * Fetch items and compute a per-source breakdown from the returned items'
 * sourceType field. Provides observability without threading params through
 * every fetcher.
 */
async function fetchBucketWithDiagnostics(bucket: FederalIntelBucket): Promise<{ items: IntelItem[]; sourceLog: SourceLogEntry[] }> {
  const items = await fetchBucket(bucket);
  const countsBySource: Record<string, number> = {};
  for (const item of items) {
    const st = item.sourceType ?? "other";
    countsBySource[st] = (countsBySource[st] ?? 0) + 1;
  }
  const sourceLog: SourceLogEntry[] = Object.entries(countsBySource).map(([source, count]) => ({
    source,
    count,
    ok: count > 0,
  }));
  if (sourceLog.length === 0) {
    sourceLog.push({ source: bucket, count: 0, ok: false });
  }
  return { items, sourceLog };
}

async function fetchBucket(bucket: FederalIntelBucket): Promise<IntelItem[]> {
  switch (bucket) {
    case "forecast":          return fetchForecast();
    case "recompete-watch":   return fetchRecompeteWatch();
    case "agency-pain":       return fetchAgencyPain();
    case "policy-radar":      return fetchPolicyRadar();
    case "incumbent-tracker": return fetchIncumbentTracker();
    case "leadership-org":    return fetchLeadershipOrg();
    case "deployment-medical":return fetchDeploymentMedical();
    case "budget-funding":    return fetchBudgetFunding();
    case "protest-litigation":return fetchProtestLitigation();
  }
}

// ── Forecast: SAM.gov pre-solicitations + Acquisition.gov forecast RSS ────────

async function fetchForecast(): Promise<IntelItem[]> {
  const items: IntelItem[] = [];

  // SAM.gov pre-solicitation type=p
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (apiKey) {
    try {
      const today = new Date();
      const from = new Date(today);
      from.setDate(today.getDate() - 60);
      const fmt = (d: Date) =>
        `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

      const params = new URLSearchParams({
        api_key: apiKey,
        postedFrom: fmt(from),
        postedTo: fmt(today),
        ptype: "p",
        limit: "50",
        offset: "0",
      });
      const naicsCodes = await profileNaicsCodes(MAX_NAICS_FILTER);
      if (naicsCodes.length > 0) params.set("naics", naicsCodes.join(","));

      const resp = await fetch(`https://api.sam.gov/opportunities/v2/search?${params}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (resp.ok) {
        const json = (await resp.json()) as any;
        if (json.code !== "900804" && !json.message?.toLowerCase().includes("quota")) {
          for (const o of (json.opportunitiesData ?? []).slice(0, 40)) {
            const parts = (o.fullParentPathName ?? "").split(".");
            const assessment = assess(o.title, o.description, o.fullParentPathName, o.postedDate);
            items.push({
              bucket: "forecast" as const,
              sourceType: "sam_gov" as const,
              agency: parts[0]?.trim() ?? null,
              component: parts[1]?.trim() ?? null,
              office: o.officeAddress?.city ?? null,
              title: o.title ?? "Untitled",
              summary: o.description?.slice(0, 500) ?? null,
              datePosted: o.postedDate ? new Date(o.postedDate) : null,
              status: o.active === "Yes" ? "active" : "closed",
              relatedRef: o.solicitationNumber ?? null,
              occuMedScore: assessment.score,
              actionTag: VERDICT_TAG[assessment.verdict],
              sourceUrl: o.uiLink ?? null,
              rawJson: JSON.stringify(o),
            });
          }
        }
      }
    } catch (_) {}
  }

  // Acquisition.gov procurement forecast feeds RSS
  const acquisitionFeeds = [
    "https://www.acquisition.gov/far-site/rss",
    "https://www.acquisition.gov/rss/dfars",
  ];
  for (const feedUrl of acquisitionFeeds) {
    try {
      const resp = await fetch(feedUrl, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const text = await resp.text();
        const entries = parseRssItems(text, 15);
        for (const entry of entries) {
          const assessment = assess(entry.title, entry.description, "Acquisition.gov", entry.pubDate);
          items.push({
            bucket: "forecast" as const,
            sourceType: "acquisition_gov" as const,
            agency: "Acquisition.gov",
            title: entry.title,
            summary: entry.description?.slice(0, 400) ?? null,
            datePosted: entry.pubDate ? new Date(entry.pubDate) : null,
            status: "published",
            occuMedScore: assessment.score,
            actionTag: topicTag(assessment, "monitor", "wait"),
            sourceUrl: entry.link ?? null,
            rawJson: JSON.stringify(entry),
          });
        }
      }
    } catch (_) {}
  }

  // Serper fallback — search for federal occupational health contracts when SAM key is missing or returns nothing
  if (items.length < 5) {
    const serperConfigured = await serperProvider.isConfigured();
    if (serperConfigured) {
      // Search phrases come from the relevance profile's lead queries, split across three queries.
      const leads = profileLeadQueries();
      const year = new Date().getUTCFullYear();
      const third = Math.max(1, Math.ceil(leads.length / 3));
      const groups = [leads.slice(0, third), leads.slice(third, third * 2), leads.slice(third * 2)].filter((group) => group.length > 0);
      const queries = groups.map((group, index) =>
        index === 0
          ? `site:sam.gov (${quotedOr(group)}) contract ${year}`
          : `federal contract (${quotedOr(group)}) solicitation ${year}`,
      );
      try {
        const results = queries.length > 0 ? await serperProvider.searchMultiple(queries, 8) : [];
        for (const r of results) {
          const text = `${r.title} ${r.snippet ?? ""}`;
          const assessment = assess(r.title, r.snippet, null, null);
          // Agency name parsing only: any "Department of X" named in the result text.
          const agencyMatch = text.match(/\bdepartment of ([a-z]+)/i);
          items.push({
            bucket: "forecast" as const,
            sourceType: "serper_search" as const,
            agency: agencyMatch ? `Department of ${agencyMatch[1]}` : "Federal Government",
            component: null,
            office: null,
            title: r.title.slice(0, 255),
            summary: r.snippet?.slice(0, 500) ?? null,
            datePosted: new Date(),
            status: "active",
            relatedRef: null,
            occuMedScore: assessment.score,
            actionTag: VERDICT_TAG[assessment.verdict],
            sourceUrl: r.link ?? null,
            rawJson: JSON.stringify(r),
          });
        }
      } catch (_) {}
    }
  }

  return items;
}

// ── Recompete Watch: SAM.gov active notices (expiry) + USAspending ────────────

async function fetchRecompeteWatch(): Promise<IntelItem[]> {
  const items: IntelItem[] = [];
  const apiKey = process.env.SAM_GOV_API_KEY;

  // SAM.gov active notices in the profile's NAICS codes — approaching deadline/expiry
  if (apiKey) {
    try {
      const today = new Date();
      // Look at notices posted in the past 18 months for recompete signals
      const from = new Date(today);
      from.setMonth(today.getMonth() - 18);
      const fmt = (d: Date) =>
        `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

      const params = new URLSearchParams({
        api_key: apiKey,
        postedFrom: fmt(from),
        postedTo: fmt(today),
        ptype: "o",
        limit: "50",
        active: "Yes",
      });
      const recompeteNaics = await profileNaicsCodes(MAX_NAICS_FILTER);
      if (recompeteNaics.length > 0) params.set("naics", recompeteNaics.join(","));

      const resp = await fetch(`https://api.sam.gov/opportunities/v2/search?${params}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (resp.ok) {
        const json = (await resp.json()) as any;
        if (json.code !== "900804" && !json.message?.toLowerCase().includes("quota")) {
          for (const o of (json.opportunitiesData ?? []).slice(0, 30)) {
            const parts = (o.fullParentPathName ?? "").split(".");
            const deadlineDate = o.responseDeadLine ? new Date(o.responseDeadLine) : null;
            const daysToDeadline = deadlineDate ? Math.floor((deadlineDate.getTime() - today.getTime()) / 86400000) : null;
            const isUrgent = daysToDeadline !== null && daysToDeadline >= 0 && daysToDeadline < 90;
            const assessment = assess(o.title, o.description, o.fullParentPathName, o.postedDate);
            items.push({
              bucket: "recompete-watch" as const,
              sourceType: "sam_gov" as const,
              agency: parts[0]?.trim() ?? null,
              component: parts[1]?.trim() ?? null,
              title: o.title ?? "Active Notice",
              summary: o.description?.slice(0, 400) ?? null,
              datePosted: o.postedDate ? new Date(o.postedDate) : null,
              status: isUrgent ? "closing-soon" : "active",
              relatedRef: o.solicitationNumber ?? null,
              occuMedScore: assessment.score,
              actionTag: isUrgent && assessment.verdict !== "reject" ? "pursue" : "monitor",
              sourceUrl: o.uiLink ?? null,
              rawJson: JSON.stringify(o),
            });
          }
        }
      }
    } catch (_) {}
  }

  // USAspending awards in the profile's NAICS codes — check expiry window
  try {
    const body = {
      filters: {
        naics_codes: await profileNaicsCodes(MAX_NAICS_FILTER),
        award_type_codes: ["A", "B", "C", "D"],
        time_period: [{ start_date: "2022-01-01", end_date: new Date().toISOString().slice(0, 10) }],
      },
      fields: ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "Awarding Sub Agency", "Start Date", "End Date", "Description", "NAICS Code"],
      sort: "Award Amount",
      order: "desc",
      limit: 40,
      page: 1,
    };

    const resp = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (resp.ok) {
      const json = (await resp.json()) as any;
      const today = new Date();
      for (const r of (json.results ?? []).slice(0, 40)) {
        const endDate = r["End Date"] ? new Date(r["End Date"]) : null;
        const daysToExpiry = endDate ? Math.floor((endDate.getTime() - today.getTime()) / 86400000) : null;
        const isRecompeting = daysToExpiry !== null && daysToExpiry < 548;
        const assessment = assess(r["Description"], r["Description"], `${r["Awarding Agency"] ?? ""} ${r["Awarding Sub Agency"] ?? ""}`, r["Start Date"]);

        items.push({
          bucket: "recompete-watch" as const,
          sourceType: "usaspending" as const,
          agency: r["Awarding Agency"] ?? null,
          component: r["Awarding Sub Agency"] ?? null,
          title: `Award: ${r["Award ID"] ?? "Unknown"} — ${r["Recipient Name"] ?? "Unknown"}`,
          summary: r["Description"]?.slice(0, 400) ?? null,
          datePosted: r["Start Date"] ? new Date(r["Start Date"]) : null,
          status: isRecompeting ? "recompete-window" : "active",
          contractorIncumbent: r["Recipient Name"] ?? null,
          relatedRef: r["Award ID"] ?? null,
          budgetSignal: r["Award Amount"] ? `$${Number(r["Award Amount"]).toLocaleString()}` : null,
          occuMedScore: assessment.score,
          actionTag: isRecompeting ? "pursue" : "monitor",
          sourceUrl: r["Award ID"] ? `https://www.usaspending.gov/award/${encodeURIComponent(r["Award ID"])}` : null,
          rawJson: JSON.stringify(r),
        });
      }
    }
  } catch (_) {}

  return items;
}

// ── Agency Pain: Oversight.gov + GAO RSS + DHS/DoD OIG feeds ─────────────────

async function fetchAgencyPain(): Promise<IntelItem[]> {
  const items: IntelItem[] = [];

  // Oversight.gov full-text search
  try {
    const url = new URL("https://efts.oversight.gov/public_search/");
    url.searchParams.set("query", profileQueryText(120));
    url.searchParams.set("result_type", "report");
    url.searchParams.set("date_range_field", "report_date");
    url.searchParams.set("date_start", "2023-01-01");
    url.searchParams.set("sort", "date_desc");
    url.searchParams.set("size", "30");

    const resp = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });

    if (resp.ok) {
      const json = (await resp.json()) as any;
      const hits = json.hits?.hits ?? json.results ?? [];
      for (const h of hits.slice(0, 25)) {
        const src = h._source ?? h;
        const assessment = assess(src.title ?? src.report_title, src.summary ?? src.highlights?.join(" "), src.agency_name ?? src.agency, src.report_date);
        items.push({
          bucket: "agency-pain" as const,
          sourceType: "oversight_gov" as const,
          agency: src.agency_name ?? src.agency ?? null,
          title: src.title ?? src.report_title ?? "Oversight Report",
          summary: src.summary ?? src.highlights?.join(" ")?.slice(0, 400) ?? null,
          datePosted: src.report_date ? new Date(src.report_date) : null,
          status: "published",
          oversightSignal: src.report_type ?? null,
          relatedRef: src.report_number ?? null,
          occuMedScore: assessment.score,
          actionTag: "brief",
          sourceUrl: src.url ?? (src.id ? `https://www.oversight.gov/report/${src.id}` : null),
          rawJson: JSON.stringify(src),
        });
      }
    }
  } catch (_) {}

  // GAO reports RSS
  try {
    const resp = await fetch("https://www.gao.gov/rss/reports.xml", { signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      const text = await resp.text();
      for (const entry of parseRssItems(text, 15)) {
        const assessment = assess(entry.title, entry.description, "GAO", entry.pubDate);
        items.push({
          bucket: "agency-pain" as const,
          sourceType: "gao" as const,
          agency: "GAO",
          title: entry.title,
          summary: entry.description?.slice(0, 400) ?? null,
          datePosted: entry.pubDate ? new Date(entry.pubDate) : null,
          status: "published",
          oversightSignal: "GAO Report",
          occuMedScore: assessment.score,
          actionTag: topicTag(assessment),
          sourceUrl: entry.link ?? null,
          rawJson: JSON.stringify(entry),
        });
      }
    }
  } catch (_) {}

  // DHS OIG RSS
  try {
    const resp = await fetch("https://www.oig.dhs.gov/rss/reports.xml", { signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      const text = await resp.text();
      for (const entry of parseRssItems(text, 12)) {
        const assessment = assess(entry.title, entry.description, "DHS OIG", entry.pubDate);
        items.push({
          bucket: "agency-pain" as const,
          sourceType: "oig" as const,
          agency: "DHS",
          component: "OIG",
          title: entry.title,
          summary: entry.description?.slice(0, 400) ?? null,
          datePosted: entry.pubDate ? new Date(entry.pubDate) : null,
          status: "published",
          oversightSignal: "DHS OIG Report",
          occuMedScore: assessment.score,
          actionTag: topicTag(assessment),
          sourceUrl: entry.link ?? null,
          rawJson: JSON.stringify(entry),
        });
      }
    }
  } catch (_) {}

  // DoD OIG RSS
  try {
    const resp = await fetch("https://www.dodig.mil/rss/reports.xml", { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error("DoD OIG RSS unavailable");
    const text = await resp.text();
    for (const entry of parseRssItems(text, 12)) {
      const assessment = assess(entry.title, entry.description, "DoD OIG", entry.pubDate);
      items.push({
        bucket: "agency-pain" as const,
        sourceType: "oig" as const,
        agency: "DoD",
        component: "OIG",
        title: entry.title,
        summary: entry.description?.slice(0, 400) ?? null,
        datePosted: entry.pubDate ? new Date(entry.pubDate) : null,
        status: "published",
        oversightSignal: "DoD OIG Report",
        occuMedScore: assessment.score,
        actionTag: topicTag(assessment),
        sourceUrl: entry.link ?? null,
        rawJson: JSON.stringify(entry),
      });
    }
  } catch (_) {}

  return items;
}

// ── Policy Radar: Federal Register + Acquisition.gov FAR/DFARS RSS ───────────

async function fetchPolicyRadar(): Promise<IntelItem[]> {
  const items: IntelItem[] = [];

  // Federal Register articles API (no key required)
  try {
    const url = new URL("https://www.federalregister.gov/api/v1/articles.json");
    url.searchParams.set("conditions[term]", profileQueryText(120));
    url.searchParams.set("conditions[type][]", "RULE");
    url.searchParams.set("conditions[type][]", "PRORULE");
    url.searchParams.set("conditions[type][]", "NOTICE");
    url.searchParams.set("per_page", "30");
    url.searchParams.set("order", "newest");

    const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
    if (resp.ok) {
      const json = (await resp.json()) as any;
      for (const a of (json.results ?? []).slice(0, 25)) {
        const assessment = assess(a.title, a.abstract, a.agencies?.[0]?.name, a.publication_date);
        items.push({
          bucket: "policy-radar" as const,
          sourceType: "federal_register" as const,
          agency: a.agencies?.[0]?.name ?? null,
          title: a.title ?? "Federal Register Notice",
          summary: a.abstract?.slice(0, 500) ?? null,
          datePosted: a.publication_date ? new Date(a.publication_date) : null,
          status: a.type ?? null,
          relatedRef: a.document_number ?? null,
          occuMedScore: assessment.score,
          actionTag: "monitor",
          sourceUrl: a.html_url ?? null,
          rawJson: JSON.stringify(a),
        });
      }
    }
  } catch (_) {}

  // Acquisition.gov FAR/DFARS change feed RSS
  const acqFeeds = [
    "https://www.acquisition.gov/far-site/rss",
    "https://www.acquisition.gov/rss/dfars",
  ];
  for (const feedUrl of acqFeeds) {
    try {
      const resp = await fetch(feedUrl, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const text = await resp.text();
        for (const entry of parseRssItems(text, 12)) {
          const assessment = assess(entry.title, entry.description, "Acquisition.gov", entry.pubDate);
          items.push({
            bucket: "policy-radar" as const,
            sourceType: "acquisition_gov" as const,
            agency: "Acquisition.gov",
            title: entry.title,
            summary: entry.description?.slice(0, 400) ?? null,
            datePosted: entry.pubDate ? new Date(entry.pubDate) : null,
            status: "FAR/DFARS Update",
            occuMedScore: assessment.score,
            actionTag: "monitor",
            sourceUrl: entry.link ?? null,
            rawJson: JSON.stringify(entry),
          });
        }
      }
    } catch (_) {}
  }

  return items;
}

// ── Incumbent Tracker: USAspending NAICS awards at priority agencies ──────────

async function fetchIncumbentTracker(): Promise<IntelItem[]> {
  const body = {
    filters: {
      naics_codes: await profileNaicsCodes(MAX_NAICS_FILTER),
      award_type_codes: ["A", "B", "C", "D"],
      time_period: [{ start_date: "2022-01-01", end_date: new Date().toISOString().slice(0, 10) }],
    },
    fields: ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "Awarding Sub Agency", "Start Date", "End Date", "Description", "NAICS Code", "NAICS Description"],
    sort: "Award Amount",
    order: "desc",
    limit: 50,
    page: 1,
  };

  const resp = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) throw new Error(`USAspending ${resp.status}`);
  const json = (await resp.json()) as any;
  const today = new Date();

  return (json.results ?? []).slice(0, 40).map((r: any) => {
    const assessment = assess(
      r["Description"],
      `${r["Description"] ?? ""} ${r["NAICS Description"] ?? ""}`,
      `${r["Awarding Agency"] ?? ""} ${r["Awarding Sub Agency"] ?? ""}`,
      r["Start Date"],
    );
    return {
      bucket: "incumbent-tracker" as const,
      sourceType: "usaspending" as const,
      agency: r["Awarding Agency"] ?? null,
      component: r["Awarding Sub Agency"] ?? null,
      title: `${r["Recipient Name"] ?? "Unknown Recipient"} — ${r["NAICS Description"] ?? r["NAICS Code"] ?? "Healthcare"}`,
      summary: r["Description"]?.slice(0, 400) ?? null,
      datePosted: r["Start Date"] ? new Date(r["Start Date"]) : null,
      status: r["End Date"] && new Date(r["End Date"]) > today ? "active" : "expired",
      contractorIncumbent: r["Recipient Name"] ?? null,
      relatedRef: r["Award ID"] ?? null,
      budgetSignal: r["Award Amount"] ? `$${Number(r["Award Amount"]).toLocaleString()}` : null,
      occuMedScore: assessment.score,
      actionTag: "monitor" as const,
      sourceUrl: r["Award ID"] ? `https://www.usaspending.gov/award/${encodeURIComponent(r["Award ID"])}` : null,
      rawJson: JSON.stringify(r),
    };
  });
}

// ── Leadership Org: USAJOBS + agency pressroom RSS ────────────────────────────

async function fetchLeadershipOrg(): Promise<IntelItem[]> {
  const items: IntelItem[] = [];

  // USAJOBS search — postings matching the profile's lead service query
  try {
    const url = new URL("https://data.usajobs.gov/api/search");
    url.searchParams.set("Keyword", profileLeadQueries(1)[0] ?? "");
    url.searchParams.set("ResultsPerPage", "50");
    url.searchParams.set("SortField", "DatePosted");
    url.searchParams.set("SortDirection", "Desc");
    url.searchParams.set("WhoMayApply", "All");

    const resp = await fetch(url.toString(), {
      headers: {
        "Authorization-Key": process.env.USAJOBS_API_KEY ?? "DEMO_KEY",
        "User-Agent": "Occu-Med-IntelSuite/1.0",
        Host: "data.usajobs.gov",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (resp.ok) {
      const json = (await resp.json()) as any;
      for (const job of (json.SearchResult?.SearchResultItems ?? []).slice(0, 30)) {
        const pos = job.MatchedObjectDescriptor ?? {};
        const assessment = assess(pos.PositionTitle, pos.UserArea?.Details?.MajorDuties?.[0], `${pos.DepartmentName ?? ""} ${pos.OrganizationName ?? ""}`, pos.PublicationStartDate);
        items.push({
          bucket: "leadership-org" as const,
          sourceType: "usajobs" as const,
          agency: pos.DepartmentName ?? null,
          component: pos.OrganizationName ?? null,
          office: pos.PositionLocationDisplay ?? null,
          title: pos.PositionTitle ?? "Senior Position",
          summary: pos.UserArea?.Details?.MajorDuties?.[0]?.slice(0, 400) ?? pos.PositionTitle,
          datePosted: pos.PublicationStartDate ? new Date(pos.PublicationStartDate) : null,
          status: pos.PositionStatus ?? "open",
          relatedRef: pos.PositionID ?? null,
          occuMedScore: assessment.score,
          actionTag: "contact" as const,
          sourceUrl: pos.PositionURI ?? pos.ApplyURI?.[0] ?? null,
          rawJson: JSON.stringify(pos),
        });
      }
    }
  } catch (_) {}

  // DHS pressroom RSS
  try {
    const resp = await fetch("https://www.dhs.gov/news/rss", { signal: AbortSignal.timeout(8000) });
    if (resp.ok) {
      const text = await resp.text();
      for (const entry of parseRssItems(text, 8)) {
        if (/appoint|director|chief|leadership|personnel|named/i.test(entry.title + " " + (entry.description ?? ""))) {
          const assessment = assess(entry.title, entry.description, null, entry.pubDate);
          items.push({
            bucket: "leadership-org" as const,
            sourceType: "rss_feed" as const,
            agency: "DHS",
            title: entry.title,
            summary: entry.description?.slice(0, 400) ?? null,
            datePosted: entry.pubDate ? new Date(entry.pubDate) : null,
            status: "published",
            occuMedScore: assessment.score,
            actionTag: "monitor" as const,
            sourceUrl: entry.link ?? null,
            rawJson: JSON.stringify(entry),
          });
        }
      }
    }
  } catch (_) {}

  // DoD news RSS
  try {
    const resp = await fetch("https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=10", { signal: AbortSignal.timeout(8000) });
    if (resp.ok) {
      const text = await resp.text();
      for (const entry of parseRssItems(text, 8)) {
        if (/appoint|director|chief|leadership|personnel|named/i.test(entry.title + " " + (entry.description ?? ""))) {
          const assessment = assess(entry.title, entry.description, null, entry.pubDate);
          items.push({
            bucket: "leadership-org" as const,
            sourceType: "rss_feed" as const,
            agency: "DoD",
            title: entry.title,
            summary: entry.description?.slice(0, 400) ?? null,
            datePosted: entry.pubDate ? new Date(entry.pubDate) : null,
            status: "published",
            occuMedScore: assessment.score,
            actionTag: "monitor" as const,
            sourceUrl: entry.link ?? null,
            rawJson: JSON.stringify(entry),
          });
        }
      }
    }
  } catch (_) {}

  return items;
}

// ── Deployment Medical: CDC + State Dept + FAA ───────────────────────────────

async function fetchDeploymentMedical(): Promise<IntelItem[]> {
  const items: IntelItem[] = [];

  // CDC Travel Health Notices RSS
  try {
    const resp = await fetch("https://tools.cdc.gov/api/v2/resources/media/310621.rss", { signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      const text = await resp.text();
      for (const entry of parseRssItems(text, 20)) {
        const assessment = assess(entry.title, entry.description, "CDC", entry.pubDate);
        items.push({
          bucket: "deployment-medical" as const,
          sourceType: "cdc" as const,
          agency: "CDC",
          regionCountry: extractCountryFromTitle(entry.title),
          title: entry.title,
          summary: entry.description?.slice(0, 400) ?? null,
          datePosted: entry.pubDate ? new Date(entry.pubDate) : null,
          status: "active",
          medicalTravelRelevance: "CDC Travel Health Notice",
          occuMedScore: assessment.score,
          actionTag: "brief" as const,
          sourceUrl: entry.link ?? null,
          rawJson: JSON.stringify(entry),
        });
      }
    }
  } catch (_) {}

  // State Dept Travel Advisories RSS
  try {
    const resp = await fetch("https://travel.state.gov/_res/rss/TAsTWs.xml", { signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      const text = await resp.text();
      for (const entry of parseRssItems(text, 20)) {
        // Advisory severity parsing (State Department level wording), not Occu-Med relevance.
        const isHigh = /level [34]|do not travel|reconsider/i.test(entry.title + " " + (entry.description ?? ""));
        const assessment = assess(entry.title, entry.description, "State Department", entry.pubDate);
        items.push({
          bucket: "deployment-medical" as const,
          sourceType: "state_dept" as const,
          agency: "State Department",
          regionCountry: entry.title?.replace(/- Level.*$/i, "").trim() ?? null,
          title: entry.title,
          summary: entry.description?.slice(0, 400) ?? null,
          datePosted: entry.pubDate ? new Date(entry.pubDate) : null,
          status: "active",
          medicalTravelRelevance: "Travel Advisory",
          occuMedScore: assessment.score,
          actionTag: isHigh ? "brief" : "monitor" as const,
          sourceUrl: entry.link ?? null,
          rawJson: JSON.stringify(entry),
        });
      }
    }
  } catch (_) {}

  // FAA Safety Briefing / Aviation Medicine news RSS
  try {
    const resp = await fetch("https://www.faa.gov/newsroom/rss_feeds/combined_news_feed.xml", { signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      const text = await resp.text();
      for (const entry of parseRssItems(text, 15)) {
        const assessment = assess(entry.title, entry.description, "FAA", entry.pubDate);
        if (assessment.topical) {
          items.push({
            bucket: "deployment-medical" as const,
            sourceType: "faa" as const,
            agency: "FAA",
            title: entry.title,
            summary: entry.description?.slice(0, 400) ?? null,
            datePosted: entry.pubDate ? new Date(entry.pubDate) : null,
            status: "published",
            medicalTravelRelevance: "FAA Aviation Medicine",
            occuMedScore: assessment.score,
            actionTag: "brief" as const,
            sourceUrl: entry.link ?? null,
            rawJson: JSON.stringify(entry),
          });
        }
      }
    }
  } catch (_) {}

  return items;
}

function extractCountryFromTitle(title: string): string | null {
  if (!title) return null;
  const m = title.match(/^([^-–]+)/);
  return m ? m[1].trim() : title.slice(0, 50);
}

// ── Budget Funding: GovInfo + OMB circulars ───────────────────────────────────

async function fetchBudgetFunding(): Promise<IntelItem[]> {
  const items: IntelItem[] = [];

  // GovInfo search API (public)
  try {
    const url = new URL("https://api.govinfo.gov/search");
    url.searchParams.set("query", `${profileQueryText(100)} federal budget`);
    url.searchParams.set("pageSize", "30");
    url.searchParams.set("collection", "BUDGET,OMB");
    url.searchParams.set("sortBy", "dateIssued:desc");

    const resp = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });

    if (resp.ok) {
      const json = (await resp.json()) as any;
      for (const doc of (json.results ?? []).slice(0, 25)) {
        const assessment = assess(doc.title, doc.abstractText, doc.governmentAuthor1 ?? doc.departmentName, doc.dateIssued);
        items.push({
          bucket: "budget-funding" as const,
          sourceType: "govinfo" as const,
          agency: doc.governmentAuthor1 ?? doc.departmentName ?? null,
          title: doc.title ?? "Budget Document",
          summary: doc.abstractText?.slice(0, 400) ?? doc.title,
          datePosted: doc.dateIssued ? new Date(doc.dateIssued) : null,
          status: doc.collectionCode ?? null,
          budgetSignal: doc.collectionCode ?? null,
          relatedRef: doc.packageId ?? null,
          occuMedScore: assessment.score,
          actionTag: "monitor" as const,
          sourceUrl: doc.packageLink ?? null,
          rawJson: JSON.stringify(doc),
        });
      }
    }
  } catch (_) {}

  // OMB circulars RSS
  try {
    const resp = await fetch("https://www.whitehouse.gov/omb/information-for-agencies/circulars/feed/", { signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      const text = await resp.text();
      for (const entry of parseRssItems(text, 10)) {
        const assessment = assess(entry.title, entry.description, "OMB", entry.pubDate);
        items.push({
          bucket: "budget-funding" as const,
          sourceType: "omb" as const,
          agency: "OMB",
          title: entry.title,
          summary: entry.description?.slice(0, 400) ?? null,
          datePosted: entry.pubDate ? new Date(entry.pubDate) : null,
          status: "published",
          budgetSignal: "OMB Circular",
          occuMedScore: assessment.score,
          actionTag: "monitor" as const,
          sourceUrl: entry.link ?? null,
          rawJson: JSON.stringify(entry),
        });
      }
    }
  } catch (_) {}

  return items;
}

// ── Protest Litigation: GAO bid protests + Acquisition.gov FAR deviations ─────

async function fetchProtestLitigation(): Promise<IntelItem[]> {
  const items: IntelItem[] = [];

  // GAO bid protest decisions RSS
  try {
    const resp = await fetch("https://www.gao.gov/rss/legal.xml", { signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      const text = await resp.text();
      for (const entry of parseRssItems(text, 25)) {
        const assessment = assess(entry.title, entry.description, "GAO", entry.pubDate);
        items.push({
          bucket: "protest-litigation" as const,
          sourceType: "gao" as const,
          agency: "GAO",
          title: entry.title,
          summary: entry.description?.slice(0, 400) ?? null,
          datePosted: entry.pubDate ? new Date(entry.pubDate) : null,
          status: "published",
          oversightSignal: "GAO Bid Protest",
          occuMedScore: assessment.score,
          actionTag: topicTag(assessment),
          sourceUrl: entry.link ?? null,
          rawJson: JSON.stringify(entry),
        });
      }
    }
  } catch (_) {}

  // Acquisition.gov FAR/DFARS deviation pages RSS
  const acqFeeds = [
    "https://www.acquisition.gov/far-site/rss",
    "https://www.acquisition.gov/rss/dfars",
  ];
  for (const feedUrl of acqFeeds) {
    try {
      const resp = await fetch(feedUrl, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const text = await resp.text();
        for (const entry of parseRssItems(text, 10)) {
          // FAR deviation / protest event wording: notice-type parsing, not Occu-Med relevance.
          if (/deviation|waiver|class deviation|protest/i.test(entry.title + " " + (entry.description ?? ""))) {
            const assessment = assess(entry.title, entry.description, "Acquisition.gov", entry.pubDate);
            items.push({
              bucket: "protest-litigation" as const,
              sourceType: "acquisition_gov" as const,
              agency: "Acquisition.gov",
              title: entry.title,
              summary: entry.description?.slice(0, 400) ?? null,
              datePosted: entry.pubDate ? new Date(entry.pubDate) : null,
              status: "FAR Deviation",
              occuMedScore: assessment.score,
              actionTag: "monitor" as const,
              sourceUrl: entry.link ?? null,
              rawJson: JSON.stringify(entry),
            });
          }
        }
      }
    } catch (_) {}
  }

  // USAspending recent awards (protest signal monitoring)
  try {
    const body = {
      filters: {
        naics_codes: await profileNaicsCodes(MAX_NAICS_FILTER),
        award_type_codes: ["A", "B", "C", "D"],
        time_period: [{ start_date: "2024-06-01", end_date: new Date().toISOString().slice(0, 10) }],
      },
      fields: ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "Awarding Sub Agency", "Start Date"],
      sort: "Start Date",
      order: "desc",
      limit: 20,
      page: 1,
    };

    const resp = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });

    if (resp.ok) {
      const json = (await resp.json()) as any;
      for (const r of (json.results ?? []).slice(0, 15)) {
        const assessment = assess(r["Description"] ?? r["Recipient Name"], r["Description"], `${r["Awarding Agency"] ?? ""} ${r["Awarding Sub Agency"] ?? ""}`, r["Start Date"]);
        items.push({
          bucket: "protest-litigation" as const,
          sourceType: "usaspending" as const,
          agency: r["Awarding Agency"] ?? null,
          component: r["Awarding Sub Agency"] ?? null,
          title: `Recent Award — ${r["Recipient Name"] ?? "Unknown"} (${r["Award ID"] ?? ""})`,
          summary: `Award of ${r["Award Amount"] ? "$" + Number(r["Award Amount"]).toLocaleString() : "unknown amount"} to ${r["Recipient Name"] ?? "unknown"}. Monitor for protest activity.`,
          datePosted: r["Start Date"] ? new Date(r["Start Date"]) : null,
          status: "awarded",
          contractorIncumbent: r["Recipient Name"] ?? null,
          relatedRef: r["Award ID"] ?? null,
          budgetSignal: r["Award Amount"] ? `$${Number(r["Award Amount"]).toLocaleString()}` : null,
          occuMedScore: assessment.score,
          actionTag: "monitor" as const,
          sourceUrl: r["Award ID"] ? `https://www.usaspending.gov/award/${encodeURIComponent(r["Award ID"])}` : null,
          rawJson: JSON.stringify(r),
        });
      }
    }
  } catch (_) {}

  return items;
}

// ── RSS parser utility ────────────────────────────────────────────────────────

function parseRssItems(xml: string, limit = 20): { title: string; description: string | null; link: string | null; pubDate: string | null }[] {
  const items: { title: string; description: string | null; link: string | null; pubDate: string | null }[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  const getTag = (content: string, tag: string): string | null => {
    const m = content.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i"));
    return m ? m[1].trim() : null;
  };

  while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
    const content = match[1];
    const title = getTag(content, "title") ?? "Untitled";
    const description = getTag(content, "description") ?? getTag(content, "summary");
    const link = getTag(content, "link") ?? getTag(content, "guid");
    const pubDate = getTag(content, "pubDate") ?? getTag(content, "dc:date") ?? getTag(content, "published");
    items.push({ title, description, link, pubDate });
  }

  return items;
}

export default router;
