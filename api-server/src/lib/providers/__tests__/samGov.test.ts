import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatSamGovApiError } from "../samGov";

describe("SAM.gov provider diagnostics", () => {
  it("marks API_KEY_INVALID as recoverable and identifies its environment source", () => {
    const message = formatSamGovApiError(
      401,
      "<html><body><h1>API_KEY_INVALID</h1><p>An invalid API key was supplied.</p></body></html>",
      { source: "environment", key: "SAM_GOV_API_KEY" },
    );

    assert.match(message, /SAM_API_KEY_NOT_CONFIGURED_OR_INVALID/);
    assert.match(message, /SAM_GOV_API_KEY environment variable/);
    assert.match(message, /Falling back to official public SAM\.gov opportunity pages/);
  });

  it("marks GSA 900901 Invalid Credentials responses as recoverable", () => {
    const message = formatSamGovApiError(
      401,
      '{"code":"900901","message":"Invalid Credentials","description":"Invalid Credentials. Make sure you have provided the correct security credentials"}',
      { source: "environment", key: "SAM_GOV_API_KEY" },
    );

    assert.match(message, /SAM_API_KEY_NOT_CONFIGURED_OR_INVALID/);
    assert.match(message, /SAM\.gov API error 401/);
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
