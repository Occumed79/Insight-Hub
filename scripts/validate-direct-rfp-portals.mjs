#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const catalogPath = resolve(
  repoRoot,
  "api-server/src/lib/providers/directRfpPortals.ts",
);
const source = readFileSync(catalogPath, "utf8");

const compactEntryRegex = /\{ id: "([^"]+)", name: "([^"]+)", jurisdiction: "([^"]+)"(?:, state: "([^"]+)")?, country: "([^"]+)", level: "([^"]+)", url: "([^"]+)", searchUrl: "([^"]+)", domain: "([^"]+)", accessMode: "([^"]+)", requiresKey: (true|false), requiresLogin: (true|false), tier: (\d), parserStatus: "([^"]+)", notes: "([^"]+)" \}/g;
const hasSam = /id: "us-sam-gov"[\s\S]*?domain: "sam\.gov"[\s\S]*?parserStatus: "ready_to_parse"/.test(
  source,
);

const entries = [];
let match;
while ((match = compactEntryRegex.exec(source))) {
  entries.push({
    id: match[1],
    name: match[2],
    jurisdiction: match[3],
    state: match[4],
    country: match[5],
    level: match[6],
    url: match[7],
    searchUrl: match[8],
    domain: match[9],
    accessMode: match[10],
    requiresKey: match[11] === "true",
    requiresLogin: match[12] === "true",
    tier: Number(match[13]),
    parserStatus: match[14],
    notes: match[15],
  });
}

const errors = [];

function duplicateValues(key) {
  const seen = new Map();
  for (const item of entries) {
    const value = item[key];
    if (!value) continue;
    seen.set(value, [...(seen.get(value) ?? []), item.id]);
  }
  return [...seen.entries()].filter(([, ids]) => ids.length > 1);
}

for (const [value, ids] of duplicateValues("id")) {
  errors.push(`Duplicate id ${value}: ${ids.join(", ")}`);
}
if (!hasSam) errors.push("SAM.gov catalog seed is missing or malformed.");
if (entries.length < 45) {
  errors.push(
    `Expected at least 45 verified direct portal entries after SAM; found ${entries.length}.`,
  );
}

const expectedStates = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VA",
  "VT",
  "WA",
  "WV",
  "WI",
  "WY",
];
const expectedStateSet = new Set(expectedStates);
const stateCodes = new Set(
  entries
    .filter((entry) => entry.country === "US" && entry.state && entry.level === "state")
    .map((entry) => entry.state),
);
const invalidStateCodes = [...stateCodes].filter(
  (state) => !expectedStateSet.has(state),
);
if (invalidStateCodes.length > 0) {
  errors.push(`Invalid state codes: ${invalidStateCodes.join(", ")}.`);
}

// Coverage gaps are reported, not converted into speculative catalog records.
// The audited catalog deliberately retains only official sources that survived
// live-source verification; missing states must not fail structural validation.
const missingStatePortalCodes = expectedStates.filter(
  (state) => !stateCodes.has(state),
);

for (const blocked of [
  "bidnet",
  "demandstar",
  "govwin",
  "planetbids",
  "opengov",
  "periscopes2g",
]) {
  if (
    entries.some((entry) => entry.domain.toLowerCase().includes(blocked))
  ) {
    errors.push(`Blocked aggregator domain leaked into direct catalog: ${blocked}`);
  }
}

const byTier = entries.reduce(
  (acc, item) => ({ ...acc, [item.tier]: (acc[item.tier] ?? 0) + 1 }),
  {},
);
const byParserStatus = entries.reduce(
  (acc, item) => ({
    ...acc,
    [item.parserStatus]: (acc[item.parserStatus] ?? 0) + 1,
  }),
  {},
);
const byAccessMode = entries.reduce(
  (acc, item) => ({
    ...acc,
    [item.accessMode]: (acc[item.accessMode] ?? 0) + 1,
  }),
  {},
);

if (errors.length > 0) {
  console.error("Direct RFP portal catalog validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Direct RFP portal catalog validation passed.");
console.log(
  JSON.stringify(
    {
      statePortalCount: stateCodes.size,
      missingStatePortalCodes,
      coveragePolicy:
        "Missing state-level portals are reported as coverage gaps; only verified official sources are retained.",
      listedEntriesAfterSam: entries.length,
      includesSam: hasSam,
      byTier,
      byParserStatus,
      byAccessMode,
    },
    null,
    2,
  ),
);
