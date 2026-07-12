import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DIRECT_RFP_PORTALS } from "../api-server/src/lib/providers/directRfpPortals";
import { inferPortalBuyerSector } from "../api-server/src/lib/providers/directRfpPortalRelevanceCatalog";

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

interface ShardFile {
  shard: number;
  shards: number;
  generatedAt: string;
  portalCount: number;
  records: PortalResearchRecord[];
}

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const inputDir = resolve(arg("input-dir", "portal-research-shards"));
const auditOut = resolve(
  arg("audit-out", "artifacts/portal-research/portal-research-audit.json"),
);
const summaryOut = resolve(
  arg("summary-out", "artifacts/portal-research/portal-research-summary.json"),
);
const generatedOut = resolve(
  arg(
    "generated-out",
    "api-server/src/lib/providers/portalResearch.generated.ts",
  ),
);
const catalogPath = resolve(
  arg(
    "catalog",
    "api-server/src/lib/providers/directRfpPortalRelevanceCatalog.ts",
  ),
);

const files = (await readdir(inputDir))
  .filter((name) => name.endsWith(".json"))
  .sort();
if (files.length === 0) throw new Error(`No shard files found in ${inputDir}`);

const shardFiles: ShardFile[] = [];
for (const file of files) {
  shardFiles.push(
    JSON.parse(await readFile(resolve(inputDir, file), "utf8")) as ShardFile,
  );
}

const records = shardFiles.flatMap((file) => file.records);
const portalIds = new Set(DIRECT_RFP_PORTALS.map((portal) => portal.id));
const counts = new Map<string, number>();
for (const record of records) {
  counts.set(record.portalId, (counts.get(record.portalId) ?? 0) + 1);
}
const missingPortalIds = [...portalIds].filter((id) => !counts.has(id)).sort();
const unknownPortalIds = [...counts.keys()].filter((id) => !portalIds.has(id)).sort();
const duplicatePortalIds = [...counts.entries()]
  .filter(([, count]) => count !== 1)
  .map(([id]) => id)
  .sort();
if (missingPortalIds.length || unknownPortalIds.length || duplicatePortalIds.length) {
  throw new Error(
    JSON.stringify({ missingPortalIds, unknownPortalIds, duplicatePortalIds }, null, 2),
  );
}

const byId = new Map(records.map((record) => [record.portalId, record]));
const ordered = DIRECT_RFP_PORTALS.map((portal) => {
  const record = byId.get(portal.id);
  if (!record) throw new Error(`Missing research record for ${portal.id}`);
  return record;
});

const countsByStatus = ordered.reduce<Record<string, number>>((acc, record) => {
  acc[record.researchStatus] = (acc[record.researchStatus] ?? 0) + 1;
  return acc;
}, {});
const acceptedEvidenceCount = ordered.reduce(
  (sum, record) => sum + record.acceptedEvidence.length,
  0,
);
const queryCount = ordered.reduce(
  (sum, record) => sum + record.queriesExecuted.length,
  0,
);
const successfulQueryCount = ordered.reduce(
  (sum, record) => sum + record.successfulQueryCount,
  0,
);
const failedQueryCount = ordered.reduce(
  (sum, record) => sum + record.failedQueryCount,
  0,
);
const inspectedPageCount = ordered.reduce(
  (sum, record) => sum + record.officialPagesInspected.length,
  0,
);
const rejectedCandidateCount = ordered.reduce(
  (sum, record) => sum + record.rejectedCandidates.length,
  0,
);
const researchFailedPortalIds = ordered
  .filter((record) => record.researchStatus === "research_failed")
  .map((record) => record.portalId);

const summary = {
  generatedAt: new Date().toISOString(),
  totalCatalogPortals: DIRECT_RFP_PORTALS.length,
  totalResearchRecords: ordered.length,
  missingPortalIds,
  unknownPortalIds,
  duplicatePortalIds,
  countsByStatus,
  queryCount,
  successfulQueryCount,
  failedQueryCount,
  inspectedPageCount,
  acceptedEvidenceCount,
  rejectedCandidateCount,
  researchFailedPortalIds,
  inaccessiblePortalIds: ordered
    .filter((record) => record.researchStatus === "inaccessible")
    .map((record) => record.portalId),
  notDirectSourcePortalIds: ordered
    .filter((record) => record.researchStatus === "not_a_direct_source")
    .map((record) => record.portalId),
};

await mkdir(dirname(auditOut), { recursive: true });
await mkdir(dirname(summaryOut), { recursive: true });
await mkdir(dirname(generatedOut), { recursive: true });
await writeFile(
  auditOut,
  JSON.stringify({ generatedAt: summary.generatedAt, records: ordered }, null, 2),
);
await writeFile(summaryOut, JSON.stringify(summary, null, 2));

if (researchFailedPortalIds.length > 0) {
  throw new Error(
    `External search failed for ${researchFailedPortalIds.length} portals; refusing to convert failed searches into no-match classifications. See ${summaryOut}.`,
  );
}

