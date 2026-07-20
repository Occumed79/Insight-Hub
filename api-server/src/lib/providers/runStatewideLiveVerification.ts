import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { bsoPortalProviders } from "./bsoPortal";
import { calEprocureProvider } from "./calEprocure";
import { jaggaerSciQuestProviders } from "./jaggaerSciQuest";
import { minnesotaOspProvider } from "./minnesotaOsp";
import { nyScrProvider } from "./nyScr";
import { oregonBuysProvider } from "./oregonBuys";
import {
  STATEWIDE_PORTAL_CONFIGS,
  statewideProcurementProviders,
} from "./statewideProcurementPortals";
import { texasEsbdProvider } from "./texasEsbd";
import type { DataSourceProvider, ProviderFetchResult } from "./types";

export const STATEWIDE_LIVE_STATUSES = [
  "PASS",
  "HEALTHY_EMPTY",
  "BLOCKED_CHALLENGE",
  "BAD_ENDPOINT",
  "PARSER_FAILURE",
  "REQUEST_FAILURE",
] as const;

export type StatewideLiveStatus = (typeof STATEWIDE_LIVE_STATUSES)[number];

interface StatewideLiveTarget {
  state: string;
  portalId: string;
  provider: DataSourceProvider;
}

export interface StatewideLiveResult {
  state: string;
  portalId: string;
  httpResult: string;
  status: StatewideLiveStatus;
  recordCount: number;
  durationMs: number;
  errors: string[];
}

const SPECIALIZED_TARGETS: readonly StatewideLiveTarget[] = [
  { state: "CA", portalId: "ca-caleprocure", provider: calEprocureProvider },
  { state: "IA", portalId: "ia-das", provider: jaggaerSciQuestProviders["ia-das"]! },
  { state: "MA", portalId: "ma-commbuys", provider: bsoPortalProviders["ma-commbuys"]! },
  { state: "NJ", portalId: "nj-start", provider: bsoPortalProviders["nj-start"]! },
  { state: "NV", portalId: "nv-epro", provider: bsoPortalProviders["nv-epro"]! },
  { state: "NY", portalId: "ny-contract-reporter", provider: nyScrProvider },
  { state: "TX", portalId: "tx-esbd", provider: texasEsbdProvider },
];

const RECOVERY_OVERRIDES: Readonly<Record<string, DataSourceProvider>> = {
  "mn-swift": minnesotaOspProvider,
  "or-oregonbuys": oregonBuysProvider,
};

export const STATEWIDE_LIVE_TARGETS: readonly StatewideLiveTarget[] = [
  ...STATEWIDE_PORTAL_CONFIGS.map((config) => ({
    state: config.state,
    portalId: config.portalId,
    provider: RECOVERY_OVERRIDES[config.portalId] ?? statewideProcurementProviders[config.portalId]!,
  })),
  ...SPECIALIZED_TARGETS,
].sort((left, right) => left.state.localeCompare(right.state));

function classify(result: ProviderFetchResult): StatewideLiveStatus {
  if (result.records.length > 0) return "PASS";
  if (result.errors.length === 0) return "HEALTHY_EMPTY";
  const errors = result.errors.join(" ").toLowerCase();
  if (/captcha|browser\/login challenge|access denied|verify you are human|checking your browser|http 401|http 403|requires you to login/.test(errors)) {
    return "BLOCKED_CHALLENGE";
  }
  if (/application requested is not found|no server is available to handle this request|service unavailable/.test(errors)) {
    return "REQUEST_FAILURE";
  }
  if (/http 404|http 410|enotfound|eai_again|invalid url|name or service not known|no such host|redirected outside/.test(errors)) {
    return "BAD_ENDPOINT";
  }
  if (/no recognizable|no parseable|failed to parse|parser|parse error|dedicated provider is not registered/.test(errors)) {
    return "PARSER_FAILURE";
  }
  return "REQUEST_FAILURE";
}

function httpResult(result: ProviderFetchResult): string {
  if (result.records.length > 0 || result.errors.length === 0) return "OK";
  const status = result.errors.join(" ").match(/\bHTTP\s+(\d{3})\b/i)?.[1];
  return status ? `HTTP ${status}` : "REQUEST_ERROR";
}

async function verifyTarget(target: StatewideLiveTarget): Promise<StatewideLiveResult> {
  const started = Date.now();
  try {
    const result = await target.provider.fetch({ limit: 2, offset: 0 });
    return {
      state: target.state,
      portalId: target.portalId,
      httpResult: httpResult(result),
      status: classify(result),
      recordCount: result.records.length,
      durationMs: Date.now() - started,
      errors: result.errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result = { records: [], total: 0, errors: [message] };
    return {
      state: target.state,
      portalId: target.portalId,
      httpResult: httpResult(result),
      status: classify(result),
      recordCount: 0,
      durationMs: Date.now() - started,
      errors: [message],
    };
  }
}

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index] as T);
    }
  }));
  return results;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

export function renderStatewideLiveMarkdown(results: readonly StatewideLiveResult[]): string {
  const counts = Object.fromEntries(STATEWIDE_LIVE_STATUSES.map((status) => [status, results.filter((result) => result.status === status).length]));
  const lines = [
    "# Statewide live procurement verification",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `PASS: ${counts.PASS} | HEALTHY_EMPTY: ${counts.HEALTHY_EMPTY} | BLOCKED_CHALLENGE: ${counts.BLOCKED_CHALLENGE} | BAD_ENDPOINT: ${counts.BAD_ENDPOINT} | PARSER_FAILURE: ${counts.PARSER_FAILURE} | REQUEST_FAILURE: ${counts.REQUEST_FAILURE}`,
    "",
    "| State | Portal ID | HTTP result | Record count | Status | Duration | Diagnostic |",
    "|---|---|---|---:|---|---:|---|",
  ];
  for (const result of results) {
    lines.push(`| ${result.state} | ${result.portalId} | ${result.httpResult} | ${result.recordCount} | ${result.status} | ${result.durationMs}ms | ${escapeCell(result.errors[0] ?? "")} |`);
  }
  return `${lines.join("\n")}\n`;
}

