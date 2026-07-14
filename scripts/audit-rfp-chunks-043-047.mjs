import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const providerDir = path.join(repoRoot, "api-server", "src", "lib", "providers");
const outputDir = path.join(repoRoot, "audit-output", "rfp-chunks-043-047");
const prunedDir = path.join(outputDir, "pruned");
const USER_AGENT =
  "Mozilla/5.0 (compatible; OccuMed-InsightHub-Audit/1.0; +https://www.occumed.com)";
const REQUEST_TIMEOUT_MS = 12_000;
const CONCURRENCY = 14;
const auditedChunkNumbers = ["043", "044", "045", "046", "047"];

function extractObjectBlocks(source) {
  const blocks = [];
  let depth = 0;
  let start = -1;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        blocks.push(source.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return blocks;
}

function stringField(block, field) {
  const match = block.match(
    new RegExp(`${field}\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "m"),
  );
  if (!match) return undefined;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}

function booleanField(block, field) {
  const match = block.match(new RegExp(`${field}\\s*:\\s*(true|false)`, "m"));
  return match ? match[1] === "true" : undefined;
}

function numberField(block, field) {
  const match = block.match(new RegExp(`${field}\\s*:\\s*(\\d+)`, "m"));
  return match ? Number(match[1]) : undefined;
}

function portalFromBlock(block, sourceFile, chunk) {
  return {
    id: stringField(block, "id"),
    name: stringField(block, "name"),
    jurisdiction: stringField(block, "jurisdiction"),
    state: stringField(block, "state"),
    country: stringField(block, "country"),
    level: stringField(block, "level"),
    url: stringField(block, "url"),
    searchUrl: stringField(block, "searchUrl"),
    domain: stringField(block, "domain"),
    accessMode: stringField(block, "accessMode"),
    requiresKey: booleanField(block, "requiresKey"),
    requiresLogin: booleanField(block, "requiresLogin"),
    tier: numberField(block, "tier"),
    parserStatus: stringField(block, "parserStatus"),
    notes: stringField(block, "notes"),
    sourceFile,
    chunk,
    block,
  };
}

function parseStaticPortals(source, sourceFile, chunk) {
  return extractObjectBlocks(source)
    .map((block) => portalFromBlock(block, sourceFile, chunk))
    .filter((portal) => portal.id && portal.url && portal.domain);
}

function decodeQuotedStrings(value) {
  return [...value.matchAll(/"((?:\\.|[^"\\])*)"/g)].map((match) => {
    try {
      return JSON.parse(`"${match[1]}"`);
    } catch {
      return match[1];
    }
  });
}

function renderPortal(portal) {
  const q = (value) => JSON.stringify(value);
  return [
    "{",
    `    id: ${q(portal.id)},`,
    `    name: ${q(portal.name)},`,
    `    jurisdiction: ${q(portal.jurisdiction)},`,
    portal.state ? `    state: ${q(portal.state)},` : null,
    `    country: ${q(portal.country)},`,
    `    level: ${q(portal.level)},`,
    `    url: ${q(portal.url)},`,
    portal.searchUrl ? `    searchUrl: ${q(portal.searchUrl)},` : null,
    `    domain: ${q(portal.domain)},`,
    `    accessMode: ${q(portal.accessMode)},`,
    `    requiresKey: ${portal.requiresKey ? "true" : "false"},`,
    `    requiresLogin: ${portal.requiresLogin ? "true" : "false"},`,
    `    tier: ${portal.tier},`,
    `    parserStatus: ${q(portal.parserStatus)},`,
    `    notes: ${q(portal.notes)},`,
    "  }",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseTennesseeGenerated(source, sourceFile, chunk) {
  if (!source.includes("const COUNTY_NAMES")) {
    return parseStaticPortals(source, sourceFile, chunk);
  }

  const countyMatch = source.match(/const COUNTY_NAMES\s*=\s*"([^"]+)"\.split/s);
  if (!countyMatch) throw new Error("Could not parse Tennessee COUNTY_NAMES");
  const countyNames = countyMatch[1].split(",");

  const replacementsStart = source.indexOf("const REPLACEMENTS");
  const replacementsEnd = source.indexOf("\n};", replacementsStart);
  if (replacementsStart < 0 || replacementsEnd < 0) {
    throw new Error("Could not locate Tennessee REPLACEMENTS object");
  }
  const replacementSource = source.slice(replacementsStart, replacementsEnd + 3);
  const replacements = new Map();
  for (const match of replacementSource.matchAll(/^\s*(\w+):\s*\[([\s\S]*?)^\s*\],/gm)) {
    const values = decodeQuotedStrings(match[2]);
    if (values.length >= 7) replacements.set(match[1], values.slice(0, 7));
  }

  const fallbackNote =
    "County-specific Tennessee County Technical Assistance Service page retained as a fallback because this correction pass did not verify a stable direct source-of-truth procurement, finance, bid, public-notice, school-procurement, or buyer-specific portal for this county. Follow the listed county offices for department-specific opportunities. No Occu-Med-specific solicitation is claimed.";

  return countyNames.map((countyName) => {
    const slug = countyName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const replacement = replacements.get(countyName);
    const portal = replacement
      ? {
          id: `tn-${slug}-county`,
          name: replacement[0],
          jurisdiction: `${countyName} County`,
          state: "TN",
          country: "US",
          level: "district",
          url: replacement[1],
          searchUrl: replacement[2],
          domain: replacement[3],
          accessMode: replacement[4],
          requiresKey: false,
          requiresLogin: false,
          tier: 3,
          parserStatus: replacement[5],
          notes: replacement[6],
        }
      : {
          id: `tn-${slug}-county`,
          name: `${countyName} County CTAS County Information`,
          jurisdiction: `${countyName} County`,
          state: "TN",
          country: "US",
          level: "district",
          url: `https://www.ctas.tennessee.edu/county/${slug}`,
          searchUrl: `https://www.ctas.tennessee.edu/county/${slug}`,
          domain: "www.ctas.tennessee.edu",
          accessMode: "public_html",
          requiresKey: false,
          requiresLogin: false,
          tier: 3,
          parserStatus: "catalog_only",
          notes: fallbackNote,
        };
    return { ...portal, sourceFile, chunk, block: renderPortal(portal) };
  });
}

