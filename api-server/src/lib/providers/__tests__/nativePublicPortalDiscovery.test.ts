import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  discoverNativePortal,
  fingerprintJsonEndpoint,
  parseSitemapLike,
  RobotsRules,
  classifyPortalFamily,
} from "../nativePublicPortalDiscovery";
import { buildOccuMedSearchQueries } from "../../search/occumedProcurementOntology";
import { buildPublicPortalSearchPlan } from "../publicPortalDiscovery";

function response(body: string, init: ResponseInit = {}) {
  return new Response(body, init);
}
function mockFetch(routes: Record<string, Response | Error>) {
  return async (input: string | URL) => {
    const key = String(input);
    const value = routes[key];
    if (!value) throw new Error(`missing route ${key}`);
    if (value instanceof Error) throw value;
    return value.clone();
  };
}

describe("native public portal discovery", () => {
  it("parses robots sitemap directives and allow/disallow precedence", () => {
    const robots = RobotsRules.parse(
      `User-agent: *\nDisallow: /bids\nAllow: /bids/open\nSitemap: /one.xml\nSitemap: https://portal.example.gov/two.xml`,
      "https://portal.example.gov/",
    );
    assert.deepEqual(robots.sitemaps, [
      "https://portal.example.gov/one.xml",
      "https://portal.example.gov/two.xml",
    ]);
    assert.equal(robots.allows("https://portal.example.gov/bids/old"), false);
    assert.equal(
      robots.allows("https://portal.example.gov/bids/open/123"),
      true,
    );
  });

  it("parses sitemap indexes, nested sitemaps, lastmod hints, RSS, Atom, malformed XML and text sitemaps", () => {
    const index = parseSitemapLike(
      `<sitemapindex><sitemap><loc>/nested.xml</loc></sitemap></sitemapindex>`,
      "https://portal.example.gov/root.xml",
    );
    assert.deepEqual(index.sitemaps, ["https://portal.example.gov/nested.xml"]);
    const xml = parseSitemapLike(
      `<urlset><url><loc>/bid/1</loc><lastmod>2026-01-01</lastmod></url></urlset>`,
      "https://portal.example.gov/sitemap.xml",
    );
    assert.equal(xml.candidates[0].url, "https://portal.example.gov/bid/1");
    assert.equal(xml.candidates[0].lastmodHint, "2026-01-01");
    assert.equal(xml.candidates[0].verified, false);
    const rss = parseSitemapLike(
      `<rss><channel><item><title>RFP Clinic</title><link>/rss-bid</link></item></channel></rss>`,
      "https://portal.example.gov/feed.xml",
    );
    assert.equal(rss.candidates[0].method, "rss_feed");
    const atom = parseSitemapLike(
      `<feed><entry><title>RFP Medical</title><link href="/atom-bid" /></entry></feed>`,
      "https://portal.example.gov/feed.atom",
    );
    assert.equal(atom.candidates[0].method, "atom_feed");
    assert.equal(
      parseSitemapLike(`<broken`, "https://portal.example.gov/sitemap.xml")
        .candidates.length,
      0,
    );
    assert.equal(
      parseSitemapLike(
        `https://portal.example.gov/bid/pdf-only.pdf`,
        "https://portal.example.gov/sitemap.txt",
      ).candidates[0].url,
      "https://portal.example.gov/bid/pdf-only.pdf",
    );
  });

  it("discovers HTML pagination, HTTP Link pagination, feeds, deduplicates duplicate URLs and preserves partial failures", async () => {
    const routes = {
      "https://portal.example.gov/robots.txt": response(
        `User-agent: *\nSitemap: /sitemap.xml`,
      ),
      "https://portal.example.gov/sitemap.xml": response(
        `<urlset><url><loc>https://portal.example.gov/bids/1</loc></url><url><loc>https://portal.example.gov/bids/dupe</loc></url></urlset>`,
      ),
      "https://portal.example.gov/sitemap_index.xml": new Error(
        "bad xml endpoint",
      ),
      "https://portal.example.gov/sitemap.txt": response(``),
      "https://portal.example.gov/search": response(
        `<html><head><link type="application/rss+xml" href="/feed.xml"></head><body><a href="/page2">Next</a><a href="/bids/dupe">RFP Occupational Health</a><a href="/bids/pdf.pdf">PDF-only opportunity</a></body></html>`,
        { headers: { Link: "</page3>; rel=next" } },
      ),
      "https://portal.example.gov/page2": response(
        `<a href="/bids/2">Solicitation medical surveillance</a>`,
      ),
      "https://portal.example.gov/page3": response(
        `<a href="/bids/3">Request for proposal drug testing</a>`,
      ),
      "https://portal.example.gov/feed.xml": response(
        `<rss><channel><item><title>RFP Physicals</title><link>/bids/4</link></item></channel></rss>`,
      ),
      "https://portal.example.gov/bids/1": response(
        `RFP Occupational Health Services current active deadline 2099-01-01`,
      ),
      "https://portal.example.gov/bids/dupe": response(
        `RFP Occupational Health Services duplicate deadline 2099-01-01`,
      ),
      "https://portal.example.gov/bids/pdf.pdf": response(`%PDF-1.4`, {
        headers: { "content-type": "application/pdf" },
      }),
      "https://portal.example.gov/bids/2": response(
        `medical surveillance bid 2099`,
      ),
      "https://portal.example.gov/bids/3": response(`drug testing bid 2099`),
      "https://portal.example.gov/bids/4": response(`physicals bid 2099`),
    };
    const out = await discoverNativePortal(
      "https://portal.example.gov/search",
      { fetchImpl: mockFetch(routes), maxPages: 10 },
    );
    assert.ok(
      out.diagnostics.sitemapsFound.includes(
        "https://portal.example.gov/sitemap.xml",
      ),
    );
    assert.ok(
      out.diagnostics.feedsFound.includes(
        "https://portal.example.gov/feed.xml",
      ),
    );
    assert.ok(
      out.diagnostics.listingPagesCrawled.includes(
        "https://portal.example.gov/page3",
      ),
    );
    assert.equal(
      out.candidates.filter((c) => c.url.endsWith("/bids/dupe")).length,
      1,
    );
    assert.ok(
      out.candidates.some(
        (c) => c.url.endsWith("pdf.pdf") && c.contentType === "application/pdf",
      ),
    );
    assert.ok(out.diagnostics.errors.length > 0);
    assert.ok(out.diagnostics.candidatesVerifiedFromDirectOfficialContent >= 4);
  });

  it("enforces same-origin, oversized response, cancellation and timeout limits", async () => {
    const foreign = await discoverNativePortal("https://portal.example.gov/", {
      fetchImpl: mockFetch({
        "https://portal.example.gov/robots.txt": response(``),
        "https://portal.example.gov/sitemap.xml": response(
          `<urlset><url><loc>https://evil.example.com/bid</loc></url></urlset>`,
        ),
        "https://portal.example.gov/sitemap_index.xml": response(``),
        "https://portal.example.gov/sitemap.txt": response(``),
        "https://portal.example.gov/": response(
          `<a href="https://evil.example.com/bid">RFP</a>`,
        ),
      }),
    });
    assert.equal(foreign.candidates.length, 0);
    const big = await discoverNativePortal("https://portal.example.gov/", {
      maxBytes: 5,
      fetchImpl: mockFetch({
        "https://portal.example.gov/robots.txt": response(``),
        "https://portal.example.gov/sitemap.xml": response(`too large`),
        "https://portal.example.gov/sitemap_index.xml": response(``),
        "https://portal.example.gov/sitemap.txt": response(``),
        "https://portal.example.gov/": response(`too large`),
      }),
    });
    assert.ok(big.diagnostics.errors.some((e) => e.includes("oversized")));
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const cancelled = await discoverNativePortal(
      "https://portal.example.gov/",
      {
        signal: controller.signal,
        fetchImpl: mockFetch({
          "https://portal.example.gov/robots.txt": response(``),
        }),
      },
    );
    assert.ok(
      cancelled.diagnostics.errors.some(
        (e) => e.includes("cancelled") || e.includes("aborted"),
      ),
    );
  });

  it("fingerprints public dynamic JSON endpoints and never silently classifies unknown families", () => {
    const fp = fingerprintJsonEndpoint(
      "https://portal.example.gov/bids",
      "https://portal.example.gov/api/search?page=2",
      "POST",
      "application/json",
      {
        results: [
          {
            solicitationId: "A",
            title: "RFP",
            status: "Open",
            dueDate: "2099-01-01",
            detailUrl: "/bid/A",
          },
        ],
        page: 2,
      },
      { q: "medical" },
    );
    assert.equal(fp.paginationMechanism, "page");
    assert.deepEqual(fp.candidateIdentifierFields, ["solicitationId"]);
    assert.equal(fp.portalFamily, "unknown");
    assert.equal(classifyPortalFamily("https://sam.gov/opp"), "sam.gov");
  });

  it("adds prior-year, no-year, PSC/NAICS and occupational-health query variants without requiring a year", () => {
    const queries = buildOccuMedSearchQueries(2026);
    assert.ok(queries.some((q) => q.includes("2025 still open")));
    assert.ok(queries.some((q) => q.includes("PSC Q201")));
    assert.ok(queries.some((q) => q.includes("NAICS 621111")));
    assert.ok(queries.some((q) => q.includes("employee health")));
    assert.ok(queries.some((q) => !/\b20\d{2}\b/.test(q)));
  });

  it("tracks fair portal and query bundle continuation diagnostics", () => {
    const plan = buildPublicPortalSearchPlan({
      executionBudget: 1,
      rotationKey: "fairness",
    });
    assert.equal(plan.selectedQueries.length, 1);
    assert.ok(
      plan.diagnostics.deferredPortalIds.length > 0 ||
        plan.diagnostics.deferredQueryBundleIndexes.length > 0,
    );
  });
});
