import assert from "node:assert/strict";
import test from "node:test";

import type { PublicPortalSource } from "../../providers/publicPortalProviders/catalog";
import {
  defaultSpiderConfigForSource,
  getSpider,
  initializeCrawlerSpiders,
  listSpiderKinds,
  registerSpiderConfig,
  resetSpiderRegistryForTests,
  resolveSpiderConfig,
} from "../index";
import { FeedSpider } from "../spiders/feedSpider";
import { JsonEndpointSpider } from "../spiders/jsonEndpointSpider";
import type {
  FeedSpiderConfig,
  JsonEndpointSpiderConfig,
  SpiderRunContext,
} from "../types";

function source(scraperType: PublicPortalSource["scraperType"]): PublicPortalSource {
  return {
    id: `test-${scraperType}`,
    agencyName: "Test Procurement Office",
    agencyType: "state",
    state: "CA",
    sourceUrl: "https://procurement.example.gov/opportunities",
    searchUrl: "https://procurement.example.gov/opportunities",
    domain: "procurement.example.gov",
    sourceLevel: "state",
    scraperType,
    enabled: true,
    verificationStatus: "verified",
  };
}

function limits() {
  return {
    maxPages: 2,
    maxUrls: 10,
    maxBytes: 100_000,
    maxDepth: 1,
    maxRedirects: 1,
    requestTimeoutMs: 1_000,
    elapsedMs: 5_000,
    minDomainIntervalMs: 0,
    maxRetries: 0,
  };
}

const RSS_ITEM = `<?xml version="1.0"?><rss><channel><item><guid>item-1</guid><title>Pre-employment Medical Examination Services</title><link>https://procurement.example.gov/bids/1</link><description>Physical examinations and fitness-for-duty testing</description><pubDate>2026-07-20T00:00:00Z</pubDate><deadline>2026-08-01T00:00:00Z</deadline></item></channel></rss>`;

test("crawler registers all six requested spider kinds", () => {
  resetSpiderRegistryForTests();
  initializeCrawlerSpiders();
  assert.deepEqual(listSpiderKinds(), [
    "browser_discovery",
    "document",
    "feed",
    "json_endpoint",
    "portal_family",
    "static_listing",
  ]);
  for (const kind of listSpiderKinds()) assert.ok(getSpider(kind));
});

test("portal-family config delegates while preserving source-specific URLs", () => {
  resetSpiderRegistryForTests();
  initializeCrawlerSpiders();
  registerSpiderConfig({
    id: "family-template",
    sourceId: "template",
    kind: "static_listing",
    enabled: true,
    startUrls: ["https://template.example.gov/bids"],
    allowedHosts: ["template.example.gov"],
  });
  const family = {
    id: "city-member",
    sourceId: "city-member",
    kind: "portal_family" as const,
    family: "civic-family",
    delegateSpiderId: "family-template",
    enabled: true,
    startUrls: ["https://city.example.gov/bids"],
    allowedHosts: ["city.example.gov"],
  };
  const resolved = resolveSpiderConfig(family);
  assert.equal(resolved.kind, "static_listing");
  assert.equal(resolved.id, "city-member");
  assert.deepEqual(resolved.startUrls, ["https://city.example.gov/bids"]);
  assert.deepEqual(resolved.allowedHosts, ["city.example.gov"]);
});

test("catalog static document and feed sources use shared portal-family templates", () => {
  resetSpiderRegistryForTests();
  initializeCrawlerSpiders();
  const cases: Array<[
    PublicPortalSource["scraperType"],
    "static_listing" | "document" | "feed",
  ]> = [
    ["static_html", "static_listing"],
    ["scrapy", "static_listing"],
    ["pdf_links", "document"],
    ["rss", "feed"],
  ];

  for (const [scraperType, expectedKind] of cases) {
    const config = defaultSpiderConfigForSource(source(scraperType));
    assert.ok(config, `missing generated config for ${scraperType}`);
    assert.equal(config.kind, "portal_family");
    registerSpiderConfig(config);
    const resolved = resolveSpiderConfig(config);
    assert.equal(resolved.kind, expectedKind);
    assert.deepEqual(resolved.allowedHosts, ["procurement.example.gov"]);
    assert.deepEqual(resolved.startUrls, [
      "https://procurement.example.gov/opportunities",
    ]);
  }
});

