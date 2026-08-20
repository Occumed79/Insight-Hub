import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.APP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const {
  buildCanadaBuysQueries,
  internationalPublicPortalsProvider,
  isOfficialCanadaBuysTenderUrl,
} = await import("../internationalPublicPortals");

test("CanadaBuys discovery is pinned to official tender-opportunity pages", () => {
  assert.equal(
    isOfficialCanadaBuysTenderUrl(
      "https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/example",
    ),
    true,
  );
  assert.equal(
    isOfficialCanadaBuysTenderUrl(
      "https://www.canadabuys.canada.ca/en/tender-opportunities",
    ),
    true,
  );
  assert.equal(
    isOfficialCanadaBuysTenderUrl(
      "https://canadabuys.canada.ca/en/contract-history",
    ),
    false,
  );
  assert.equal(
    isOfficialCanadaBuysTenderUrl(
      "https://canadabuys.canada.ca.evil.test/en/tender-opportunities/example",
    ),
    false,
  );
});

test("CanadaBuys queries preserve the Occu-Med service ontology", () => {
  const queries = buildCanadaBuysQueries();
  assert.equal(queries.length, 2);
  assert.ok(queries.every((query: string) => query.includes("site:canadabuys.canada.ca/en/tender-opportunities")));
  assert.ok(queries.some((query: string) => /occupational health/i.test(query)));
  assert.ok(queries.some((query: string) => /medical surveillance/i.test(query)));
  assert.ok(queries.some((query: string) => /respirator fit testing/i.test(query)));
});

test("international provider is keyless-configured because TED published search is anonymous", async () => {
  assert.equal(await internationalPublicPortalsProvider.isConfigured(), true);
  const status = await internationalPublicPortalsProvider.getStatus();
  assert.equal(status.configured, true);
  assert.equal(status.healthy, true);
  assert.equal(status.recordCount, 2);
});
