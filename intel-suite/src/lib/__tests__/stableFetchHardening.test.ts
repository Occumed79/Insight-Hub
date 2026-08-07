import assert from "node:assert/strict";
import test from "node:test";
import {
  installStableFetch,
  MAX_STABLE_FETCH_CACHE_BYTES,
  MAX_STABLE_FETCH_CACHE_ENTRIES,
} from "../stable-fetch";

test("stable fetch bounds fallback memory, preserves request IDs, and cancels retry backoff", async () => {
  const originalFetch = globalThis.fetch;
  let failing = false;
  const requestIds = new Map<string, string[]>();

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const url = new URL(raw, "http://localhost");
    const headers = new Headers(init?.headers);
    const requestId = headers.get("x-request-id") ?? "";
    const list = requestIds.get(url.pathname) ?? [];
    list.push(requestId);
    requestIds.set(url.pathname, list);

    if (failing) {
      return new Response(JSON.stringify({ error: "temporary" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ path: url.pathname }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    assert.ok(MAX_STABLE_FETCH_CACHE_ENTRIES <= 64);
    assert.ok(MAX_STABLE_FETCH_CACHE_BYTES <= 24 * 1024 * 1024);
    installStableFetch();

    for (let index = 0; index <= MAX_STABLE_FETCH_CACHE_ENTRIES; index += 1) {
      const response = await fetch(`/api/cache-${index}`);
      assert.equal(response.status, 200);
    }

    failing = true;

    await assert.rejects(
      () => fetch("/api/cache-0"),
      /GET \/api\/cache-0 returned HTTP 503/,
      "oldest cache entry should be evicted once the cache exceeds its bound",
    );

    const recent = await fetch(`/api/cache-${MAX_STABLE_FETCH_CACHE_ENTRIES}`);
    assert.equal(recent.status, 200);
    assert.equal(
      recent.headers.get("x-insight-hub-data-source"),
      "last-known-good",
    );

    const retryIds = requestIds.get(
      `/api/cache-${MAX_STABLE_FETCH_CACHE_ENTRIES}`,
    ) ?? [];
    const failedAttemptIds = retryIds.slice(-3);
    assert.equal(failedAttemptIds.length, 3);
    assert.ok(failedAttemptIds.every(Boolean));
    assert.equal(
      new Set(failedAttemptIds).size,
      1,
      "all retries for one logical request must carry the same request ID",
    );

    const controller = new AbortController();
    const cancelled = fetch("/api/cancel-backoff", {
      signal: controller.signal,
    });
    setTimeout(
      () =>
        controller.abort(
          new DOMException("navigation cancelled request", "AbortError"),
        ),
      10,
    );
    await assert.rejects(cancelled, /navigation cancelled request/);
    assert.equal(
      requestIds.get("/api/cancel-backoff")?.length,
      1,
      "aborting during retry backoff must prevent a second network attempt",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
