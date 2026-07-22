import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import type { NormalizedOpportunity } from "../../providers/types";
import {
  calculateOpportunityDedupeKeys,
  decideOpportunityQuality,
  serializeOpportunity,
} from "../opportunityIdentity";
import {
  classifyIdentityMatch,
  failedProvidersForRetry,
  isStaleIngestionRun,
  mergeSourceRefresh,
  protectedLineageKeys,
  shouldArchiveForDeadline,
  shouldProtectCanonicalFromRefresh,
  STALE_INGESTION_RUN_AFTER_MS,
} from "../pipelineRules";

function fixture(
  overrides: Partial<NormalizedOpportunity> = {},
): NormalizedOpportunity {
  return {
    externalId: "notice-100",
    title: "RFP Employee Occupational Health Services",
    agency: "County of Fresno",
    type: "RFP",
    status: "active",
    postedDate: new Date("2026-07-01T00:00:00Z"),
    responseDeadline: new Date("2026-08-15T00:00:00Z"),
    description:
      "Occupational health physicals, drug testing, and medical surveillance.",
    solicitationNumber: "RFP-26-100",
    sourceUrl: "https://example.gov/bids/100?utm_source=test",
    source: "samGov",
    rawData: { sourceEvidence: "fixture", sourceConfidence: "high" },
    ...overrides,
  };
}

type Canonical = Record<string, unknown> & { id: string };

class InMemoryPipeline {
  raw: Record<string, unknown>[] = [];
  staging: Array<{
    status: string;
    reason: string | null;
    canonicalId?: string;
  }> = [];
  opportunities = new Map<string, Canonical>();
  keys = new Map<string, string>();
  nextId = 1;

  ingest(record: NormalizedOpportunity) {
    this.raw.push(serializeOpportunity(record));
    const quality = decideOpportunityQuality(record);
    if (quality.status !== "accepted") {
      this.staging.push({ status: quality.status, reason: quality.reason });
      return;
    }
    const keys = calculateOpportunityDedupeKeys(record);
    const match = classifyIdentityMatch(keys, this.keys);
    const protectedDuplicate =
      match &&
      shouldProtectCanonicalFromRefresh(
        match.matchType,
        record.rawData?.fallback === true,
      );
    if (protectedDuplicate) {
      this.staging.push({
        status: "duplicate",
        reason: match.matchType,
        canonicalId: match.opportunityId,
      });
      for (const key of protectedLineageKeys(keys, match.matchType)) {
        this.keys.set(key.value, match.opportunityId);
      }
      return;
    }
    const id = match?.opportunityId ?? `canonical-${this.nextId++}`;
    const incoming = { ...serializeOpportunity(record), id } as Canonical;
    const existing = this.opportunities.get(id);
    this.opportunities.set(
      id,
      existing ? mergeSourceRefresh(existing, incoming) : incoming,
    );
    for (const key of keys) this.keys.set(key.value, id);
    this.staging.push({
      status: "accepted",
      reason: match?.matchType ?? null,
      canonicalId: id,
    });
  }
}

