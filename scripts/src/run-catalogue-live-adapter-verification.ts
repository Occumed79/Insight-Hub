import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { getRegisteredPublicPortalAdapter } from "../../api-server/src/lib/providers/publicPortalAdapterRegistry";
import {
  classifyLiveVerificationResult,
  isFatalLiveVerificationStatus,
  type LiveVerificationStatus,
} from "../../api-server/src/lib/providers/liveVerificationClassification";
import { PUBLISHED_DIRECT_RFP_PORTALS } from "../../api-server/src/lib/providers/publishedDirectRfpCatalogue";

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_ATTEMPTS = 2;
const DEFAULT_LIMIT = 10;

type LiveOutcome =
  | "success"
  | "partial"
  | "no_results"
  | "blocked_challenge"
  | "request_failure"
  | "bad_endpoint"
  | "parser_failure"
  | "configuration_failure";

interface LiveAdapterResult {
  portalId: string;
  name: string;
  jurisdiction: string;
  sourceUrl: string;
  outcome: LiveOutcome;
  status: LiveVerificationStatus | "CONFIGURATION_FAILURE";
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

function outcomeForStatus(status: LiveVerificationStatus): LiveOutcome {
  switch (status) {
    case "PASS":
      return "success";
    case "HEALTHY_EMPTY":
      return "no_results";
    case "BLOCKED_CHALLENGE":
      return "blocked_challenge";
    case "REQUEST_FAILURE":
      return "request_failure";
    case "BAD_ENDPOINT":
      return "bad_endpoint";
    case "PARSER_FAILURE":
      return "parser_failure";
  }
}

function resultFromFetch(input: {
  portal: (typeof PUBLISHED_DIRECT_RFP_PORTALS)[number];
  records: number;
  errors: string[];
  attempts: number;
  startedAt: number;
}): LiveAdapterResult {
  const status = classifyLiveVerificationResult({
    records: Array.from({ length: input.records }, () => ({} as never)),
    errors: input.errors,
  });
  return {
    portalId: input.portal.id,
    name: input.portal.name,
    jurisdiction: input.portal.jurisdiction,
    sourceUrl: input.portal.searchUrl || input.portal.url,
    outcome:
      input.records > 0 && input.errors.length > 0
        ? "partial"
        : outcomeForStatus(status),
    status,
    configured: true,
    records: input.records,
    errors: input.errors,
    attempts: input.attempts,
    durationMs: Date.now() - input.startedAt,
  };
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
      outcome: "configuration_failure",
      status: "CONFIGURATION_FAILURE",
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
      outcome: "configuration_failure",
      status: "CONFIGURATION_FAILURE",
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
      outcome: "configuration_failure",
      status: "CONFIGURATION_FAILURE",
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
      if (records > 0 || errors.length === 0) {
        return resultFromFetch({
          portal,
          records,
          errors,
          attempts: attempt,
          startedAt,
        });
      }
      lastErrors = errors;

      const status = classifyLiveVerificationResult({
        records: [],
        errors,
      });
      if (status === "BLOCKED_CHALLENGE" || isFatalLiveVerificationStatus(status)) {
        return resultFromFetch({
          portal,
          records: 0,
          errors,
          attempts: attempt,
          startedAt,
        });
      }
    } catch (error) {
      clearTimeout(timeout);
      lastErrors = [error instanceof Error ? error.message : String(error)];
    } finally {
      clearTimeout(timeout);
    }
  }

  return resultFromFetch({
    portal,
    records: 0,
    errors: lastErrors.length > 0 ? lastErrors : ["Unknown adapter failure."],
    attempts: maxAttempts,
    startedAt,
  });
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
  blockedChallenge: results.filter(
    (result) => result.outcome === "blocked_challenge",
  ).length,
  requestFailure: results.filter(
    (result) => result.outcome === "request_failure",
  ).length,
  badEndpoint: results.filter((result) => result.outcome === "bad_endpoint").length,
  parserFailure: results.filter(
    (result) => result.outcome === "parser_failure",
  ).length,
  configurationFailure: results.filter(
    (result) => result.outcome === "configuration_failure",
  ).length,
  records: results.reduce((total, result) => total + result.records, 0),
};

const incompleteVerification = results.length !== portals.length;
const fatalFailures =
  summary.badEndpoint +
  summary.parserFailure +
  summary.configurationFailure +
  (incompleteVerification ? 1 : 0);
const report = {
  generatedAt,
  clean: fatalFailures === 0,
  incompleteVerification,
  fatalFailures,
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
  `- Blocked/browser challenges: ${summary.blockedChallenge}`,
  `- Transient request failures: ${summary.requestFailure}`,
  `- Bad endpoints: ${summary.badEndpoint}`,
  `- Parser failures: ${summary.parserFailure}`,
  `- Configuration failures: ${summary.configurationFailure}`,
  `- Incomplete verification: ${incompleteVerification ? "yes" : "no"}`,
  `- Fatal failures: ${fatalFailures}`,
  `- Records returned: ${summary.records}`,
  "",
  "## Results",
  "",
  ...results.flatMap((result) => [
    `### ${result.outcome.toUpperCase()} · ${result.portalId}`,
    "",
    `- Status: ${result.status}`,
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
