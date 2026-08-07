import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.INSIGHT_E2E_BASE_URL ?? "http://127.0.0.1:4173";

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

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

let notRelevant = false;
const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();

await page.route("**/api/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;

  const json = (body, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

  if (path === "/api/opportunities/ingestion-runs/current") {
    return json({ run: null });
  }
  if (path === "/api/settings") return json({});
  if (path === "/api/providers") return json({ providers: [] });

  if (path === "/api/opportunities" && request.method() === "GET") {
    const view = url.searchParams.get("view") ?? "actionable";
    const rows =
      notRelevant && view !== "all"
        ? []
        : [
            {
              id: "11111111-1111-4111-8111-111111111111",
              noticeId: "TEST-001",
              title: "Occupational Health and Medical Surveillance Services",
              agency: "Department of Example",
              type: "Solicitation",
              status: "active",
              postedDate: recent,
              responseDeadline: future,
              description:
                "Request for proposal for occupational health examinations, audiometry, spirometry, and employee medical surveillance.",
              solicitationNumber: "TEST-001",
              samUrl: "https://sam.gov/opp/test-001/view",
              providerName: "samGov",
              source: "sam_gov",
              sourceConfidence: "high",
              userGrade: notRelevant ? "spam" : null,
              relevance: {
                score: 96,
                reasons: ["Explicit occupational-health procurement scope"],
                category: "Occupational health",
                confidence: "high",
                feedbackAdj: 0,
                contextualFeedbackAdj: 0,
              },
              quality: {
                classification: "verified-open",
                label: "Verified Open",
                actionable: true,
                summaryEligible: true,
                sourceType: "official-direct",
                reasons: [],
              },
              crossSource: {
                canonicalKey: "sol:departmentofexample:test001",
                rank: 10400,
                authority: "official",
                contextHash: "browser-smoke",
                suppressed: notRelevant,
              },
            },
          ];
    return json({
      data: rows,
      total: rows.length,
      page: 1,
      limit: 50,
      view,
      ranking: {
        mode: "cross-source-v2",
        candidates: rows.length,
        canonicalRecords: rows.length,
        queryContext: null,
      },
    });
  }

  if (
    request.method() === "POST" &&
    /^\/api\/opportunities\/[^/]+\/feedback$/.test(path)
  ) {
    const body = request.postDataJSON?.() ?? JSON.parse(request.postData() || "{}");
    if (body.grade === "spam") notRelevant = true;
    return json({
      success: true,
      opportunityId: path.split("/")[3],
      grade: body.grade,
      learningContext: {
        context: "scope:occupational-health",
        contextHash: "browser-smoke",
      },
    });
  }

  return json({});
});

try {
  const opportunityTitle =
    "Occupational Health and Medical Surveillance Services";
  await page.goto(`${baseUrl}/portal/opportunities`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });

  await page
    .getByRole("heading", { name: "Opportunity Intelligence" })
    .waitFor();
  await page.getByText(opportunityTitle, { exact: true }).waitFor();
  await page.getByRole("button", { name: "Bid-ready & Verified" }).waitFor();
  await page.getByRole("button", { name: "Fetch Intelligence" }).waitFor();

  const card = page.locator("article").filter({ hasText: opportunityTitle }).first();
  await card.waitFor();
  await card.getByTitle("Excellent fit").waitFor();
  await card.getByTitle("Good fit").waitFor();
  await card.getByTitle("Poor fit").waitFor();
  await card
    .getByTitle("Mark not relevant before opening or generating an AI brief")
    .waitFor();

  await page.getByRole("button", { name: "Fetch Intelligence" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByText("Federal Structured Ensemble", { exact: true }).waitFor();
  await page.getByText("SAM.gov Official API", { exact: true }).waitFor();
  await page
    .getByText("Tango Federal Opportunities", { exact: true })
    .waitFor();
  await page
    .getByText("State, Local & Private Search", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Cancel" }).click();

  await card
    .getByTitle("Mark not relevant before opening or generating an AI brief")
    .click();
  await page.getByText("No opportunities found", { exact: true }).waitFor({
    timeout: 10_000,
  });

  assert.deepEqual(
    pageErrors,
    [],
    `browser emitted page errors: ${pageErrors.join(" | ")}`,
  );
  console.log(
    JSON.stringify({
      event: "opportunities_browser_acceptance_passed",
      route: "/portal/opportunities",
      verified: [
        "page-render",
        "quality-tabs",
        "card-feedback-before-brief",
        "federal-ensemble-dialog",
        "browser-discovery-selector",
        "not-relevant-refetch-suppression",
      ],
    }),
  );
} finally {
  await browser.close();
}