test("JSON endpoint spider maps common procurement fields", async () => {
  const portal = source("public_json");
  const config: JsonEndpointSpiderConfig = {
    id: "json-test",
    sourceId: portal.id,
    kind: "json_endpoint",
    enabled: true,
    startUrls: ["https://procurement.example.gov/api/opportunities"],
    allowedHosts: ["procurement.example.gov"],
    endpointUrl: "https://procurement.example.gov/api/opportunities",
    pagination: { mode: "none" },
    fields: {
      id: ["id"],
      title: ["title"],
      agency: ["agency"],
      description: ["description"],
      solicitationNumber: ["number"],
      postedDate: ["posted"],
      responseDeadline: ["deadline"],
      detailUrl: ["url"],
    },
  };
  const spider = new JsonEndpointSpider();
  const context: SpiderRunContext = {
    source: portal,
    config,
    limits: limits(),
    fetchText: async (url) => ({
      url,
      status: 200,
      contentType: "application/json",
      text: JSON.stringify({
        results: [
          {
            id: "abc",
            title: "Occupational Health Medical Surveillance Services",
            agency: "Example Agency",
            description: "Employee physical examinations and drug testing",
            number: "RFP-100",
            posted: "2026-07-20T00:00:00Z",
            deadline: "2026-08-20T00:00:00Z",
            url: "/opportunities/abc",
          },
        ],
      }),
      notModified: false,
    }),
    recordDiscoveredUrl: () => undefined,
  };
  const result = await spider.run(context);
  assert.equal(result.outcome, "success");
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]?.solicitationNumber, "RFP-100");
  assert.equal(
    result.records[0]?.sourceUrl,
    "https://procurement.example.gov/opportunities/abc",
  );
});

test("feed spider parses RSS and Atom opportunity entries", async () => {
  const portal = source("rss");
  const config: FeedSpiderConfig = {
    id: "feed-test",
    sourceId: portal.id,
    kind: "feed",
    enabled: true,
    startUrls: ["https://procurement.example.gov/feed.xml"],
    allowedHosts: ["procurement.example.gov"],
  };
  const spider = new FeedSpider();
  const context: SpiderRunContext = {
    source: portal,
    config,
    limits: limits(),
    fetchText: async (url) => ({
      url,
      status: 200,
      contentType: "application/rss+xml",
      text: RSS_ITEM,
      notModified: false,
    }),
    recordDiscoveredUrl: () => undefined,
  };
  const result = await spider.run(context);
  assert.equal(result.outcome, "success");
  assert.equal(result.records.length, 1);
  assert.match(result.records[0]?.title ?? "", /Pre-employment/);
});

test("feed spider retains records collected before the crawl deadline", async () => {
  const portal = source("rss");
  const config: FeedSpiderConfig = {
    id: "feed-partial-test",
    sourceId: portal.id,
    kind: "feed",
    enabled: true,
    startUrls: [
      "https://procurement.example.gov/feed-1.xml",
      "https://procurement.example.gov/feed-2.xml",
    ],
    allowedHosts: ["procurement.example.gov"],
  };
  const controller = new AbortController();
  let calls = 0;
  const result = await new FeedSpider().run({
    source: portal,
    config,
    limits: limits(),
    signal: controller.signal,
    fetchText: async (url) => {
      calls += 1;
      controller.abort(
        new DOMException("Request timed out after 5ms", "TimeoutError"),
      );
      return {
        url,
        status: 200,
        contentType: "application/rss+xml",
        text: RSS_ITEM,
        notModified: false,
      };
    },
    recordDiscoveredUrl: () => undefined,
  });

  assert.equal(calls, 1);
  assert.equal(result.outcome, "success");
  assert.equal(result.records.length, 1);
  assert.match(result.diagnostics.errors.join(" "), /timed out/i);
});
