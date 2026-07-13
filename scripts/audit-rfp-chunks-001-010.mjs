import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const providerDir = path.join(repoRoot, "api-server", "src", "lib", "providers");
const outputDir = path.join(repoRoot, "audit-output", "rfp-chunks-001-010");
const USER_AGENT =
  "Mozilla/5.0 (compatible; OccuMed-InsightHub-Audit/1.0; +https://www.occumed.com)";
const REQUEST_TIMEOUT_MS = 12_000;
const CONCURRENCY = 14;

const auditedChunkNumbers = Array.from({ length: 10 }, (_, index) =>
  String(index + 1).padStart(3, "0"),
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
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
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
  const expression = new RegExp(
    `${field}\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`,
    "m",
  );
  const match = block.match(expression);
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

function parsePortalObjects(source, sourceFile) {
  return extractObjectBlocks(source)
    .map((block) => ({
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
    }))
    .filter((portal) => portal.id && portal.url && portal.domain);
}

function readChunk(chunkNumber) {
  const filename = `directRfpPortals.generated.${chunkNumber}.ts`;
  const source = fs.readFileSync(path.join(providerDir, filename), "utf8");
  return parsePortalObjects(source, filename).map((portal) => ({
    ...portal,
    chunk: chunkNumber,
  }));
}

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function hostnameFor(url) {
  try {
    return normalizeHostname(new URL(url).hostname);
  } catch {
    return "";
  }
}

function normalizedBuyer(portal) {
  return [portal.country, portal.state, portal.jurisdiction]
    .map((value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " "))
    .join("|");
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.hostname = normalizeHostname(parsed.hostname);
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return String(url || "").trim().toLowerCase();
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
  if (error) {
    if (/abort|timeout/i.test(error)) return "timeout";
    return "network_error";
  }
  if ([401, 403, 429].includes(status)) return "blocked_or_login";
  if ([404, 410].includes(status)) return "dead";
  if (status >= 500) return "server_error";
  if (status < 200 || status >= 400) return "unexpected_status";
  if (/pdf/i.test(contentType)) return "live_document";

  const lowered = text.toLowerCase();
  if (challengeSignals.some((signal) => lowered.includes(signal))) {
    return "blocked_or_dynamic";
  }
  const matchedSignals = procurementSignals.filter((signal) =>
    lowered.includes(signal),
  );
  if (matchedSignals.length > 0) return "live_procurement";
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

function endpointSeverity(classification) {
  const order = {
    live_procurement: 0,
    live_document: 0,
    reachable_unclear: 1,
    blocked_or_dynamic: 2,
    blocked_or_login: 2,
    unexpected_status: 3,
    server_error: 3,
    timeout: 3,
    network_error: 3,
    dead: 4,
  };
  return order[classification] ?? 3;
}

function summarizePortalStatus(endpointResults) {
  const classifications = endpointResults.map((result) => result.classification);
  if (classifications.every((value) => value === "dead")) return "dead";
  if (
    classifications.some((value) =>
      ["live_procurement", "live_document"].includes(value),
    )
  ) {
    return classifications.every((value) => endpointSeverity(value) <= 1)
      ? "live"
      : "mixed";
  }
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

function allCatalogRecords() {
  const files = fs
    .readdirSync(providerDir)
    .filter(
      (name) =>
        /^directRfpPortals\.generated\.\d{3}\.ts$/.test(name) ||
        name === "directRfpPortals.ts",
    );
  return files.flatMap((filename) => {
    const source = fs.readFileSync(path.join(providerDir, filename), "utf8");
    return parsePortalObjects(source, filename);
  });
}

const auditedPortals = auditedChunkNumbers.flatMap(readChunk);
const fullCatalog = allCatalogRecords();

if (auditedPortals.length === 0) {
  throw new Error("No portals were parsed from chunks 001-010");
}

const duplicateIdMap = new Map();
const duplicateUrlMap = new Map();
const duplicateBuyerMap = new Map();
for (const portal of fullCatalog) {
  const keys = [
    [duplicateIdMap, portal.id],
    [duplicateUrlMap, normalizeUrl(portal.searchUrl || portal.url)],
    [duplicateBuyerMap, normalizedBuyer(portal)],
  ];
  for (const [map, key] of keys) {
    if (!key) continue;
    const values = map.get(key) || [];
    values.push({ id: portal.id, sourceFile: portal.sourceFile, jurisdiction: portal.jurisdiction });
    map.set(key, values);
  }
}

const uniqueEndpointUrls = [
  ...new Set(
    auditedPortals.flatMap((portal) =>
      [portal.url, portal.searchUrl].filter(Boolean),
    ),
  ),
];

console.log(
  `Auditing ${auditedPortals.length} records and ${uniqueEndpointUrls.length} unique endpoints from chunks 001-010...`,
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
  const declaredHost = normalizeHostname(portal.domain || "");
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
    !endpoints.some((endpoint) =>
      ["live_procurement", "live_document"].includes(endpoint.classification),
    )
  ) {
    issues.push("ready_to_parse_not_supported_by_live_check");
  }
  if (
    portal.parserStatus === "catalog_only" &&
    endpoints.some(
      (endpoint) =>
        endpoint.classification === "live_procurement" &&
        endpoint.procurementSignals.length >= 3,
    )
  ) {
    issues.push("possible_parser_candidate");
  }
  if (
    portal.requiresLogin === false &&
    endpoints.some((endpoint) => endpoint.classification === "blocked_or_login")
  ) {
    issues.push("login_or_access_restriction_possible");
  }

  const idDuplicates = duplicateIdMap.get(portal.id) || [];
  const urlDuplicates = duplicateUrlMap.get(normalizeUrl(portal.searchUrl || portal.url)) || [];
  const buyerDuplicates = duplicateBuyerMap.get(normalizedBuyer(portal)) || [];
  if (idDuplicates.length > 1) issues.push("duplicate_id_in_combined_catalog");
  if (urlDuplicates.length > 1) issues.push("duplicate_url_in_combined_catalog");
  if (buyerDuplicates.length > 1) issues.push("duplicate_buyer_in_combined_catalog");

  return {
    ...portal,
    auditStatus: summarizePortalStatus(endpoints),
    issues,
    endpoints,
    duplicates: {
      id: idDuplicates,
      url: urlDuplicates,
      buyer: buyerDuplicates,
    },
  };
});

const statusCounts = records.reduce((counts, record) => {
  counts[record.auditStatus] = (counts[record.auditStatus] || 0) + 1;
  return counts;
}, {});
const issueCounts = records.flatMap((record) => record.issues).reduce((counts, issue) => {
  const key = issue.split(":")[0];
  counts[key] = (counts[key] || 0) + 1;
  return counts;
}, {});
const perChunk = auditedChunkNumbers.map((chunk) => {
  const chunkRecords = records.filter((record) => record.chunk === chunk);
  const statuses = chunkRecords.reduce((counts, record) => {
    counts[record.auditStatus] = (counts[record.auditStatus] || 0) + 1;
    return counts;
  }, {});
  return {
    chunk,
    total: chunkRecords.length,
    statuses,
    flagged: chunkRecords.filter(
      (record) => record.issues.length > 0 || record.auditStatus !== "live",
    ).length,
  };
});

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
    issueCounts,
    perChunk,
  },
  records,
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, "audit.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