const generatedTs = `// Generated by scripts/merge-portal-research.ts. Do not hand edit.\n\nexport interface PortalResearchEvidenceItem {\n  title: string;\n  url: string;\n  snippet: string;\n  pageStatus: number | null;\n  matchedServiceCategories: string[];\n  matchedServiceTerms: string[];\n  matchedProcurementTerms: string[];\n  evidenceType: \"active_or_historical_solicitation\" | \"award_or_contract\" | \"forecast_or_sources_sought\";\n  acceptedAt: string;\n}\n\nexport interface PortalResearchRecord {\n  portalId: string;\n  portalName: string;\n  jurisdiction: string;\n  country: string;\n  portalUrl: string;\n  searchUrl?: string;\n  portalDomain: string;\n  researchStatus: \"verified_relevant\" | \"researched_no_match\" | \"research_failed\" | \"inaccessible\" | \"not_a_direct_source\";\n  researchStartedAt: string;\n  researchCompletedAt: string;\n  queriesExecuted: string[];\n  successfulQueryCount: number;\n  failedQueryCount: number;\n  searchProviders: string[];\n  officialPagesInspected: string[];\n  acceptedEvidence: PortalResearchEvidenceItem[];\n  rejectedCandidates: Array<{ url: string; reason: string }>;\n  errors: string[];\n  portalHttpStatus: number | null;\n  redirectedHost?: string;\n}\n\nexport const PORTAL_RESEARCH_RECORDS: PortalResearchRecord[] = ${JSON.stringify(ordered, null, 2)};\n\nexport const PORTAL_RESEARCH_BY_ID = new Map(PORTAL_RESEARCH_RECORDS.map((record) => [record.portalId, record]));\n`;
await writeFile(generatedOut, generatedTs);

function quote(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const relevanceRecords = DIRECT_RFP_PORTALS.map((portal) => {
  const research = byId.get(portal.id)!;
  const evidence = research.acceptedEvidence;
  const categories = [
    ...new Set(evidence.flatMap((item) => item.matchedServiceCategories)),
  ];
  const completedDate = research.researchCompletedAt.slice(0, 10);
  if (research.researchStatus === "verified_relevant") {
    const reviewMethod = evidence.some(
      (item) => item.evidenceType === "award_or_contract",
    )
      ? "official_contract_history"
      : evidence.some(
            (item) => item.evidenceType === "forecast_or_sources_sought",
          )
        ? "official_procurement_forecast"
        : "official_relevant_solicitation";
    return {
      portalId: portal.id,
      occumedFit: "verified_high",
      buyerSector: inferPortalBuyerSector(portal),
      occumedServiceCategories: categories,
      relevanceReasonCodes: ["portal_verified_by_external_research"],
      relevanceEvidence: evidence.map(
        (item) => `${item.title}: ${item.matchedServiceCategories.join(", ")}`,
      ),
      relevanceEvidenceUrls: evidence.map((item) => item.url),
      lastRelevanceVerified: completedDate,
      reviewMethod,
    };
  }
  if (research.researchStatus === "not_a_direct_source") {
    return {
      portalId: portal.id,
      occumedFit: "irrelevant",
      buyerSector: inferPortalBuyerSector(portal),
      occumedServiceCategories: [],
      relevanceReasonCodes: ["not_a_direct_procurement_source"],
      relevanceEvidence: [
        `External research found that the catalog URL redirects to or represents a blocked marketplace or non-direct source (${research.redirectedHost ?? "unknown host"}).`,
      ],
      relevanceEvidenceUrls: [],
      lastRelevanceVerified: completedDate,
      reviewMethod: "not_a_direct_procurement_source",
    };
  }
  if (research.researchStatus === "inaccessible") {
    return {
      portalId: portal.id,
      occumedFit: "insufficient_evidence",
      buyerSector: inferPortalBuyerSector(portal),
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_inaccessible_after_research"],
      relevanceEvidence: [
        `The portal could not be accessed, although ${research.successfulQueryCount} official-domain searches completed. Errors: ${research.errors.slice(0, 3).join(" | ") || "portal access unavailable"}.`,
      ],
      relevanceEvidenceUrls: [],
      lastRelevanceVerified: completedDate,
      reviewMethod: "insufficient_access",
    };
  }
  return {
    portalId: portal.id,
    occumedFit: "insufficient_evidence",
    buyerSector: inferPortalBuyerSector(portal),
    occumedServiceCategories: [],
    relevanceReasonCodes: ["researched_no_qualifying_match"],
    relevanceEvidence: [
      `Completed ${research.successfulQueryCount} of ${research.queriesExecuted.length} official-domain searches and inspected ${research.officialPagesInspected.length} official pages; no qualifying Occu-Med procurement artifact met the evidence rules.`,
    ],
    relevanceEvidenceUrls: [],
    lastRelevanceVerified: completedDate,
    reviewMethod: "researched_no_match",
  };
});

let catalog = await readFile(catalogPath, "utf8");
catalog = catalog.replace(
  '| "not_a_direct_procurement_source";',
  '| "not_a_direct_procurement_source"\n  | "researched_no_match";',
);
const startMarker = "function buildBaselineRecord(";
const endMarker = "export const DIRECT_RFP_PORTAL_RELEVANCE_BY_ID";
const start = catalog.indexOf(startMarker);
const end = catalog.indexOf(endMarker);
if (start < 0 || end < 0 || end <= start) {
  throw new Error("Could not locate relevance-record generation section");
}
const replacement = `export const DIRECT_RFP_PORTAL_RELEVANCE_RECORDS: DirectRfpPortalRelevanceRecord[] = ${quote(relevanceRecords)};\n\n`;
catalog = `${catalog.slice(0, start)}${replacement}${catalog.slice(end)}`;
await writeFile(catalogPath, catalog);

console.log(JSON.stringify(summary, null, 2));
