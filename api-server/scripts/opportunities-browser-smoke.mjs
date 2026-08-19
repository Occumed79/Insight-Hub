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

function forecastRecord(recompete) {
  return {
    id: recompete ? "recompete-browser-001" : "forecast-browser-001",
    source: "govconapi",
    sourceId: recompete ? "REC-001" : "FCO-001",
    title: recompete
      ? "Occupational Health Services Recompete"
      : "Planned Occupational Health Medical Services",
    agency: "Department of Example",
    subAgency: "Workforce Health Office",
    description: recompete
      ? "Forecasted recompete for occupational health examinations, medical surveillance, and testing services."
      : "Forward acquisition forecast for occupational health examinations, audiometry, spirometry, and workforce medical services.",
    naics: "621111",
    setAside: "Small Business",
    state: "VA",
    valueRangeText: "$1M-$5M",
    valueLow: 1_000_000,
    valueHigh: 5_000_000,
    estimatedSolicitationDate: future,
    estimatedAwardFiscalYear: new Date().getUTCFullYear() + 1,
    estimatedAwardQuarter: "Q2",
    status: "forecast",
    isRecompete: recompete,
    incumbentName: recompete ? "Example Incumbent LLC" : null,
    incumbentAward: recompete
      ? {
          recipientName: "Example Incumbent LLC",
          currentValue: 2_750_000,
          expires: future,
          awardingAgency: "Department of Example",
          latestActionDate: recent,
        }
      : null,
    pointOfContact: {
      name: "Contracting Officer",
      email: "co@example.gov",
      phone: null,
    },
    sourceUrl: "https://example.gov/forecast/occupational-health",
    lastUpdatedDate: recent,
    relevance: {
      score: 95,
      classification: "strong",
      semanticSimilarity: 0.94,
      provider: "deterministic",
      reasons: ["Core occupational-health scope"],
    },
  };
}

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
  if (path === "/api/providers/telemetry") {
    return json({
      generatedAt: new Date().toISOString(),
      quotaPolicies: [
        { provider: "you", renewal: "daily", priority: 10, purpose: "discovery" },
        { provider: "browserbase", renewal: "monthly", priority: 20, purpose: "discovery" },
        { provider: "keenable", renewal: "monthly", priority: 22, purpose: "discovery" },
        { provider: "exa", renewal: "monthly", priority: 26, purpose: "discovery" },
      ],
      credentialPools: {
        "you-multi-account": {
          id: "you-multi-account",
          rotateOnSuccess: false,
          configuredAccounts: 2,
          activeSlot: "YOU_API_KEY",
          slots: [
            { slot: "YOU_API_KEY", configured: true, active: true, coolingDown: false, cooldownUntil: null },
            { slot: "YOU_API_KEY_2", configured: true, active: false, coolingDown: false, cooldownUntil: null },
          ],
        },
        "browserbase-multi-account": {
          id: "browserbase-multi-account",
          rotateOnSuccess: false,
          configuredAccounts: 2,
          activeSlot: "BROWSERBASE_API_KEY",
          slots: [
            { slot: "BROWSERBASE_API_KEY", configured: true, active: true, coolingDown: false, cooldownUntil: null },
            { slot: "BROWSERBASE_KEY_2", configured: true, active: false, coolingDown: false, cooldownUntil: null },
          ],
        },
      },
      budgets: [
        { provider: "you", requestsToday: 12, requestsThisMonth: 12, remainingToday: 88, remainingThisMonth: null, available: true, cooldownUntil: 0, lastOutcome: "success" },
        { provider: "browserbase", requestsToday: 2, requestsThisMonth: 14, remainingToday: null, remainingThisMonth: null, available: true, cooldownUntil: 0, lastOutcome: "success" },
        { provider: "keenable", requestsToday: 1, requestsThisMonth: 8, remainingToday: null, remainingThisMonth: null, available: true, cooldownUntil: 0, lastOutcome: "success" },
        { provider: "exa", requestsToday: 1, requestsThisMonth: 6, remainingToday: null, remainingThisMonth: null, available: true, cooldownUntil: 0, lastOutcome: "success" },
      ],
    });
  }

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
    const body =
      request.postDataJSON?.() ?? JSON.parse(request.postData() || "{}");
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

  if (path === "/api/govcon/forecasts" && request.method() === "GET") {
    const recompete = url.searchParams.get("recompete") === "true";
    const record = forecastRecord(recompete);
    return json({
      records: [record],
      pagination: { limit: 50, offset: 0, total: 1, hasNext: false },
      sourcePageRecords: 1,
      semanticRejectedCount: 0,
      suppressedCount: 0,
      lowRelevanceCount: 0,
      semanticProvider: "deterministic",
      source: recompete ? "govconapi" : "govcon+official-fco",
      sourceBreakdown: recompete
        ? undefined
        : {
            govcon: 1,
            officialAgencyForecasts: 0,
            agencyDiscoveryProviders: ["langsearch"],
            recoveredErrors: [],
          },
      fetchedAt: new Date().toISOString(),
      cached: false,
    });
  }

  if (path === "/api/govcon/feedback" && request.method() === "POST") {
    return json({ success: true });
  }

  if (
    path === "/api/govcon/recompete-verify" &&
    request.method() === "POST"
  ) {
    return json({
      confidence: "verified",
      confidenceScore: 94,
      summary: "Official award evidence confirms the incumbent position.",
      evidence: [
        {
          source: "USAspending",
          awardId: "CONT_AWD_BROWSER001",
          recipientName: "Example Incumbent LLC",
          agency: "Department of Example",
          description: "Occupational health services",
          amount: 2_750_000,
          startDate: recent,
          endDate: future,
          naics: "621111",
          sourceUrl: "https://usaspending.gov/award/browser001",
          matchScore: 96,
        },
      ],
      sourcesChecked: [
        { source: "USAspending", status: "matched" },
        { source: "SAM Contract Awards", status: "matched" },
      ],
      verifiedAt: new Date().toISOString(),
      cached: false,
    });
  }

  if (path === "/api/relevant-news" && request.method() === "GET") {
    return json({
      articles: [
        {
          id: "news-browser-001",
          title: "Federal Agency Announces New Occupational Health Contract",
          description:
            "The agency announced a new acquisition for workforce medical services and occupational health support.",
          content: null,
          url: "https://example.com/federal-contract-news",
          image: null,
          publishedAt: recent,
          source: {
            name: "Federal Contract News",
            url: "https://example.com",
            country: "us",
          },
          relevanceScore: 92,
        },
      ],
      totalArticles: 1,
      upstreamArticles: 3,
      filteredOut: 2,
      query: "federal contracts occupational health",
      source: "gnews",
      fetchedAt: new Date().toISOString(),
      cached: false,
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

  const card = page
    .locator("article")
    .filter({ hasText: opportunityTitle })
    .first();
  await card.waitFor();
  await card.getByTitle("Excellent fit").waitFor();
  await card.getByTitle("Good fit").waitFor();
  await card.getByTitle("Poor fit").waitFor();
  await card
    .getByTitle("Mark not relevant before opening or generating an AI brief")
    .waitFor();

  await page.getByRole("button", { name: "Fetch Intelligence" }).click();
  const fetchDialog = page.getByRole("dialog");
  await fetchDialog.waitFor();
  await fetchDialog.getByText("Federal Structured Sources", { exact: true }).waitFor();
  await fetchDialog.getByText("SAM.gov Official API", { exact: true }).waitFor();
  await fetchDialog
    .getByText("Tango Federal Opportunities", { exact: true })
    .waitFor();
  await fetchDialog
    .getByText("State, Local & Private Search", { exact: true })
    .waitFor();
  await fetchDialog
    .getByText("Search quota / account routing", { exact: true })
    .waitFor();
  await fetchDialog.getByText("You.com", { exact: true }).waitFor();
  await fetchDialog.getByText("Browserbase", { exact: true }).waitFor();

  const samButton = fetchDialog.getByRole("button", { name: /SAM.gov Official API/ });
  const tangoButton = fetchDialog.getByRole("button", { name: /Tango Federal Opportunities/ });
  await samButton.click();
  await assert.doesNotReject(async () => tangoButton.waitFor());
  await fetchDialog.getByRole("button", { name: "Cancel" }).click();

  await card
    .getByTitle("Mark not relevant before opening or generating an AI brief")
    .click();
  await page.getByText("No opportunities found", { exact: true }).waitFor({
    timeout: 10_000,
  });

  await page.goto(`${baseUrl}/portal/forecasts`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  await page.getByRole("heading", { name: "Forecasts" }).waitFor();
  await page
    .getByText("Planned Occupational Health Medical Services", { exact: true })
    .waitFor();
  await page.getByText("95% fit", { exact: true }).waitFor();
  await page.getByTitle("Hide as not relevant").waitFor();

  await page.goto(`${baseUrl}/portal/recompete-watch`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  await page.getByRole("heading", { name: "Recompete Watch" }).waitFor();
  await page
    .getByText("Occupational Health Services Recompete", { exact: true })
    .waitFor();
  await page.getByText("Incumbent position", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Verify official awards" }).click();
  await page
    .getByText("Official award evidence confirms the incumbent position.", {
      exact: true,
    })
    .waitFor();
  await page.getByText("USAspending", { exact: true }).waitFor();

  await page.goto(`${baseUrl}/portal/relevant-news`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  await page.getByRole("heading", { name: "Relevant News" }).waitFor();
  await page
    .getByText("Federal Agency Announces New Occupational Health Contract", {
      exact: true,
    })
    .waitFor();
  await page.getByText("relevance 92", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Read Article" }).waitFor();

  assert.deepEqual(
    pageErrors,
    [],
    `browser emitted page errors: ${pageErrors.join(" | ")}`,
  );
  console.log(
    JSON.stringify({
      event: "insight_hub_browser_acceptance_passed",
      routes: [
        "/portal/opportunities",
        "/portal/forecasts",
        "/portal/recompete-watch",
        "/portal/relevant-news",
      ],
      verified: [
        "opportunity-page-render",
        "quality-tabs",
        "card-feedback-before-brief",
        "independent-federal-source-controls",
        "browser-discovery-selector",
        "quota-account-telemetry",
        "not-relevant-refetch-suppression",
        "forecast-page-and-ranked-record",
        "recompete-page-and-official-award-verification",
        "relevant-news-page-and-article-link",
      ],
    }),
  );
} finally {
  await browser.close();
}