describe("raw, staging, persistent identity, and refresh rules", () => {
  it("retains raw and rejected staging records", () => {
    const pipeline = new InMemoryPipeline();
    pipeline.ingest(
      fixture({ title: "Office furniture", description: "Chairs and desks" }),
    );
    assert.equal(pipeline.raw.length, 1);
    assert.equal(pipeline.staging.length, 1);
    assert.equal(pipeline.staging[0].status, "rejected");
    assert.match(pipeline.staging[0].reason!, /relevance filter/i);
    assert.equal(pipeline.opportunities.size, 0);
  });

  it("promotes accepted records and an identical rerun is idempotent", () => {
    const pipeline = new InMemoryPipeline();
    pipeline.ingest(fixture());
    pipeline.ingest(fixture());
    assert.equal(pipeline.raw.length, 2);
    assert.equal(
      pipeline.staging.filter((row) => row.status === "accepted").length,
      2,
    );
    assert.equal(pipeline.opportunities.size, 1);
  });

  it("resolves a cross-provider solicitation identity to one canonical opportunity", () => {
    const pipeline = new InMemoryPipeline();
    pipeline.ingest(fixture());
    pipeline.ingest(
      fixture({
        externalId: "county-portal-55",
        source: "publicPortalProviders",
        sourceUrl: "https://county.example.gov/rfp/55",
      }),
    );
    assert.equal(pipeline.opportunities.size, 1);
    assert.equal(pipeline.staging[1].reason, "solicitation");
  });

  it("treats a provider-identity amendment as a refresh and preserves user fields", () => {
    const pipeline = new InMemoryPipeline();
    pipeline.ingest(fixture());
    const id = [...pipeline.opportunities.keys()][0];
    pipeline.opportunities.set(id, {
      ...pipeline.opportunities.get(id)!,
      notes: "My bid/no-bid note",
      userGrade: "excellent",
      userConfidence: 97,
      createdAt: "preserved",
      firstSeenAt: "preserved",
    });
    pipeline.ingest(
      fixture({
        title: "RFP Employee Occupational Health Services - Amendment 2",
        responseDeadline: new Date("2026-09-01T00:00:00Z"),
      }),
    );
    const refreshed = pipeline.opportunities.get(id)!;
    assert.match(String(refreshed.title), /Amendment 2/);
    assert.equal(refreshed.notes, "My bid/no-bid note");
    assert.equal(refreshed.userGrade, "excellent");
    assert.equal(refreshed.userConfidence, 97);
    assert.equal(refreshed.createdAt, "preserved");
    assert.equal(refreshed.firstSeenAt, "preserved");
  });

  it("keeps only the matched weak lineage key for a cross-provider duplicate", () => {
    const pipeline = new InMemoryPipeline();
    pipeline.ingest(fixture({ solicitationNumber: undefined }));
    pipeline.ingest(
      fixture({
        externalId: "other-44",
        source: "publicPortalProviders",
        solicitationNumber: undefined,
      }),
    );
    assert.equal(pipeline.opportunities.size, 1);
    assert.equal(pipeline.staging[1].status, "duplicate");
    const duplicateKeys = calculateOpportunityDedupeKeys(
      fixture({
        externalId: "other-44",
        source: "publicPortalProviders",
        solicitationNumber: undefined,
      }),
    );
    assert.ok(
      duplicateKeys
        .filter((key) => key.type === "url")
        .every((key) => pipeline.keys.has(key.value)),
    );
    assert.ok(
      duplicateKeys
        .filter((key) => key.type === "provider")
        .every((key) => !pipeline.keys.has(key.value)),
    );
  });

  it("does not promote a repeated weak duplicate into a canonical refresh", () => {
    const pipeline = new InMemoryPipeline();
    pipeline.ingest(fixture({ solicitationNumber: undefined }));
    const duplicate = fixture({
      externalId: "other-44",
      source: "publicPortalProviders",
      solicitationNumber: undefined,
      title: "RFP Employee Occupational Health Services - weaker copy",
    });
    pipeline.ingest(duplicate);
    pipeline.ingest(duplicate);

    assert.equal(pipeline.opportunities.size, 1);
    assert.equal(pipeline.staging[1].status, "duplicate");
    assert.equal(pipeline.staging[2].status, "duplicate");
    assert.doesNotMatch(
      String([...pipeline.opportunities.values()][0].title),
      /weaker copy/,
    );
  });

  it("does not let a fallback solicitation match refresh canonical fields", () => {
    const pipeline = new InMemoryPipeline();
    pipeline.ingest(fixture());
    pipeline.ingest(
      fixture({
        externalId: "search-fallback-1",
        source: "serper",
        title: "RFP Employee Occupational Health Services - search fallback",
        rawData: { fallback: true, sourceConfidence: "low" },
      }),
    );

    assert.equal(pipeline.staging[1].status, "duplicate");
    assert.doesNotMatch(
      String([...pipeline.opportunities.values()][0].title),
      /search fallback/,
    );
  });
});

