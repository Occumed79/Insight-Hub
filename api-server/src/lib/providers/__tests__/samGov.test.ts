import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatSamGovApiError } from "../samGov";

describe("SAM.gov provider diagnostics", () => {
  it("identifies a stale environment variable as the source of API_KEY_INVALID", () => {
    const message = formatSamGovApiError(
      401,
      "<html><body><h1>API_KEY_INVALID</h1><p>An invalid API key was supplied.</p></body></html>",
      { source: "environment", key: "SAM_GOV_API_KEY" },
    );

    assert.match(message, /API_KEY_INVALID/);
    assert.match(message, /SAM_GOV_API_KEY environment variable/);
    assert.match(message, /environment variables take precedence over database settings/);
  });

  it("identifies Settings UI database credentials when they are rejected", () => {
    const message = formatSamGovApiError(
      401,
      "<html><body><h1>API_KEY_INVALID</h1></body></html>",
      { source: "database", key: "samApiKey" },
    );

    assert.match(message, /samApiKey database setting/);
  });
});
