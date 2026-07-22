import {
  fingerprintJsonEndpoint,
  type DynamicEndpointFingerprint,
} from "./nativePublicPortalDiscovery";

export interface DynamicEndpointAuditOptions {
  timeoutMs?: number;
  maxResponses?: number;
  allowedApiHosts?: string[];
  searchText?: string;
  activateOpportunityTab?: boolean;
  activateFilterText?: string;
  paginateOnce?: boolean;
}

export async function auditPublicDynamicEndpoints(
  pageUrl: string,
  options: DynamicEndpointAuditOptions = {},
): Promise<DynamicEndpointFingerprint[]> {
  const playwright = await import("playwright");
  const browser = await playwright.chromium.launch({ headless: true });
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
      (allowed) => normalized === allowed || normalized.endsWith(`.${allowed}`),
    );
  };
  try {
    const page = await browser.newPage();
    page.on("response", async (response) => {
      try {
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
      timeout: options.timeoutMs ?? 15_000,
    });
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
    if (options.activateFilterText) {
      await page
        .getByText(options.activateFilterText, { exact: false })
        .first()
        .click({ timeout: 1000 })
        .catch(() => undefined);
    }
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
    await page.waitForTimeout(Math.min(2000, options.timeoutMs ?? 2000));
  } finally {
    await browser.close();
  }
  return fingerprints;
}