function readChunk(chunk) {
  const sourceFile = `directRfpPortals.generated.${chunk}.ts`;
  const source = fs.readFileSync(path.join(providerDir, sourceFile), "utf8");
  const records =
    chunk === "046"
      ? parseTennesseeGenerated(source, sourceFile, chunk)
      : parseStaticPortals(source, sourceFile, chunk);
  return { sourceFile, source, chunk, records };
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}

const procurementSignals = [
  "procurement",
  "purchasing",
  "solicitation",
  "request for proposal",
  "request for quote",
  "request for qualification",
  "invitation to bid",
  "open bids",
  "current bids",
  "bid opportunities",
  "contract opportunities",
  "vendor opportunities",
  "doing business",
  "bids and proposals",
  "rfp",
  "rfq",
  "bid notice",
  "public notice",
];

const challengeSignals = [
  "attention required! | cloudflare",
  "checking your browser",
  "verify you are human",
  "access denied",
  "request unsuccessful",
  "enable javascript and cookies to continue",
  "incapsula incident id",
  "akamai reference",
  "bot detection",
];

function classifyResponse({ status, contentType, text, error }) {
  if (error) return /abort|timeout/i.test(error) ? "timeout" : "network_error";
  if ([401, 403, 429].includes(status)) return "blocked_or_login";
  if ([404, 410].includes(status)) return "dead";
  if (status >= 500) return "server_error";
  if (status < 200 || status >= 400) return "unexpected_status";
  if (/pdf/i.test(contentType)) return "live_document";
  const lowered = text.toLowerCase();
  if (challengeSignals.some((signal) => lowered.includes(signal))) return "blocked_or_dynamic";
  if (procurementSignals.some((signal) => lowered.includes(signal))) return "live_procurement";
  return "reachable_unclear";
}

