/**
 * Prospect Location & Hiring Intelligence Routes
 *
 * GET  /api/prospects/:id/locations         — list all locations for a prospect
 * POST /api/prospects/:id/discover-locations — AI-discover all worldwide branches
 * GET  /api/prospects/:id/jobs              — list all job postings
 * POST /api/prospects/:id/discover-jobs     — pull hiring notices & match to locations
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { prospectsTable, prospectLocationsTable, prospectJobsTable } from "@workspace/db/schema";
import { serperProvider } from "../lib/providers/serper";
import { resolveCredential } from "../lib/config/providerConfig";

const router = Router();

// ── Health-related job title keywords ────────────────────────────────────────
const HEALTH_KEYWORDS = [
  "occupational health", "industrial hygiene", "ehs", "environmental health",
  "safety", "health nurse", "physician", "medical", "wellness", "ergonomist",
  "industrial medicine", "occupational medicine", "first responder", "emt",
  "paramedic", "health technician", "safety officer", "safety manager",
  "injury prevention", "workers comp", "clinical", "health program",
  "toxicologist", "industrial nurse", "site medic", "medical director",
];

function isHealthRelated(title: string, snippet: string): { yes: boolean; reason: string } {
  const combined = `${title} ${snippet}`.toLowerCase();
  for (const kw of HEALTH_KEYWORDS) {
    if (combined.includes(kw)) return { yes: true, reason: kw };
  }
  return { yes: false, reason: "" };
}

function hiringTrendLabel(count: number): string {
  if (count >= 15) return "high";
  if (count >= 5) return "medium";
  if (count >= 1) return "low";
  return "none";
}

// ── Heuristic location extractor (fallback when Gemini is unavailable) ────────
const VALID_TYPES = ["headquarters", "manufacturing", "office", "research", "testing", "warehouse", "training", "distribution", "service_center", "other"];

const COUNTRY_LIST = [
  "United States","United Kingdom","Germany","France","Australia","Canada","Japan","Italy",
  "Spain","Netherlands","Belgium","Sweden","Norway","Denmark","Finland","Poland","Czech Republic",
  "Romania","Hungary","Austria","Switzerland","Portugal","Greece","Turkey","Israel","Saudi Arabia",
  "UAE","Qatar","Kuwait","Bahrain","India","China","South Korea","Singapore","Malaysia","Thailand",
  "Philippines","Indonesia","Brazil","Mexico","Colombia","Argentina","Chile","South Africa",
  "Egypt","Nigeria","Kenya","Morocco","Algeria","Pakistan","Bangladesh","Vietnam","Taiwan",
  "New Zealand","Ireland","Luxembourg","Slovakia","Croatia","Slovenia","Estonia","Latvia","Lithuania",
];

const US_STATES: Record<string,string> = {
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
const STATE_ABBREVS = new Set(Object.values(US_STATES));

function heuristicExtractLocations(
  companyName: string,
  results: { title: string; link: string; snippet: string }[]
): any[] {
  const locations: any[] = [];
  const seenKeys = new Set<string>();

  for (const r of results) {
    const text = `${r.title} ${r.snippet}`;

    // Match "City, State" patterns (US)
    const cityStateRe = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?),\s*([A-Z]{2})\b/g;
    let m: RegExpExecArray | null;
    while ((m = cityStateRe.exec(text)) !== null) {
      const [, city, stateAbbrev] = m;
      if (!STATE_ABBREVS.has(stateAbbrev)) continue;
      const key = `${city.toLowerCase()}|united states`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      locations.push({
        name: `${companyName} – ${city}, ${stateAbbrev}`,
        type: guessType(text),
        city,
        state: stateAbbrev,
        country: "United States",
        employeeEstimate: "",
        description: r.snippet.slice(0, 150),
        sourceUrl: r.link,
      });
    }

    // Match international countries
    for (const country of COUNTRY_LIST) {
      if (!text.includes(country)) continue;
      // Try to extract a city before the country
      const countryRe = new RegExp(`([A-Z][a-z]+(?:\\s[A-Z][a-z]+)?)\\s*,?\\s*${country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, "g");
      const cm = countryRe.exec(text);
      const city = cm?.[1] || "";
      const key = `${city.toLowerCase()}|${country.toLowerCase()}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      locations.push({
        name: city ? `${companyName} – ${city}, ${country}` : `${companyName} – ${country}`,
        type: guessType(text),
        city: city || null,
        state: "",
        country,
        employeeEstimate: "",
        description: r.snippet.slice(0, 150),
        sourceUrl: r.link,
      });
    }
  }

  return locations.slice(0, 60); // cap at 60 heuristic results
}

function guessType(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("headquarter") || t.includes("hq") || t.includes("corporate office")) return "headquarters";
  if (t.includes("manufactur") || t.includes("plant") || t.includes("factory") || t.includes("assembly")) return "manufacturing";
  if (t.includes("research") || t.includes("r&d") || t.includes("lab")) return "research";
  if (t.includes("test") || t.includes("range")) return "testing";
  if (t.includes("warehouse") || t.includes("distribution")) return "warehouse";
  if (t.includes("training")) return "training";
  if (t.includes("service center") || t.includes("depot")) return "service_center";
  return "office";
}

// ── Wikipedia fallback search ─────────────────────────────────────────────────
async function wikipediaFallbackLocations(companyName: string): Promise<any[]> {
  try {
    // 1. Search Wikipedia for the company
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(companyName)}&srlimit=3&format=json&origin=*`;
    const searchResp = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    if (!searchResp.ok) return [];
    const searchData = (await searchResp.json()) as any;
    const topTitle = searchData?.query?.search?.[0]?.title;
    if (!topTitle) return [];

    // 2. Fetch the page extract
    const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=true&explaintext=true&titles=${encodeURIComponent(topTitle)}&format=json&origin=*`;
    const extractResp = await fetch(extractUrl, { signal: AbortSignal.timeout(8000) });
    if (!extractResp.ok) return [];
    const extractData = (await extractResp.json()) as any;
    const pages = extractData?.query?.pages ?? {};
    const pageText = Object.values(pages)[0] as any;
    const extract = pageText?.extract ?? "";
    if (!extract) return [];

    // 3. Parse locations from extract using heuristics
    const fakeResults = [{ title: topTitle, link: `https://en.wikipedia.org/wiki/${encodeURIComponent(topTitle)}`, snippet: extract.slice(0, 800) }];
    return heuristicExtractLocations(companyName, fakeResults);
  } catch {
    return [];
  }
}

// ── List locations ────────────────────────────────────────────────────────────

router.get("/prospects/:id/locations", async (req, res) => {
  try {
    const { id } = req.params;
    const locs = await db
      .select()
      .from(prospectLocationsTable)
      .where(eq(prospectLocationsTable.prospectId, id))
      .orderBy(prospectLocationsTable.country, prospectLocationsTable.city);
    res.json({ locations: locs });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list locations" });
  }
});

// ── Discover worldwide locations ──────────────────────────────────────────────

router.post("/prospects/:id/discover-locations", async (req, res) => {
  const { id } = req.params;

  try {
    const rows = await db.select().from(prospectsTable).where(eq(prospectsTable.id, id));
    if (!rows.length) return res.status(404).json({ error: "Prospect not found" });
    const prospect = rows[0];

    const errors: string[] = [];
    const warnings: string[] = [];
    let source = "serper+gemini";

    // ── 1. Serper — global facility searches ──────────────────────────────────
    const queries = [
      `"${prospect.name}" global locations facilities offices worldwide list`,
      `"${prospect.name}" manufacturing plants facilities USA`,
      `"${prospect.name}" worldwide offices subsidiaries locations`,
      `"${prospect.name}" site locations headquarters campus facilities`,
    ];

    const serperConfigured = await serperProvider.isConfigured();
    let serperResults: { title: string; link: string; snippet: string }[] = [];

    if (serperConfigured) {
      try {
        serperResults = await serperProvider.searchMultiple(queries, 10);
      } catch (e: any) {
        errors.push(`Serper: ${e.message}`);
      }
    }

    if (serperResults.length === 0) {
      // Fallback to Wikipedia
      warnings.push("Serper returned no results — using Wikipedia fallback");
      source = "wikipedia-fallback";
      const wikiLocs = await wikipediaFallbackLocations(prospect.name);
      serperResults = wikiLocs.map(l => ({
        title: l.name,
        link: l.sourceUrl || "",
        snippet: l.description || l.country,
      }));
      if (serperResults.length === 0) {
        return res.json({ locations: [], added: 0, total: 0, errors, warnings,
          message: !serperConfigured
            ? "Serper API key not configured — add it in Settings → Integrations."
            : "No results found from Serper or Wikipedia. Try again later." });
      }
    }

    // ── 2. Gemini — extract structured location data ───────────────────────────
    const geminiKey = await resolveCredential("geminiApiKey", "GEMINI_API_KEY");
    let extracted: any[] = [];

    if (geminiKey) {
      const textSample = serperResults
        .map((r) => `Title: ${r.title}\nURL: ${r.link}\nSnippet: ${r.snippet}`)
        .join("\n\n---\n\n");

      const prompt = `You are extracting structured location data for "${prospect.name}" (${prospect.industry || "defense contractor"}).

From the search results below, extract EVERY worldwide location/facility you can identify.
Be comprehensive — include headquarters, manufacturing plants, offices, research centers, test facilities, training centers, warehouses, service centers, and any other facility type.

For each location, output a JSON object with these fields:
- "name": facility name (e.g., "${prospect.name} Palmdale Plant" — use company name + city if no specific name)
- "type": EXACTLY one of: headquarters, manufacturing, office, research, testing, warehouse, training, distribution, service_center, other
- "city": city name
- "state": US state abbreviation or province (empty string if outside US/Canada)
- "country": full country name (e.g., "United States", "Germany", "United Kingdom")
- "employeeEstimate": approximate employee count as string (e.g., "12,000+" or "" if unknown)
- "description": one sentence describing what this facility does
- "sourceUrl": the URL where this location was mentioned

Return ONLY a valid JSON array. No explanation, no markdown, no code fences — just the raw JSON array starting with [ and ending with ].
If you cannot find any locations, return [].

Search results:
${textSample}`;

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
          warnings.push(`Gemini: ${errMsg} — using heuristic extraction instead`);
          extracted = heuristicExtractLocations(prospect.name, serperResults);
          source = source.replace("gemini", "heuristic");
        }
      } catch (e: any) {
        warnings.push(`Gemini extraction error: ${e.message} — using heuristic extraction`);
        extracted = heuristicExtractLocations(prospect.name, serperResults);
        source = source.replace("gemini", "heuristic");
      }
    } else {
      warnings.push("Gemini key not configured — using heuristic extraction");
      extracted = heuristicExtractLocations(prospect.name, serperResults);
      source = "serper+heuristic";
    }

    // ── 3. Persist discovered locations (skip duplicates by city+country) ──────
    const existing = await db
      .select()
      .from(prospectLocationsTable)
      .where(eq(prospectLocationsTable.prospectId, id));

    const existingKeys = new Set(
      existing.map((l) => `${(l.city || "").toLowerCase()}|${(l.country || "").toLowerCase()}`)
    );

    let added = 0;
    for (const loc of extracted) {
      if (!loc.country) continue;
      const key = `${(loc.city || "").toLowerCase()}|${(loc.country || "").toLowerCase()}`;
      if (existingKeys.has(key)) continue;

      await db.insert(prospectLocationsTable).values({
        id: randomUUID(),
        prospectId: id,
        name: loc.name || `${prospect.name} – ${loc.city || loc.country}`,
        type: VALID_TYPES.includes(loc.type) ? loc.type : "office",
        city: loc.city || null,
        state: loc.state || null,
        country: loc.country,
        employeeEstimate: loc.employeeEstimate || null,
        description: loc.description || null,
        sourceUrl: loc.sourceUrl || null,
        openPositions: 0,
        healthPositions: 0,
        hiringTrend: "none",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      existingKeys.add(key);
      added++;
    }

    const allLocs = await db
      .select()
      .from(prospectLocationsTable)
      .where(eq(prospectLocationsTable.prospectId, id))
      .orderBy(prospectLocationsTable.country, prospectLocationsTable.city);

    res.json({ locations: allLocs, added, total: allLocs.length, errors, warnings, source });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Location discovery failed" });
  }
});

// ── List jobs ─────────────────────────────────────────────────────────────────

router.get("/prospects/:id/jobs", async (req, res) => {
  try {
    const { id } = req.params;
    const jobs = await db
      .select()
      .from(prospectJobsTable)
      .where(eq(prospectJobsTable.prospectId, id))
      .orderBy(prospectJobsTable.createdAt);
    res.json({ jobs });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list jobs" });
  }
});

// ── Discover job postings & update location hiring stats ───────────────────────

router.post("/prospects/:id/discover-jobs", async (req, res) => {
  const { id } = req.params;

  try {
    const rows = await db.select().from(prospectsTable).where(eq(prospectsTable.id, id));
    if (!rows.length) return res.status(404).json({ error: "Prospect not found" });
    const prospect = rows[0];

    const errors: string[] = [];

    // ── 1. Serper — job posting searches ─────────────────────────────────────
    const jobQueries = [
      `"${prospect.name}" jobs hiring 2026 site:linkedin.com/jobs OR site:indeed.com OR site:careers.${(prospect.website || "example.com").replace(/https?:\/\/(www\.)?/, "").split("/")[0]}`,
      `"${prospect.name}" occupational health safety nurse industrial hygiene jobs`,
      `"${prospect.name}" open positions EHS medical health safety hiring 2025 OR 2026`,
      `"${prospect.name}" careers jobs engineering manufacturing hiring`,
    ];

    let serperResults: { title: string; link: string; snippet: string }[] = [];
    try {
      serperResults = await serperProvider.searchMultiple(jobQueries, 12);
    } catch (e: any) {
      errors.push(`Serper jobs: ${e.message}`);
    }

    // ── 2. Parse job results ──────────────────────────────────────────────────
    const locations = await db
      .select()
      .from(prospectLocationsTable)
      .where(eq(prospectLocationsTable.prospectId, id));

    // Clear old jobs for this prospect
    await db.delete(prospectJobsTable).where(eq(prospectJobsTable.prospectId, id));

    const jobsToInsert: any[] = [];
    const locationJobCounts: Record<string, { total: number; health: number; categories: Record<string, number> }> = {};

    for (const r of serperResults) {
      // Try to find matching location
      let locationId: string | null = null;
      const combined = `${r.title} ${r.snippet}`.toLowerCase();

      for (const loc of locations) {
        if (loc.city && combined.includes(loc.city.toLowerCase())) {
          locationId = loc.id;
          break;
        }
        if (loc.state && combined.includes(loc.state.toLowerCase())) {
          locationId = loc.id;
        }
      }

      // Extract raw location from snippet
      const locMatch = r.snippet.match(/(?:in|at|location[:\s]+)\s*([A-Z][a-z]+(?:,\s*[A-Z]{2})?)/);
      const rawLocation = locMatch?.[1] || "";

      // Extract job type
      let jobType = "full-time";
      if (combined.includes("part-time") || combined.includes("part time")) jobType = "part-time";
      else if (combined.includes("contract") || combined.includes("contractor")) jobType = "contract";
      else if (combined.includes("intern")) jobType = "intern";

      // Guess department
      let department = "General";
      if (combined.includes("engineer") || combined.includes("engineering")) department = "Engineering";
      else if (combined.includes("manufactur") || combined.includes("production") || combined.includes("machinist")) department = "Manufacturing";
      else if (combined.includes("software") || combined.includes("developer") || combined.includes("data ")) department = "Software & IT";
      else if (combined.includes("finance") || combined.includes("accounting")) department = "Finance";
      else if (combined.includes("supply chain") || combined.includes("logistics") || combined.includes("procurement")) department = "Supply Chain";
      else if (combined.includes("hr") || combined.includes("human resources") || combined.includes("talent")) department = "HR";
      else if (combined.includes("security") || combined.includes("cyber")) department = "Security";
      else if (combined.includes("program manager") || combined.includes("project manager")) department = "Program Management";

      const { yes: isHealth, reason } = isHealthRelated(r.title, r.snippet);
      if (isHealth) department = "Health & Safety";

      // Extract posted date
      const dateMatch = r.snippet.match(/\b(\d{1,2}\s+(?:hour|day|week|month)s?\s+ago|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4})\b/i);

      jobsToInsert.push({
        id: randomUUID(),
        prospectId: id,
        locationId,
        title: r.title.replace(/\s*[-|–].*$/, "").trim().slice(0, 150),
        department,
        rawLocation,
        jobType,
        postedDate: dateMatch?.[0] || "",
        url: r.link,
        snippet: r.snippet.slice(0, 400),
        isHealthRelated: isHealth,
        healthRelevanceReason: reason,
        createdAt: new Date(),
      });

      // Update location stats
      if (locationId) {
        if (!locationJobCounts[locationId]) {
          locationJobCounts[locationId] = { total: 0, health: 0, categories: {} };
        }
        locationJobCounts[locationId].total++;
        if (isHealth) locationJobCounts[locationId].health++;
        locationJobCounts[locationId].categories[department] = (locationJobCounts[locationId].categories[department] || 0) + 1;
      }
    }

    // Insert jobs
    if (jobsToInsert.length > 0) {
      await db.insert(prospectJobsTable).values(jobsToInsert);
    }

    // Update location hiring stats
    for (const [locId, stats] of Object.entries(locationJobCounts)) {
      await db
        .update(prospectLocationsTable)
        .set({
          openPositions: stats.total,
          healthPositions: stats.health,
          hiringTrend: hiringTrendLabel(stats.total),
          hiringCategories: JSON.stringify(
            Object.entries(stats.categories).map(([cat, count]) => ({ category: cat, count }))
          ),
          jobsLastUpdated: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(prospectLocationsTable.id, locId));
    }

    const allJobs = await db
      .select()
      .from(prospectJobsTable)
      .where(eq(prospectJobsTable.prospectId, id));

    const allLocs = await db
      .select()
      .from(prospectLocationsTable)
      .where(eq(prospectLocationsTable.prospectId, id));

    res.json({
      jobs: allJobs,
      locations: allLocs,
      stats: {
        jobsFound: allJobs.length,
        healthJobs: allJobs.filter((j) => j.isHealthRelated).length,
        locationsWithHiring: Object.keys(locationJobCounts).length,
      },
      errors,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Job discovery failed" });
  }
});

// ── Delete a location ─────────────────────────────────────────────────────────

router.delete("/prospects/:id/locations/:locId", async (req, res) => {
  try {
    const { locId } = req.params;
    await db.delete(prospectJobsTable).where(eq(prospectJobsTable.locationId, locId));
    await db.delete(prospectLocationsTable).where(eq(prospectLocationsTable.id, locId));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete location" });
  }
});

export default router;
