import assert from "node:assert/strict";
import test from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.APP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { isCrawlerSchedulerEnabled } = await import("../scheduler");

test("background crawler is disabled unless explicitly enabled", () => {
  const original = process.env.PUBLIC_PORTAL_CRAWLER_SCHEDULER_ENABLED;
  try {
    delete process.env.PUBLIC_PORTAL_CRAWLER_SCHEDULER_ENABLED;
    assert.equal(isCrawlerSchedulerEnabled(), false);

    process.env.PUBLIC_PORTAL_CRAWLER_SCHEDULER_ENABLED = "false";
    assert.equal(isCrawlerSchedulerEnabled(), false);

    process.env.PUBLIC_PORTAL_CRAWLER_SCHEDULER_ENABLED = "true";
    assert.equal(isCrawlerSchedulerEnabled(), true);
  } finally {
    if (original === undefined) {
      delete process.env.PUBLIC_PORTAL_CRAWLER_SCHEDULER_ENABLED;
    } else {
      process.env.PUBLIC_PORTAL_CRAWLER_SCHEDULER_ENABLED = original;
    }
  }
});
