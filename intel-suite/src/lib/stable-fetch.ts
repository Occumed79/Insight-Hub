const INSTALL_KEY = "__insightHubStableApiFetchInstalled__" as const;

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [250, 750];
const FALLBACK_TTL_MS = 10 * 60 * 1000;
const MAX_CACHED_BODY_BYTES = 5 * 1024 * 1024;
export const MAX_STABLE_FETCH_CACHE_ENTRIES = 64;
export const MAX_STABLE_FETCH_CACHE_BYTES = 24 * 1024 * 1024;

type CachedResponse = {
  body: ArrayBuffer;
  byteLength: number;
  expiresAt: number;
  headers: [string, string][];
  status: number;
  statusText: string;
};

type StableFetchGlobal = typeof globalThis & {
  [INSTALL_KEY]?: true;
};

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal ? abortReason(signal) : new DOMException("The operation was aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function resolveRequest(input: RequestInfo | URL, init?: RequestInit): { method: string; url: URL } {
  const request = typeof Request !== "undefined" && input instanceof Request ? input : null;
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  return { method, url: new URL(rawUrl, globalThis.location?.href ?? "http://localhost") };
}

function newRequestId(): string {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // Fall through to a non-secret correlation identifier.
  }
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function responseFromCache(entry: CachedResponse, requestId: string): Response {
  const headers = new Headers(entry.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-insight-hub-data-source", "last-known-good");
  headers.set("x-request-id", requestId);
  return new Response(entry.body.slice(0), {
    status: entry.status,
    statusText: entry.statusText,
    headers,
  });
}

async function cacheSuccessfulJson(response: Response): Promise<CachedResponse | null> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("json")) return null;

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CACHED_BODY_BYTES) return null;

  try {
    const body = await response.clone().arrayBuffer();
    if (body.byteLength > MAX_CACHED_BODY_BYTES) return null;
    return {
      body,
      byteLength: body.byteLength,
      expiresAt: Date.now() + FALLBACK_TTL_MS,
      headers: Array.from(response.headers.entries()),
      status: response.status,
      statusText: response.statusText,
    };
  } catch {
    return null;
  }
}

function cacheBytes(cache: Map<string, CachedResponse>): number {
  let total = 0;
  for (const entry of cache.values()) total += entry.byteLength;
  return total;
}

function pruneStableCache(
  cache: Map<string, CachedResponse>,
  now = Date.now(),
  incomingBytes = 0,
): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }

  let retainedBytes = cacheBytes(cache);
  while (
    cache.size >= MAX_STABLE_FETCH_CACHE_ENTRIES ||
    retainedBytes + incomingBytes > MAX_STABLE_FETCH_CACHE_BYTES
  ) {
    let oldestKey: string | null = null;
    let oldestExpiry = Number.POSITIVE_INFINITY;
    for (const [key, entry] of cache) {
      if (entry.expiresAt < oldestExpiry) {
        oldestExpiry = entry.expiresAt;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    const removed = cache.get(oldestKey);
    cache.delete(oldestKey);
    retainedBytes -= removed?.byteLength ?? 0;
  }
}

/**
 * Stabilizes same-origin API reads in the browser.
 *
 * GET requests are retried for transient Render/Neon failures. When every retry
 * fails, the most recent successful JSON response is returned for a short,
 * bounded window instead of allowing a valid list to flash to an empty state.
 */
export function installStableFetch(): void {
  const stableGlobal = globalThis as StableFetchGlobal;
  if (stableGlobal[INSTALL_KEY] || typeof globalThis.fetch !== "function") return;

  const nativeFetch = globalThis.fetch.bind(globalThis);
  const lastKnownGood = new Map<string, CachedResponse>();

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const { method, url } = resolveRequest(input, init);
    const isSameOriginApi =
      method === "GET" &&
      url.pathname.startsWith("/api/") &&
      (!globalThis.location || url.origin === globalThis.location.origin);

    if (!isSameOriginApi) return nativeFetch(input, init);

    const cacheKey = url.toString();
    const requestId = newRequestId();
    let lastError: unknown = new Error(`GET ${url.pathname} failed`);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (init?.signal?.aborted) throw abortReason(init.signal);
      try {
        const headers = new Headers(
          typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
        );
        new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
        headers.set("accept", headers.get("accept") ?? "application/json");
        headers.set("cache-control", "no-cache");
        headers.set("pragma", "no-cache");
        if (!headers.has("x-request-id")) headers.set("x-request-id", requestId);

        const response = await nativeFetch(input, {
          ...init,
          method,
          headers,
          cache: "no-store",
        });

        if (response.ok) {
          const cached = await cacheSuccessfulJson(response);
          if (cached) {
            lastKnownGood.delete(cacheKey);
            pruneStableCache(lastKnownGood, Date.now(), cached.byteLength);
            if (cached.byteLength <= MAX_STABLE_FETCH_CACHE_BYTES) {
              lastKnownGood.set(cacheKey, cached);
            }
          }
          return response;
        }

        if (!RETRYABLE_STATUS.has(response.status)) return response;
        lastError = new Error(`GET ${url.pathname} returned HTTP ${response.status}`);
        try {
          await response.body?.cancel();
        } catch {
          // The response is already discarded; cancellation is best-effort.
        }
      } catch (error) {
        if (isAbortError(error) || init?.signal?.aborted) throw error;
        lastError = error;
      }

      if (attempt < RETRY_DELAYS_MS.length) {
        await wait(RETRY_DELAYS_MS[attempt], init?.signal ?? undefined);
      }
    }

    pruneStableCache(lastKnownGood);
    const cached = lastKnownGood.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return responseFromCache(cached, requestId);
    }
    if (cached) lastKnownGood.delete(cacheKey);

    throw lastError;
  };

  stableGlobal[INSTALL_KEY] = true;
}
