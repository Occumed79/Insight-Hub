import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeCrawlerUrl, makeCrawlerFetcher } from "../safety";
import { DEFAULT_CRAWL_LIMITS } from "../types";

test("crawler preserves the catalog hostname after allowlist comparison", () => {
  assert.equal(
    canonicalizeCrawlerUrl(
      "https://www.agency.gov/bids/#open",
      "https://www.agency.gov/bids/",
      ["agency.gov"],
    ),
    "https://www.agency.gov/bids",
  );
});

test("crawler rejects robots-disallowed targets before requesting them", async () => {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    requested.push(url);
    if (url === "https://robots-blocked.example.gov/robots.txt") {
      return new Response("User-agent: *\nDisallow: /private\n", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }
    throw new Error(`Target page should not have been requested: ${url}`);
  }) as typeof fetch;

  try {
    const fetchText = makeCrawlerFetcher({
      limits: {
        ...DEFAULT_CRAWL_LIMITS,
        minDomainIntervalMs: 0,
        maxRetries: 0,
      },
      allowedHosts: ["robots-blocked.example.gov"],
    });
    await assert.rejects(
      () =>
        fetchText(
          "https://robots-blocked.example.gov/private/opportunities",
        ),
      /robots disallow/,
    );
    assert.deepEqual(requested, [
      "https://robots-blocked.example.gov/robots.txt",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