describe("run retry and deadline rules", () => {
  it("persists run and provider progress counters in RFP-only tables", async () => {
    const schema = await readFile(
      path.resolve(
        process.cwd(),
        "../lib/db/src/schema/opportunity-ingestion.ts",
      ),
      "utf8",
    );
    for (const table of [
      "opportunity_ingestion_runs",
      "opportunity_ingestion_run_sources",
      "opportunity_raw_records",
      "opportunity_staging",
      "opportunity_source_registry",
      "opportunity_dedupe_keys",
    ])
      assert.ok(schema.includes(`\"${table}\"`), `missing ${table}`);
    for (const counter of [
      "providersCompleted",
      "providersTotal",
      "fetched",
      "staged",
      "accepted",
      "rejected",
      "duplicates",
      "created",
      "updated",
      "archived",
    ]) {
      assert.ok(
        schema.includes(counter),
        `missing persisted progress counter ${counter}`,
      );
    }
  });

  it("selects only failed providers for retry", () => {
    assert.deepEqual(
      failedProvidersForRetry([
        { provider: "samGov", status: "completed" },
        { provider: "serper", status: "failed" },
        { provider: "exa", status: "failed" },
      ]),
      ["serper", "exa"],
    );
  });

  it("archives a known past deadline and never archives an unknown deadline", () => {
    const now = new Date("2026-07-20T00:00:00Z");
    assert.equal(
      shouldArchiveForDeadline(new Date("2026-07-19T23:59:59Z"), now),
      true,
    );
    assert.equal(shouldArchiveForDeadline(null, now), false);
    assert.equal(shouldArchiveForDeadline(undefined, now), false);
  });

  it("recovers only active runs whose persisted heartbeat is stale", () => {
    const now = new Date("2026-07-21T20:00:00Z");
    assert.equal(
      isStaleIngestionRun(
        new Date(now.getTime() - STALE_INGESTION_RUN_AFTER_MS),
        now,
      ),
      true,
    );
    assert.equal(
      isStaleIngestionRun(
        new Date(now.getTime() - STALE_INGESTION_RUN_AFTER_MS + 1),
        now,
      ),
      false,
    );
  });

  it("bounds provider execution, heartbeats, cancellation, stale recovery, and terminal states in the coordinator", async () => {
    const source = await readFile(
      path.resolve(process.cwd(), "src/lib/ingestion/manualIngestion.ts"),
      "utf8",
    );
    for (const required of [
      "PROVIDER_DEADLINE_MS = 90_000",
      "RUN_DEADLINE_MS = 20 * 60 * 1000",
      "HEARTBEAT_INTERVAL_MS = 5_000",
      "AbortController",
      "ProviderTimeoutError",
      "Promise.race",
      "cancellationRequested",
      "cancelManualIngestion",
      "finally",
      "rfp_run_finalized",
      "completed_with_errors",
      "cancelled",
    ])
      assert.ok(
        source.includes(required),
        `missing bounded-run safeguard ${required}`,
      );
  });

  it("passes abort signals through the provider runner into SAM.gov fetches", async () => {
    const runner = await readFile(
      path.resolve(process.cwd(), "src/lib/ingestion/providerRunner.ts"),
      "utf8",
    );
    const sam = await readFile(
      path.resolve(process.cwd(), "src/lib/providers/samGov.ts"),
      "utf8",
    );
    assert.ok(runner.includes("signal?: AbortSignal"));
    assert.ok(runner.includes("signal: options.signal"));
    assert.ok(sam.includes("fetch(`${baseUrl}?${params}`, { signal })"));
  });

  it("bounds public portal sub-runs below the manual provider deadline", async () => {
    const combined = await readFile(
      path.resolve(process.cwd(), "src/lib/providers/publicPortalProviders.ts"),
      "utf8",
    );
    const catalog = await readFile(
      path.resolve(
        process.cwd(),
        "src/lib/providers/publicPortalProviders/index.ts",
      ),
      "utf8",
    );
    for (const required of [
      "COMBINED_PORTAL_SOURCE_TIMEOUT_MS = 30_000",
      "COMBINED_PORTAL_RUN_TIMEOUT_MS = 75_000",
      "composeAbortSignal",
      "Promise.race([sourcePromise, sourceDeadline])",
      "const allTasks = Promise.allSettled",
      "const runDeadline = new Promise",
    ])
      assert.ok(
        combined.includes(required),
        `missing combined public-portal bound ${required}`,
      );
    assert.match(
      combined,
      /await Promise\.race\(\[\s*allTasks(?:\.then\(\(\) => undefined\))?,\s*runDeadline\s*\]\)/,
      "missing combined public-portal run deadline race",
    );
    for (const required of [
      "waitForDomainRateLimit(domain, signal)",
      "fetch(pageUrl,",
      "signal: requestSignal.signal",
      "runWithConcurrency",
      "options.signal",
      "publicPortalDiscovery.search({ keywords: options.keywords, signal })",
    ])
      assert.ok(
        catalog.includes(required),
        `missing catalog public-portal cancellation path ${required}`,
      );
  });

  it("GET /opportunities contains no archive mutation", async () => {
    const routePath = path.resolve(
      process.cwd(),
      "src/routes/opportunities.ts",
    );
    const source = await readFile(routePath, "utf8");
    const getStart = source.indexOf('router.get("/opportunities"');
    const fetchStart = source.indexOf('router.post("/opportunities/fetch"');
    const getHandler = source.slice(getStart, fetchStart);
    assert.equal(getHandler.includes("reconcileExpiredOpportunities"), false);
    assert.equal(getHandler.includes(".update(opportunitiesTable)"), false);
  });
});
