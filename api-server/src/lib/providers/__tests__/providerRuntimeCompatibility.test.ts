import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.APP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { toSerperFreeTierQuery, SerperProvider } = await import("../serper");
const { TangoProvider } = await import("../tango");
const { OlostepProvider } = await import("../olostep");
const { JinaProvider } = await import("../jina");
const { SocrataProvider } = await import("../socrata");

test("Serper compatibility helper remains stable while the provider is retired", async () => {
  const safe = toSerperFreeTierQuery(
    '("occupational health" OR "employee health") (RFP OR RFQ) site:example.gov -awarded -jobs',
  );

  assert.equal(safe, "occupational health employee health RFP RFQ");
  assert.doesNotMatch(safe, /\bOR\b|[()"]|site:|-awarded|-jobs/i);

  const provider = new SerperProvider();
  assert.equal(await provider.isConfigured(), false);
  assert.deepEqual(await provider.search("occupational health RFP"), []);
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

test("OloStep is permanently retired and never makes a network request", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OLOSTEP_API_KEY;
  let called = false;

  process.env.OLOSTEP_API_KEY = "test-olostep-key";
  globalThis.fetch = async () => {
    called = true;
    throw new Error("OloStep network call should never happen");
  };

  try {
    const provider = new OlostepProvider();
    assert.equal(await provider.isConfigured(), false);
    assert.equal(await provider.getText("https://example.gov/rfp"), null);
    assert.deepEqual(await provider.scrapeMany(["https://example.gov/rfp"]), []);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.OLOSTEP_API_KEY;
    else process.env.OLOSTEP_API_KEY = originalApiKey;
  }
});

test("Jina Reader works keyless and attaches the key only when available", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.JINA_API_KEY;
  const authorizations: string[] = [];

  globalThis.fetch = async (_input, init) => {
    const headers = init?.headers as Record<string, string> | undefined;
    authorizations.push(headers?.Authorization ?? "");
    return new Response("# Occupational Health RFP\nOpen solicitation", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  };

  try {
    delete process.env.JINA_API_KEY;
    const provider = new JinaProvider();
    assert.equal(await provider.isConfigured(), true);
    assert.match(
      (await provider.extractUrl("https://example.gov/rfp")) ?? "",
      /Occupational Health RFP/,
    );
    assert.equal(authorizations[0], "");

    process.env.JINA_API_KEY = "test-jina-key";
    assert.match(
      (await provider.extractUrl("https://example.gov/rfp")) ?? "",
      /Occupational Health RFP/,
    );
    assert.equal(authorizations[1], "Bearer test-jina-key");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.JINA_API_KEY;
    else process.env.JINA_API_KEY = originalApiKey;
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
