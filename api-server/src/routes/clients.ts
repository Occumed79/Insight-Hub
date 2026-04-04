/**
 * Client Intelligence Routes
 *
 * GET    /api/clients                                        — list all clients
 * GET    /api/clients/:id                                    — get client with branches
 * POST   /api/clients/:id/research-branches                  — AI-discover worldwide branches
 * GET    /api/clients/:id/branches/:branchId/hiring          — get hiring posts + trend for branch
 * POST   /api/clients/:id/branches/:branchId/refresh-hiring  — pull fresh hiring data for branch
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { clientsTable, clientBranchesTable, branchHiringPostsTable } from "@workspace/db/schema";
import { serperProvider } from "../lib/providers/serper";
import { resolveCredential } from "../lib/config/providerConfig";

const router = Router();

// ── Intelligence utilities ─────────────────────────────────────────────────────

/** Simple in-memory TTL cache for intelligence API responses (5-minute TTL) */
const intelCache = new Map<string, { data: unknown; expires: number }>();
const INTEL_TTL = 5 * 60 * 1000;

function intelCacheGet<T>(key: string): T | null {
  const entry = intelCache.get(key);
  if (!entry || Date.now() > entry.expires) { intelCache.delete(key); return null; }
  return entry.data as T;
}
function intelCacheSet(key: string, data: unknown) {
  intelCache.set(key, { data, expires: Date.now() + INTEL_TTL });
}

/**
 * Normalize a company name for fuzzy API matching:
 * strips legal suffixes, parenthetical qualifiers, punctuation,
 * and returns the core 1-2 word token most likely to match external records.
 */
function normalizeCompanyName(name: string): string {
  return name
    .replace(/\s*\(.*?\)\s*/g, " ")          // strip parentheticals
    .replace(/[,.].*$/g, "")                  // strip after comma/period
    .replace(/\b(inc|corp|llc|ltd|co|lp|llp|incorporated|limited|company|the)\b\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Location extraction helpers (fallback when Gemini unavailable) ────────────

const COUNTRY_LIST_C = [
  "United States","United Kingdom","Germany","France","Australia","Canada","Japan","Italy",
  "Spain","Netherlands","Belgium","Sweden","Norway","Denmark","Finland","Poland","Czech Republic",
  "Romania","Hungary","Austria","Switzerland","Portugal","Greece","Turkey","Israel","Saudi Arabia",
  "UAE","Qatar","Kuwait","Bahrain","India","China","South Korea","Singapore","Malaysia","Thailand",
  "Philippines","Indonesia","Brazil","Mexico","Colombia","Argentina","Chile","South Africa",
  "Egypt","Nigeria","Kenya","Morocco","Algeria","Pakistan","Bangladesh","Vietnam","Taiwan",
  "New Zealand","Ireland","Luxembourg","Slovakia","Croatia","Slovenia","Estonia","Latvia","Lithuania",
];

const US_STATES_C: Record<string,string> = {
  "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO",
  "Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID",
  "Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA",
  "Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN",
  "Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV",
  "New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC",
  "North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA",
  "Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX",
  "Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV",
  "Wisconsin":"WI","Wyoming":"WY","Washington DC":"DC","Washington D.C.":"DC",
};
const STATE_ABBREVS_C = new Set(Object.values(US_STATES_C));

function guessBranchType(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("headquarter") || t.includes("hq") || t.includes("corporate office")) return "headquarters";
  if (t.includes("manufactur") || t.includes("plant") || t.includes("factory") || t.includes("assembly")) return "manufacturing";
  if (t.includes("research") || t.includes("r&d") || t.includes("lab")) return "research";
  if (t.includes("depot") || t.includes("maintenance")) return "depot";
  if (t.includes("field") || t.includes("operations")) return "field_operations";
  if (t.includes("data center") || t.includes("datacenter")) return "data_center";
  if (t.includes("training")) return "training";
  if (t.includes("distribution") || t.includes("warehouse")) return "distribution";
  return "office";
}

function heuristicExtractBranches(
  companyName: string,
  results: { title: string; link: string; snippet: string }[]
): any[] {
  const locations: any[] = [];
  const seenKeys = new Set<string>();

  for (const r of results) {
    const text = `${r.title} ${r.snippet}`;
    const cityStateRe = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?),\s*([A-Z]{2})\b/g;
    let m: RegExpExecArray | null;
    while ((m = cityStateRe.exec(text)) !== null) {
      const [, city, stateAbbrev] = m;
      if (!STATE_ABBREVS_C.has(stateAbbrev)) continue;
      const key = `${city.toLowerCase()}|united states`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      locations.push({ name: `${companyName} – ${city}, ${stateAbbrev}`, branchType: guessBranchType(text), city, state: stateAbbrev, country: "United States", address: "", sourceUrl: r.link, description: r.snippet.slice(0, 150) });
    }
    for (const country of COUNTRY_LIST_C) {
      if (!text.includes(country)) continue;
      const countryRe = new RegExp(`([A-Z][a-z]+(?:\\s[A-Z][a-z]+)?)\\s*,?\\s*${country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, "g");
      const cm = countryRe.exec(text);
      const city = cm?.[1] || "";
      const key = `${city.toLowerCase()}|${country.toLowerCase()}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      locations.push({ name: city ? `${companyName} – ${city}, ${country}` : `${companyName} – ${country}`, branchType: guessBranchType(text), city: city || null, state: "", country, address: "", sourceUrl: r.link, description: r.snippet.slice(0, 150) });
    }
  }
  return locations.slice(0, 60);
}

async function wikipediaFallbackBranches(companyName: string): Promise<any[]> {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(companyName)}&srlimit=3&format=json&origin=*`;
    const searchResp = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    if (!searchResp.ok) return [];
    const searchData = (await searchResp.json()) as any;
    const topTitle = searchData?.query?.search?.[0]?.title;
    if (!topTitle) return [];
    const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=true&explaintext=true&titles=${encodeURIComponent(topTitle)}&format=json&origin=*`;
    const extractResp = await fetch(extractUrl, { signal: AbortSignal.timeout(8000) });
    if (!extractResp.ok) return [];
    const extractData = (await extractResp.json()) as any;
    const pages = extractData?.query?.pages ?? {};
    const pageText = Object.values(pages)[0] as any;
    const extract = pageText?.extract ?? "";
    if (!extract) return [];
    return heuristicExtractBranches(companyName, [{ title: topTitle, link: `https://en.wikipedia.org/wiki/${encodeURIComponent(topTitle)}`, snippet: extract.slice(0, 800) }]);
  } catch {
    return [];
  }
}

