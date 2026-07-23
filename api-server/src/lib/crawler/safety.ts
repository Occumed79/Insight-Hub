import { createHash } from "node:crypto";

import { RobotsRules } from "../providers/nativePublicPortalDiscovery";
import type {
  CrawlFetchResult,
  CrawlFrontierState,
  CrawlLimits,
} from "./types";

const lastDomainFetchAt = new Map<string, number>();
const robotsCache = new Map<string, Promise<RobotsRules>>();

export function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

export function isAllowedCrawlerHost(
  url: string,
  allowedHosts: readonly string[],
): boolean {
  try {
    const host = normalizeHost(new URL(url).hostname);
    return allowedHosts.some((allowed) => {
      const normalized = normalizeHost(allowed);
      return host === normalized || host.endsWith(`.${normalized}`);
    });
  } catch {
    return false;
  }
}

export function canonicalizeCrawlerUrl(
  value: string,
  baseUrl: string,
  allowedHosts: readonly string[],
): string | null {
  try {
    const url = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (!isAllowedCrawlerHost(url.toString(), allowedHosts)) return null;
    url.hash = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

function abortError(signal?: AbortSignal): Error {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  return new Error("Crawler request cancelled");
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortError(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

async function waitForDomain(
  url: string,
  minimumIntervalMs: number,
  signal?: AbortSignal,
): Promise<void> {
  const host = normalizeHost(new URL(url).hostname);
  const last = lastDomainFetchAt.get(host) ?? 0;
  const waitMs = Math.max(0, minimumIntervalMs - (Date.now() - last));
  await sleep(waitMs, signal);
  lastDomainFetchAt.set(host, Date.now());
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    throw new Error(`Crawler response exceeded ${maxBytes} bytes`);
  }
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`Crawler response exceeded ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function loadRobotsRules(
  targetUrl: string,
  limits: CrawlLimits,
  signal?: AbortSignal,
): Promise<RobotsRules> {
  const target = new URL(targetUrl);
  const origin = target.origin;
  const cached = robotsCache.get(origin);
  if (cached) return cached;

  const pending = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(limits.requestTimeoutMs, 5_000),
    );
    const onParentAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", onParentAbort, { once: true });
    try {
      const robotsUrl = new URL("/robots.txt", origin).toString();
      const response = await fetch(robotsUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          accept: "text/plain,*/*;q=0.1",
          "user-agent":
            "OccuMed-InsightHub/1.0 controlled public procurement crawler (+https://www.occumed.com)",
        },
      });
      if (!response.ok) return new RobotsRules();
      const text = await readLimited(
        response,
        Math.min(limits.maxBytes, 250_000),
      );
      return RobotsRules.parse(text, origin);
    } catch (error) {
      if (signal?.aborted) throw abortError(signal);
      // An unavailable robots file does not create a rule that is not published.
      // Other crawler limits and official-host restrictions still apply.
      return new RobotsRules();
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onParentAbort);
    }
  })();

  robotsCache.set(origin, pending);
  try {
    return await pending;
  } catch (error) {
    robotsCache.delete(origin);
    throw error;
  }
}

export async function assertCrawlerRobotsAllowed(
  url: string,
  limits: CrawlLimits,
  signal?: AbortSignal,
): Promise<void> {
  const rules = await loadRobotsRules(url, limits, signal);
  if (!rules.allows(url)) throw new Error(`robots disallow ${url}`);
}

export function contentHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function makeCrawlerFetcher(options: {
  limits: CrawlLimits;
  allowedHosts: readonly string[];
  frontier?: CrawlFrontierState;
  signal?: AbortSignal;
  onBytes?: (bytes: number) => void;
  onRetry?: () => void;
}) {
  const { limits, allowedHosts, frontier, signal, onBytes, onRetry } = options;

  return async (
    rawUrl: string,
    init: RequestInit = {},
  ): Promise<CrawlFetchResult> => {
    const initial = canonicalizeCrawlerUrl(rawUrl, rawUrl, allowedHosts);
    if (!initial) throw new Error(`Crawler host is not allowed: ${rawUrl}`);

    let current = initial;
    let redirects = 0;
    let attempt = 0;
    while (true) {
      if (signal?.aborted) throw abortError(signal);
      await assertCrawlerRobotsAllowed(current, limits, signal);
      await waitForDomain(current, limits.minDomainIntervalMs, signal);
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        limits.requestTimeoutMs,
      );
      const onParentAbort = () => controller.abort(signal?.reason);
      signal?.addEventListener("abort", onParentAbort, { once: true });
      try {
        const headers = new Headers(init.headers);
        headers.set(
          "user-agent",
          "OccuMed-InsightHub/1.0 controlled public procurement crawler (+https://www.occumed.com)",
        );
        headers.set(
          "accept",
          "application/json,application/rss+xml,application/atom+xml,application/xml,text/html,application/pdf;q=0.9,*/*;q=0.5",
        );
        if (frontier?.etag) headers.set("if-none-match", frontier.etag);
        if (frontier?.lastModified)
          headers.set("if-modified-since", frontier.lastModified);

        const response = await fetch(current, {
          ...init,
          headers,
          redirect: "manual",
          signal: controller.signal,
        });

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location)
            throw new Error(`Crawler redirect had no location: ${current}`);
          if (redirects >= limits.maxRedirects)
            throw new Error(`Crawler redirect limit exceeded: ${current}`);
          const next = canonicalizeCrawlerUrl(
            location,
            current,
            allowedHosts,
          );
          if (!next)
            throw new Error(`Crawler redirect left allowed hosts: ${location}`);
          current = next;
          redirects += 1;
          continue;
        }

        if (response.status === 304) {
          return {
            url: current,
            status: 304,
            contentType: response.headers.get("content-type") ?? undefined,
            etag: response.headers.get("etag") ?? frontier?.etag,
            lastModified:
              response.headers.get("last-modified") ?? frontier?.lastModified,
            text: "",
            notModified: true,
          };
        }

        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt < limits.maxRetries) {
            attempt += 1;
            onRetry?.();
            const retryAfter = Number(
              response.headers.get("retry-after") ?? 0,
            );
            await sleep(
              retryAfter > 0
                ? retryAfter * 1_000
                : Math.min(8_000, 500 * 2 ** attempt),
              signal,
            );
            continue;
          }
          throw new Error(
            `Crawler request returned HTTP ${response.status}: ${current}`,
          );
        }

        const text = await readLimited(response, limits.maxBytes);
        onBytes?.(new TextEncoder().encode(text).byteLength);
        return {
          url: current,
          status: response.status,
          contentType: response.headers.get("content-type") ?? undefined,
          etag: response.headers.get("etag") ?? undefined,
          lastModified: response.headers.get("last-modified") ?? undefined,
          text,
          notModified: false,
        };
      } catch (error) {
        if (controller.signal.aborted && !signal?.aborted) {
          if (attempt < limits.maxRetries) {
            attempt += 1;
            onRetry?.();
            await sleep(Math.min(8_000, 500 * 2 ** attempt), signal);
            continue;
          }
          throw new Error(`Crawler request timed out: ${current}`);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onParentAbort);
      }
    }
  };
}
