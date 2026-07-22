import {
  fingerprintJsonEndpoint,
  type DynamicEndpointFingerprint,
} from "./nativePublicPortalDiscovery";

export async function auditPublicDynamicEndpoints(
  pageUrl: string,
  options: { timeoutMs?: number; maxResponses?: number } = {},
): Promise<DynamicEndpointFingerprint[]> {
  const playwright = await import("playwright");
  const browser = await playwright.chromium.launch({ headless: true });
  const fingerprints: DynamicEndpointFingerprint[] = [];
  try {
    const page = await browser.newPage();
    page.on("response", async (response) => {
      if (fingerprints.length >= (options.maxResponses ?? 10)) return;
      const request = response.request();
      if (!["xhr", "fetch"].includes(request.resourceType())) return;
      const contentType = response.headers()["content-type"] ?? "";
      if (!/(json|csv|xml|html)/i.test(contentType)) return;
      const url = new URL(response.url());
      const pageHost = new URL(pageUrl).hostname.replace(/^www\./, "");
      const responseHost = url.hostname.replace(/^www\./, "");
      if (responseHost !== pageHost && !responseHost.endsWith(`.${pageHost}`))
        return;
      let sample: unknown = {};
      if (/json/i.test(contentType)) sample = await response.json();
      else sample = { fragment: (await response.text()).slice(0, 2000) };
      let body: unknown;
      const post = request.postData();
      if (post)
        body = post.trim().startsWith("{")
          ? JSON.parse(post)
          : Object.fromEntries(new URLSearchParams(post));
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
    });
    await page.goto(pageUrl, {
      waitUntil: "networkidle",
      timeout: options.timeoutMs ?? 15_000,
    });
    await page.waitForTimeout(Math.min(2000, options.timeoutMs ?? 2000));
  } finally {
    await browser.close();
  }
  return fingerprints;
}