// ── Seed helper — ensures 28 clients exist ────────────────────────────────────

const SEED_CLIENTS = [
  { name: "AC Transit", website: "https://www.actransit.org", industry: "Public Transportation", headquarters: "Oakland, CA" },
  { name: "Alutiiq", website: "https://www.alutiiq.com", industry: "Defense & Government Services", headquarters: "Anchorage, AK" },
  { name: "BAE Systems", website: "https://www.baesystems.com", industry: "Defense & Aerospace", headquarters: "Falls Church, VA" },
  { name: "C3EL", website: "https://www.c3el.com", industry: "Defense & Government Services", headquarters: "Arlington, VA" },
  { name: "CACI International", website: "https://www.caci.com", industry: "Defense & IT Services", headquarters: "Reston, VA" },
  { name: "California Dept of Corrections and Rehabilitation", website: "https://www.cdcr.ca.gov", industry: "Government / Corrections", headquarters: "Sacramento, CA" },
  { name: "Camber Corporation", website: "https://www.camber.com", industry: "Defense & Engineering Services", headquarters: "Huntsville, AL" },
  { name: "Clovehitch", website: "https://www.clovehitch.com", industry: "Defense & Government Services", headquarters: "United States" },
  { name: "Constellis", website: "https://www.constellis.com", industry: "Security & Risk Management", headquarters: "Herndon, VA" },
  { name: "DataPath", website: "https://www.datapath.com", industry: "Communications & Defense IT", headquarters: "Atlanta, GA" },
  { name: "Fluor Corporation", website: "https://www.fluor.com", industry: "Engineering & Construction", headquarters: "Irving, TX" },
  { name: "Freeport-McMoRan", website: "https://www.fcx.com", industry: "Mining & Natural Resources", headquarters: "Phoenix, AZ" },
  { name: "GDC", website: "https://www.gdcit.com", industry: "IT & Government Services", headquarters: "United States" },
  { name: "IAP Worldwide Services", website: "https://www.iapws.com", industry: "Defense & Government Operations", headquarters: "Cape Canaveral, FL" },
  { name: "IDS International", website: "https://www.idsinternational.com", industry: "Defense & Security Consulting", headquarters: "Arlington, VA" },
  { name: "ITC Defense", website: "https://www.itcdefense.com", industry: "Defense Staffing & Services", headquarters: "Reston, VA" },
  { name: "KBR", website: "https://www.kbr.com", industry: "Engineering & Defense Services", headquarters: "Houston, TX" },
  { name: "Leidos", website: "https://www.leidos.com", industry: "Defense & Technology", headquarters: "Reston, VA" },
  { name: "MAG Aerospace", website: "https://www.magaero.com", industry: "Aerospace & Defense", headquarters: "Fairfax, VA" },
  { name: "ManTech International", website: "https://www.mantech.com", industry: "Defense & IT Services", headquarters: "Herndon, VA" },
  { name: "SkyBridge Tactical", website: "https://www.skybridgetactical.com", industry: "Defense & Communications", headquarters: "United States" },
  { name: "Sierra Nevada Corporation", website: "https://www.sncorp.com", industry: "Aerospace & Defense", headquarters: "Sparks, NV" },
  { name: "SOS International", website: "https://www.sosiltd.com", industry: "Defense & Intelligence", headquarters: "Reston, VA" },
  { name: "Trace Systems", website: "https://www.tracesystems.com", industry: "Defense IT & Communications", headquarters: "Vienna, VA" },
  { name: "V2X", website: "https://www.v2x.com", industry: "Defense Operations & Maintenance", headquarters: "McLean, VA" },
  { name: "Valiant Integrated Services", website: "https://www.valiantis.com", industry: "Defense & Government Services", headquarters: "Herndon, VA" },
  { name: "Versar", website: "https://www.versar.com", industry: "Environmental & Defense Services", headquarters: "Springfield, VA" },
  { name: "Weatherford International", website: "https://www.weatherford.com", industry: "Oil & Gas Services", headquarters: "Houston, TX" },
];

