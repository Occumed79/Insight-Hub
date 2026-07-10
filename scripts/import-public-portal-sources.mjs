#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/import-public-portal-sources.mjs <sources.csv|sources.json> [output.json]");
  process.exit(1);
}
const output = process.argv[3] ?? "public-portal-sources.imported.json";

const allowedAgencyTypes = new Set(["state", "county", "city", "fire_department", "fire_district", "ems", "public_safety", "school_district", "special_district", "public_authority", "transit_authority", "airport_authority", "port_authority"]);
const allowedScraperTypes = new Set(["static_html", "scrapy", "playwright_public", "rss", "public_json", "pdf_links", "existing_parser"]);

function parseCsv(text) {
  const rows = [];
  let cell = "", row = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (quoted && ch === '"' && next === '"') { cell += '"'; i++; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (!quoted && ch === ",") { row.push(cell); cell = ""; continue; }
    if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  const headers = rows.shift()?.map((value) => value.trim()) ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])));
}

function sourceLevelFor(row) {
  if (row.sourceLevel) return row.sourceLevel;
  if (["state", "county"].includes(row.agencyType)) return row.agencyType;
  if (row.agencyType === "city") return "municipal";
  if (["public_authority", "transit_authority", "airport_authority", "port_authority"].includes(row.agencyType)) return "authority";
  return "district";
}

function toSource(row) {
  const url = new URL(row.sourceUrl);
  const agencyName = row.agencyName.trim();
  const id = (row.id || `${row.state}-${agencyName}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return {
    id,
    agencyName,
    agencyType: row.agencyType,
    state: row.state?.toUpperCase() ?? "",
    county: row.county || undefined,
    city: row.city || undefined,
    sourceUrl: url.toString(),
    domain: url.hostname.replace(/^www\./, "").toLowerCase(),
    portalPlatform: row.portalPlatform || undefined,
    sourceLevel: sourceLevelFor(row),
    scraperType: row.scraperType,
    enabled: String(row.enabled).toLowerCase() === "true",
    verificationStatus: row.verificationStatus || (String(row.enabled).toLowerCase() === "true" ? "verified" : "needs_review"),
    notes: row.notes || undefined,
  };
}

function validate(source) {
  const errors = [];
  if (!source.agencyName) errors.push("agencyName is required");
  if (!allowedAgencyTypes.has(source.agencyType)) errors.push(`invalid agencyType ${source.agencyType}`);
  if (!allowedScraperTypes.has(source.scraperType)) errors.push(`invalid scraperType ${source.scraperType}`);
  if (source.enabled && source.verificationStatus !== "verified") errors.push("enabled sources must be verified");
  if (!source.state || !/^[A-Z]{2}$/.test(source.state)) errors.push("state must be a two-letter U.S. postal abbreviation");
  return errors;
}

const ext = path.extname(input).toLowerCase();
const rows = ext === ".json" ? JSON.parse(fs.readFileSync(input, "utf8")) : parseCsv(fs.readFileSync(input, "utf8"));
const sources = [];
const errors = [];
for (const [index, row] of rows.entries()) {
  try {
    const source = toSource(row);
    const rowErrors = validate(source);
    if (rowErrors.length) errors.push(`row ${index + 1}: ${rowErrors.join("; ")}`);
    else sources.push(source);
  } catch (error) {
    errors.push(`row ${index + 1}: ${error.message}`);
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
fs.writeFileSync(output, `${JSON.stringify(sources, null, 2)}\n`);
console.log(`Wrote ${sources.length} verified/imported public portal sources to ${output}`);
