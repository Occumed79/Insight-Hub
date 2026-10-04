import "../../search/__tests__/support/useFixtureProfile";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { TangoProvider } from "../tango";

const realFetch = globalThis.fetch;
const requests: URL[] = [];

function opportunity(id: string) {
  return {
    opportunity_id: id,
    title: `Occupational health services ${id}`,
    active: true,
    first_notice_date: "2026-09-20",
    response_deadline: "2026-11-30",
    office: { agency_name: "DEPT OF VETERANS AFFAIRS" },
    sam_url: `https://sam.gov/opp/${id}/view`,
  };
}

function mockTango(handler: (url: URL) => { status?: number; results?: unknown[] }) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requests.push(url);
    const { status = 200, results = [] } = handler(url);
    return new Response(
      JSON.stringify(status === 200 ? { count: results.length, next: null, previous: null, results } : { detail: "err" }),
      { status, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
}

describe("Tango targeted queries", () => {
  beforeEach(() => {
    requests.length = 0;
    process.env.TANGO_API_KEY = "test-key";
    process.env.TANGO_BASE_URL = "https://tango.test/api/";
    delete process.env.TANGO_CODE_QUERIES;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.TANGO_API_KEY;
    delete process.env.TANGO_BASE_URL;
  });

  it("asks for what Occu-Med buys: NAICS, PSC and semantic queries, not everything", async () => {
    mockTango(() => ({ results: [opportunity("a")] }));
    const result = await new TangoProvider().fetch({ dateRange: 30, limit: 100 });

    const labels = result.diagnostics?.queries as string[];
    assert.deepEqual(labels, ["naics", "psc", "semantic"]);
    const naicsRequest = requests.find((url) => url.searchParams.has("naics"));
    const pscRequest = requests.find((url) => url.searchParams.has("psc"));
    const searchRequest = requests.find((url) => url.searchParams.has("search"));
    assert.ok(naicsRequest?.searchParams.get("naics")?.includes("|"), "naics is multi-value");
    assert.ok(pscRequest?.searchParams.get("psc"));
    assert.match(searchRequest?.searchParams.get("search") ?? "", /occupational health/i);
    // Every request keeps the open-notice guards.
    for (const url of requests) {
      assert.equal(url.searchParams.get("active"), "true");
      assert.equal(url.searchParams.get("notice_type"), "o|k");
      assert.ok(url.searchParams.get("response_deadline_after"));
    }
  });

  it("de-duplicates a notice returned by several queries and tags which query found it", async () => {
    mockTango(() => ({ results: [opportunity("same")] }));
    const result = await new TangoProvider().fetch({ dateRange: 30, limit: 100 });
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0]!.rawData?.tangoQuery, "naics");
  });

  it("uses the user's keywords as the only query when given", async () => {
    mockTango(() => ({ results: [opportunity("k")] }));
    const result = await new TangoProvider().fetch({ dateRange: 30, limit: 100, keywords: "audiometry" });
    assert.deepEqual(result.diagnostics?.queries, ["keywords"]);
    assert.equal(requests[0]!.searchParams.get("search"), "audiometry");
    assert.equal(requests[0]!.searchParams.has("naics"), false);
  });

  it("keeps results when one query fails, and throws only when every query fails", async () => {
    mockTango((url) => (url.searchParams.has("psc") ? { status: 400 } : { results: [opportunity(url.searchParams.has("naics") ? "n" : "s")] }));
    const partial = await new TangoProvider().fetch({ dateRange: 30, limit: 100 });
    assert.equal(partial.records.length, 2);
    assert.ok(partial.errors.some((error) => /psc query/.test(error)));

    mockTango(() => ({ status: 400 }));
    await assert.rejects(() => new TangoProvider().fetch({ dateRange: 30, limit: 100 }), /Tango API error 400/);
  });

  it("can fall back to a single unfiltered query", async () => {
    process.env.TANGO_CODE_QUERIES = "false";
    mockTango(() => ({ results: [opportunity("u")] }));
    const result = await new TangoProvider().fetch({ dateRange: 30, limit: 100 });
    assert.deepEqual(result.diagnostics?.queries, ["unfiltered"]);
    assert.equal(requests.length, 1);
  });
});