// ── List all clients ──────────────────────────────────────────────────────────

router.get("/clients", async (req, res) => {
  try {
    const clients = await db
      .select()
      .from(clientsTable)
      .orderBy(clientsTable.name);

    if (clients.length === 0) {
      await seedClients();
      const seeded = await db.select().from(clientsTable).orderBy(clientsTable.name);
      return res.json({ clients: seeded });
    }

    // Get branch counts per client
    const branches = await db.select().from(clientBranchesTable);
    const branchCountMap: Record<string, number> = {};
    for (const b of branches) {
      branchCountMap[b.clientId] = (branchCountMap[b.clientId] || 0) + 1;
    }

    const clientsWithCounts = clients.map((c) => ({
      ...c,
      branchCount: branchCountMap[c.id] || 0,
    }));

    res.json({ clients: clientsWithCounts });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list clients" });
  }
});

// ── Get single client with branches ──────────────────────────────────────────

router.get("/clients/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    if (!rows.length) return res.status(404).json({ error: "Client not found" });

    const branches = await db
      .select()
      .from(clientBranchesTable)
      .where(eq(clientBranchesTable.clientId, id))
      .orderBy(clientBranchesTable.country, clientBranchesTable.city);

    res.json({ client: rows[0], branches });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get client" });
  }
});

// ── Research branches (AI-powered discovery) ─────────────────────────────────

router.post("/clients/:id/research-branches", async (req, res) => {
  const { id } = req.params;

  try {
    const rows = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    if (!rows.length) return res.status(404).json({ error: "Client not found" });
    const client = rows[0];

    const errors: string[] = [];

    // ── 1. Serper — worldwide location searches ───────────────────────────────
    const queries = [
      `"${client.name}" worldwide locations offices facilities list`,
      `"${client.name}" global offices manufacturing plants operations`,
      `"${client.name}" locations headquarters subsidiaries branches`,
      `"${client.name}" facility locations site operations worldwide`,
    ];

    let serperResults: { title: string; link: string; snippet: string }[] = [];
    const warnings: string[] = [];
    let source = "serper+gemini";
    try {
      serperResults = await serperProvider.searchMultiple(queries, 10);
    } catch (e: any) {
      errors.push(`Serper: ${e.message}`);
    }

    if (serperResults.length === 0) {
      // Wikipedia fallback
      warnings.push("Serper returned no results — using Wikipedia fallback");
      source = "wikipedia-fallback";
      const wikiLocs = await wikipediaFallbackBranches(client.name);
      serperResults = wikiLocs.map(l => ({ title: l.name, link: l.sourceUrl || "", snippet: l.description || l.country }));
      if (serperResults.length === 0) {
        return res.json({ branches: [], added: 0, total: 0, errors, warnings,
          message: "No results found from Serper or Wikipedia." });
      }
    }

    // ── 2. Gemini — extract structured branch data ────────────────────────────
    const geminiKey = await resolveCredential("geminiApiKey", "GEMINI_API_KEY");

    const textSample = serperResults
      .map((r) => `Title: ${r.title}\nURL: ${r.link}\nSnippet: ${r.snippet}`)
      .join("\n\n---\n\n");

    const prompt = `You are extracting structured branch/location data for the company "${client.name}" (Industry: ${client.industry || "Defense & Government Services"}).

From the search results below, extract EVERY worldwide branch, office, facility, or location you can identify.
Be comprehensive — include headquarters, manufacturing plants, offices, R&D facilities, depots, field operations, training centers, distribution centers, data centers, and any other location type.

For each location output a JSON object with these exact fields:
- "name": branch name (e.g., "${client.name} – Houston Office" — include company name + location if no specific name)
- "branchType": EXACTLY one of: office, manufacturing, research, depot, field_operations, headquarters, training, distribution, data_center, other
- "city": city name (empty string if unknown)
- "state": US state abbreviation or province (empty string if outside US/Canada)
- "country": full country name (e.g., "United States", "Germany", "United Kingdom")
- "address": street address if known, else empty string
- "sourceUrl": the URL where this location was mentioned

Return ONLY a valid JSON array. No explanation, no markdown, no code fences — just the raw JSON array starting with [ and ending with ].
If you cannot find any locations, return [].

Search results:
${textSample}`;

    let extracted: any[] = [];
    if (geminiKey) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 4000, temperature: 0.1 },
            }),
            signal: AbortSignal.timeout(20000),
          }
        );
        if (response.ok) {
          const json = (await response.json()) as any;
          const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "[]";
          const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
          extracted = JSON.parse(cleaned);
        } else {
          const errBody = await response.text().catch(() => "");
          const errMsg = JSON.parse(errBody)?.error?.message ?? errBody.slice(0, 100);
          warnings.push(`Gemini: ${errMsg} — using heuristic extraction`);
          extracted = heuristicExtractBranches(client.name, serperResults);
          source = source.replace("gemini", "heuristic");
        }
      } catch (e: any) {
        warnings.push(`Gemini error: ${e.message} — using heuristic extraction`);
        extracted = heuristicExtractBranches(client.name, serperResults);
        source = source.replace("gemini", "heuristic");
      }
    } else {
      warnings.push("Gemini not configured — using heuristic extraction");
      extracted = heuristicExtractBranches(client.name, serperResults);
      source = "serper+heuristic";
    }

    // ── 3. Persist discovered branches (upsert by city+country) ──────────────
    const existing = await db
      .select()
      .from(clientBranchesTable)
      .where(eq(clientBranchesTable.clientId, id));

    const existingKeys = new Set(
      existing.map((b) => `${(b.city || "").toLowerCase()}|${(b.country || "").toLowerCase()}`)
    );

    const validTypes = ["office", "manufacturing", "research", "depot", "field_operations", "headquarters", "training", "distribution", "data_center", "other"];

    let added = 0;
    for (const loc of extracted) {
      if (!loc.country) continue;
      const key = `${(loc.city || "").toLowerCase()}|${(loc.country || "").toLowerCase()}`;
      if (existingKeys.has(key)) continue;

      await db.insert(clientBranchesTable).values({
        id: randomUUID(),
        clientId: id,
        name: loc.name || `${client.name} – ${loc.city || loc.country}`,
        branchType: validTypes.includes(loc.branchType) ? loc.branchType : "office",
        city: loc.city || null,
        state: loc.state || null,
        country: loc.country,
        address: loc.address || null,
        sourceUrl: loc.sourceUrl || null,
        lastResearched: new Date(),
        hiringTrendDirection: "unknown",
        postingCount: "0",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      existingKeys.add(key);
      added++;
    }

    const allBranches = await db
      .select()
      .from(clientBranchesTable)
      .where(eq(clientBranchesTable.clientId, id))
      .orderBy(clientBranchesTable.country, clientBranchesTable.city);

    res.json({ branches: allBranches, added, total: allBranches.length, errors, warnings, source });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Branch discovery failed" });
  }
});

