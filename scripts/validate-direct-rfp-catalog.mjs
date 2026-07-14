import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const providerDir = path.join(repoRoot, "api-server", "src", "lib", "providers");
const outputDir = path.join(repoRoot, "audit-output", "direct-rfp-full-catalog");
const corePath = path.join(providerDir, "directRfpPortals.ts");
const indexPath = path.join(providerDir, "directRfpPortals.generated.ts");
const chunkNumbers = Array.from({ length: 47 }, (_, index) =>
  String(index + 1).padStart(3, "0"),
);

function findArrayBounds(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Array marker not found: ${marker}`);
  const assignmentIndex = source.indexOf("=", markerIndex);
  const openIndex = source.indexOf("[", assignmentIndex);
  if (assignmentIndex < 0 || openIndex < 0) {
    throw new Error(`Array assignment not found: ${marker}`);
  }

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
  throw new Error(`Closing array bracket not found: ${marker}`);
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

function parsePortal(block, sourceLabel) {
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
    sourceLabel,
  };
}

function parseCore() {
  const source = fs.readFileSync(corePath, "utf8");
  const { openIndex, closeIndex } = findArrayBounds(
    source,
    "export const CORE_DIRECT_RFP_PORTALS",
  );
  return extractObjectBlocks(source.slice(openIndex + 1, closeIndex)).map((block) =>
    parsePortal(block, "core"),
  );
}

function parseChunk(chunk) {
  const filename = `directRfpPortals.generated.${chunk}.ts`;
  const filepath = path.join(providerDir, filename);
  if (!fs.existsSync(filepath)) throw new Error(`Missing chunk file: ${filename}`);
  const source = fs.readFileSync(filepath, "utf8");
  return extractObjectBlocks(source)
    .map((block) => parsePortal(block, chunk))
    .filter((portal) => portal.id || portal.url || portal.name);
}

function normalizedHostname(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}

function normalizedUrl(value) {
  const url = new URL(value);
  url.hash = "";
  url.hostname = normalizedHostname(url.hostname);
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  const entries = [...url.searchParams.entries()].sort(([aKey, aValue], [bKey, bValue]) =>
    aKey.localeCompare(bKey) || aValue.localeCompare(bValue),
  );
  url.search = "";
  for (const [key, valuePart] of entries) url.searchParams.append(key, valuePart);
  return url.toString();
}

function normalizedBuyer(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(the|county of|city of|town of|village of)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function groupedDuplicates(records, keyForRecord) {
  const groups = new Map();
  for (const record of records) {
    const key = keyForRecord(record);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      records: group.map(({ id, name, jurisdiction, sourceLabel, url, searchUrl }) => ({
        id,
        name,
        jurisdiction,
        sourceLabel,
        url,
        searchUrl,
      })),
    }));
}

const coreRecords = parseCore();
const chunkRecords = chunkNumbers.flatMap(parseChunk);
const records = [...coreRecords, ...chunkRecords];
const errors = [];
const warnings = [];

const requiredStringFields = [
  "id",
  "name",
  "jurisdiction",
  "country",
  "level",
  "url",
  "domain",
  "accessMode",
  "parserStatus",
  "notes",
];
const validLevels = new Set(["federal", "state", "district", "international"]);
const validAccessModes = new Set(["api", "csv", "public_html", "dynamic_html", "portal"]);
const validParserStatuses = new Set(["ready_to_parse", "needs_parser", "catalog_only"]);

for (const record of records) {
  const label = `${record.sourceLabel}:${record.id || "<missing-id>"}`;
  for (const field of requiredStringFields) {
    if (typeof record[field] !== "string" || record[field].trim() === "") {
      errors.push(`${label} missing required string field ${field}`);
    }
  }
  if (typeof record.requiresKey !== "boolean") {
    errors.push(`${label} missing boolean requiresKey`);
  }
  if (typeof record.requiresLogin !== "boolean") {
    errors.push(`${label} missing boolean requiresLogin`);
  }
  if (![1, 2, 3].includes(record.tier)) errors.push(`${label} has invalid tier ${record.tier}`);
  if (record.level && !validLevels.has(record.level)) {
    errors.push(`${label} has invalid level ${record.level}`);
  }
  if (record.accessMode && !validAccessModes.has(record.accessMode)) {
    errors.push(`${label} has invalid accessMode ${record.accessMode}`);
  }
  if (record.parserStatus && !validParserStatuses.has(record.parserStatus)) {
    errors.push(`${label} has invalid parserStatus ${record.parserStatus}`);
  }

  for (const [field, value] of [
    ["url", record.url],
    ["searchUrl", record.searchUrl],
  ]) {
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (!/^https?:$/.test(parsed.protocol)) {
        errors.push(`${label} ${field} is not HTTP(S): ${value}`);
      }
    } catch {
      errors.push(`${label} has invalid ${field}: ${value}`);
    }
  }

  if (record.url && record.domain) {
    try {
      const target = new URL(record.searchUrl || record.url);
      const targetHost = normalizedHostname(target.hostname);
      const declared = normalizedHostname(record.domain);
      if (
        targetHost !== declared &&
        !targetHost.endsWith(`.${declared}`) &&
        !declared.endsWith(`.${targetHost}`)
      ) {
        errors.push(`${label} domain mismatch: ${declared} vs ${targetHost}`);
      }
    } catch {
      // Invalid URL is already reported above.
    }
  }

  const searchableText = `${record.url || ""} ${record.searchUrl || ""} ${record.notes || ""}`.toLowerCase();
  if (/ctas\.tennessee\.edu|ctas county information|ctas fallback/.test(searchableText)) {
    errors.push(`${label} still contains a Tennessee CTAS placeholder`);
  }
  if (/placeholder|needs research|replace me|example\.com/.test(searchableText)) {
    errors.push(`${label} contains placeholder language or URL`);
  }
}

const duplicateIds = groupedDuplicates(records, (record) => record.id);
for (const group of duplicateIds) {
  errors.push(`Duplicate ID ${group.key}: ${group.records.map((record) => record.sourceLabel).join(", ")}`);
}

const duplicateTargets = groupedDuplicates(records, (record) => {
  try {
    return normalizedUrl(record.searchUrl || record.url);
  } catch {
    return null;
  }
});
for (const group of duplicateTargets) {
  errors.push(
    `Duplicate target URL ${group.key}: ${group.records.map((record) => `${record.sourceLabel}:${record.id}`).join(", ")}`,
  );
}

const duplicateBuyers = groupedDuplicates(records, (record) => normalizedBuyer(record.jurisdiction));
for (const group of duplicateBuyers) {
  warnings.push(
    `Multiple records for buyer ${group.key}: ${group.records.map((record) => `${record.sourceLabel}:${record.id}`).join(", ")}`,
  );
}

const indexSource = fs.readFileSync(indexPath, "utf8");
for (const chunk of chunkNumbers) {
  const importNeedle = `directRfpPortals.generated.${chunk}`;
  const spreadNeedle = `...GENERATED_DIRECT_RFP_PORTALS_${chunk}`;
  if (!indexSource.includes(importNeedle)) errors.push(`Generated index missing import for chunk ${chunk}`);
  if (!indexSource.includes(spreadNeedle)) errors.push(`Generated index missing spread for chunk ${chunk}`);
}

const countsBySource = records.reduce((counts, record) => {
  counts[record.sourceLabel] = (counts[record.sourceLabel] || 0) + 1;
  return counts;
}, {});
const report = {
  generatedAt: new Date().toISOString(),
  totalRecords: records.length,
  coreRecords: coreRecords.length,
  generatedRecords: chunkRecords.length,
  countsBySource,
  duplicateIds,
  duplicateTargets,
  duplicateBuyers,
  errors,
  warnings,
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "validation.json"), `${JSON.stringify(report, null, 2)}\n`);
const markdown = [
  "# Direct RFP full-catalog validation",
  "",
  `Generated: ${report.generatedAt}`,
  "",
  `- Total records: **${report.totalRecords}**`,
  `- Core records: **${report.coreRecords}**`,
  `- Generated chunk records: **${report.generatedRecords}**`,
  `- Errors: **${errors.length}**`,
  `- Warnings: **${warnings.length}**`,
  "",
  "## Counts by source",
  "",
  "| Source | Records |",
  "|---|---:|",
  ...Object.entries(countsBySource).map(([sourceLabel, count]) => `| ${sourceLabel} | ${count} |`),
  "",
  "## Errors",
  "",
  ...(errors.length ? errors.map((error) => `- ${error}`) : ["None."]),
  "",
  "## Warnings",
  "",
  ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ["None."]),
  "",
].join("\n");
fs.writeFileSync(path.join(outputDir, "validation.md"), markdown);

console.log(markdown);
if (errors.length > 0) process.exitCode = 1;
