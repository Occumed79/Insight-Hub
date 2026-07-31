import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.APP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { toSerperFreeTierQuery } = await import("../serper");
const { TangoProvider } = await import("../tango");
const { OlostepProvider } = await import("../olostep");
const { SocrataProvider } = await import("../socrata");

test("Serper removes free-tier-incompatible boolean and negative operators", () => {
  const safe = toSerperFreeTierQuery(
    '("occupational health" OR "employee health") (RFP OR RFQ) site:example.gov -awarded -jobs',
  );

  assert.equal(
    safe,
    "occupational health employee health RFP RFQ",
  );
  assert.doesNotMatch(safe, /\bOR\b|[()"]|site:|-awarded|-jobs/i);
});

test("Tango uses a supported meta wildcard instead of expanding meta.notice_type", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.TANGO_API_KEY;
  let requestedUrl = "";

  process.env.TANGO_API_KEY = "test-tango-key";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const result = await new TangoProvider().fetch({
      dateRange: 30,
      limit: 1,
    });
    assert.equal(result.records.length, 0);
    const shape = new URL(requestedUrl).searchParams.get("shape") ?? "";
    assert.match(shape, /meta\(\*\)/);
    assert.doesNotMatch(shape, /meta\(notice_type/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.TANGO_API_KEY;
    else process.env.TANGO_API_KEY = originalApiKey;
  }
});

test("Olostep posts to the current v1 scrape endpoint with bearer auth", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OLOSTEP_API_KEY;
  let requestedUrl = "";
  let requestedMethod = "";
  let authorization = "";
  let requestBody: Record<string, unknown> = {};

  process.env.OLOSTEP_API_KEY = "test-olostep-key";
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedMethod = init?.method ?? "GET";
    const headers = init?.headers as Record<string, string> | undefined;
    authorization = headers?.Authorization ?? "";
    requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<
      string,
      unknown
    >;
    return new Response(
      JSON.stringify({
        url_to_scrape: "https://example.gov/rfp",
        result: {
          markdown_content: "# Occupational Health RFP",
          page_metadata: { status_code: 200 },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const text = await new OlostepProvider().getText(
      "https://example.gov/rfp",
    );
    assert.equal(requestedUrl, "https://api.olostep.com/v1/scrapes");
    assert.equal(requestedMethod, "POST");
    assert.equal(authorization, "Bearer test-olostep-key");
    assert.equal(requestBody.url_to_scrape, "https://example.gov/rfp");
    assert.deepEqual(requestBody.formats, ["markdown", "text"]);
    assert.equal(text, "# Occupational Health RFP");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.OLOSTEP_API_KEY;
    else process.env.OLOSTEP_API_KEY = originalApiKey;
  }
});

test("Socrata accepts the configured app token without requiring an API key pair", async () => {
  const originalFetch = globalThis.fetch;
  const originalAppToken = process.env.SOCRATA_APP_TOKEN;
  const originalApiKey = process.env.SOCRATA_API_KEY;
  const originalApiSecret = process.env.SOCRATA_API_SECRET;
  let appToken = "";
  let authorization = "";

  process.env.SOCRATA_APP_TOKEN = "test-socrata-app-token";
  delete process.env.SOCRATA_API_KEY;
  delete process.env.SOCRATA_API_SECRET;
  globalThis.fetch = async (_input, init) => {
    const headers = init?.headers as Record<string, string> | undefined;
    appToken = headers?.["X-App-Token"] ?? "";
    authorization = headers?.Authorization ?? "";
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const provider = new SocrataProvider();
    assert.equal(await provider.isConfigured(), true);
    const results = await provider.search("occupational health procurement");
    assert.deepEqual(results, []);
    assert.equal(appToken, "test-socrata-app-token");
    assert.equal(authorization, "");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAppToken === undefined) delete process.env.SOCRATA_APP_TOKEN;
    else process.env.SOCRATA_APP_TOKEN = originalAppToken;
    if (originalApiKey === undefined) delete process.env.SOCRATA_API_KEY;
    else process.env.SOCRATA_API_KEY = originalApiKey;
    if (originalApiSecret === undefined) delete process.env.SOCRATA_API_SECRET;
    else process.env.SOCRATA_API_SECRET = originalApiSecret;
  }
});