// ── Get hiring posts for a branch ─────────────────────────────────────────────

router.get("/clients/:id/branches/:branchId/hiring", async (req, res) => {
  try {
    const { branchId } = req.params;
    const branch = await db
      .select()
      .from(clientBranchesTable)
      .where(eq(clientBranchesTable.id, branchId));
    if (!branch.length) return res.status(404).json({ error: "Branch not found" });

    const posts = await db
      .select()
      .from(branchHiringPostsTable)
      .where(eq(branchHiringPostsTable.branchId, branchId))
      .orderBy(branchHiringPostsTable.createdAt);

    res.json({ branch: branch[0], posts });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get hiring data" });
  }
});

// ── Refresh hiring data for a branch ─────────────────────────────────────────

router.post("/clients/:id/branches/:branchId/refresh-hiring", async (req, res) => {
  const { id, branchId } = req.params;

  try {
    const clientRows = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    if (!clientRows.length) return res.status(404).json({ error: "Client not found" });
    const client = clientRows[0];

    const branchRows = await db.select().from(clientBranchesTable).where(eq(clientBranchesTable.id, branchId));
    if (!branchRows.length) return res.status(404).json({ error: "Branch not found" });
    const branch = branchRows[0];

    const errors: string[] = [];
    const locationStr = [branch.city, branch.state, branch.country].filter(Boolean).join(", ");

    // ── 1. Serper — job posting searches ─────────────────────────────────────
    const jobQueries = [
      `"${client.name}" jobs hiring ${locationStr} site:linkedin.com/jobs OR site:indeed.com`,
      `"${client.name}" open positions ${locationStr} 2025 OR 2026`,
      `"${client.name}" ${locationStr} careers jobs hiring`,
    ];

    let serperResults: { title: string; link: string; snippet: string }[] = [];
    try {
      serperResults = await serperProvider.searchMultiple(jobQueries, 10);
    } catch (e: any) {
      errors.push(`Serper: ${e.message}`);
    }

    // ── 2. Clear old posts for this branch and insert fresh ones ──────────────
    await db.delete(branchHiringPostsTable).where(eq(branchHiringPostsTable.branchId, branchId));

    const postsToInsert = serperResults.map((r) => {
      const combined = `${r.title} ${r.snippet}`.toLowerCase();
      let department = "General";
      if (combined.includes("engineer") || combined.includes("engineering")) department = "Engineering";
      else if (combined.includes("manufactur") || combined.includes("production")) department = "Manufacturing";
      else if (combined.includes("software") || combined.includes("developer")) department = "Software & IT";
      else if (combined.includes("safety") || combined.includes("health") || combined.includes("medical")) department = "Health & Safety";
      else if (combined.includes("logistics") || combined.includes("supply chain")) department = "Logistics";
      else if (combined.includes("finance") || combined.includes("accounting")) department = "Finance";
      else if (combined.includes("hr") || combined.includes("human resources")) department = "HR";

      const dateMatch = r.snippet.match(/\b(\d{1,2}\s+(?:hour|day|week|month)s?\s+ago|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4})\b/i);

      return {
        id: randomUUID(),
        branchId,
        clientId: id,
        title: r.title.replace(/\s*[-|–].*$/, "").trim().slice(0, 150),
        department,
        url: r.link,
        postedDate: dateMatch?.[0] || "",
        source: r.link.includes("linkedin") ? "LinkedIn" : r.link.includes("indeed") ? "Indeed" : "Web",
        rawJson: JSON.stringify({ title: r.title, snippet: r.snippet, link: r.link }),
        createdAt: new Date(),
      };
    });

    if (postsToInsert.length > 0) {
      await db.insert(branchHiringPostsTable).values(postsToInsert);
    }

    // ── 3. Gemini — generate hiring trend summary ─────────────────────────────
    let trendSummary = "";
    let trendDirection = "unknown";
    const geminiKey = await resolveCredential("geminiApiKey", "GEMINI_API_KEY");

    if (geminiKey && serperResults.length > 0) {
      try {
        const sample = serperResults
          .slice(0, 8)
          .map((r) => `Title: ${r.title}\nSnippet: ${r.snippet}`)
          .join("\n\n---\n\n");

        const prompt = `You are analyzing hiring data for ${client.name}'s ${branch.branchType} in ${locationStr}.
Based on these ${serperResults.length} job postings found:

${sample}

Write a concise 1-2 sentence hiring trend summary (e.g., "Ramping up logistics roles — 14 postings, strong engineering demand").
Then on a new line write ONLY one of these words: growing, stable, contracting

Respond with the summary sentence(s) on line 1, then the direction word on the last line.`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 200, temperature: 0.3 },
            }),
          }
        );
        if (response.ok) {
          const json = (await response.json()) as any;
          const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
          const lines = raw.split("\n").filter((l: string) => l.trim());
          const lastLine = lines[lines.length - 1]?.toLowerCase().trim();
          if (["growing", "stable", "contracting"].includes(lastLine)) {
            trendDirection = lastLine;
            trendSummary = lines.slice(0, -1).join(" ").trim();
          } else {
            trendSummary = raw;
          }
        }
      } catch (e: any) {
        errors.push(`Gemini trend: ${e.message}`);
      }
    }

    if (!trendSummary) {
      const count = postsToInsert.length;
      if (count > 10) { trendSummary = `${count} open positions found. Active hiring activity.`; trendDirection = "growing"; }
      else if (count > 3) { trendSummary = `${count} open positions found. Moderate hiring activity.`; trendDirection = "stable"; }
      else if (count > 0) { trendSummary = `${count} open position(s) found. Limited hiring activity.`; trendDirection = "stable"; }
      else { trendSummary = "No open positions found in recent search."; trendDirection = "contracting"; }
    }

    // ── 4. Update branch with trend data ─────────────────────────────────────
    await db
      .update(clientBranchesTable)
      .set({
        hiringTrendSummary: trendSummary,
        hiringTrendDirection: trendDirection,
        postingCount: String(postsToInsert.length),
        lastResearched: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clientBranchesTable.id, branchId));

    // ── 5. Recalculate overall client hiring trend ────────────────────────────
    const allBranches = await db
      .select()
      .from(clientBranchesTable)
      .where(eq(clientBranchesTable.clientId, id));

    const directions = allBranches.map((b) => b.hiringTrendDirection).filter((d) => d !== "unknown");
    let overallTrend = "unknown";
    if (directions.length > 0) {
      const growingCount = directions.filter((d) => d === "growing").length;
      const contractingCount = directions.filter((d) => d === "contracting").length;
      const ratio = growingCount / directions.length;
      if (ratio >= 0.5) overallTrend = "growing";
      else if (contractingCount / directions.length >= 0.5) overallTrend = "contracting";
      else overallTrend = "stable";
    }

    await db
      .update(clientsTable)
      .set({ overallHiringTrend: overallTrend, updatedAt: new Date() })
      .where(eq(clientsTable.id, id));

    const updatedBranch = await db
      .select()
      .from(clientBranchesTable)
      .where(eq(clientBranchesTable.id, branchId));

    const posts = await db
      .select()
      .from(branchHiringPostsTable)
      .where(eq(branchHiringPostsTable.branchId, branchId));

    res.json({
      branch: updatedBranch[0],
      posts,
      stats: { postsFound: postsToInsert.length, trendDirection, overallClientTrend: overallTrend },
      errors,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Hiring refresh failed" });
  }
});

