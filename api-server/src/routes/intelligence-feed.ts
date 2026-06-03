/**
 * Intelligence Feed Routes
 *
 * GET  /api/intel-feed              — list items (filters: scope, stateCode, signalType, feedback, page, limit)
 * POST /api/intel-feed/fetch        — trigger a fetch for federal or a specific state
 * PATCH /api/intel-feed/:id/feedback — save | dismiss | reset an item
 * GET  /api/intel-feed/signals      — get feedback signal weights for learning
 */

import { Router } from "express";
import { createHash, randomUUID } from "crypto";
import { eq, and, desc, inArray, sql, count as countFn } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  intelFeedItemsTable,
  intelFeedSignalsTable,
  type InsertIntelFeedItem,
  type IntelSignalType,
  type IntelSource,
} from "@workspace/db/schema";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeDate(value: string | number | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeDate(value: string | number | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function makeId(scope: string, stateCode: string | null, externalId: string): string {
  const hash = createHash("sha256")
    .update(`${scope}::${stateCode ?? "federal"}::${externalId}`)
    .digest("hex");
  return [hash.slice(0,8), hash.slice(8,12), "5" + hash.slice(13,16), hash.slice(16,20), hash.slice(20,32)].join("-");
}

// ── GET /api/intel-feed ───────────────────────────────────────────────────────

router.get("/intel-feed", async (req, res) => {
  const {
    scope,
    stateCode,
    signalType,
    feedback,
    page: pageStr = "1",
    limit: limitStr = "50",
  } = req.query as Record<string, string>;

  const page  = Math.max(1, parseInt(pageStr, 10));
  const limit = Math.min(200, Math.max(1, parseInt(limitStr, 10)));
  const offset = (page - 1) * limit;

  try {
    const conditions: any[] = [];
    if (scope)       conditions.push(eq(intelFeedItemsTable.scope, scope as any));
    if (stateCode)   conditions.push(eq(intelFeedItemsTable.stateCode, stateCode));
    if (signalType && signalType !== "all") conditions.push(eq(intelFeedItemsTable.signalType, signalType as any));
    if (feedback && feedback !== "all")     conditions.push(eq(intelFeedItemsTable.feedback, feedback as any));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
      db.select().from(intelFeedItemsTable)
        .where(where)
        .orderBy(desc(intelFeedItemsTable.publishedDate), desc(intelFeedItemsTable.fetchedAt))
        .limit(limit).offset(offset),
      db.select({ count: countFn() }).from(intelFeedItemsTable).where(where),
    ]);

    const total = Number(totalRows[0]?.count ?? 0);
    return res.json({ items: rows, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to list intel feed items" });
  }
});

// ── PATCH /api/intel-feed/:id/feedback ────────────────────────────────────────

router.patch("/intel-feed/:id/feedback", async (req, res) => {
  const { id } = req.params;
  const { feedback } = req.body as { feedback: "saved" | "dismissed" | "new" };

  if (!["saved", "dismissed", "new"].includes(feedback)) {
    return res.status(400).json({ error: "Invalid feedback value" });
  }

  try {
    const rows = await db
      .update(intelFeedItemsTable)
      .set({ feedback: feedback as any, updatedAt: new Date() })
      .where(eq(intelFeedItemsTable.id, id))
      .returning();

    if (!rows.length) return res.status(404).json({ error: "Item not found" });

    const item = rows[0]!;

    // Update signal weights
    if (feedback !== "new") {
      await upsertSignal(
        item.signalType,
        item.source,
        item.stateCode ?? null,
        feedback === "saved" ? 1 : 0,
        feedback === "dismissed" ? 1 : 0,
      );
    }

    return res.json({ item });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to update feedback" });
  }
});

// ── Signal upsert helper ──────────────────────────────────────────────────────

async function upsertSignal(
  signalType: IntelSignalType,
  source: IntelSource,
  stateCode: string | null,
  saved: number,
  dismissed: number,
) {
  const sigId = makeId("signal", stateCode, `${signalType}::${source}`);
  await db.insert(intelFeedSignalsTable).values({
    id: sigId,
    signalType,
    source,
    stateCode,
    savedCount: saved,
    dismissedCount: dismissed,
    totalCount: 1,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: intelFeedSignalsTable.id,
    set: {
      savedCount: sql`${intelFeedSignalsTable.savedCount} + ${saved}`,
      dismissedCount: sql`${intelFeedSignalsTable.dismissedCount} + ${dismissed}`,
      totalCount: sql`${intelFeedSignalsTable.totalCount} + 1`,
      updatedAt: new Date(),
    },
  });
}

// ── GET /api/intel-feed/signals ───────────────────────────────────────────────

router.get("/intel-feed/signals", async (_req, res) => {
  try {
    const rows = await db.select().from(intelFeedSignalsTable).orderBy(desc(intelFeedSignalsTable.updatedAt));
    return res.json({ signals: rows });
  } catch (err) {
    return res.status(500).json({ error: "Failed to get signals" });
  }
});

// ── POST /api/intel-feed/fetch ────────────────────────────────────────────────

router.post("/intel-feed/fetch", async (req, res) => {
  const { scope = "federal", stateCode, dateRange = 30 } = req.body as {
    scope?: "federal" | "state";
    stateCode?: string;
    dateRange?: number;
  };

  try {
    let items: Omit<InsertIntelFeedItem, "id">[] = [];
    const errors: string[] = [];

    if (scope === "federal") {
      const [frItems, errs1] = await fetchFederalRegister(dateRange);
      const [usaItems, errs2] = await fetchUSASpendingExpiring();
      const [samItems, errs3] = await fetchSAMAwards(dateRange);
      const [serperItems, errs4] = await fetchFederalSerper(dateRange);
      items = [...frItems, ...usaItems, ...samItems, ...serperItems];
      errors.push(...errs1, ...errs2, ...errs3, ...errs4);
    } else if (scope === "state" && stateCode) {
      const [stateItems, errs] = await fetchStateIntel(stateCode, dateRange);
      items = stateItems;
      errors.push(...errs);
    }

    const now = new Date();
    let created = 0, updated = 0;

    for (const item of items) {
      try {
        const dedupKey = item.externalId ?? item.sourceUrl ?? item.title;
        const id = makeId(item.scope ?? "federal", item.stateCode ?? null, dedupKey);
        const existing = await db.select({ id: intelFeedItemsTable.id, feedback: intelFeedItemsTable.feedback })
          .from(intelFeedItemsTable).where(eq(intelFeedItemsTable.id, id)).limit(1);

        // Don't overwrite user feedback on re-fetch
        const keepFeedback = existing[0]?.feedback ?? "new";

        // Sanitize publishedDate — reject invalid Date objects before insert
        const publishedDate = item.publishedDate instanceof Date && !isNaN(item.publishedDate.getTime())
          ? item.publishedDate : null;

        await db.insert(intelFeedItemsTable).values({
          ...item, id, publishedDate, feedback: keepFeedback as any,
          fetchedAt: now, createdAt: now, updatedAt: now,
        }).onConflictDoUpdate({
          target: intelFeedItemsTable.id,
          set: {
            title: item.title,
            summary: item.summary ?? undefined,
            agency: item.agency ?? undefined,
            signalType: item.signalType ?? "other",
            source: item.source ?? "other",
            sourceUrl: item.sourceUrl ?? undefined,
            publishedDate,
            relevanceScore: item.relevanceScore ?? 50,
            rawJson: item.rawJson ?? undefined,
            fetchedAt: now,
            updatedAt: now,
          },
        });

        if (existing.length) updated++; else created++;
      } catch (itemErr: any) {
        errors.push(`Item insert failed [${item.externalId ?? item.title?.slice(0,40)}]: ${itemErr?.message}`);
      }
    }

    return res.json({ fetched: items.length, created, updated, scope, stateCode, errors });
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ error: err?.message ?? "Fetch failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FETCHERS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Federal Register ──────────────────────────────────────────────────────────

async function fetchFederalRegister(dateRange: number): Promise<[InsertIntelFeedItem[], string[]]> {
  const items: Omit<InsertIntelFeedItem, "id">[] = [];
  const errors: string[] = [];
  try {
    const from = new Date();
    from.setDate(from.getDate() - dateRange);
    const fromStr = from.toISOString().split("T")[0];

    const keywords = [
      "occupational health", "workplace safety", "OSHA", "drug testing",
      "physical examination", "DOT physical", "workers compensation",
      "occupational medicine", "health screening", "medical surveillance",
    ];

    for (const kw of keywords.slice(0, 5)) {
      try {
        const params = new URLSearchParams({
          "conditions[term]": kw,
          "conditions[publication_date][gte]": fromStr,
          "fields[]": "title,abstract,document_number,publication_date,agencies,type,html_url",
          "per_page": "10",
          "order": "newest",
        });
        const resp = await fetch(`https://www.federalregister.gov/api/v1/documents.json?${params}`, {
          signal: AbortSignal.timeout(12000),
        });
        if (!resp.ok) continue;
        const json = await resp.json() as any;
        for (const doc of (json.results ?? []).slice(0, 8)) {
          const signalType = mapFRTypeToSignal(doc.type);
          items.push({
            scope: "federal",
            stateCode: null,
            signalType,
            source: "federal_register",
            agency: doc.agencies?.[0]?.name ?? "Federal Register",
            title: doc.title,
            summary: doc.abstract?.slice(0, 600) ?? null,
            sourceUrl: doc.html_url ?? null,
            publishedDate: safeDate(doc.publication_date),
            externalId: `fr::${doc.document_number}`,
            relevanceScore: scoreByKeyword(doc.title + " " + (doc.abstract ?? "")),
            rawJson: JSON.stringify(doc),
          });
        }
      } catch (_) {}
    }
  } catch (e: any) {
    errors.push(`Federal Register: ${e.message}`);
  }
  return [items, errors];
}

function mapFRTypeToSignal(type: string): IntelSignalType {
  if (!type) return "other";
  const t = type.toLowerCase();
  if (t.includes("proposed rule") || t.includes("proposed_rule")) return "new_rulemaking";
  if (t.includes("rule") || t.includes("final")) return "regulatory_change";
  if (t.includes("notice")) return "industry_trend";
  return "other";
}

// ── USA Spending — expiring contracts ─────────────────────────────────────────

async function fetchUSASpendingExpiring(): Promise<[InsertIntelFeedItem[], string[]]> {
  const items: Omit<InsertIntelFeedItem, "id">[] = [];
  const errors: string[] = [];
  try {
    const today = new Date();
    const future = new Date();
    future.setDate(today.getDate() + 180);
    const fmt = (d: Date) => d.toISOString().split("T")[0];

    const body = {
      filters: {
        time_period: [{ start_date: fmt(today), end_date: fmt(future) }],
        award_type_codes: ["A", "B", "C", "D"],
        naics_codes: ["621111", "621999", "621610", "561612", "611519", "621310", "621320", "621399", "621498", "621512"],
      },
      fields: ["Award ID", "Recipient Name", "Awarding Agency", "Award Amount",
               "Period of Performance Current End Date", "Description", "Award Type", "NAICS Code"],
      sort: "Period of Performance Current End Date",
      order: "asc",
      limit: 25,
      page: 1,
    };

    const resp = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`USASpending HTTP ${resp.status}`);
    const json = await resp.json() as any;

    for (const award of (json.results ?? []).slice(0, 20)) {
      const endDate = award["Period of Performance Current End Date"];
      const recipient = award["Recipient Name"] ?? "Unknown";
      const agency = award["Awarding Agency"] ?? "Federal";
      const amount = award["Award Amount"] ? `$${Number(award["Award Amount"]).toLocaleString()}` : "";
      // Score before inserting
      const usaScoreText = `${award["Description"] ?? ""} ${recipient} ${award["NAICS Code"] ?? ""}`.toLowerCase();
      const usaScore = scoreByKeyword(usaScoreText);
      if (usaScore <= 40) continue; // skip non-relevant

      const desc = award["Description"] ?? award["Award ID"] ?? "Federal Contract";
      const cleanTitle = desc.length > 80 ? desc.slice(0, 77) + "..." : desc;

      items.push({
        scope: "federal",
        stateCode: null,
        signalType: "expiring_contract",
        source: "usaspending",
        agency,
        title: `Expiring: ${cleanTitle}`,
        summary: [
          `Incumbent: ${recipient}`,
          endDate ? `Expires: ${endDate}` : null,
          amount ? `Value: ${amount}` : null,
          award["NAICS Code"] ? `NAICS: ${award["NAICS Code"]}` : null,
        ].filter(Boolean).join(" · "),
        sourceUrl: `https://www.usaspending.gov/award/${award["Award ID"]}`,
        publishedDate: safeDate(endDate),
        externalId: `usaspending::${award["Award ID"]}`,
        relevanceScore: usaScore,
        rawJson: JSON.stringify(award),
      });
    }
  } catch (e: any) {
    errors.push(`USASpending: ${e.message}`);
  }
  return [items, errors];
}

// ── SAM.gov Contract Awards (re-compete intel) ────────────────────────────────

async function fetchSAMAwards(dateRange: number): Promise<[InsertIntelFeedItem[], string[]]> {
  const items: Omit<InsertIntelFeedItem, "id">[] = [];
  const errors: string[] = [];
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) return [items, ["SAM_GOV_API_KEY not configured"]];

  try {
    const today = new Date();
    const from = new Date();
    from.setDate(today.getDate() - dateRange);
    const fmt = (d: Date) =>
      `${String(d.getMonth() + 1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;

    const params = new URLSearchParams({
      api_key: apiKey,
      postedFrom: fmt(from),
      postedTo: fmt(today),
      ptype: "a", // awards only
      limit: "25",
      offset: "0",
      naics: "621111,621999,621610,561612,611519",
    });

    const resp = await fetch(`https://api.sam.gov/opportunities/v2/search?${params}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`SAM awards HTTP ${resp.status}`);
    const json = await resp.json() as any;
    if (json.code === "900804" || json.message?.toLowerCase().includes("quota")) {
      errors.push("SAM.gov quota exceeded");
      return [items, errors];
    }

    for (const o of (json.opportunitiesData ?? []).slice(0, 25)) {
      const parts = (o.fullParentPathName ?? "").split(".");
      const agency = parts[0]?.trim() ?? "Federal";
      const rawTitle = o.title ?? "";
      const naics = o.naicsCode ?? "";
      const awardee = o.award?.awardee?.name ?? null;
      const awardAmt = o.award?.amount ? `$${Number(o.award.amount).toLocaleString()}` : null;
      const endDate = o.archiveDate ? `Archived: ${o.archiveDate}` : null;

      // Score against Occu-Med relevance before including
      const scoreText = `${rawTitle} ${agency} ${naics} ${o.fullParentPathName ?? ""}`.toLowerCase();
      const relevanceScore = scoreByKeyword(scoreText);

      // Only include items that score above base (40) — skip pure noise
      if (relevanceScore <= 40) continue;

      // Build a human-readable summary (NOT a raw API URL)
      const summaryParts = [
        awardee ? `Incumbent: ${awardee}` : null,
        awardAmt ? `Award value: ${awardAmt}` : null,
        naics ? `NAICS: ${naics}` : null,
        endDate,
      ].filter(Boolean);
      const summary = summaryParts.length > 0
        ? summaryParts.join(" · ")
        : `Solicitation #${o.solicitationNumber ?? "N/A"}`;

      items.push({
        scope: "federal",
        stateCode: null,
        signalType: "expiring_contract",
        source: "sam_awards",
        agency,
        title: `Re-Compete: ${rawTitle}`,
        summary,
        sourceUrl: o.uiLink ?? null,
        publishedDate: safeDate(o.postedDate),
        externalId: `sam_award::${o.noticeId ?? o.solicitationNumber ?? rawTitle}`,
        relevanceScore,
        rawJson: JSON.stringify(o),
      });
    }
  } catch (e: any) {
    errors.push(`SAM Awards: ${e.message}`);
  }
  return [items, errors];
}

// ── Federal Serper (regulations, enforcement, trends) ─────────────────────────

async function fetchFederalSerper(dateRange: number): Promise<[InsertIntelFeedItem[], string[]]> {
  const items: Omit<InsertIntelFeedItem, "id">[] = [];
  const errors: string[] = [];
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return [items, ["SERPER_API_KEY not configured"]];

  const queries = [
    { q: "OSHA enforcement action occupational health 2025", signal: "enforcement_action" as IntelSignalType },
    { q: "federal budget occupational health funding announcement 2025", signal: "budget_funding" as IntelSignalType },
    { q: "DOL workplace safety rulemaking proposed rule 2025", signal: "new_rulemaking" as IntelSignalType },
    { q: "occupational health services federal contract award 2025", signal: "procurement_forecast" as IntelSignalType },
  ];

  for (const { q, signal } of queries) {
    try {
      const resp = await fetch("https://google.serper.dev/news", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q, num: 5, tbs: `qdr:${dateRange > 14 ? "m" : "w"}` }),
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) continue;
      const json = await resp.json() as any;
      for (const r of (json.news ?? []).slice(0, 4)) {
        items.push({
          scope: "federal",
          stateCode: null,
          signalType: signal,
          source: "other",
          agency: r.source ?? "News",
          title: r.title,
          summary: r.snippet?.slice(0, 500) ?? null,
          sourceUrl: r.link ?? null,
          publishedDate: safeDate(r.date),
          externalId: `serper_fed::${Buffer.from(r.link ?? r.title).toString("base64").slice(0, 32)}`,
          relevanceScore: scoreByKeyword(r.title + " " + (r.snippet ?? "")),
          rawJson: JSON.stringify(r),
        });
      }
    } catch (_) {}
  }
  return [items, errors];
}

// ── State Intel — Serper-powered per-state sweep ──────────────────────────────

const STATE_PROCUREMENT_URLS: Record<string, string> = {
  AL: "vendor.staars.alabama.gov",
  AK: "iris-vss.alaska.gov",
  AZ: "procure.az.gov",
  AR: "www.ark.org/vendor",
  CA: "caleprocure.ca.gov",
  CO: "coloradoprocurement.com",
  CT: "biznet.ct.gov",
  DE: "bidnow.delaware.gov",
  DC: "contracts.ocp.dc.gov",
  FL: "vendor.myfloridamarketplace.com",
  GA: "doas.georgia.gov/state-purchasing",
  HI: "hands.ehawaii.gov",
  ID: "purchasing.idaho.gov",
  IL: "ipg.illinois.gov",
  IN: "www.in.gov/idoa/procurement",
  IA: "bidopportunities.iowa.gov",
  KS: "supplier.sok.ks.gov",
  KY: "eProcurement.ky.gov",
  LA: "wwwcfprd.doa.louisiana.gov/osp",
  ME: "www.maine.gov/purchases",
  MD: "eMarylandMarketplace.com",
  MA: "www.commbuys.com",
  MI: "sigma.michigan.gov",
  MN: "www.mmd.admin.state.mn.us",
  MS: "www.dfa.ms.gov/procurement",
  MO: "www.mo.gov/business/contracts-bids",
  MT: "vendor.mt.gov",
  NE: "das.nebraska.gov/materiel/purchasing",
  NV: "purchasing.nv.gov",
  NH: "www.das.nh.gov/purchasing",
  NJ: "www.njstart.gov",
  NM: "www.generalservices.state.nm.us",
  NY: "www.ogs.ny.gov/acq",
  NC: "ncadmin.nc.gov/eprocurement",
  ND: "www.nd.gov/omb/agency/procurement",
  OH: "procure.ohio.gov",
  OK: "ok.gov/dcs/central-purchasing",
  OR: "oregon.gov/das/procurement",
  PA: "www.emarketplace.state.pa.us",
  RI: "www.ridop.ri.gov",
  SC: "procurement.sc.gov",
  SD: "bids.sd.gov",
  TN: "www.tn.gov/generalservices/procurement",
  TX: "comptroller.texas.gov/purchasing",
  UT: "purchasing.utah.gov",
  VT: "bgs.vermont.gov/purchasing",
  VA: "eva.virginia.gov",
  WA: "des.wa.gov/services/contracting-purchasing",
  WV: "wvoasis.gov",
  WI: "vendornet.state.wi.us",
  WY: "ai.wyo.gov/divisions/sao/purchasing",
};

async function fetchStateIntel(stateCode: string, dateRange: number): Promise<[InsertIntelFeedItem[], string[]]> {
  const items: Omit<InsertIntelFeedItem, "id">[] = [];
  const errors: string[] = [];
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return [items, ["SERPER_API_KEY not configured"]];

  const portalDomain = STATE_PROCUREMENT_URLS[stateCode] ?? "";
  const tbs = dateRange > 21 ? "m" : "w";

  const queries: Array<{ q: string; signal: IntelSignalType; source: IntelSource }> = [
    // Direct procurement
    {
      q: portalDomain
        ? `site:${portalDomain} occupational health`
        : `${stateCode} state government RFP occupational health bid solicitation`,
      signal: "state_procurement",
      source: "state_portal",
    },
    // Broader state procurement
    {
      q: `"${getStateName(stateCode)}" state RFP "occupational health" OR "workplace health" OR "drug testing" OR "physical exam" ${new Date().getFullYear()}`,
      signal: "state_procurement",
      source: "state_serper",
    },
    // Regulatory signals
    {
      q: `"${getStateName(stateCode)}" state OSHA OR "workers comp" regulation rulemaking occupational health ${new Date().getFullYear()}`,
      signal: "regulatory_change",
      source: "state_serper",
    },
    // Budget / funding
    {
      q: `"${getStateName(stateCode)}" state budget "occupational health" OR "workplace safety" funding appropriation ${new Date().getFullYear()}`,
      signal: "budget_funding",
      source: "state_serper",
    },
    // Industry trends
    {
      q: `"${getStateName(stateCode)}" occupational health contract award OR "contract awarded" employer services ${new Date().getFullYear()}`,
      signal: "industry_trend",
      source: "state_serper",
    },
  ];

  for (const { q, signal, source } of queries) {
    try {
      const resp = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q, num: 5, tbs: `qdr:${tbs}` }),
        signal: AbortSignal.timeout(12000),
      });
      if (!resp.ok) continue;
      const json = await resp.json() as any;

      for (const r of (json.organic ?? []).slice(0, 4)) {
        items.push({
          scope: "state",
          stateCode,
          signalType: signal,
          source,
          agency: r.displayLink ?? getStateName(stateCode),
          title: r.title,
          summary: r.snippet?.slice(0, 500) ?? null,
          sourceUrl: r.link ?? null,
          publishedDate: new Date(),
          externalId: `state::${stateCode}::${Buffer.from(r.link ?? r.title).toString("base64").slice(0, 32)}`,
          relevanceScore: scoreByKeyword(r.title + " " + (r.snippet ?? "")),
          rawJson: JSON.stringify(r),
        });
      }

      // Also check news results
      const newsResp = await fetch("https://google.serper.dev/news", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q, num: 3, tbs: `qdr:${tbs}` }),
        signal: AbortSignal.timeout(10000),
      });
      if (newsResp.ok) {
        const newsJson = await newsResp.json() as any;
        for (const r of (newsJson.news ?? []).slice(0, 3)) {
          items.push({
            scope: "state",
            stateCode,
            signalType: signal,
            source: "state_serper",
            agency: r.source ?? getStateName(stateCode),
            title: r.title,
            summary: r.snippet?.slice(0, 500) ?? null,
            sourceUrl: r.link ?? null,
            publishedDate: safeDate(r.date) ?? new Date(),
            externalId: `state_news::${stateCode}::${Buffer.from(r.link ?? r.title).toString("base64").slice(0, 32)}`,
            relevanceScore: scoreByKeyword(r.title + " " + (r.snippet ?? "")),
            rawJson: JSON.stringify(r),
          });
        }
      }
    } catch (_) {}
  }

  return [items, errors];
}

