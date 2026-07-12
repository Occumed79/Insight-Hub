import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DIRECT_RFP_PORTALS } from "../api-server/src/lib/providers/directRfpPortals";
import {
  PROCUREMENT_TERM_GROUPS,
  SERVICE_CATEGORIES,
} from "../api-server/src/lib/search/occumedProcurementOntology";

const BLOCKED_HOST_PARTS = [
  "bidnet",
  "demandstar",
  "highergov",
  "govtribe",
  "govwin",
  "starbridge",
  "rfpmart",
  "bidbanana",
  "sweetspot",
  "fedscout",
  "planetbids",
  "opengov",
  "periscope",
  "s2g",
  "ionwave",
];

const QUERY_BUNDLES = [
  [
    '"occupational health services"',
    '"occupational medicine"',
    '"employee occupational health"',
    '"pre-employment physical"',
    '"pre-placement medical"',
  ],
  [
    '"medical surveillance"',
    '"respirator medical clearance"',
    '"respirator fit testing"',
    '"hearing conservation"',
    '"audiometric testing"',
  ],
  [
    '"drug and alcohol testing services"',
    '"DOT drug testing"',
    '"Medical Review Officer"',
    '"specimen collection"',
    '"breath alcohol testing"',
  ],
  [
    '"firefighter physical"',
    '"NFPA 1582"',
    '"law enforcement medical"',
    '"public safety physical"',
    '"fitness for duty"',
  ],
  [
    '"deployment medical screening"',
    '"medical readiness"',
    '"OCONUS medical clearance"',
    '"contractor personnel medical"',
    '"local nationals occupational health"',
  ],
  [
    '"employee vaccination"',
    '"travel medicine"',
    '"onsite medical services"',
    '"nationwide provider network"',
    '"medical program management"',
  ],
];

const PROCUREMENT_SUFFIX =
  '(RFP OR RFQ OR IFB OR ITB OR solicitation OR bid OR contract OR award OR "scope of work" OR forecast)';
const MIN_SUCCESSFUL_QUERIES_FOR_NO_MATCH = 4;

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: "serper" | "bing_rss" | "bing_html" | "duckduckgo";
}

interface SearchOutcome {
  succeeded: boolean;
  provider?: SearchResult["source"];
  results: SearchResult[];
  errors: string[];
}

interface EvidenceItem {
  title: string;
  url: string;
  snippet: string;
  pageStatus: number | null;
  matchedServiceCategories: string[];
  matchedServiceTerms: string[];
  matchedProcurementTerms: string[];
  evidenceType:
    | "active_or_historical_solicitation"
    | "award_or_contract"
    | "forecast_or_sources_sought";
  acceptedAt: string;
}