function debugAssetUrls(html: string, pageUrl: string, limit = 10): string[] {
  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return [];
  }
  const candidates = [
    ...Array.from(html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi), (match) => match[1] ?? ""),
    ...Array.from(html.matchAll(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi), (match) => match[1] ?? ""),
  ];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const candidate of candidates) {
    let url: URL;
    try {
      url = new URL(candidate.replace(/&amp;/gi, "&"), pageUrl);
    } catch {
      continue;
    }
    if (url.origin !== origin || !/\.(?:js|mjs)(?:$|[?#])/i.test(url.pathname + url.search)) continue;
    url.hash = "";
    const key = url.toString().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(url.toString());
    if (urls.length >= limit) break;
  }
  return urls;
}

async function captureFailureSources(results: readonly StatewideLiveResult[], outputDir: string): Promise<void> {
  const debugDir = resolve(outputDir, "debug-source");
  await mkdir(debugDir, { recursive: true });
  const configs = new Map(STATEWIDE_PORTAL_CONFIGS.map((config) => [config.portalId, config]));
  await mapConcurrent(
    results.filter((result) => result.status !== "PASS" && result.status !== "HEALTHY_EMPTY"),
    3,
    async (result) => {
      const config = configs.get(result.portalId);
      if (!config) return;
      const stem = `${result.state}-${result.portalId}`.replace(/[^a-z0-9._-]/gi, "-");
      try {
        const response = await fetch(config.listingUrl, {
          redirect: "follow",
          headers: {
            accept: "text/html,application/xhtml+xml,application/json,text/csv;q=0.9,*/*;q=0.8",
            "user-agent": "OccuMed-InsightHub/1.0 statewide-verification-debug",
          },
        });
        const body = await response.text();
        const finalUrl = response.url || config.listingUrl;
        const assets = debugAssetUrls(body, finalUrl);
        await Promise.all([
          writeFile(resolve(debugDir, `${stem}.body.txt`), body.slice(0, 3_000_000), "utf8"),
          writeFile(resolve(debugDir, `${stem}.meta.json`), `${JSON.stringify({
            requestedUrl: config.listingUrl,
            finalUrl,
            status: response.status,
            contentType: response.headers.get("content-type"),
            assets,
          }, null, 2)}\n`, "utf8"),
          ...assets.map(async (assetUrl, index) => {
            try {
              const assetResponse = await fetch(assetUrl, {
                redirect: "follow",
                headers: {
                  accept: "application/javascript,text/javascript,*/*;q=0.8",
                  "user-agent": "OccuMed-InsightHub/1.0 statewide-verification-debug",
                },
              });
              const assetBody = await assetResponse.text();
              await writeFile(
                resolve(debugDir, `${stem}.asset-${String(index + 1).padStart(2, "0")}.js`),
                `/* ${assetUrl} | HTTP ${assetResponse.status} */\n${assetBody.slice(0, 3_000_000)}`,
                "utf8",
              );
            } catch (error) {
              await writeFile(
                resolve(debugDir, `${stem}.asset-${String(index + 1).padStart(2, "0")}.error.txt`),
                `${assetUrl}\n${error instanceof Error ? error.stack || error.message : String(error)}\n`,
                "utf8",
              );
            }
          }),
        ]);
      } catch (error) {
        await writeFile(resolve(debugDir, `${stem}.error.txt`), `${error instanceof Error ? error.stack || error.message : String(error)}\n`, "utf8");
      }
    },
  );
}

export async function runStatewideLiveVerification(): Promise<StatewideLiveResult[]> {
  const states = new Set(STATEWIDE_LIVE_TARGETS.map((target) => target.state));
  if (STATEWIDE_LIVE_TARGETS.length !== 50 || states.size !== 50) {
    throw new Error(`Expected exactly 50 unique state targets; found ${STATEWIDE_LIVE_TARGETS.length} targets and ${states.size} states`);
  }
  const concurrency = Math.min(Math.max(Number(process.env.STATEWIDE_LIVE_CONCURRENCY) || 4, 1), 8);
  const outputDir = resolve(process.env.STATEWIDE_LIVE_REPORT_DIR || "artifacts/statewide-live-verification");
  await mkdir(outputDir, { recursive: true });
  const results = await mapConcurrent(STATEWIDE_LIVE_TARGETS, concurrency, verifyTarget);
  results.sort((left, right) => left.state.localeCompare(right.state));
  const markdown = renderStatewideLiveMarkdown(results);
  await Promise.all([
    writeFile(resolve(outputDir, "statewide-live-verification.md"), markdown, "utf8"),
    writeFile(resolve(outputDir, "statewide-live-verification.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`, "utf8"),
    captureFailureSources(results, outputDir),
  ]);
  process.stdout.write(markdown);
  if (results.some((result) => result.status === "BAD_ENDPOINT" || result.status === "PARSER_FAILURE")) {
    process.exitCode = 1;
  }
  return results;
}

const invokedUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedUrl === import.meta.url) {
  runStatewideLiveVerification().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
