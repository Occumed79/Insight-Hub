import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const providerDir = path.join(repoRoot, "api-server", "src", "lib", "providers");
const outputDir = path.join(repoRoot, "audit-output", "rfp-chunks-011-042");
const prunedDir = path.join(outputDir, "pruned");
const USER_AGENT =
  "Mozilla/5.0 (compatible; OccuMed-InsightHub-Audit/1.0; +https://www.occumed.com)";
const REQUEST_TIMEOUT_MS = 12_000;
const CONCURRENCY = 14;
const START_CHUNK = 11;
const END_CHUNK = 42;

const auditedChunkNumbers = Array.from(
  { length: END_CHUNK - START_CHUNK + 1 },
  (_, index) => String(START_CHUNK + index).padStart(3, "0"),
);

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
  const expression = new RegExp(`${field}\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "m");
  const match = block.match(expression);
  if (!match) return undefined;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}

function parsePortals(source, sourceFile, chunk) {
  return extractObjectBlocks(source)
    .map((block) => ({
      id: stringField(block, "id"),
      name: stringField(block, "name"),
      jurisdiction: stringField(block, "jurisdiction"),
      state: stringField(block, "state"),
      country: stringField(block, "country"),
      url: stringField(block, "url"),
      searchUrl: stringField(block, "searchUrl"),
      domain: stringField(block, "domain"),
      accessMode: stringField(block, "accessMode"),
      parserStatus: stringField(block, "parserStatus"),
      sourceFile,
      chunk,
      block,
    }))
    .filter((portal) => portal.id && portal.url && portal.domain);
}

function readChunk(chunk) {
  const sourceFile = `directRfpPortals.generated.${chunk}.ts`;
  const source = fs.readFileSync(path.join(providerDir, sourceFile), "utf8");
  return { sourceFile, source, records: parsePortals(source, sourceFile, chunk) };
}

function normalizeHostname(hostname) {
  return String(hostname || "")
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}

function hostnameFor(url) {
  try {
    return normalizeHostname(new URL(url).hostname);
  } catch {
    return "";
  }
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
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
if (auditedPortals.length === 0) {
  throw new Error("No portals were parsed from chunks 011-042");
}

const uniqueEndpointUrls = [
  ...new Set(
    auditedPortals.flatMap((portal) => [portal.url, portal.searchUrl].filter(Boolean)),
  ),
];

console.log(
  `Auditing ${auditedPortals.length} records and ${uniqueEndpointUrls.length} endpoints from chunks 011-042...`,
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
  const issues = [];
  const declaredHost = normalizeHostname(portal.domain);
  const sourceHost = hostnameFor(portal.searchUrl || portal.url);
  if (declaredHost && sourceHost && declaredHost !== sourceHost) {
    issues.push(`declared_domain_mismatch:${declaredHost}->${sourceHost}`);
  }
  if (
    portal.accessMode === "public_html" &&
    endpoints.some((endpoint) =>
      ["blocked_or_dynamic", "blocked_or_login"].includes(endpoint.classification),
    )
  ) {
    issues.push("access_mode_likely_dynamic_or_protected");
  }
  if (
    portal.parserStatus === "ready_to_parse" &&
    !endpoints.every((endpoint) =>
      ["live_procurement", "live_document"].includes(endpoint.classification),
    )
  ) {
    issues.push("ready_to_parse_not_supported_by_live_check");
  }
  return {
    ...portal,
    block: undefined,
    auditStatus: portalStatus(endpoints),
    issues,
    endpoints,
  };
});

const statusCounts = records.reduce((counts, record) => {
  counts[record.auditStatus] = (counts[record.auditStatus] || 0) + 1;
  return counts;
}, {});

const perChunk = chunks.map((chunk) => {
  const chunkRecords = records.filter((record) => record.chunk === chunk.records[0]?.chunk || record.chunk === chunk.sourceFile.match(/(\d{3})/)[1]);
  const statuses = chunkRecords.reduce((counts, record) => {
    counts[record.auditStatus] = (counts[record.auditStatus] || 0) + 1;
    return counts;
  }, {});
  return {
    chunk: chunk.sourceFile.match(/(\d{3})/)[1],
    total: chunkRecords.length,
    retained: statuses.live || 0,
    removed: chunkRecords.length - (statuses.live || 0),
    statuses,
  };
});

fs.mkdirSync(prunedDir, { recursive: true });
for (const chunk of chunks) {
  const chunkNumber = chunk.sourceFile.match(/(\d{3})/)[1];
  const liveIds = new Set(
    records
      .filter((record) => record.chunk === chunkNumber && record.auditStatus === "live")
      .map((record) => record.id),
  );
  const keptBlocks = chunk.records
    .filter((record) => liveIds.has(record.id))
    .map((record) => record.block.trim());
  const exportName = `GENERATED_DIRECT_RFP_PORTALS_${chunkNumber}`;
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
  "# Live audit and strict-prune plan: direct RFP portal chunks 011-042",
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
  "The `pruned/` directory contains complete replacement files for chunks 011-042. Only records whose stored endpoints all returned a clear live procurement page or procurement document are retained.",
  "",
].join("\n");

fs.writeFileSync(path.join(outputDir, "audit.md"), markdown);
console.log(`Audit complete. Output written to ${outputDir}`);
console.log(JSON.stringify(report.summary, null, 2));