interface PortalResearchRecord {
  portalId: string;
  portalName: string;
  jurisdiction: string;
  country: string;
  portalUrl: string;
  searchUrl?: string;
  portalDomain: string;
  researchStatus:
    | "verified_relevant"
    | "researched_no_match"
    | "research_failed"
    | "inaccessible"
    | "not_a_direct_source";
  researchStartedAt: string;
  researchCompletedAt: string;
  queriesExecuted: string[];
  successfulQueryCount: number;
  failedQueryCount: number;
  searchProviders: string[];
  officialPagesInspected: string[];
  acceptedEvidence: EvidenceItem[];
  rejectedCandidates: Array<{ url: string; reason: string }>;
  errors: string[];
  portalHttpStatus: number | null;
  redirectedHost?: string;
}

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const shard = Number(arg("shard", "0"));
const shards = Number(arg("shards", "1"));
const out = resolve(arg("out", `portal-research-${shard}.json`));
const concurrency = Math.max(1, Number(arg("concurrency", "4")));
const maxEvidencePages = Math.max(3, Number(arg("max-evidence-pages", "12")));

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/<!\[CDATA\[|\]\]>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function host(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sameOfficialFamily(portalDomain: string, resultUrl: string): boolean {
  const resultHost = host(resultUrl);
  const normalizedPortal = portalDomain.toLowerCase().replace(/^www\./, "");
  if (!resultHost) return false;
  if (BLOCKED_HOST_PARTS.some((part) => resultHost.includes(part))) return false;
  if (
    resultHost === normalizedPortal ||
    resultHost.endsWith(`.${normalizedPortal}`) ||
    normalizedPortal.endsWith(`.${resultHost}`)
  ) {
    return true;
  }
  return /\.(gov|mil|us)$/.test(resultHost) || resultHost.endsWith(".gov.au");
}

function termMatches(text: string, terms: string[]): string[] {
  const lower = text.toLowerCase();
  return terms.filter((term) => lower.includes(term.toLowerCase()));
}

function classifyEvidence(text: string): {
  serviceCategories: string[];
  serviceTerms: string[];
  procurementTerms: string[];
  evidenceType: EvidenceItem["evidenceType"] | null;
} {
  const serviceCategories: string[] = [];
  const serviceTerms: string[] = [];
  for (const category of SERVICE_CATEGORIES) {
    const matches = termMatches(text, [
      ...category.explicitPhrases,
      ...category.componentTerms,
      ...(category.regulatoryTerms ?? []),
      ...(category.highIntentPhrases ?? []),
    ]);
    if (matches.length > 0) {
      serviceCategories.push(category.label);
      serviceTerms.push(...matches);
    }
  }
  const procurementTerms = termMatches(
    text,
    PROCUREMENT_TERM_GROUPS.flatMap((group) => group.phrases),
  );
  const lower = text.toLowerCase();
  let evidenceType: EvidenceItem["evidenceType"] | null = null;
  if (/award|awarded|executed contract|contract number/.test(lower)) {
    evidenceType = "award_or_contract";
  } else if (/forecast|sources sought|presolicitation|pre-solicitation/.test(lower)) {
    evidenceType = "forecast_or_sources_sought";
  } else if (procurementTerms.length > 0) {
    evidenceType = "active_or_historical_solicitation";
  }
  return {
    serviceCategories: [...new Set(serviceCategories)],
    serviceTerms: [...new Set(serviceTerms)],
    procurementTerms: [...new Set(procurementTerms)],
    evidenceType,
  };
}

async function fetchText(url: string, timeoutMs = 20_000): Promise<{
  status: number | null;
  finalUrl: string;
  text: string;
  error?: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml,application/rss+xml,application/pdf;q=0.8,*/*;q=0.5",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    const contentType = response.headers.get("content-type") ?? "";
    let text = "";
    if (
      contentType.includes("text") ||
      contentType.includes("json") ||
      contentType.includes("xml") ||
      contentType.includes("rss")
    ) {
      text = stripHtml((await response.text()).slice(0, 2_000_000));
    }
    return { status: response.status, finalUrl: response.url, text };
  } catch (error) {
    return {
      status: null,
      finalUrl: url,
      text: "",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRaw(url: string, timeoutMs = 20_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml,application/rss+xml,*/*;q=0.5",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) throw new Error(`${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function retry<T>(
  label: string,
  operation: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(500 * 2 ** (attempt - 1));
    }
  }
  throw new Error(
    `${label}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function serperSearch(query: string): Promise<SearchResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error("SERPER_API_KEY unavailable");
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
    },
    body: JSON.stringify({ q: query, num: 10 }),
  });
  if (!response.ok) throw new Error(`Serper ${response.status}`);
  const data = (await response.json()) as {
    organic?: Array<{ title?: string; link?: string; snippet?: string }>;
  };
  return (data.organic ?? [])
    .filter((item) => item.link)
    .map((item) => ({
      title: item.title ?? "",
      url: item.link ?? "",
      snippet: item.snippet ?? "",
      source: "serper" as const,
    }));
}

async function bingRssSearch(query: string): Promise<SearchResult[]> {
  const xml = await fetchRaw(
    `https://www.bing.com/search?format=rss&count=10&q=${encodeURIComponent(query)}`,
  );
  if (!/<rss|<item/i.test(xml)) throw new Error("Bing RSS returned no RSS payload");
  const results: SearchResult[] = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemPattern.exec(xml)) && results.length < 10) {
    const item = itemMatch[1];
    const title = item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const link = item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "";
    const description =
      item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? "";
    if (!link.trim()) continue;
    results.push({
      title: stripHtml(title),
      url: stripHtml(link),
      snippet: stripHtml(description),
      source: "bing_rss",
    });
  }
  return results;
}

async function bingHtmlSearch(query: string): Promise<SearchResult[]> {
  const html = await fetchRaw(
    `https://www.bing.com/search?count=10&q=${encodeURIComponent(query)}`,
  );
  const results: SearchResult[] = [];
  const blockPattern = /<li[^>]+class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = blockPattern.exec(html)) && results.length < 10) {
    const block = blockMatch[1];
    const anchor = block.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor?.[1]) continue;
    const snippet = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "";
    results.push({
      title: stripHtml(anchor[2]),
      url: anchor[1],
      snippet: stripHtml(snippet),
      source: "bing_html",
    });
  }
  if (results.length === 0 && !/b_algo/i.test(html)) {
    throw new Error("Bing HTML returned no recognizable result payload");
  }
  return results;
}

