import { resolveCredential } from "../config/providerConfig";

const CLOUDFLARE_BROWSER_CDP_BASE = "wss://api.cloudflare.com/client/v4/accounts";
const MIN_KEEP_ALIVE_MS = 60_000;
const MAX_KEEP_ALIVE_MS = 600_000;

export interface CloudflareBrowserCredentials {
  accountId: string;
  apiToken: string;
}

function nonEmpty(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

/**
 * Render uses the existing *_DEPLOY_TOKEN name for the browser-specific token.
 * Prefer the clearer *_API_TOKEN name when it is present, while retaining the
 * deployed name as a backward-compatible alias.
 */
export function hasCloudflareBrowserEnvironment(): boolean {
  const accountId = nonEmpty(process.env.CLOUDFLARE_BROWSER_ACCOUNT_ID);
  const apiToken =
    nonEmpty(process.env.CLOUDFLARE_BROWSER_API_TOKEN) ??
    nonEmpty(process.env.CLOUDFLARE_BROWSER_DEPLOY_TOKEN);
  return Boolean(accountId && apiToken);
}

export async function resolveCloudflareBrowserCredentials(): Promise<CloudflareBrowserCredentials | null> {
  const [accountId, preferredToken, legacyToken] = await Promise.all([
    resolveCredential(
      "cloudflareBrowserAccountId",
      "CLOUDFLARE_BROWSER_ACCOUNT_ID",
    ),
    resolveCredential(
      "cloudflareBrowserApiToken",
      "CLOUDFLARE_BROWSER_API_TOKEN",
    ),
    resolveCredential(
      "cloudflareBrowserDeployToken",
      "CLOUDFLARE_BROWSER_DEPLOY_TOKEN",
    ),
  ]);
  const apiToken = preferredToken ?? legacyToken;
  return accountId && apiToken ? { accountId, apiToken } : null;
}

export function cloudflareBrowserCdpEndpoint(
  accountId: string,
  requestedKeepAliveMs: number,
): string {
  const keepAliveMs = Math.min(
    MAX_KEEP_ALIVE_MS,
    Math.max(MIN_KEEP_ALIVE_MS, Math.floor(requestedKeepAliveMs)),
  );
  return `${CLOUDFLARE_BROWSER_CDP_BASE}/${encodeURIComponent(accountId)}/browser-rendering/devtools/browser?keep_alive=${keepAliveMs}`;
}