const flaggedRecords = records
  .filter((record) => record.issues.length > 0 || record.auditStatus !== "live")
  .sort((a, b) => {
    const severityDifference =
      Math.max(...b.endpoints.map((endpoint) => endpointSeverity(endpoint.classification))) -
      Math.max(...a.endpoints.map((endpoint) => endpointSeverity(endpoint.classification)));
    return severityDifference || a.id.localeCompare(b.id);
  });

const markdown = [
  "# Live audit: direct RFP portal chunks 001-010",
  "",
  `Generated: ${report.generatedAt}`,
  "",
  "## Scope",
  "",
  `- Records audited: **${records.length}**`,
  `- Unique stored endpoints requested: **${uniqueEndpointUrls.length}**`,
  `- Chunks: **001-010**`,
  "- Both `url` and `searchUrl` were requested when they differed.",
  "- A blocked or bot-protected official page is classified for manual review rather than treated as dead.",
  "",
  "## Record status",
  "",
  "| Status | Count |",
  "|---|---:|",
  ...Object.entries(statusCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => `| ${status} | ${count} |`),
  "",
  "## Per-chunk accounting",
  "",
  "| Chunk | Total | Live | Mixed | Manual review | Unclear | Unreachable/error | Dead | Flagged |",
  "|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ...perChunk.map(
    ({ chunk, total, statuses, flagged }) =>
      `| ${chunk} | ${total} | ${statuses.live || 0} | ${statuses.mixed || 0} | ${statuses.manual_review || 0} | ${statuses.reachable_unclear || 0} | ${statuses.unreachable_or_error || 0} | ${statuses.dead || 0} | ${flagged} |`,
  ),
  "",
  "## Metadata findings",
  "",
  "| Finding | Count |",
  "|---|---:|",
  ...Object.entries(issueCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([issue, count]) => `| ${issue} | ${count} |`),
  "",
  "## Records requiring review or correction",
  "",
  "| Chunk | ID | Jurisdiction | Status | Endpoint result | Findings |",
  "|---:|---|---|---|---|---|",
  ...flaggedRecords.map((record) => {
    const endpointSummary = record.endpoints
      .map(
        (endpoint) =>
          `${endpoint.status || "ERR"} ${endpoint.classification}${endpoint.finalUrl !== endpoint.requestedUrl ? " (redirected)" : ""}`,
      )
      .join("; ");
    return `| ${record.chunk} | \`${record.id}\` | ${String(record.jurisdiction || "").replace(/\|/g, "\\|")} | ${record.auditStatus} | ${endpointSummary} | ${record.issues.join(", ") || "live review needed"} |`;
  }),
  "",
  "## Interpretation",
  "",
  "This audit verifies current network reachability and procurement-page signals. It does not automatically replace a dead URL, decide that every redirect is authoritative, or claim that a generic procurement page exposes a machine-readable opportunity list. Records marked for manual review require primary-source verification before catalog metadata is changed.",
  "",
].join("\n");

fs.writeFileSync(path.join(outputDir, "audit.md"), markdown);
console.log(`\nAudit complete. Output written to ${outputDir}`);
console.log(JSON.stringify(report.summary, null, 2));