// ── Intelligence: summary (config status + FEC snapshot) ─────────────────────

router.get("/clients/intelligence/summary", async (req, res) => {
  try {
    const summaryCached = intelCacheGet("summary");
    if (summaryCached) return res.json(summaryCached);

    const dolApiKey = await resolveCredential("dolApiKey", "DOL_API_KEY");
    const clToken = await resolveCredential("courtListenerToken", "COURT_LISTENER_TOKEN");

    // When APIs are configured we attempt a lightweight aggregate for up to 5 clients.
    // This gives the scorecard meaningful live counts without 28 parallel API calls.
    let regulatoryFlaggedCount = 0;
    let activeLitigationCount = 0;

    if (dolApiKey) {
      try {
        const allClients = await db.select({ id: clientsTable.id, name: clientsTable.name }).from(clientsTable).limit(10);
        const results = await Promise.allSettled(
          allClients.map(async (c) => {
            const q = encodeURIComponent(c.name.replace(/[,.].*$/, "").trim());
            const url = `https://data.dol.gov/get/full_inspections/search/establishment_name/${q}/rows/5`;
            const r = await fetch(url, { headers: { "X-API-KEY": dolApiKey as string } });
            if (!r.ok) return 0;
            const d = await r.json() as { total?: number; data?: unknown[] };
            const found = d.total ?? (Array.isArray(d.data) ? d.data.length : 0);
            return found > 0 ? 1 : 0;
          })
        );
        regulatoryFlaggedCount = results.reduce((acc, r) => acc + (r.status === "fulfilled" ? (r.value as number) : 0), 0);
      } catch { regulatoryFlaggedCount = 0; }
    }

    if (clToken) {
      try {
        const allClients = await db.select({ id: clientsTable.id, name: clientsTable.name }).from(clientsTable).limit(10);
        const results = await Promise.allSettled(
          allClients.map(async (c) => {
            const q = encodeURIComponent(`"${c.name.replace(/[,.].*$/, "").trim()}"`);
            const url = `https://www.courtlistener.com/api/rest/v4/dockets/?q=${q}&order_by=-date_filed&page_size=5`;
            const r = await fetch(url, { headers: { Authorization: `Token ${clToken}` } });
            if (!r.ok) return 0;
            const d = await r.json() as { results?: { date_terminated?: string }[] };
            const active = (d.results || []).filter((x) => !x.date_terminated).length;
            return active;
          })
        );
        activeLitigationCount = results.reduce((acc, r) => acc + (r.status === "fulfilled" ? (r.value as number) : 0), 0);
      } catch { activeLitigationCount = 0; }
    }

    const summaryResult = {
      oshaConfigured: !!dolApiKey,
      litigationConfigured: !!clToken,
      regulatoryFlaggedCount,
      activeLitigationCount,
    };
    intelCacheSet("summary", summaryResult);
    res.json(summaryResult);
  } catch (err: unknown) {
    req.log.error(err);
    res.status(500).json({ error: "Summary failed", detail: err instanceof Error ? err.message : String(err) });
  }
});

