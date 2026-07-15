import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sourceFile = path.join(
  repoRoot,
  "api-server",
  "src",
  "lib",
  "providers",
  "directRfpPortals.ts",
);
const outputDir = path.join(repoRoot, "audit-output", "core-direct-rfp-portals");
const USER_AGENT =
  "Mozilla/5.0 (compatible; OccuMed-InsightHub-Audit/1.0; +https://www.occumed.com)";
const REQUEST_TIMEOUT_MS = 12_000;
const CONCURRENCY = 14;

const REGISTERED_PARSER_IDS = new Set([
  "us-sam-gov",
  "ca-caleprocure",
  "tx-esbd",
  "ny-contract-reporter",
  "fl-vbs",
  "pa-emarketplace",
  "va-eva",
  "oh-ohiobuys",
  "mi-sigma",
  "md-emma",
  "nc-evp",
]);

function findArrayBounds(source) {
  const marker = "export const CORE_DIRECT_RFP_PORTALS: DirectRfpPortal[] = [";
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error("CORE_DIRECT_RFP_PORTALS marker not found");
  const openIndex = source.indexOf("[", markerIndex);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openIndex; index < source.length; index += 1) {
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
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return { openIndex, closeIndex: index };
    }
  }
  throw new Error("CORE_DIRECT_RFP_PORTALS closing bracket not found");
}

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

function parsePortal(block) {
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
    block,
  };
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

function portalStatus(portal, endpoints) {
  if (REGISTERED_PARSER_IDS.has(portal.id)) return "live";
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

const source = fs.readFileSync(sourceFile, "utf8");
const { openIndex, closeIndex } = findArrayBounds(source);
const arrayBody = source.slice(openIndex + 1, closeIndex);
const portals = extractObjectBlocks(arrayBody)
  .map(parsePortal)
  .filter((portal) => portal.id && portal.url && portal.domain);
if (portals.length === 0) throw new Error("No core portals were parsed");

const uniqueEndpointUrls = [
  ...new Set(portals.flatMap((portal) => [portal.url, portal.searchUrl].filter(Boolean))),
];
console.log(`Auditing ${portals.length} core records and ${uniqueEndpointUrls.length} endpoints...`);

const endpointResults = await mapWithConcurrency(
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
const endpointByUrl = new Map(endpointResults.map((result) => [result.requestedUrl, result]));

const records = portals.map((portal) => {
  const endpointUrls = [...new Set([portal.url, portal.searchUrl].filter(Boolean))];
  const endpoints = endpointUrls.map((url) => endpointByUrl.get(url));
  const auditStatus = portalStatus(portal, endpoints);
  return {
    ...portal,
    block: undefined,
    auditStatus,
    retentionBasis: REGISTERED_PARSER_IDS.has(portal.id)
      ? "registered_parser"
      : auditStatus === "live"
        ? "live_endpoint"
        : null,
    endpoints,
  };
});

const statusCounts = records.reduce((counts, record) => {
  counts[record.auditStatus] = (counts[record.auditStatus] || 0) + 1;
  return counts;
}, {});
const retainedIds = new Set(
  records.filter((record) => record.auditStatus === "live").map((record) => record.id),
);
const keptBlocks = portals
  .filter((portal) => retainedIds.has(portal.id))
  .map((portal) => portal.block.trim());
const prunedSource = [
  source.slice(0, openIndex + 1),
  keptBlocks.length ? `\n  ${keptBlocks.join(",\n  ")}\n` : "\n",
  source.slice(closeIndex),
].join("");

const report = {
  generatedAt: new Date().toISOString(),
  auditScope: {
    records: records.length,
    uniqueEndpoints: uniqueEndpointUrls.length,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    concurrency: CONCURRENCY,
  },
  summary: {
    statusCounts,
    retained: statusCounts.live || 0,
    removed: records.length - (statusCounts.live || 0),
    registeredParserRetained: records.filter(
      (record) => record.retentionBasis === "registered_parser",
    ).length,
  },
  records,
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "audit.json"), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, "directRfpPortals.pruned.ts"), prunedSource);

const markdown = [
  "# Live audit and strict-prune plan: core direct RFP portals",
  "",
  `Generated: ${report.generatedAt}`,
  "",
  "## Summary",
  "",
  `- Core records audited: **${records.length}**`,
  `- Records retained: **${report.summary.retained}**`,
  `- Records removed: **${report.summary.removed}**`,
  `- Registered parser-backed sources retained: **${report.summary.registeredParserRetained}**`,
  "",
  "| Status | Count |",
  "|---|---:|",
  ...Object.entries(statusCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => `| ${status} | ${count} |`),
  "",
  "## Removed records",
  "",
  "| ID | Jurisdiction | Status | Endpoint result |",
  "|---|---|---|---|",
  ...records
    .filter((record) => record.auditStatus !== "live")
    .map((record) => {
      const endpoints = record.endpoints
        .map((endpoint) => `${endpoint.status || "ERR"} ${endpoint.classification}`)
        .join("; ");
      return `| \`${record.id}\` | ${String(record.jurisdiction || "").replace(/\|/g, "\\|")} | ${record.auditStatus} | ${endpoints} |`;
    }),
  "",
  "Registered parser-backed sources are retained as verified integration sources even when a generic HTTP audit encounters a temporary access restriction. Every other retained record must return a clear procurement page or document for all stored endpoints.",
  "",
].join("\n");
fs.writeFileSync(path.join(outputDir, "audit.md"), markdown);
console.log(`Audit complete. Output written to ${outputDir}`);
console.log(JSON.stringify(report.summary, null, 2));