function decodeDuckDuckGoUrl(value: string): string {
  try {
    const parsed = new URL(value, "https://html.duckduckgo.com");
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : parsed.toString();
  } catch {
    return value;
  }
}

async function duckDuckGoSearch(query: string): Promise<SearchResult[]> {
  const html = await fetchRaw(
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
  );
  const results: SearchResult[] = [];
  const linkPattern = /<a[^>]+(?:class=['"]result-link['"][^>]+)?href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html)) && results.length < 10) {
    const url = decodeDuckDuckGoUrl(match[1]);
    if (!/^https?:/i.test(url)) continue;
    results.push({
      title: stripHtml(match[2]),
      url,
      snippet: "",
      source: "duckduckgo",
    });
  }
  if (results.length === 0 && !/no results|result-link/i.test(html)) {
    throw new Error("DuckDuckGo returned no recognizable result payload");
  }
  return results;
}

async function search(query: string): Promise<SearchOutcome> {
  const errors: string[] = [];
  const providers: Array<{
    name: SearchResult["source"];
    run: () => Promise<SearchResult[]>;
  }> = [];
  if (process.env.SERPER_API_KEY) {
    providers.push({
      name: "serper",
      run: () => retry("Serper", () => serperSearch(query), 3),
    });
  }
  providers.push(
    {
      name: "bing_rss",
      run: () => retry("Bing RSS", () => bingRssSearch(query), 3),
    },
    {
      name: "bing_html",
      run: () => retry("Bing HTML", () => bingHtmlSearch(query), 2),
    },
    {
      name: "duckduckgo",
      run: () => retry("DuckDuckGo", () => duckDuckGoSearch(query), 2),
    },
  );

  for (const provider of providers) {
    try {
      const results = await provider.run();
      return { succeeded: true, provider: provider.name, results, errors };
    } catch (error) {
      errors.push(
        `${provider.name}:${error instanceof Error ? error.message : String(error)}`,
      );
      await sleep(200);
    }
  }
  return { succeeded: false, results: [], errors };
}

async function mapLimit<T, R>(
  values: T[],
  limit: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  async function run(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      results[index] = await worker(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, run));
  return results;
}

async function researchPortal(
  portal: (typeof DIRECT_RFP_PORTALS)[number],
): Promise<PortalResearchRecord> {
  const started = new Date().toISOString();
  const errors: string[] = [];
  const officialPagesInspected: string[] = [];
  const rejectedCandidates: Array<{ url: string; reason: string }> = [];
  const acceptedEvidence: EvidenceItem[] = [];

  const portalFetch = await fetchText(portal.url);
  if (portalFetch.error) errors.push(`portal:${portalFetch.error}`);
  if (portalFetch.status !== null) officialPagesInspected.push(portalFetch.finalUrl);
  const redirectedHost = host(portalFetch.finalUrl);
  const redirectedToBlocked = BLOCKED_HOST_PARTS.some((part) =>
    redirectedHost.includes(part),
  );

  const queries = QUERY_BUNDLES.map(
    (bundle) =>
      `site:${portal.domain} (${bundle.join(" OR ")}) ${PROCUREMENT_SUFFIX}`,
  );
  const searchOutcomes = await mapLimit(queries, 2, async (query) => {
    const outcome = await search(query);
    if (!outcome.succeeded) {
      errors.push(`search-failed:${query}:${outcome.errors.join(" | ")}`);
    } else if (outcome.errors.length > 0) {
      errors.push(`search-fallback:${query}:${outcome.errors.join(" | ")}`);
    }
    return outcome;
  });
  const successfulQueryCount = searchOutcomes.filter(
    (outcome) => outcome.succeeded,
  ).length;
  const failedQueryCount = queries.length - successfulQueryCount;
  const searchProviders = [
    ...new Set(
      searchOutcomes
        .map((outcome) => outcome.provider)
        .filter((provider): provider is SearchResult["source"] => Boolean(provider)),
    ),
  ];

  const candidates = new Map<string, SearchResult>();
  for (const result of searchOutcomes.flatMap((outcome) => outcome.results)) {
    if (!result.url || candidates.has(result.url)) continue;
    if (!sameOfficialFamily(portal.domain, result.url)) {
      rejectedCandidates.push({ url: result.url, reason: "not-official-domain" });
      continue;
    }
    candidates.set(result.url, result);
  }

  const candidateList = [...candidates.values()].slice(0, maxEvidencePages);
  const fetchedCandidates = await mapLimit(candidateList, 3, async (candidate) => ({
    candidate,
    fetched: await fetchText(candidate.url),
  }));

  for (const { candidate, fetched } of fetchedCandidates) {
    if (fetched.status !== null) officialPagesInspected.push(fetched.finalUrl);
    if (fetched.error) {
      rejectedCandidates.push({
        url: candidate.url,
        reason: `official-page-fetch-failed:${fetched.error}`,
      });
      continue;
    }
    const combined = `${candidate.title} ${candidate.snippet} ${fetched.text}`;
    const classification = classifyEvidence(combined);
    if (
      classification.serviceCategories.length === 0 ||
      classification.procurementTerms.length === 0 ||
      !classification.evidenceType
    ) {
      rejectedCandidates.push({
        url: candidate.url,
        reason: "missing-service-or-procurement-signal",
      });
      continue;
    }
    const pageReachable = Boolean(
      fetched.status && fetched.status >= 200 && fetched.status < 400,
    );
    if (!pageReachable) {
      rejectedCandidates.push({
        url: candidate.url,
        reason: `official-page-not-reachable:${fetched.status ?? "unknown"}`,
      });
      continue;
    }
    const pageHasEvidenceText = fetched.text.length > 100;
    const officialDocument = /\.pdf($|\?)/i.test(candidate.url);
    if (!pageHasEvidenceText && !officialDocument) {
      rejectedCandidates.push({
        url: candidate.url,
        reason: "official-page-has-no-verifiable-content",
      });
      continue;
    }
    acceptedEvidence.push({
      title: candidate.title || "Official procurement record",
      url: fetched.finalUrl || candidate.url,
      snippet: candidate.snippet.slice(0, 1000),
      pageStatus: fetched.status,
      matchedServiceCategories: classification.serviceCategories,
      matchedServiceTerms: classification.serviceTerms.slice(0, 25),
      matchedProcurementTerms: classification.procurementTerms.slice(0, 15),
      evidenceType: classification.evidenceType,
      acceptedAt: new Date().toISOString(),
    });
  }

  const uniqueEvidence = [
    ...new Map(acceptedEvidence.map((item) => [item.url, item])).values(),
  ];
  let researchStatus: PortalResearchRecord["researchStatus"];
  if (redirectedToBlocked) researchStatus = "not_a_direct_source";
  else if (uniqueEvidence.length > 0) researchStatus = "verified_relevant";
  else if (successfulQueryCount < MIN_SUCCESSFUL_QUERIES_FOR_NO_MATCH)
    researchStatus = "research_failed";
  else if (portalFetch.status === null && officialPagesInspected.length === 0)
    researchStatus = "inaccessible";
  else researchStatus = "researched_no_match";

  return {
    portalId: portal.id,
    portalName: portal.name,
    jurisdiction: portal.jurisdiction,
    country: portal.country,
    portalUrl: portal.url,
    searchUrl: portal.searchUrl,
    portalDomain: portal.domain,
    researchStatus,
    researchStartedAt: started,
    researchCompletedAt: new Date().toISOString(),
    queriesExecuted: queries,
    successfulQueryCount,
    failedQueryCount,
    searchProviders,
    officialPagesInspected: [...new Set(officialPagesInspected)],
    acceptedEvidence: uniqueEvidence,
    rejectedCandidates: rejectedCandidates.slice(0, 100),
    errors,
    portalHttpStatus: portalFetch.status,
    redirectedHost: redirectedHost || undefined,
  };
}

const selected = DIRECT_RFP_PORTALS.filter((_, index) => index % shards === shard);
console.log(`Researching shard ${shard + 1}/${shards}: ${selected.length} portals`);
const records = await mapLimit(selected, concurrency, researchPortal);
await mkdir(dirname(out), { recursive: true });
await writeFile(
  out,
  JSON.stringify(
    {
      shard,
      shards,
      generatedAt: new Date().toISOString(),
      portalCount: records.length,
      records,
    },
    null,
    2,
  ),
);
console.log(`Wrote ${records.length} portal records to ${out}`);