// ── Intelligence: FEC political contributions ─────────────────────────────────

router.get("/clients/:id/intelligence/fec", async (req, res) => {
  const { id } = req.params;

  try {
    const cacheKey = `fec:${id}`;
    const cached = intelCacheGet(cacheKey);
    if (cached) return res.json(cached);

    const clientRows = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    if (!clientRows.length) return res.status(404).json({ error: "Client not found" });
    const client = clientRows[0];

    // Resolve FEC API key (DEMO_KEY is free and public)
    const fecKey = (await resolveCredential("fecApiKey", "FEC_API_KEY")) || "DEMO_KEY";

    // 1. Search for PAC committees by company name
    const searchUrl = `https://api.open.fec.gov/v1/committees/?api_key=${fecKey}&q=${encodeURIComponent(client.name)}&per_page=10&sort=-last_file_date`;
    const searchResp = await fetch(searchUrl, {
      headers: { "User-Agent": "OccuMed-Intelligence/1.0 (contact@occu-med.com)" },
    });

    if (!searchResp.ok) {
      return res.json({ configured: true, committee: null, allCommittees: [], totalReceipts: 0, totalDisbursements: 0, cycles: [], partySplit: [], recentDisbursements: [] });
    }

    interface FecCommittee {
      committee_id: string;
      name: string;
      committee_type?: string;
      committee_type_full?: string;
      state?: string;
      treasurer_name?: string;
      first_file_date?: string;
      last_file_date?: string;
      cycles?: number[];
    }
    interface FecSearchResult { results?: FecCommittee[] }
    interface FecCycleTotals { cycle?: number; receipts?: number; disbursements?: number; contributions?: number }
    interface FecTotalsResult { results?: FecCycleTotals[] }
    interface FecDisbursement { recipient_name?: string; disbursement_amount?: number; disbursement_date?: string; disbursement_description?: string }
    interface FecDisbResult { results?: FecDisbursement[] }

    const searchData = (await searchResp.json()) as FecSearchResult;
    const committees: FecCommittee[] = searchData.results || [];

    // Pick the most active committee (prefer PAC-Qualified, most recent)
    const primaryCommittee = committees.find((c) => c.committee_type === "Q") || committees[0];

    if (!primaryCommittee) {
      return res.json({ configured: true, committee: null, allCommittees: [], totalReceipts: 0, totalDisbursements: 0, cycles: [], partySplit: [], recentDisbursements: [] });
    }

    // 2. Get cycle totals for the primary committee
    const totalsUrl = `https://api.open.fec.gov/v1/committee/${primaryCommittee.committee_id}/totals/?api_key=${fecKey}&per_page=6&sort=-cycle`;
    const totalsResp = await fetch(totalsUrl, {
      headers: { "User-Agent": "OccuMed-Intelligence/1.0 (contact@occu-med.com)" },
    });

    let cycleTotals: { cycle?: number; receipts: number; disbursements: number; contributions: number }[] = [];
    let totalReceipts = 0;
    let totalDisbursements = 0;

    if (totalsResp.ok) {
      const totalsData = (await totalsResp.json()) as FecTotalsResult;
      cycleTotals = (totalsData.results || []).slice(0, 5).map((t) => ({
        cycle: t.cycle,
        receipts: t.receipts || 0,
        disbursements: t.disbursements || 0,
        contributions: t.contributions || 0,
      }));
      totalReceipts = cycleTotals.slice(0, 4).reduce((acc, t) => acc + t.receipts, 0);
      totalDisbursements = cycleTotals.slice(0, 4).reduce((acc, t) => acc + t.disbursements, 0);
    }

    // 3. Get recent schedule_b disbursements to determine party breakdown
    const disbUrl = `https://api.open.fec.gov/v1/schedules/schedule_b/?api_key=${fecKey}&committee_id=${primaryCommittee.committee_id}&per_page=50&sort=-disbursement_date&two_year_transaction_period=2024`;
    const disbResp = await fetch(disbUrl, {
      headers: { "User-Agent": "OccuMed-Intelligence/1.0 (contact@occu-med.com)" },
    });

    let recentDisbursements: { date?: string; recipient?: string; amount?: number; description?: string }[] = [];
    let republican = 0;
    let democrat = 0;
    let bipartisan = 0;

    const GOP_PATTERNS = /republican|rnc|nrcc|nrsc|gop/i;
    const DEM_PATTERNS = /democrat|dnc|dccc|dscc/i;

    if (disbResp.ok) {
      const disbData = (await disbResp.json()) as FecDisbResult;
      const rawDisb: FecDisbursement[] = disbData.results || [];

      for (const d of rawDisb) {
        const name = (d.recipient_name || "").toLowerCase();
        if (GOP_PATTERNS.test(name)) republican += d.disbursement_amount || 0;
        else if (DEM_PATTERNS.test(name)) democrat += d.disbursement_amount || 0;
        else bipartisan += d.disbursement_amount || 0;
      }

      recentDisbursements = rawDisb.slice(0, 10).map((d) => ({
        date: d.disbursement_date,
        recipient: d.recipient_name,
        amount: d.disbursement_amount,
        description: d.disbursement_description,
      }));
    }

    const total = republican + democrat + bipartisan;
    const partySplit = total > 0 ? [
      { party: "Republican", amount: republican, pct: Math.round((republican / total) * 100) },
      { party: "Democrat", amount: democrat, pct: Math.round((democrat / total) * 100) },
      { party: "Other / Bipartisan", amount: bipartisan, pct: Math.round((bipartisan / total) * 100) },
    ].filter((p) => p.amount > 0) : [];

    const fecResult = {
      configured: true,
      committee: {
        id: primaryCommittee.committee_id,
        name: primaryCommittee.name,
        type: primaryCommittee.committee_type_full,
        state: primaryCommittee.state,
        treasurer: primaryCommittee.treasurer_name,
        firstFileDate: primaryCommittee.first_file_date,
        lastFileDate: primaryCommittee.last_file_date,
        cycles: primaryCommittee.cycles,
      },
      allCommittees: committees.map((c) => ({ id: c.committee_id, name: c.name, type: c.committee_type_full, active: c.last_file_date })),
      totalReceipts,
      totalDisbursements,
      cycles: cycleTotals,
      partySplit,
      recentDisbursements,
    };
    intelCacheSet(`fec:${id}`, fecResult);
    res.json(fecResult);
  } catch (err: unknown) {
    req.log.error(err);
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "FEC data fetch failed", detail: msg });
  }
});

