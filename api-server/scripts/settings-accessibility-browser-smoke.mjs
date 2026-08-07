import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright";

const baseUrl = process.env.INSIGHT_E2E_BASE_URL ?? "http://127.0.0.1:4173";
const browserEngine = process.env.INSIGHT_E2E_BROWSER ?? "chromium";
const browserType = { chromium, firefox, webkit }[browserEngine];
if (!browserType) throw new Error(`Unsupported INSIGHT_E2E_BROWSER: ${browserEngine}`);

async function waitForServer() {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.ok || response.status === 304) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Vite preview did not become ready at ${baseUrl}: ${
      lastError instanceof Error ? lastError.message : String(lastError ?? "unknown")
    }`,
  );
}

await waitForServer();
const browser = await browserType.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.emulateMedia({ reducedMotion: "reduce" });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

await page.route("**/api/**", async (route) => {
  const url = new URL(route.request().url());
  const path = url.pathname;
  const json = (body, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

  if (path === "/api/settings") {
    return json({
      companyProfile: "Occupational health services",
      defaultNaics: "621111",
      lookbackDays: 30,
    });
  }
  if (path === "/api/providers") return json({ providers: [] });
  return json({});
});

async function assertViewport(width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}/portal/settings`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });

  const main = page.getByRole("main");
  await main.waitFor();
  const settingsLink = page.locator('a[href="/portal/settings"]');
  await settingsLink.waitFor();
  assert.equal(
    await settingsLink.getAttribute("aria-current"),
    "page",
    `${browserEngine} Settings route must expose aria-current=page`,
  );

  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await skipLink.focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(() => document.activeElement?.id ?? null),
    "portal-main-content",
    `${browserEngine} Settings skip link must focus main content`,
  );

  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  assert.ok(
    metrics.scrollWidth <= metrics.clientWidth + 1,
    `${browserEngine} Settings overflows ${width}px viewport`,
  );
  assert.ok(
    metrics.scrollHeight >= metrics.clientHeight,
    `${browserEngine} Settings must fill/scroll the viewport`,
  );

  const unnamed = await page.locator("button:visible, input:visible, select:visible, textarea:visible").evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const element = /** @type {HTMLElement} */ (node);
        const aria = element.getAttribute("aria-label")?.trim();
        const labelledBy = element.getAttribute("aria-labelledby")?.trim();
        const title = element.getAttribute("title")?.trim();
        const text = element.textContent?.trim();
        const id = element.getAttribute("id");
        const explicitLabel = id
          ? Array.from(document.querySelectorAll("label")).some(
              (label) => label.getAttribute("for") === id && Boolean(label.textContent?.trim()),
            )
          : false;
        const wrappingLabel = Boolean(element.closest("label")?.textContent?.trim());
        return !aria && !labelledBy && !title && !text && !explicitLabel && !wrappingLabel;
      })
      .map((node) => ({
        tag: node.tagName.toLowerCase(),
        id: node.getAttribute("id"),
        type: node.getAttribute("type"),
      })),
  );
  assert.deepEqual(
    unnamed,
    [],
    `${browserEngine} Settings contains visible unnamed controls: ${JSON.stringify(unnamed)}`,
  );

  const tinyTargets = await page.locator('a[href="/portal/settings"], nav[aria-label="Intelligence workspaces"] a').evaluateAll((nodes) =>
    nodes
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          text: node.textContent?.trim() || node.getAttribute("href"),
          width: rect.width,
          height: rect.height,
        };
      })
      .filter((entry) => entry.width > 0 && entry.height > 0 && entry.height < 44),
  );
  assert.deepEqual(
    tinyTargets,
    [],
    `${browserEngine} Settings navigation contains sub-44px targets`,
  );
}

try {
  await assertViewport(390, 844);
  await assertViewport(320, 700);
  assert.deepEqual(
    pageErrors,
    [],
    `${browserEngine} emitted Settings page errors: ${pageErrors.join(" | ")}`,
  );
  console.log(
    JSON.stringify({
      event: "insight_hub_settings_accessibility_passed",
      browser: browserEngine,
      viewports: ["390x844", "320x700"],
      verified: [
        "settings-current-route",
        "settings-keyboard-skip-focus",
        "settings-mobile-overflow",
        "settings-visible-control-names",
        "settings-navigation-touch-targets",
      ],
    }),
  );
} finally {
  await browser.close();
}
