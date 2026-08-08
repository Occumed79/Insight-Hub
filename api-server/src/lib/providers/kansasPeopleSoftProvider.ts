import type {
  DataSourceProvider,
  FetchOptions,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { OfficialPlatformSession } from "./officialPlatformSession";
import {
  PEOPLESOFT_TENANTS,
  peopleSoftPublicProviders,
} from "./peopleSoftPublic";

const KANSAS_PORTAL_ID = "ks-esupplier";
const KANSAS_BROWSER_CHALLENGE_BODY =
  /SOK eSupplier Redirect|cookies enabled|PeopleSoft Sign-in|Return to Sign In with cookies enabled/i;
const KANSAS_BROWSER_CHALLENGE_URL =
  /[?&](?:errorPg=ckreq|errorCode=999)(?:&|$)|[?&]cmd=login(?:&|$)/i;

export interface KansasPeopleSoftChallengeProbe {
  challenged: boolean;
  finalUrl?: string;
}

function safePath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`.slice(0, 320);
  } catch {
    return value.slice(0, 320);
  }
}

export function isKansasPeopleSoftBrowserChallenge(input: {
  body?: string;
  url?: string;
}): boolean {
  return (
    KANSAS_BROWSER_CHALLENGE_BODY.test(input.body ?? "") ||
    KANSAS_BROWSER_CHALLENGE_URL.test(input.url ?? "")
  );
}

export async function probeKansasPeopleSoftBrowserChallenge(
  signal?: AbortSignal,
): Promise<KansasPeopleSoftChallengeProbe> {
  const tenant = PEOPLESOFT_TENANTS.find(
    (candidate) => candidate.portalId === KANSAS_PORTAL_ID,
  );
  if (!tenant) return { challenged: false };

  const origin = new URL(tenant.listingUrl).origin;
  const session = new OfficialPlatformSession(
    [origin],
    "Kansas PeopleSoft challenge probe",
  );
  try {
    const response = await session.requestText(tenant.listingUrl, {
      timeoutMs: 12_000,
      maxRetries: 0,
      signal,
    });
    return {
      challenged: isKansasPeopleSoftBrowserChallenge({
        body: response.body,
        url: response.url,
      }),
      finalUrl: response.url,
    };
  } catch {
    // A network failure is not evidence of a browser/session challenge. Preserve
    // the underlying provider result rather than hiding a real endpoint failure.
    return { challenged: false };
  }
}

export class KansasPeopleSoftChallengeAwareProvider
  implements DataSourceProvider
{
  readonly name = "publicPortalProviders" as const;

  constructor(
    readonly baseProvider: DataSourceProvider,
    private readonly challengeProbe: (
      signal?: AbortSignal,
    ) => Promise<KansasPeopleSoftChallengeProbe> =
      probeKansasPeopleSoftBrowserChallenge,
  ) {}

  async isConfigured(): Promise<boolean> {
    return this.baseProvider.isConfigured();
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const result = await this.baseProvider.fetch(options);
    if (result.records.length > 0 || result.errors.length === 0) return result;
    if (!result.errors.some((error) => /no parseable opportunity rows/i.test(error))) {
      return result;
    }

    const probe = await this.challengeProbe(options.signal);
    if (!probe.challenged) return result;

    const finalPath = safePath(probe.finalUrl);
    return {
      records: [],
      total: 0,
      errors: [
        `${KANSAS_PORTAL_ID}: browser/login challenge — the public Kansas eSupplier route redirects fresh HTTP sessions to the PeopleSoft session gate${finalPath ? ` (${finalPath})` : ""}.`,
      ],
    };
  }

  async getStatus(): Promise<ProviderStatus> {
    return this.baseProvider.getStatus();
  }
}

const baseKansasProvider = peopleSoftPublicProviders[KANSAS_PORTAL_ID];
if (!baseKansasProvider) {
  throw new Error("Kansas PeopleSoft base provider is not registered");
}

export const kansasPeopleSoftProvider =
  new KansasPeopleSoftChallengeAwareProvider(baseKansasProvider);