// ── Intelligence: OSHA regulatory / enforcement (Serper-powered) ───────────────

router.get("/clients/:id/intelligence/osha", async (req, res) => {
  const { id } = req.params;

  try {
    const cacheKey = `osha:${id}`;
    const cached = intelCacheGet(cacheKey);
    if (cached) return res.json(cached);

    const clientRows = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    if (!clientRows.length) return res.status(404).json({ error: "Client not found" });
    const client = clientRows[0];

    const serperKey = await resolveCredential("serperApiKey", "SERPER_API_KEY");
    if (!serperKey) {
      return res.json({
        configured: false,
        message: "Serper API key not configured. Add your Serper key in Integrations to enable OSHA enforcement data.",
        settingKey: "serperApiKey",
      });
    }

    const companyName = client.name.replace(/[,.].*$/, "").trim();

    // Search OSHA enforcement database via Google (Serper)
    const queries = [
      `site:osha.gov "${companyName}" inspection`,
      `"${companyName}" OSHA inspection violation penalty enforcement`,
    ];

    const searchResults = await Promise.allSettled(
      queries.map((q) =>
        fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
          body: JSON.stringify({ q, num: 8 }),
        }).then(async (r) => {
          if (!r.ok) return [];
          const json = (await r.json()) as { organic?: { title?: string; link?: string; snippet?: string; date?: string }[] };
          return json.organic ?? [];
        }).catch(() => [])
      )
    );

    // Deduplicate by link
    const seen = new Set<string>();
    const allResults: { title: string; link: string; snippet: string; date?: string }[] = [];
    for (const r of searchResults) {
      if (r.status === "fulfilled") {
        for (const item of r.value) {
          if (item.link && !seen.has(item.link)) {
            seen.add(item.link);
            allResults.push({ title: item.title ?? "", link: item.link ?? "", snippet: item.snippet ?? "", date: item.date });
          }
        }
      }
    }

    // Classify results into OSHA-specific vs general regulatory
    const oshaRecords = allResults.filter((r) =>
      r.link.includes("osha.gov") ||
      /\b(osha|inspection|violation|penalty|citation|willful|serious|recordable|fatality|illness|safety|health)\b/i.test(r.title + " " + r.snippet)
    );

    // Extract penalty amounts from snippets using regex
    const inspections = oshaRecords.slice(0, 20).map((r, idx) => {
      const penaltyMatch = r.snippet.match(/\$[\d,]+(?:\.\d{2})?/);
      const stateMatch = r.snippet.match(/\b([A-Z]{2})\b/) || r.link.match(/state=([A-Z]{2})/i);
      const violationsMatch = r.snippet.match(/(\d+)\s+(?:serious\s+)?violation/i);
      return {
        id: `serper-${idx}`,
        establishment: companyName,
        title: r.title,
        snippet: r.snippet,
        openDate: r.date || null,
        closeDate: null,
        totalPenalty: penaltyMatch ? penaltyMatch[0].replace(/[$,]/g, "") : null,
        violations: violationsMatch ? parseInt(violationsMatch[1]) : null,
        state: stateMatch ? (stateMatch[1] || null) : null,
        city: null,
        sourceUrl: r.link,
        isOshaGov: r.link.includes("osha.gov"),
      };
    });

    const oshaResult = { configured: true, inspections, total: inspections.length, source: "serper" };
    intelCacheSet(`osha:${id}`, oshaResult);
    res.json(oshaResult);
  } catch (err: unknown) {
    req.log.error(err);
    res.status(500).json({ error: "OSHA data fetch failed", detail: err instanceof Error ? err.message : String(err) });
  }
});