// ── Scoring helper ────────────────────────────────────────────────────────────

// Occu-Med core: occupational health, drug/alcohol testing, physicals, OSHA compliance
const HIGH_KEYWORDS = [
  "occupational health", "occupational medicine", "drug test", "drug testing",
  "alcohol test", "substance abuse", "physical exam", "dot physical",
  "pre-employment medical", "medical surveillance", "fit for duty",
  "fitness for duty", "workers comp", "workers compensation",
  "workplace health", "employee health", "health screening",
  "medical evaluation", "breath alcohol", "urine drug screen",
];
const MED_KEYWORDS = [
  "osha", "osha compliance", "osha 300", "industrial hygiene",
  "health services", "employer services", "occupational", "screening",
  "medical exam", "cdl physical", "random testing", "eap",
  "employee assistance", "return to work", "injury management",
  "621111", "621999", "621610", // NAICS codes for health services
];
// Hard exclusions — clearly irrelevant to Occu-Med
const EXCLUDE_KEYWORDS = [
  "propeller", "nut,self-locking", "cylinder assembly", "hub,propeller",
  "tape,nuclear", "circuit card", "sensor,opaque", "sensor assy",
  "elevator cable", "power supply", "fabric,collapsible", "geospatial",
  "substation", "fuel system maintenance", "tire rod", "biohazardous waste",
  "window washing", "drum,fabric", "mouse body composition",
];

function scoreByKeyword(text: string): number {
  const t = text.toLowerCase();
  // Immediately exclude clearly irrelevant hardware/facility items
  if (EXCLUDE_KEYWORDS.some(ex => t.includes(ex.toLowerCase()))) return 0;
  let score = 20; // base — must earn relevance
  for (const kw of HIGH_KEYWORDS) { if (t.includes(kw)) score += 15; }
  for (const kw of MED_KEYWORDS)  { if (t.includes(kw)) score += 8;  }
  return Math.min(100, score);
}

// ── State name lookup ─────────────────────────────────────────────────────────

const STATE_NAMES: Record<string, string> = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",
  CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"Washington D.C.",FL:"Florida",
  GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",
  IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",
  MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",
  MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",
  NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",
  OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",
  SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",
  VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",
};

function getStateName(code: string): string {
  return STATE_NAMES[code] ?? code;
}

export default router;
