import type { PublicPortalSource } from "../providers/publicPortalProviders/catalog";
import { saveDiscoveryCandidates } from "./discoveryCandidateStore";
import {
  completeFrontierState,
  initialFrontierState,
  isFrontierDue,
  loadCrawlFrontier,
  saveCrawlFrontier,
} from "./frontierStore";
import { getSpider, getSpiderConfig, resolveSpiderConfig } from "./registry";
import { contentHash, makeCrawlerFetcher } from "./safety";
import {
  DEFAULT_CRAWL_LIMITS,
  type CrawlDiagnostics,
  type CrawlLimits,
  type SpiderRunResult,
} from "./types";

export interface RunRegisteredSpiderOptions {
  force?: boolean;
  signal?: AbortSignal;
  onHeartbeat?: (status: {
    sourceId: string;
    spiderId: string;
    message: string;
  }) => void | Promise<void>;
}

function blockedError(message: string): boolean {
  return /http\s+(401|403)|access denied|forbidden|captcha|robots disallow|permission/i.test(
    message,
  );
}

function mergedLimits(overrides?: Partial<CrawlLimits>): CrawlLimits {
  return { ...DEFAULT_CRAWL_LIMITS, ...(overrides ?? {}) };
}

function deferredResult(
  sourceId: string,
  spiderId: string,
  kind: CrawlDiagnostics["kind"],
): SpiderRunResult {
  const now = new Date().toISOString();
  return {
    outcome: "deferred",
    records: [],
    diagnostics: {
      spiderId,
      sourceId,
      kind,
      startedAt: now,
      completedAt: now,
      pagesCrawled: 0,
      urlsVisited: 0,
      bytesRead: 0,
      retries: 0,
      discoveredUrls: [],
      errors: [],
    },
  };
}

export async function runRegisteredSpider(
  source: PublicPortalSource,
  spiderId: string,
  options: RunRegisteredSpiderOptions = {},
): Promise<SpiderRunResult> {
  const configured = getSpiderConfig(spiderId);
  if (!configured) throw new Error(`Unknown crawler spider: ${spiderId}`);
  if (configured.sourceId !== source.id)
    throw new Error(
      `Spider ${spiderId} is registered for ${configured.sourceId}, not ${source.id}`,
    );
  if (!configured.enabled) return deferredResult(source.id, spiderId, configured.kind);

  const frontier =
    (await loadCrawlFrontier(source.id, spiderId)) ??
    initialFrontierState(source.id, spiderId);
  if (!options.force && !isFrontierDue(frontier)) {
    return deferredResult(source.id, spiderId, configured.kind);
  }

  const config = resolveSpiderConfig(configured);
  const spider = getSpider(config.kind);
  if (!spider) throw new Error(`No crawler implementation registered for ${config.kind}`);
  const limits = mergedLimits(config.limits);
  const startedAt = Date.now();
  let bytesRead = 0;
  let retries = 0;
  const discovered = new Set<string>();
  const fetchText = makeCrawlerFetcher({
    limits,
    allowedHosts: config.allowedHosts,
    frontier,
    signal: options.signal,
    onBytes: (bytes) => {
      bytesRead += bytes;
    },
    onRetry: () => {
      retries += 1;
    },
  });

  await options.onHeartbeat?.({
    sourceId: source.id,
    spiderId,
    message: `Starting ${config.kind} spider`,
  });

  let result: SpiderRunResult;
  try {
    result = await spider.run({
      source,
      config,
      limits,
      signal: options.signal,
      frontier,
      fetchText,
      recordDiscoveredUrl: (url) => discovered.add(url),
    });
    result.diagnostics.bytesRead = bytesRead;
    result.diagnostics.retries = retries;
    result.diagnostics.discoveredUrls = Array.from(
      new Set([...result.diagnostics.discoveredUrls, ...discovered]),
    ).slice(0, limits.maxUrls);
    if (Date.now() - startedAt > limits.elapsedMs) {
      result.diagnostics.errors.push(
        `Crawler elapsed budget exceeded after ${Date.now() - startedAt}ms`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const now = new Date().toISOString();
    result = {
      outcome: blockedError(message) ? "blocked" : "failed",
      records: [],
      diagnostics: {
        spiderId,
        sourceId: source.id,
        kind: config.kind,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: now,
        pagesCrawled: 0,
        urlsVisited: 0,
        bytesRead,
        retries,
        discoveredUrls: Array.from(discovered),
        errors: [message],
      },
    };
  }

  if (
    result.outcome === "failed" &&
    result.diagnostics.errors.some(blockedError)
  ) {
    result.outcome = "blocked";
  }
  result.diagnostics.completedAt ??= new Date().toISOString();
  const resultHash =
    result.contentHash ??
    (result.records.length > 0
      ? contentHash(
          result.records
            .map((record) =>
              [record.externalId, record.title, record.sourceUrl].join("|"),
            )
            .sort()
            .join("\n"),
        )
      : frontier.contentHash);

  if (config.kind === "browser_discovery") {
    await saveDiscoveryCandidates(
      source.id,
      spiderId,
      result.diagnostics.dynamicEndpoints ?? [],
    );
  }

  const error = result.diagnostics.errors.join("; ") || undefined;
  await saveCrawlFrontier(
    completeFrontierState({
      prior: frontier,
      sourceId: source.id,
      spiderId,
      outcome: result.outcome,
      error,
      scheduleMinutes: config.scheduleMinutes,
      etag: result.etag,
      lastModified: result.lastModified,
      contentHash: resultHash,
      cursor: result.cursor,
      pagesCrawled: result.diagnostics.pagesCrawled,
      urlsVisited: result.diagnostics.urlsVisited,
      recordsFound: result.records.length,
    }),
  );

  await options.onHeartbeat?.({
    sourceId: source.id,
    spiderId,
    message: `${config.kind} spider ${result.outcome}; ${result.records.length} records`,
  });
  return { ...result, contentHash: resultHash };
}