// ── Intelligence: Litigation (CourtListener) ──────────────────────────────────

router.get("/clients/:id/intelligence/litigation", async (req, res) => {
  const { id } = req.params;

  try {
    const cacheKey = `litigation:${id}`;
    const cached = intelCacheGet(cacheKey);
    if (cached) return res.json(cached);

    const clientRows = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    if (!clientRows.length) return res.status(404).json({ error: "Client not found" });
    const client = clientRows[0];

    const clToken = await resolveCredential("courtListenerToken", "COURT_LISTENER_TOKEN");
    if (!clToken) {
      return res.json({
        configured: false,
        message: "CourtListener token not configured. Create a free account at https://www.courtlistener.com/sign-in/ and add your API token to enable litigation data.",
        settingKey: "courtListenerToken",
      });
    }

    // CourtListener REST API v4 — use /search/ endpoint (dockets/?q= removed in v4)
    const searchUrl = `https://www.courtlistener.com/api/rest/v4/search/?q=${encodeURIComponent(`"${client.name}"`)}&type=r&order_by=score+desc&page_size=15`;
    const resp = await fetch(searchUrl, {
      headers: {
        Authorization: `Token ${clToken}`,
        "User-Agent": "OccuMed-Intelligence/1.0 (contact@occu-med.com)",
      },
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      req.log.warn({ status: resp.status, detail }, "CourtListener API returned non-OK");
      return res.json({ configured: true, unavailable: true, cases: [], total: 0, sourceError: `CourtListener responded with ${resp.status}` });
    }

    interface ClSearchResult {
      docket_id?: number;
      caseName?: string;
      court?: string;
      dateFiled?: string;
      dateTerminated?: string;
      docketNumber?: string;
      docket_absolute_url?: string;
      cause?: string;
      jurisdictionType?: string;
    }
    interface ClSearchResponse { count?: number; results?: ClSearchResult[] }

    const data = (await resp.json()) as ClSearchResponse;
    const cases = (data.results || []).map((c) => ({
      id: c.docket_id,
      caseName: c.caseName,
      court: c.court,
      dateFiled: c.dateFiled,
      dateTerminated: c.dateTerminated,
      status: (c.dateTerminated ? "Closed" : "Active") as "Active" | "Closed",
      docketNumber: c.docketNumber,
      url: c.docket_absolute_url ? `https://www.courtlistener.com${c.docket_absolute_url}` : undefined,
      cause: c.cause,
      jurisdictionType: c.jurisdictionType,
      amountAtStake: null as number | null,
    }));

    const litigationResult = { configured: true, cases, total: data.count || cases.length };
    intelCacheSet(`litigation:${id}`, litigationResult);
    res.json(litigationResult);
  } catch (err: unknown) {
    req.log.error(err);
    res.status(500).json({ error: "Litigation data fetch failed", detail: err instanceof Error ? err.message : String(err) });
  }
});

// ── Seed helper ───────────────────────────────────────────────────────────────

async function seedClients(): Promise<void> {
  for (const c of SEED_CLIENTS) {
    await db.insert(clientsTable).values({
      id: randomUUID(),
      name: c.name,
      website: c.website,
      industry: c.industry,
      headquarters: c.headquarters,
      overallHiringTrend: "unknown",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

export default router;