async function fetchEndpoint(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
        "user-agent": USER_AGENT,
      },
    });
    const contentType = response.headers.get("content-type") || "";
    let body = "";
    if (/text|html|json|xml|javascript/i.test(contentType)) {
      body = (await response.text()).slice(0, 350_000);
    } else if (/pdf/i.test(contentType)) {
      body = "PDF document";
    } else {
      const buffer = await response.arrayBuffer();
      body = Buffer.from(buffer.slice(0, 100_000)).toString("utf8");
    }
    const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const plainText = stripHtml(body).slice(0, 80_000);
    const result = {
      requestedUrl: url,
      finalUrl: response.url || url,
      status: response.status,
      contentType,
      title: titleMatch ? stripHtml(titleMatch[1]).slice(0, 250) : "",
      elapsedMs: Date.now() - startedAt,
      procurementSignals: procurementSignals.filter((signal) =>
        plainText.toLowerCase().includes(signal),
      ),
      error: null,
      textSample: plainText.slice(0, 500),
    };
    return { ...result, classification: classifyResponse({ ...result, text: plainText }) };
  } catch (error) {
    const result = {
      requestedUrl: url,
      finalUrl: url,
      status: 0,
      contentType: "",
      title: "",
      elapsedMs: Date.now() - startedAt,
      procurementSignals: [],
      error: error instanceof Error ? error.message : String(error),
      textSample: "",
    };
    return { ...result, classification: classifyResponse(result) };
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function portalStatus(endpoints) {
  const classifications = endpoints.map((endpoint) => endpoint.classification);
  const live = classifications.filter((value) =>
    ["live_procurement", "live_document"].includes(value),
  ).length;
  if (live === classifications.length && live > 0) return "live";
  if (live > 0) return "mixed";
  if (classifications.every((value) => value === "dead")) return "dead";
  if (
    classifications.some((value) =>
      ["blocked_or_dynamic", "blocked_or_login"].includes(value),
    )
  ) {
    return "manual_review";
  }
  if (classifications.every((value) => value === "reachable_unclear")) {
    return "reachable_unclear";
  }
  return "unreachable_or_error";
}

const chunks = auditedChunkNumbers.map(readChunk);
const auditedPortals = chunks.flatMap((chunk) => chunk.records);
if (auditedPortals.length === 0) throw new Error("No portals parsed from chunks 043-047");

const uniqueEndpointUrls = [
  ...new Set(
    auditedPortals.flatMap((portal) => [portal.url, portal.searchUrl].filter(Boolean)),
  ),
];
console.log(
  `Auditing ${auditedPortals.length} records and ${uniqueEndpointUrls.length} endpoints from chunks 043-047...`,
);

const endpointAuditResults = await mapWithConcurrency(
  uniqueEndpointUrls,
  CONCURRENCY,
  async (url, index) => {
    const result = await fetchEndpoint(url);
    console.log(
      `[${index + 1}/${uniqueEndpointUrls.length}] ${result.classification} ${result.status || "ERR"} ${url}`,
    );
    return result;
  },
);
const endpointByUrl = new Map(
  endpointAuditResults.map((result) => [result.requestedUrl, result]),
);

const records = auditedPortals.map((portal) => {
  const endpointUrls = [...new Set([portal.url, portal.searchUrl].filter(Boolean))];
  const endpoints = endpointUrls.map((url) => endpointByUrl.get(url));
  return {
    ...portal,
    block: undefined,
    auditStatus: portalStatus(endpoints),
    endpoints,
  };
});

const statusCounts = records.reduce((counts, record) => {
  counts[record.auditStatus] = (counts[record.auditStatus] || 0) + 1;
  return counts;
}, {});
const perChunk = chunks.map((chunk) => {
  const chunkRecords = records.filter((record) => record.chunk === chunk.chunk);
  const statuses = chunkRecords.reduce((counts, record) => {
    counts[record.auditStatus] = (counts[record.auditStatus] || 0) + 1;
    return counts;
  }, {});
  return {
    chunk: chunk.chunk,
    total: chunkRecords.length,
    retained: statuses.live || 0,
    removed: chunkRecords.length - (statuses.live || 0),
    statuses,
  };
});

fs.mkdirSync(prunedDir, { recursive: true });
for (const chunk of chunks) {
  const liveIds = new Set(
    records
      .filter((record) => record.chunk === chunk.chunk && record.auditStatus === "live")
      .map((record) => record.id),
  );
  const keptBlocks = chunk.records
    .filter((record) => liveIds.has(record.id))
    .map((record) => record.block.trim());
  const exportName = `GENERATED_DIRECT_RFP_PORTALS_${chunk.chunk}`;
  const content = [
    'import type { DirectRfpPortal } from "./directRfpPortals";',
    "",
    `export const ${exportName}: DirectRfpPortal[] = [`,
    keptBlocks.length ? `  ${keptBlocks.join(",\n  ")}` : "",
    "];",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(prunedDir, chunk.sourceFile), content);
}

const report = {
  generatedAt: new Date().toISOString(),
  auditScope: {
    chunks: auditedChunkNumbers,
    records: records.length,
    uniqueEndpoints: uniqueEndpointUrls.length,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    concurrency: CONCURRENCY,
  },
  summary: {
    statusCounts,
    retained: statusCounts.live || 0,
    removed: records.length - (statusCounts.live || 0),
    perChunk,
  },
  records,
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "audit.json"), `${JSON.stringify(report, null, 2)}\n`);

const markdown = [
  "# Live audit and strict-prune plan: direct RFP portal chunks 043-047",
  "",
  `Generated: ${report.generatedAt}`,
  "",
  "## Summary",
  "",
  `- Records audited: **${records.length}**`,
  `- Strictly verified live records retained: **${report.summary.retained}**`,
  `- Unverified, mixed, protected, unclear, dead, or unreachable records removed: **${report.summary.removed}**`,
  "",
  "| Status | Count |",
  "|---|---:|",
  ...Object.entries(statusCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => `| ${status} | ${count} |`),
  "",
  "## Per-chunk accounting",
  "",
  "| Chunk | Total | Retained | Removed |",
  "|---:|---:|---:|---:|",
  ...perChunk.map(
    ({ chunk, total, retained, removed }) =>
      `| ${chunk} | ${total} | ${retained} | ${removed} |`,
  ),
  "",
  "## Removed records",
  "",
  "| Chunk | ID | Jurisdiction | Status | Endpoint result |",
  "|---:|---|---|---|---|",
  ...records
    .filter((record) => record.auditStatus !== "live")
    .map((record) => {
      const endpoints = record.endpoints
        .map((endpoint) => `${endpoint.status || "ERR"} ${endpoint.classification}`)
        .join("; ");
      return `| ${record.chunk} | \`${record.id}\` | ${String(record.jurisdiction || "").replace(/\|/g, "\\|")} | ${record.auditStatus} | ${endpoints} |`;
    }),
  "",
  "Only records whose stored endpoints all returned a clear live procurement page or procurement document are retained in the generated `pruned/` files.",
  "",
].join("\n");
fs.writeFileSync(path.join(outputDir, "audit.md"), markdown);
console.log(`Audit complete. Output written to ${outputDir}`);
console.log(JSON.stringify(report.summary, null, 2));
