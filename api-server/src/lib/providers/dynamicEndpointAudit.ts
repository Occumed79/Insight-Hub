import {
  fingerprintJsonEndpoint,
  type DynamicEndpointFingerprint,
} from "./nativePublicPortalDiscovery";
import {
  cloudflareBrowserCdpEndpoint,
  resolveCloudflareBrowserCredentials,
} from "./cloudflareBrowserRun";

export interface DynamicEndpointAuditOptions {
  timeoutMs?: number;
  maxResponses?: number;
  allowedApiHosts?: string[];
  searchText?: string;
  activateOpportunityTab?: boolean;
  activateFilterText?: string;
  paginateOnce?: boolean;
  signal?: AbortSignal;
}

function abortError(signal?: AbortSignal): Error {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  return new DOMException("Dynamic endpoint audit cancelled", "AbortError");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function connectBrowser(
  playwright: typeof import("playwright"),
  timeoutMs: number,
) {
  const cloudflare = await resolveCloudflareBrowserCredentials();
  if (cloudflare) {
    const endpoint = cloudflareBrowserCdpEndpoint(
      cloudflare.accountId,
      timeoutMs + 15_000,
    );
    try {
      const browser = await playwright.chromium.connectOverCDP(endpoint, {
        headers: {
          Authorization: `Bearer ${cloudflare.apiToken}`,
        },
        timeout: timeoutMs,
      });
      return { browser, backend: "cloudflare-browser-run-cdp" as const };
    } catch (error) {
      throw new Error(
        `Cloudflare Browser Run CDP connection failed: ${errorMessage(error)}`,
      );
    }
  }

  const browser = await playwright.chromium.launch({ headless: true });
  return { browser, backend: "local-playwright" as const };
}

export async function auditPublicDynamicEndpoints(
  pageUrl: string,
  options: DynamicEndpointAuditOptions = {},
): Promise<DynamicEndpointFingerprint[]> {
  if (options.signal?.aborted) throw abortError(options.signal);
  const playwright = await import("playwright");
  if (options.signal?.aborted) throw abortError(options.signal);

  const timeoutMs = Math.max(5_000, options.timeoutMs ?? 15_000);
  const { browser, backend } = await connectBrowser(playwright, timeoutMs);
  const fingerprints: DynamicEndpointFingerprint[] = [];
  const pageHost = new URL(pageUrl).hostname.replace(/^www\./, "");
  const allowedHosts = new Set([
    pageHost,
    ...(options.allowedApiHosts ?? []).map((host) =>
      host.replace(/^www\./, ""),
    ),
  ]);
  const isAllowedHost = (host: string) => {
    const normalized = host.replace(/^www\./, "");
    return [...allowedHosts].some(
      (allowed) =>
        normalized === allowed || normalized.endsWith(`.${allowed}`),
    );
  };
  const onAbort = () => {
    void browser.close().catch(() => undefined);
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });

  console.info(
    JSON.stringify({
      event: "dynamic_endpoint_browser_started",
      backend,
      pageHost,
    }),
  );

  try {
    if (options.signal?.aborted) throw abortError(options.signal);
    const defaultContext = browser.contexts()[0];
    const page = defaultContext
      ? defaultContext.pages()[0] ?? (await defaultContext.newPage())
      : await browser.newPage();

    page.on("response", async (response) => {
      try {
        if (options.signal?.aborted) return;
        if (fingerprints.length >= (options.maxResponses ?? 10)) return;
        const request = response.request();
        if (!["xhr", "fetch"].includes(request.resourceType())) return;
        const contentType = response.headers()["content-type"] ?? "";
        if (!/(json|csv|xml|html)/i.test(contentType)) return;
        const url = new URL(response.url());
        if (!isAllowedHost(url.hostname)) return;
        let sample: unknown = {};
        try {
          if (/json/i.test(contentType)) sample = await response.json();
          else sample = { fragment: (await response.text()).slice(0, 2000) };
        } catch (error) {
          sample = { parseError: String(error) };
        }
        let body: unknown;
        const post = request.postData();
        if (post) {
          try {
            body = post.trim().startsWith("{")
              ? JSON.parse(post)
              : Object.fromEntries(new URLSearchParams(post));
          } catch (error) {
            body = { parseError: String(error) };
          }
        }
        fingerprints.push(
          fingerprintJsonEndpoint(
            pageUrl,
            response.url(),
            request.method(),
            contentType,
            sample,
            body,
          ),
        );
      } catch {
        // Keep the audit bounded and resilient: one malformed endpoint should not abort the report.
      }
    });
    await page.goto(pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    if (options.signal?.aborted) throw abortError(options.signal);
    if (options.searchText) {
      const input = page
        .locator(
          'input[type="search"], input[name*=search i], input[placeholder*=search i]',
        )
        .first();
      if (await input.count()) {
        await input.fill(options.searchText, { timeout: 1000 });
        await input.press("Enter", { timeout: 1000 });
      }
    }
    if (options.signal?.aborted) throw abortError(options.signal);
    if (options.activateOpportunityTab) {
      await page
        .getByRole("tab", { name: /bid|rfp|opportunit|solicitation/i })
        .first()
        .click({ timeout: 1000 })
        .catch(() => undefined);
      await page
        .getByRole("button", { name: /bid|rfp|opportunit|solicitation/i })
        .first()
        .click({ timeout: 1000 })
        .catch(() => undefined);
    }
    if (options.signal?.aborted) throw abortError(options.signal);
    if (options.activateFilterText) {
      await page
        .getByText(options.activateFilterText, { exact: false })
        .first()
        .click({ timeout: 1000 })
        .catch(() => undefined);
    }
    if (options.signal?.aborted) throw abortError(options.signal);
    if (options.paginateOnce) {
      await page
        .getByRole("link", { name: /next|more/i })
        .first()
        .click({ timeout: 1000 })
        .catch(() => undefined);
      await page
        .getByRole("button", { name: /next|more/i })
        .first()
        .click({ timeout: 1000 })
        .catch(() => undefined);
    }
    if (options.signal?.aborted) throw abortError(options.signal);
    await page.waitForTimeout(Math.min(2000, timeoutMs));
  } catch (error) {
    if (options.signal?.aborted) throw abortError(options.signal);
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    await browser.close().catch(() => undefined);
  }
  return fingerprints;
}
