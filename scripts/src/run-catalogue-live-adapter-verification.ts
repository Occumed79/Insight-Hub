import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { getRegisteredPublicPortalAdapter } from "../../api-server/src/lib/providers/publicPortalAdapterRegistry";
import { PUBLISHED_DIRECT_RFP_PORTALS } from "../../api-server/src/lib/providers/publishedDirectRfpCatalogue";

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_ATTEMPTS = 2;
const DEFAULT_LIMIT = 10;

type LiveOutcome = "success" | "partial" | "no_results" | "failed";

interface LiveAdapterResult {
  portalId: string;
  name: string;
  jurisdiction: string;
  sourceUrl: string;
  outcome: LiveOutcome;
  configured: boolean;
  records: number;
  errors: string[];
  attempts: number;
  durationMs: number;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function withConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      results[index] = await worker(values[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () =>
      runWorker(),
    ),
  );
  return results;
}

async function verifyPortal(
  portal: (typeof PUBLISHED_DIRECT_RFP_PORTALS)[number],
): Promise<LiveAdapterResult> {
  const startedAt = Date.now();
  const provider = getRegisteredPublicPortalAdapter(portal.id);
  if (!provider) {
    return {
      portalId: portal.id,
      name: portal.name,
      jurisdiction: portal.jurisdiction,
      sourceUrl: portal.searchUrl || portal.url,
      outcome: "failed",
      configured: false,
      records: 0,
      errors: ["Published source has no registered runtime adapter."],
      attempts: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  let configured = false;
  try {
    configured = await provider.isConfigured();
  } catch (error) {
    return {
      portalId: portal.id,
      name: portal.name,
      jurisdiction: portal.jurisdiction,
      sourceUrl: portal.searchUrl || portal.url,
      outcome: "failed",
      configured: false,
      records: 0,
      errors: [error instanceof Error ? error.message : String(error)],
      attempts: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  if (!configured) {
    return {
      portalId: portal.id,
      name: portal.name,
      jurisdiction: portal.jurisdiction,
      sourceUrl: portal.searchUrl || portal.url,
      outcome: "failed",
      configured: false,
      records: 0,
      errors: ["Runtime adapter reported that it is not configured."],
      attempts: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  const maxAttempts = positiveInteger(
    process.env.CATALOGUE_LIVE_ATTEMPTS,
    DEFAULT_ATTEMPTS,
  );
  const timeoutMs = positiveInteger(
    process.env.CATALOGUE_LIVE_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  );
  const limit = positiveInteger(
    process.env.CATALOGUE_LIVE_RESULT_LIMIT,
    DEFAULT_LIMIT,
  );
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await Promise.race([
        provider.fetch({
          limit,
          dateRange: 180,
          signal: controller.signal,
        }),
        new Promise<never>((_resolve, reject) => {
          controller.signal.addEventListener(
            "abort",
            () => reject(new Error(`Timed out after ${timeoutMs}ms`)),
            { once: true },
          );
        }),
      ]);
      clearTimeout(timeout);
      const records = result.records.length;
      const errors = result.errors.filter(Boolean);
      if (records > 0) {
        return {
          portalId: portal.id,
          name: portal.name,
          jurisdiction: portal.jurisdiction,
          sourceUrl: portal.searchUrl || portal.url,
          outcome: errors.length > 0 ? "partial" : "success",
          configured: true,
          records,
          errors,
          attempts: attempt,
          durationMs: Date.now() - startedAt,
        };
      }
      if (errors.length === 0) {
        return {
          portalId: portal.id,
          name: portal.name,
          jurisdiction: portal.jurisdiction,
          sourceUrl: portal.searchUrl || portal.url,
          outcome: "no_results",
          configured: true,
          records: 0,
          errors: [],
          attempts: attempt,
          durationMs: Date.now() - startedAt,
        };
      }
      lastErrors = errors;
    } catch (error) {
      clearTimeout(timeout);
      lastErrors = [error instanceof Error ? error.message : String(error)];
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    portalId: portal.id,
    name: portal.name,
    jurisdiction: portal.jurisdiction,
    sourceUrl: portal.searchUrl || portal.url,
    outcome: "failed",
    configured: true,
    records: 0,
    errors: lastErrors.length > 0 ? lastErrors : ["Unknown adapter failure."],
    attempts: maxAttempts,
    durationMs: Date.now() - startedAt,
  };
}

const requestedIds = new Set(
  (process.env.CATALOGUE_LIVE_PORTAL_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const portals = PUBLISHED_DIRECT_RFP_PORTALS.filter(
  (portal) =>
    portal.id !== "us-sam-gov" &&
    (requestedIds.size === 0 || requestedIds.has(portal.id)),
);
const concurrency = positiveInteger(
  process.env.CATALOGUE_LIVE_CONCURRENCY,
  DEFAULT_CONCURRENCY,
);
const generatedAt = new Date().toISOString();
const results = (
  await withConcurrency(portals, concurrency, verifyPortal)
).sort((left, right) => left.portalId.localeCompare(right.portalId));

const summary = {
  publishedAdaptersChecked: results.length,
  success: results.filter((result) => result.outcome === "success").length,
  partial: results.filter((result) => result.outcome === "partial").length,
  noResults: results.filter((result) => result.outcome === "no_results").length,
  failed: results.filter((result) => result.outcome === "failed").length,
  records: results.reduce((total, result) => total + result.records, 0),
};
const report = {
  generatedAt,
  clean: summary.failed === 0,
  summary,
  results,
};
const markdown = [
  "# Published Catalogue Live Adapter Verification",
  "",
  `Generated: ${generatedAt}`,
  "",
  `- Result: **${report.clean ? "CLEAN" : "FAILED"}**`,
  `- Published adapters checked: ${summary.publishedAdaptersChecked}`,
  `- Success: ${summary.success}`,
  `- Partial success: ${summary.partial}`,
  `- Valid empty listings: ${summary.noResults}`,
  `- Failed: ${summary.failed}`,
  `- Records returned: ${summary.records}`,
  "",
  "## Results",
  "",
  ...results.flatMap((result) => [
    `### ${result.outcome.toUpperCase()} · ${result.portalId}`,
    "",
    `- Buyer: ${result.name}`,
    `- Records: ${result.records}`,
    `- Attempts: ${result.attempts}`,
    `- Duration: ${result.durationMs}ms`,
    `- URL: ${result.sourceUrl}`,
    ...(result.errors.length > 0
      ? [`- Errors: ${result.errors.join(" | ")}`]
      : []),
    "",
  ]),
].join("\n");

const reportDir = resolve(
  process.env.CATALOGUE_LIVE_REPORT_DIR ??
    "artifacts/catalogue-live-adapter-verification",
);
await mkdir(reportDir, { recursive: true });
await Promise.all([
  writeFile(
    resolve(reportDir, "catalogue-live-adapter-verification.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    resolve(reportDir, "catalogue-live-adapter-verification.md"),
    `${markdown}\n`,
    "utf8",
  ),
]);

console.log(markdown);
if (!report.clean) process.exitCode = 1;
