import assert from "node:assert/strict";
import test from "node:test";
import {
  cloudflareBrowserCdpEndpoint,
  hasCloudflareBrowserEnvironment,
} from "../../providers/cloudflareBrowserRun";

const ENV_KEYS = [
  "CLOUDFLARE_BROWSER_ACCOUNT_ID",
  "CLOUDFLARE_BROWSER_API_TOKEN",
  "CLOUDFLARE_BROWSER_DEPLOY_TOKEN",
] as const;

function withBrowserEnvironment(
  values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
  run: () => void,
): void {
  const previous = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<(typeof ENV_KEYS)[number], string | undefined>;
  try {
    for (const key of ENV_KEYS) {
      const value = values[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Cloudflare Browser Run recognizes the deployed browser token alias", () => {
  withBrowserEnvironment(
    {
      CLOUDFLARE_BROWSER_ACCOUNT_ID: "account-123",
      CLOUDFLARE_BROWSER_DEPLOY_TOKEN: "browser-token",
    },
    () => assert.equal(hasCloudflareBrowserEnvironment(), true),
  );
});

test("Cloudflare Browser Run remains disabled when either credential is absent", () => {
  withBrowserEnvironment(
    { CLOUDFLARE_BROWSER_ACCOUNT_ID: "account-123" },
    () => assert.equal(hasCloudflareBrowserEnvironment(), false),
  );
});

test("Cloudflare Browser Run CDP endpoint clamps keep-alive to provider limits", () => {
  assert.equal(
    cloudflareBrowserCdpEndpoint("account/with space", 1),
    "wss://api.cloudflare.com/client/v4/accounts/account%2Fwith%20space/browser-rendering/devtools/browser?keep_alive=60000",
  );
  assert.equal(
    cloudflareBrowserCdpEndpoint("account-123", 999_999),
    "wss://api.cloudflare.com/client/v4/accounts/account-123/browser-rendering/devtools/browser?keep_alive=600000",
  );
});
